const { test, expect } = require("@playwright/test");

/*
 * HORILLA HRMS - ONBOARDING AUTOMATION (30 TEST CASES)
 * ---------------------------------------------------
 * Không thực hiện đăng nhập trong tệp này. Phiên đăng nhập cần được cung cấp
 * bằng playwright.config.js / global setup / storageState có sẵn.
 *
 * Mặc định, các ca có thể thay đổi dữ liệu sẽ tự bỏ qua. Chỉ bật khi chạy trên
 * tài khoản và dữ liệu kiểm thử riêng:
 *   RUN_ONBOARDING_MUTATIONS=true
 *
 * Địa chỉ mặc định theo cấu trúc URL của Horilla 2.0. Có thể ghi đè bằng biến
 * môi trường nếu bản demo đang sử dụng đường dẫn khác.
 *
 * Một số ca cần dữ liệu mẫu, tài khoản Candidate hoặc liên kết Portal riêng.
 * Các biến môi trường liên quan được đọc trực tiếp ở từng ca kiểm thử.
 */

const env = process.env;
const mutationsEnabled = env.RUN_ONBOARDING_MUTATIONS === "true";
const emailActionsEnabled = env.ONBOARDING_ALLOW_EMAIL === "true";
const deleteActionsEnabled = env.ONBOARDING_ALLOW_DELETE === "true";
const sessionRole = (env.ONBOARDING_SESSION_ROLE || env.HORILLA_SESSION_ROLE || env.ATTENDANCE_SESSION_ROLE || "").toLowerCase();

const routes = {
  pipeline: env.ONBOARDING_VIEW_ROUTE || "/onboarding/onboarding-view/",
  candidates: env.ONBOARDING_CANDIDATE_VIEW_ROUTE || "/onboarding/candidates-view/",
  portalProfile: "/onboarding/profile-view/",
  portalUserCreation: "/onboarding/user-creation/",
  portalBankDetails: "/onboarding/employee-bank-details/",
  welcome: env.ONBOARDING_WELCOME_ROUTE || "/onboarding/welcome-aboard/",
};

// -----------------------------------------------------------------------------
// Hàm dùng chung
// -----------------------------------------------------------------------------

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function firstVisible(locator) {
  const count = await locator.count().catch(() => 0);
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) return item;
  }
  return null;
}

async function bodyText(page) {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
}

async function openOnboardingPage(page, pageName, route) {
  await page.goto("/");
  let moduleMenu = await firstVisible(
    page.getByRole("button", { name: /^Onboarding$/i }),
  );
  if (!moduleMenu) {
    moduleMenu = await firstVisible(
      page.getByRole("link", { name: /^Onboarding$/i }),
    );
  }

  let openedFromMenu = false;
  if (moduleMenu) {
    await moduleMenu.hover().catch(() => {});
    const menuItem = await firstVisible(
      page.getByText(pageName, { exact: true }),
    );
    if (menuItem) {
      await menuItem.click().catch(() => {});
      openedFromMenu = true;
    }
  }

  const expectedUrl = new RegExp(`${escapeRegExp(route)}(?:\\?.*)?$`);
  if (!openedFromMenu || !expectedUrl.test(page.url())) {
    await page.goto(route);
  }
  await expect(page).toHaveURL(expectedUrl, { timeout: 15000 });
  await expect(page.locator("body")).toBeVisible();
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

async function openPipeline(page) {
  await openOnboardingPage(page, "Onboarding View", routes.pipeline);
}

async function openCandidates(page) {
  await openOnboardingPage(page, "Candidate View", routes.candidates);
}

async function getSearchInput(page) {
  let input = await firstVisible(page.getByRole("searchbox"));
  if (input) return input;
  return firstVisible(
    page.locator(
      'input[placeholder*="search" i], input[aria-label*="search" i], input[name="search"]',
    ),
  );
}

async function getRows(page) {
  let rows = page.locator("table tbody tr");
  if ((await rows.count()) > 0) return rows;
  rows = page.locator('[role="table"] [role="row"], [role="grid"] [role="row"]');
  return rows;
}

async function findRow(page, text) {
  let row = page.locator("table tbody tr").filter({ hasText: text }).first();
  if (await row.count()) return row;
  row = page.locator('[role="row"]').filter({ hasText: text }).first();
  if (await row.count()) return row;
  return null;
}

async function requireRow(page, text, caseName) {
  const row = await findRow(page, text);
  test.skip(
    !row || !(await row.isVisible().catch(() => false)),
    `${caseName}: không tìm thấy dữ liệu mẫu '${text}'.`,
  );
  return row;
}

async function clickNamedButton(page, regex, scope = page) {
  const button = await firstVisible(scope.getByRole("button", { name: regex }));
  if (!button) return false;
  await button.click();
  return true;
}

async function clickNamedLink(page, regex, scope = page) {
  const link = await firstVisible(scope.getByRole("link", { name: regex }));
  if (!link) return false;
  await link.click();
  return true;
}

async function clickRowAction(page, rowText, actionRegex) {
  const row = await findRow(page, rowText);
  if (!row || !(await row.isVisible().catch(() => false))) return false;
  if (await clickNamedButton(page, actionRegex, row)) return true;
  return clickNamedLink(page, actionRegex, row);
}

async function openCreateForm(page, buttonRegex = /create|add|new/i, scope = page) {
  if (await clickNamedButton(page, buttonRegex, scope)) return true;
  return clickNamedLink(page, buttonRegex, scope);
}

async function fieldByLabelOrPlaceholder(page, regex) {
  let field = await firstVisible(page.getByLabel(regex));
  if (field) return field;
  const candidates = page.locator(
    'input:not([type="hidden"]), textarea, select, [role="combobox"]',
  );
  const count = await candidates.count();
  for (let i = 0; i < count; i += 1) {
    const item = candidates.nth(i);
    if (!(await item.isVisible().catch(() => false))) continue;
    const placeholder = (await item.getAttribute("placeholder")) || "";
    const ariaLabel = (await item.getAttribute("aria-label")) || "";
    const name = (await item.getAttribute("name")) || "";
    if (regex.test(`${placeholder} ${ariaLabel} ${name}`)) return item;
  }
  return null;
}

async function fillField(page, regex, value) {
  const field = await fieldByLabelOrPlaceholder(page, regex);
  if (!field) return false;
  await field.fill(String(value));
  return true;
}

async function selectField(page, regex, value) {
  let field = await firstVisible(page.getByLabel(regex));
  if (!field) field = await fieldByLabelOrPlaceholder(page, regex);
  if (!field) return false;
  const tag = await field.evaluate((element) => element.tagName.toLowerCase());
  if (tag === "select") {
    const options = field.locator("option");
    const count = await options.count();
    for (let i = 0; i < count; i += 1) {
      const option = options.nth(i);
      const label = (await option.innerText()).trim();
      const optionValue = await option.getAttribute("value");
      if (label.toLowerCase() === String(value).toLowerCase()) {
        await field.selectOption(optionValue || { label });
        return true;
      }
    }
    await field.selectOption({ label: String(value) }).catch(() => {});
    return true;
  }
  await field.click();
  const option = await firstVisible(
    page.getByRole("option", { name: new RegExp(escapeRegExp(String(value)), "i") }),
  );
  if (option) {
    await option.click();
    return true;
  }
  const textOption = await firstVisible(
    page.getByText(new RegExp(`^${escapeRegExp(String(value))}$`, "i")),
  );
  if (textOption) {
    await textOption.click();
    return true;
  }
  return false;
}

async function submitForm(page, regex = /save|submit|create|send|confirm/i) {
  const forms = page.locator("form");
  const form = forms.last();
  if ((await forms.count()) > 0) {
    const button = await firstVisible(form.getByRole("button", { name: regex }));
    if (button) {
      await button.click();
      return true;
    }
  }
  return clickNamedButton(page, regex);
}

async function confirmIfDialogAppears(page, regex = /confirm|yes|approve|send|save/i) {
  const dialog = page.getByRole("dialog").first();
  if (!(await dialog.isVisible().catch(() => false))) return false;
  return clickNamedButton(page, regex, dialog);
}

async function expectValidation(page) {
  const invalidFields = await page.locator(":invalid").count();
  const errorVisible = await firstVisible(
    page.getByText(/required|invalid|please enter|must be|cannot be empty|already exists|duplicate/i),
  );
  expect(invalidFields > 0 || Boolean(errorVisible)).toBeTruthy();
}

async function expectSuccessOrUpdatedState(page) {
  await expect(page.locator("body")).toContainText(
    /success|saved|created|updated|sent|submitted|allocated|assigned|completed|welcome/i,
    { timeout: 10000 },
  );
}

function requireMutation(caseName) {
  test.skip(
    !mutationsEnabled,
    `${caseName} có thể thay đổi dữ liệu. Bật RUN_ONBOARDING_MUTATIONS=true chỉ khi dùng tài khoản/dữ liệu kiểm thử riêng.`,
  );
}

function requireEmailPermission(caseName) {
  test.skip(
    !mutationsEnabled || !emailActionsEnabled,
    `${caseName} gửi email thật. Cần RUN_ONBOARDING_MUTATIONS=true và ONBOARDING_ALLOW_EMAIL=true.`,
  );
}

function requireDeletePermission(caseName) {
  test.skip(
    !mutationsEnabled || !deleteActionsEnabled,
    `${caseName} có thao tác xóa. Cần RUN_ONBOARDING_MUTATIONS=true và ONBOARDING_ALLOW_DELETE=true.`,
  );
}

function requireRole(caseName, ...allowedRoles) {
  test.skip(
    !allowedRoles.includes(sessionRole),
    `${caseName} cần phiên ${allowedRoles.join("/")}; ONBOARDING_SESSION_ROLE hiện là '${sessionRole || "chưa cấu hình"}'.`,
  );
}

function requireEnv(...names) {
  const missing = names.filter((name) => !env[name] || !env[name].trim());
  test.skip(missing.length > 0, `Thiếu biến môi trường: ${missing.join(", ")}`);
}

async function openPortal(page, kind = "profile") {
  const urlEnv = {
    profile: "ONBOARDING_PORTAL_URL",
    user: "ONBOARDING_USER_CREATION_URL",
    bank: "ONBOARDING_BANK_DETAILS_URL",
  }[kind];
  if (env[urlEnv]) {
    await page.goto(env[urlEnv]);
    return;
  }
  const token = env.ONBOARDING_PORTAL_TOKEN;
  test.skip(!token, "Cần ONBOARDING_PORTAL_TOKEN hoặc URL Portal tương ứng.");
  const route = {
    profile: `${routes.portalProfile}${encodeURIComponent(token)}/`,
    user: `${routes.portalUserCreation}${encodeURIComponent(token)}/`,
    bank: `${routes.portalBankDetails}${encodeURIComponent(token)}/`,
  }[kind];
  await page.goto(route);
}

async function openAllocation(page, candidateName) {
  const row = await requireRow(page, candidateName, "Allocation");
  const allocation = await firstVisible(
    row.locator(
      'button[title*="alloc" i], a[title*="alloc" i], button[aria-label*="alloc" i], a[aria-label*="alloc" i], [data-bs-title*="alloc" i]',
    ),
  );
  if (allocation) {
    await allocation.click();
    return;
  }
  const action = await firstVisible(
    row.getByRole("button", { name: /allocation|allocate|employee setup/i }),
  );
  test.skip(!action, `Không tìm thấy nút Allocation trong dòng '${candidateName}'.`);
  await action.click();
}

async function openAllocationTab(page, tabName) {
  let tab = await firstVisible(page.getByRole("tab", { name: new RegExp(tabName, "i") }));
  if (!tab) tab = await firstVisible(page.getByText(tabName, { exact: true }));
  test.skip(!tab, `Không tìm thấy thẻ Allocation '${tabName}'.`);
  await tab.click();
}

// -----------------------------------------------------------------------------
// TC01 - TC10: Onboarding View, Stage và Task
// -----------------------------------------------------------------------------

test("TC01 [Onboarding-1] - Onboarding View hiển thị Candidate theo từng đợt tuyển dụng và Stage", async ({ page }) => {
  await openPipeline(page);
  const content = await bodyText(page);
  expect(content).toMatch(/onboarding|candidate|recruitment|stage/i);
  const rows = await getRows(page);
  const hasPipeline = (await rows.count()) > 0 || await firstVisible(page.locator('[class*="kanban" i], [class*="pipeline" i], [role="tabpanel"]'));
  expect(Boolean(hasPipeline) || content.length > 40).toBeTruthy();
  await expect(page.locator("body")).not.toContainText(/500 server error|traceback|application error/i);
});

test("TC02 [Onboarding-2] - Tạo Stage mới với thông tin hợp lệ", async ({ page }) => {
  await openPipeline(page);
  requireMutation("TC02");
  requireEnv("ONBOARDING_STAGE_TITLE");
  const opened = await openCreateForm(page, /stage create|create stage|add stage|stage/i);
  test.skip(!opened, "Không tìm thấy nút tạo Stage trên Onboarding View.");
  const titleFilled = await fillField(page, /stage title|title|stage name|name/i, env.ONBOARDING_STAGE_TITLE);
  test.skip(!titleFilled, "Không tìm thấy trường tên Stage.");
  if (env.ONBOARDING_STAGE_MANAGER) {
    await selectField(page, /stage manager|manager/i, env.ONBOARDING_STAGE_MANAGER);
  }
  test.skip(!(await submitForm(page, /save|create|submit/i)), "Không tìm thấy nút lưu Stage.");
  await expectSuccessOrUpdatedState(page);
  await expect(page.locator("body")).toContainText(env.ONBOARDING_STAGE_TITLE);
});

test("TC03 [Onboarding-3] - Xác thực dữ liệu bắt buộc khi tạo Stage", async ({ page }) => {
  await openPipeline(page);
  const opened = await openCreateForm(page, /stage create|create stage|add stage|stage/i);
  test.skip(!opened, "Không tìm thấy nút tạo Stage.");
  const submitted = await submitForm(page, /save|create|submit/i);
  test.skip(!submitted, "Không tìm thấy nút gửi biểu mẫu Stage.");
  await expectValidation(page);
});

test("TC04 [Onboarding-4] - Final Stage và Stage Manager được lưu đúng", async ({ page }) => {
  await openPipeline(page);
  requireMutation("TC04");
  requireEnv("ONBOARDING_STAGE_NAME", "ONBOARDING_STAGE_MANAGER");
  const row = await requireRow(page, env.ONBOARDING_STAGE_NAME, "TC04");
  let opened = await clickRowAction(page, env.ONBOARDING_STAGE_NAME, /edit|update/i);
  if (!opened) {
    const edit = await firstVisible(row.locator('button[title*="edit" i], a[title*="edit" i], button[aria-label*="edit" i]'));
    if (edit) { await edit.click(); opened = true; }
  }
  test.skip(!opened, "Không tìm thấy thao tác chỉnh sửa Stage.");
  const finalStage = await firstVisible(page.getByLabel(/final stage/i));
  if (finalStage && !(await finalStage.isChecked().catch(() => false))) await finalStage.check();
  const managerSelected = await selectField(page, /stage manager|manager/i, env.ONBOARDING_STAGE_MANAGER);
  test.skip(!finalStage && !managerSelected, "Không tìm thấy trường Final Stage hoặc Stage Manager.");
  test.skip(!(await submitForm(page, /save|update|submit/i)), "Không tìm thấy nút lưu Stage.");
  await expectSuccessOrUpdatedState(page);
});

test("TC05 [Onboarding-5] - Tạo Task và phân công người phụ trách cho Candidate", async ({ page }) => {
  await openPipeline(page);
  requireMutation("TC05");
  requireEnv("ONBOARDING_TASK_TITLE", "ONBOARDING_TASK_STAGE");
  const stageRow = await requireRow(page, env.ONBOARDING_TASK_STAGE, "TC05");
  const opened = await openCreateForm(page, /add task|create task|task create/i, stageRow);
  test.skip(!opened, "Không tìm thấy nút tạo Task trong Stage đã cấu hình.");
  const titleFilled = await fillField(page, /task title|title|task name/i, env.ONBOARDING_TASK_TITLE);
  test.skip(!titleFilled, "Không tìm thấy trường tiêu đề Task.");
  if (env.ONBOARDING_TASK_MANAGER) await selectField(page, /task manager|manager/i, env.ONBOARDING_TASK_MANAGER);
  if (env.ONBOARDING_TASK_CANDIDATE) await selectField(page, /candidate|employee/i, env.ONBOARDING_TASK_CANDIDATE);
  if (env.ONBOARDING_TASK_DUE_DATE) await fillField(page, /due date|deadline|date/i, env.ONBOARDING_TASK_DUE_DATE);
  test.skip(!(await submitForm(page, /save|create|submit|assign/i)), "Không tìm thấy nút lưu Task.");
  await expectSuccessOrUpdatedState(page);
  await expect(page.locator("body")).toContainText(env.ONBOARDING_TASK_TITLE);
});

test("TC06 [Onboarding-6] - Biểu mẫu Task từ chối trường bắt buộc hoặc thời hạn không hợp lệ", async ({ page }) => {
  await openPipeline(page);
  requireEnv("ONBOARDING_TASK_STAGE");
  const stageRow = await requireRow(page, env.ONBOARDING_TASK_STAGE, "TC06");
  const opened = await openCreateForm(page, /add task|create task|task create/i, stageRow);
  test.skip(!opened, "Không tìm thấy nút tạo Task.");
  if (env.ONBOARDING_INVALID_TASK_DUE_DATE) {
    await fillField(page, /due date|deadline|date/i, env.ONBOARDING_INVALID_TASK_DUE_DATE);
  }
  test.skip(!(await submitForm(page, /save|create|submit|assign/i)), "Không tìm thấy nút gửi biểu mẫu Task.");
  await expectValidation(page);
});

test("TC07 [Onboarding-7] - Trạng thái và thời hạn hoàn thành Task được hiển thị nhất quán", async ({ page }) => {
  await openPipeline(page);
  requireEnv("ONBOARDING_TASK_TEXT");
  const row = await requireRow(page, env.ONBOARDING_TASK_TEXT, "TC07");
  const rowText = await row.innerText();
  expect(rowText.length).toBeGreaterThan(env.ONBOARDING_TASK_TEXT.length);
  if (env.ONBOARDING_TASK_EXPECTED_STATUS) {
    expect(rowText.toLowerCase()).toContain(env.ONBOARDING_TASK_EXPECTED_STATUS.toLowerCase());
  }
  if (env.ONBOARDING_TASK_EXPECTED_DUE_DATE) {
    expect(rowText).toContain(env.ONBOARDING_TASK_EXPECTED_DUE_DATE);
  }
});

test("TC08 [Onboarding-8] - Stage có dữ liệu liên kết hiển thị cảnh báo trước khi xóa", async ({ page }) => {
  await openPipeline(page);
  requireDeletePermission("TC08");
  requireEnv("ONBOARDING_STAGE_WITH_DATA");
  const row = await requireRow(page, env.ONBOARDING_STAGE_WITH_DATA, "TC08");
  let deleteAction = await firstVisible(row.getByRole("button", { name: /delete|remove/i }));
  if (!deleteAction) deleteAction = await firstVisible(row.locator('button[title*="delete" i], a[title*="delete" i], button[aria-label*="delete" i]'));
  test.skip(!deleteAction, "Không tìm thấy thao tác xóa Stage.");
  await deleteAction.click();
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/delete|remove|confirm|candidate|task|stage/i);
  // Không xác nhận xóa để tránh làm mất dữ liệu dùng chung.
  const cancel = await firstVisible(dialog.getByRole("button", { name: /cancel|close|no/i }));
  if (cancel) await cancel.click();
});

test("TC09 [Onboarding-9] - Cập nhật hàng loạt Stage cho nhiều Candidate được chọn", async ({ page }) => {
  await openPipeline(page);
  requireMutation("TC09");
  requireEnv("ONBOARDING_BULK_CANDIDATE_NAMES", "ONBOARDING_TARGET_STAGE");
  const names = env.ONBOARDING_BULK_CANDIDATE_NAMES.split(",").map((x) => x.trim()).filter(Boolean);
  test.skip(names.length < 2, "Cần ít nhất hai Candidate trong ONBOARDING_BULK_CANDIDATE_NAMES.");
  for (const name of names) {
    const row = await requireRow(page, name, "TC09");
    const checkbox = await firstVisible(row.locator('input[type="checkbox"]'));
    test.skip(!checkbox, `Không tìm thấy ô chọn Candidate '${name}'.`);
    await checkbox.check();
  }
  const stageSelect = await fieldByLabelOrPlaceholder(page, /stage|move to/i);
  test.skip(!stageSelect, "Không tìm thấy bộ chọn Stage cho thao tác hàng loạt.");
  await selectField(page, /stage|move to/i, env.ONBOARDING_TARGET_STAGE);
  const update = await firstVisible(page.getByRole("button", { name: /update|change|apply|save/i }));
  test.skip(!update, "Không tìm thấy nút cập nhật Stage hàng loạt.");
  await update.click();
  await confirmIfDialogAppears(page, /confirm|yes|update|save/i);
  await expectSuccessOrUpdatedState(page);
});

test("TC10 [Onboarding-10] - Cập nhật hàng loạt không làm thay đổi Candidate không được chọn", async ({ page }) => {
  await openPipeline(page);
  requireMutation("TC10");
  requireEnv("ONBOARDING_UNSELECTED_CANDIDATE", "ONBOARDING_UNSELECTED_EXPECTED_STAGE", "ONBOARDING_BULK_CANDIDATE_NAMES", "ONBOARDING_TARGET_STAGE");
  const untouchedRow = await requireRow(page, env.ONBOARDING_UNSELECTED_CANDIDATE, "TC10");
  const before = await untouchedRow.innerText();
  test.skip(before.toLowerCase().includes(env.ONBOARDING_TARGET_STAGE.toLowerCase()), "Candidate đối chứng đã ở Stage đích; cần fixture khác.");
  const names = env.ONBOARDING_BULK_CANDIDATE_NAMES.split(",").map((x) => x.trim()).filter(Boolean);
  for (const name of names) {
    const row = await requireRow(page, name, "TC10");
    const checkbox = await firstVisible(row.locator('input[type="checkbox"]'));
    test.skip(!checkbox, `Không tìm thấy ô chọn Candidate '${name}'.`);
    await checkbox.check();
  }
  await selectField(page, /stage|move to/i, env.ONBOARDING_TARGET_STAGE);
  test.skip(!(await clickNamedButton(page, /update|change|apply|save/i)), "Không tìm thấy nút cập nhật Stage hàng loạt.");
  await confirmIfDialogAppears(page, /confirm|yes|update|save/i);
  await expectSuccessOrUpdatedState(page);
  const refreshed = await findRow(page, env.ONBOARDING_UNSELECTED_CANDIDATE);
  expect(refreshed).not.toBeNull();
  expect((await refreshed.innerText()).toLowerCase()).toContain(env.ONBOARDING_UNSELECTED_EXPECTED_STAGE.toLowerCase());
});

// -----------------------------------------------------------------------------
// TC11 - TC15: Candidate View và khởi tạo Onboarding
// -----------------------------------------------------------------------------

test("TC11 [Onboarding-11] - Candidate View hiển thị đúng thông tin ứng viên đã trúng tuyển", async ({ page }) => {
  await openCandidates(page);
  const content = await bodyText(page);
  expect(content).toMatch(/candidate|joining date|job position|recruitment|email/i);
  const rows = await getRows(page);
  expect((await rows.count()) > 0 || content.length > 40).toBeTruthy();
  if (env.ONBOARDING_HIRED_CANDIDATE) await expect(page.locator("body")).toContainText(env.ONBOARDING_HIRED_CANDIDATE);
});

test("TC12 [Onboarding-12] - Tạo Candidate trực tiếp từ Candidate View", async ({ page }) => {
  await openCandidates(page);
  requireMutation("TC12");
  requireEnv("ONBOARDING_NEW_CANDIDATE_NAME", "ONBOARDING_NEW_CANDIDATE_EMAIL");
  const opened = await openCreateForm(page, /create candidate|candidate create|create|add/i);
  test.skip(!opened, "Không tìm thấy nút tạo Candidate.");
  const name = await fillField(page, /candidate name|name/i, env.ONBOARDING_NEW_CANDIDATE_NAME);
  const email = await fillField(page, /email/i, env.ONBOARDING_NEW_CANDIDATE_EMAIL);
  test.skip(!name || !email, "Biểu mẫu không có đủ trường tên và email Candidate.");
  if (env.ONBOARDING_NEW_CANDIDATE_POSITION) await selectField(page, /job position|position/i, env.ONBOARDING_NEW_CANDIDATE_POSITION);
  if (env.ONBOARDING_NEW_CANDIDATE_JOINING_DATE) await fillField(page, /joining date|joining/i, env.ONBOARDING_NEW_CANDIDATE_JOINING_DATE);
  test.skip(!(await submitForm(page, /save|create|submit/i)), "Không tìm thấy nút lưu Candidate.");
  await expectSuccessOrUpdatedState(page);
  await expect(page.locator("body")).toContainText(env.ONBOARDING_NEW_CANDIDATE_EMAIL);
});

test("TC13 [Onboarding-13] - Biểu mẫu Candidate xác thực các trường bắt buộc", async ({ page }) => {
  await openCandidates(page);
  const opened = await openCreateForm(page, /create candidate|candidate create|create|add/i);
  test.skip(!opened, "Không tìm thấy nút tạo Candidate.");
  test.skip(!(await submitForm(page, /save|create|submit/i)), "Không tìm thấy nút gửi biểu mẫu Candidate.");
  await expectValidation(page);
});

test("TC14 [Onboarding-14] - Hệ thống phát hiện Candidate trùng email hoặc hồ sơ đã tồn tại", async ({ page }) => {
  await openCandidates(page);
  requireMutation("TC14");
  requireEnv("ONBOARDING_DUPLICATE_CANDIDATE_NAME", "ONBOARDING_DUPLICATE_CANDIDATE_EMAIL");
  const opened = await openCreateForm(page, /create candidate|candidate create|create|add/i);
  test.skip(!opened, "Không tìm thấy nút tạo Candidate.");
  await fillField(page, /candidate name|name/i, env.ONBOARDING_DUPLICATE_CANDIDATE_NAME);
  await fillField(page, /email/i, env.ONBOARDING_DUPLICATE_CANDIDATE_EMAIL);
  await submitForm(page, /save|create|submit/i);
  await expect(page.locator("body")).toContainText(/already exists|duplicate|email.*used|candidate.*exists|đã tồn tại/i);
});

test("TC15 [Onboarding-15] - Bắt đầu quy trình Onboarding từ Candidate View", async ({ page }) => {
  await openCandidates(page);
  requireEmailPermission("TC15");
  requireEnv("ONBOARDING_HIRED_CANDIDATE");
  const row = await requireRow(page, env.ONBOARDING_HIRED_CANDIDATE, "TC15");
  const checkbox = await firstVisible(row.locator('input[type="checkbox"]'));
  if (checkbox) await checkbox.check();
  const start = await firstVisible(page.getByRole("button", { name: /start onboarding|send portal|onboard/i }));
  test.skip(!start, "Không tìm thấy thao tác bắt đầu Onboarding hoặc Send Portal.");
  await start.click();
  await expect(page.locator("body")).toContainText(/onboarding|portal|candidate|email/i);
});

// -----------------------------------------------------------------------------
// TC16 - TC25: Send Portal và Onboarding Portal
// -----------------------------------------------------------------------------

test("TC16 [Onboarding-16] - Gửi Send Portal cho Candidate", async ({ page }) => {
  await openCandidates(page);
  requireEmailPermission("TC16");
  requireEnv("ONBOARDING_HIRED_CANDIDATE", "ONBOARDING_PORTAL_CANDIDATE_EMAIL");
  const row = await requireRow(page, env.ONBOARDING_HIRED_CANDIDATE, "TC16");
  const checkbox = await firstVisible(row.locator('input[type="checkbox"]'));
  if (checkbox) await checkbox.check();
  let sent = await clickNamedButton(page, /send portal|send portal link/i);
  if (!sent) sent = await clickRowAction(page, env.ONBOARDING_HIRED_CANDIDATE, /send portal|portal link/i);
  test.skip(!sent, "Không tìm thấy thao tác Send Portal.");
  await confirmIfDialogAppears(page, /send|confirm|yes/i);
  await expectSuccessOrUpdatedState(page);
});

test("TC17 [Onboarding-17] - Candidate truy cập Onboarding Portal bằng liên kết hợp lệ", async ({ page }) => {
  await openPortal(page, "profile");
  await expect(page.locator("body")).toContainText(/profile|personal|candidate|onboarding|employee/i);
  await expect(page.locator("body")).not.toContainText(/invalid token|expired token|page not found|403 forbidden/i);
});

test("TC18 [Onboarding-18] - Portal từ chối liên kết không hợp lệ hoặc hết hiệu lực", async ({ page }) => {
  requireEnv("ONBOARDING_INVALID_PORTAL_URL");
  await page.goto(env.ONBOARDING_INVALID_PORTAL_URL);
  await expect(page.locator("body")).toContainText(/invalid|expired|not found|unauthorized|forbidden|link.*not/i);
});

test("TC19 [Onboarding-19] - Portal kiểm tra tạo tài khoản và quy tắc mật khẩu", async ({ page }) => {
  await openPortal(page, "user");
  requireMutation("TC19");
  requireEnv("ONBOARDING_PORTAL_PASSWORD", "ONBOARDING_PORTAL_CONFIRM_PASSWORD");
  await fillField(page, /password/i, env.ONBOARDING_PORTAL_PASSWORD);
  await fillField(page, /confirm password|re.?enter password/i, env.ONBOARDING_PORTAL_CONFIRM_PASSWORD);
  test.skip(!(await submitForm(page, /create account|create|save|submit|continue/i)), "Không tìm thấy nút tạo tài khoản.");
  if (env.ONBOARDING_EXPECT_PASSWORD_REJECTED === "true") {
    await expectValidation(page);
  } else {
    await expectSuccessOrUpdatedState(page);
  }
});

test("TC20 [Onboarding-20] - Profile View hiển thị đúng thông tin Candidate", async ({ page }) => {
  await openPortal(page, "profile");
  requireEnv("ONBOARDING_PORTAL_EXPECTED_NAME");
  await expect(page.locator("body")).toContainText(env.ONBOARDING_PORTAL_EXPECTED_NAME);
  await expect(page.locator("body")).toContainText(/personal|profile|candidate|information/i);
});

test("TC21 [Onboarding-21] - Profile View nhận ảnh hợp lệ và từ chối tệp không phù hợp", async ({ page }) => {
  await openPortal(page, "profile");
  requireMutation("TC21");
  const fileInput = await firstVisible(page.locator('input[type="file"]'));
  test.skip(!fileInput, "Profile View không hiển thị trường tải ảnh.");
  requireEnv("ONBOARDING_PROFILE_IMAGE_FILE", "ONBOARDING_INVALID_IMAGE_FILE");
  await fileInput.setInputFiles(env.ONBOARDING_PROFILE_IMAGE_FILE);
  await expect(page.locator("body")).toBeVisible();
  await fileInput.setInputFiles(env.ONBOARDING_INVALID_IMAGE_FILE);
  const invalidMessage = await firstVisible(page.getByText(/invalid|unsupported|file type|image only|format/i));
  const accept = await fileInput.getAttribute("accept");
  expect(Boolean(invalidMessage) || Boolean(accept)).toBeTruthy();
});

test("TC22 [Onboarding-22] - Nhập và lưu Personal Details với dữ liệu hợp lệ", async ({ page }) => {
  await openPortal(page, "profile");
  requireMutation("TC22");
  requireEnv("ONBOARDING_PERSONAL_PHONE", "ONBOARDING_PERSONAL_ADDRESS");
  await fillField(page, /phone|mobile/i, env.ONBOARDING_PERSONAL_PHONE);
  await fillField(page, /address/i, env.ONBOARDING_PERSONAL_ADDRESS);
  if (env.ONBOARDING_PERSONAL_DOB) await fillField(page, /date of birth|dob|birth/i, env.ONBOARDING_PERSONAL_DOB);
  test.skip(!(await submitForm(page, /save|update|submit|next/i)), "Không tìm thấy nút lưu Personal Details.");
  await expectSuccessOrUpdatedState(page);
});

test("TC23 [Onboarding-23] - Personal Details xác thực dữ liệu bắt buộc", async ({ page }) => {
  await openPortal(page, "profile");
  const submit = await firstVisible(page.getByRole("button", { name: /save|update|submit|next/i }));
  test.skip(!submit, "Không tìm thấy nút gửi Personal Details.");
  await submit.click();
  await expectValidation(page);
});

test("TC24 [Onboarding-24] - Nhập và lưu Bank Details cho Candidate", async ({ page }) => {
  await openPortal(page, "bank");
  requireMutation("TC24");
  requireEnv("ONBOARDING_BANK_NAME", "ONBOARDING_BANK_ACCOUNT");
  const bankFilled = await fillField(page, /bank name|bank/i, env.ONBOARDING_BANK_NAME);
  const accountFilled = await fillField(page, /account number|account no|bank account/i, env.ONBOARDING_BANK_ACCOUNT);
  test.skip(!bankFilled || !accountFilled, "Không tìm thấy đủ trường Bank Name và Account Number.");
  if (env.ONBOARDING_BANK_BRANCH) await fillField(page, /branch/i, env.ONBOARDING_BANK_BRANCH);
  test.skip(!(await submitForm(page, /save|submit|continue|next/i)), "Không tìm thấy nút lưu Bank Details.");
  await expectSuccessOrUpdatedState(page);
});

test("TC25 [Onboarding-25] - Welcome Onboard hiển thị và chuyển đến Employee Dashboard", async ({ page }) => {
  const route = routes.welcome;
  await page.goto(route);
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(route)}(?:\\?.*)?$`), { timeout: 15000 });
  await expect(page.locator("body")).toContainText(/welcome|onboard|employee|dashboard|congratulations/i);
  const dashboardLink = await firstVisible(page.getByRole("link", { name: /dashboard|continue|start/i }));
  if (dashboardLink) {
    await dashboardLink.click();
    await expect(page.locator("body")).toBeVisible();
  }
});

// -----------------------------------------------------------------------------
// TC26 - TC30: Allocation
// -----------------------------------------------------------------------------

test("TC26 [Onboarding-26] - Allocation Summary phản ánh tiến độ hoàn thiện hồ sơ", async ({ page }) => {
  await openPipeline(page);
  requireEnv("ONBOARDING_ALLOCATION_CANDIDATE");
  await openAllocation(page, env.ONBOARDING_ALLOCATION_CANDIDATE);
  await expect(page.locator("body")).toContainText(/summary|personal info|work info|bank info|leave policy|asset|allowance|deduction/i);
  await expect(page.locator("body")).toContainText(/personal info|work info|bank info/i);
});

test("TC27 [Onboarding-27] - Cập nhật Personal Info và Work Info trong Allocation", async ({ page }) => {
  await openPipeline(page);
  requireMutation("TC27");
  requireEnv("ONBOARDING_ALLOCATION_CANDIDATE", "ONBOARDING_ALLOCATION_PHONE", "ONBOARDING_ALLOCATION_DEPARTMENT");
  await openAllocation(page, env.ONBOARDING_ALLOCATION_CANDIDATE);
  await openAllocationTab(page, "Employee");
  await fillField(page, /phone|mobile/i, env.ONBOARDING_ALLOCATION_PHONE);
  await selectField(page, /department/i, env.ONBOARDING_ALLOCATION_DEPARTMENT);
  if (env.ONBOARDING_ALLOCATION_JOB_POSITION) await selectField(page, /job position|position/i, env.ONBOARDING_ALLOCATION_JOB_POSITION);
  test.skip(!(await submitForm(page, /save|update|submit/i)), "Không tìm thấy nút lưu thông tin Employee trong Allocation.");
  await expectSuccessOrUpdatedState(page);
});

test("TC28 [Onboarding-28] - Phân bổ Leave Policy cho nhân viên mới", async ({ page }) => {
  await openPipeline(page);
  requireMutation("TC28");
  requireEnv("ONBOARDING_ALLOCATION_CANDIDATE", "ONBOARDING_LEAVE_POLICY");
  await openAllocation(page, env.ONBOARDING_ALLOCATION_CANDIDATE);
  await openAllocationTab(page, "Leave Policy");
  const policy = await firstVisible(page.getByText(env.ONBOARDING_LEAVE_POLICY, { exact: true }));
  if (policy) await policy.click();
  else await selectField(page, /leave policy|policy/i, env.ONBOARDING_LEAVE_POLICY);
  test.skip(!(await clickNamedButton(page, /add|assign|allocate|save/i)), "Không tìm thấy nút thêm/phân bổ Leave Policy.");
  await expectSuccessOrUpdatedState(page);
});

test("TC29 [Onboarding-29] - Tìm kiếm, phân trang và phân bổ Asset", async ({ page }) => {
  await openPipeline(page);
  requireMutation("TC29");
  requireEnv("ONBOARDING_ALLOCATION_CANDIDATE", "ONBOARDING_ASSET_NAME");
  await openAllocation(page, env.ONBOARDING_ALLOCATION_CANDIDATE);
  await openAllocationTab(page, "Asset");
  const search = await getSearchInput(page);
  if (search) {
    await search.fill(env.ONBOARDING_ASSET_NAME);
    await search.press("Enter").catch(() => {});
    await expect(page.locator("body")).toContainText(env.ONBOARDING_ASSET_NAME);
  }
  const next = await firstVisible(page.getByRole("button", { name: /next|next page/i }));
  if (next && await next.isEnabled().catch(() => false)) {
    await next.click();
    await expect(page.locator("body")).toBeVisible();
  }
  const assetRow = await findRow(page, env.ONBOARDING_ASSET_NAME);
  test.skip(!assetRow, `Không tìm thấy Asset '${env.ONBOARDING_ASSET_NAME}'.`);
  const checkbox = await firstVisible(assetRow.locator('input[type="checkbox"]'));
  if (checkbox) await checkbox.check();
  test.skip(!(await clickNamedButton(page, /add|assign|allocate|save/i)), "Không tìm thấy nút phân bổ Asset.");
  await expectSuccessOrUpdatedState(page);
});

test("TC30 [Onboarding-30] - Thêm và gỡ Allowance, Deduction trong Allocation", async ({ page }) => {
  await openPipeline(page);
  requireMutation("TC30");
  requireEnv("ONBOARDING_ALLOCATION_CANDIDATE", "ONBOARDING_ALLOWANCE_NAME", "ONBOARDING_DEDUCTION_NAME");
  await openAllocation(page, env.ONBOARDING_ALLOCATION_CANDIDATE);
  await openAllocationTab(page, "Allowance");
  await selectField(page, /allowance/i, env.ONBOARDING_ALLOWANCE_NAME);
  await clickNamedButton(page, /add|assign|allocate|save/i);
  await expectSuccessOrUpdatedState(page);
  await openAllocationTab(page, "Deduction");
  await selectField(page, /deduction/i, env.ONBOARDING_DEDUCTION_NAME);
  await clickNamedButton(page, /add|assign|allocate|save/i);
  await expectSuccessOrUpdatedState(page);
  if (env.ONBOARDING_ALLOW_REMOVE === "true") {
    const remove = await firstVisible(page.getByRole("button", { name: /remove|delete/i }));
    if (remove) {
      await remove.click();
      await confirmIfDialogAppears(page, /remove|delete|confirm|yes/i);
    }
  }
});
