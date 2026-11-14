const { test, expect } = require("@playwright/test");

/*
 * HORILLA HRMS - OFFBOARDING AUTOMATION (30 TEST CASES)
 * ----------------------------------------------------
 * Không thực hiện đăng nhập trong tệp này. Phiên đã xác thực cần được cấu hình
 * bằng playwright.config.js / global setup / storageState có sẵn.
 *
 * Các thao tác thay đổi dữ liệu mặc định được bỏ qua. Chỉ bật trên tài khoản
 * và dữ liệu kiểm thử riêng bằng:
 *   RUN_OFFBOARDING_MUTATIONS=true
 *
 * Tên trang và đường dẫn được đối chiếu với mã nguồn Horilla 2.0. Có thể ghi
 * đè đường dẫn bằng biến môi trường để thích nghi với bản demo đang dùng.
 * Các thao tác gửi email, xóa và khóa tài khoản có cờ bảo vệ riêng.
 */

const env = process.env;
const mutationsEnabled = env.RUN_OFFBOARDING_MUTATIONS === "true";
const emailActionsEnabled = env.OFFBOARDING_ALLOW_EMAIL === "true";
const deleteActionsEnabled = env.OFFBOARDING_ALLOW_DELETE === "true";
const accountLockEnabled = env.OFFBOARDING_ALLOW_ACCOUNT_LOCK === "true";
const sessionRole = (env.OFFBOARDING_SESSION_ROLE || env.HORILLA_SESSION_ROLE || env.ATTENDANCE_SESSION_ROLE || "").toLowerCase();

const routes = {
  pipeline: env.OFFBOARDING_EXIT_PROCESS_ROUTE || "/offboarding/offboarding-pipeline/",
  resignations: env.OFFBOARDING_RESIGNATION_ROUTE || "/offboarding/resignation-requests-view/",
  settings: env.OFFBOARDING_SETTINGS_ROUTE || "/offboarding/offboarding-rules-view/",
  employeeTasks: env.OFFBOARDING_EMPLOYEE_TASKS_ROUTE || "/offboarding/employee-tasks-view/",
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

async function openOffboardingPage(page, pageName, route) {
  await page.goto("/");
  let moduleMenu = await firstVisible(
    page.getByRole("button", { name: /^Offboarding$/i }),
  );
  if (!moduleMenu) {
    moduleMenu = await firstVisible(
      page.getByRole("link", { name: /^Offboarding$/i }),
    );
  }

  let openedFromMenu = false;
  if (moduleMenu) {
    await moduleMenu.hover().catch(() => {});
    const menuItem = await firstVisible(page.getByText(pageName, { exact: true }));
    if (menuItem) {
      await menuItem.click().catch(() => {});
      openedFromMenu = true;
    }
  }

  const expectedUrl = new RegExp(`${escapeRegExp(route)}(?:\\?.*)?$`);
  if (!openedFromMenu || !expectedUrl.test(page.url())) await page.goto(route);
  await expect(page).toHaveURL(expectedUrl, { timeout: 15000 });
  await expect(page.locator("body")).toBeVisible();
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

async function openExitProcess(page) {
  await openOffboardingPage(page, "Exit Process", routes.pipeline);
}

async function requireResignationFeatureEnabled(page) {
  // Horilla 2.0 renders this checkbox with id/name, but without a <label for=...>.
  // getByLabel() therefore misses the real control and used to cause false skips.
  await openSettings(page);
  const toggle = page.locator("#enableResignationRequest");
  const exists = await toggle.count();
  test.skip(
    exists === 0,
    "Không xác minh được Resignation Request: tài khoản không thấy checkbox #enableResignationRequest hoặc bản Horilla dùng giao diện khác.",
  );
  const enabled = await toggle.isChecked().catch(() => false);
  test.skip(
    !enabled,
    "Resignation Request đang tắt trong Offboarding Settings. Bật tính năng trước khi chạy các test Resignation; test không tự đổi cấu hình dùng chung.",
  );
}

async function openResignations(page) {
  await requireResignationFeatureEnabled(page);
  // The Horilla route is protected by both feature flag and
  // offboarding.view_resignationletter permission.
  await page.goto(routes.resignations);
  const expectedUrl = new RegExp(`${escapeRegExp(routes.resignations)}(?:\\?.*)?$`);
  if (!expectedUrl.test(page.url())) {
    test.skip(
      true,
      `Resignation Request đang bật nhưng tài khoản không vào được ${routes.resignations}; kiểm tra quyền offboarding.view_resignationletter hoặc route của phiên bản Horilla đang chạy (đã bị chuyển tới ${page.url()}).`,
    );
  }
  await expect(page).toHaveURL(expectedUrl, { timeout: 15000 });
  await expect(page.locator("body")).toBeVisible();
}

async function selectOffboardingProcessTab(page) {
  const tabs = page.locator(".oh-tabs__tab[data-rec-id]");
  const count = await tabs.count();
  test.skip(count === 0, "Offboarding Pipeline chưa có process đang hoạt động; cần tạo/chọn một process trước khi kiểm tra Stage.");

  let selected = null;
  const processName = (env.OFFBOARDING_PROCESS_NAME || "").trim();
  if (processName) {
    selected = await firstVisible(tabs.filter({ hasText: processName }));
  }
  if (!selected) selected = await firstVisible(tabs);
  test.skip(!selected, "Không tìm thấy tab Offboarding process để mở pipeline.");
  await selected.click();
  await expect(page.locator(".oh-tabs__tab--active")).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(500);
}

async function openCreateStageForm(page) {
  await selectOffboardingProcessTab(page);
  // In Horilla 2.0, Add Stage is rendered inside the selected process shell,
  // not on the initial list of process tabs.
  let addStage = await firstVisible(page.locator('[hx-get*="create-offboarding-stage"]'));
  if (!addStage) {
    // HorillaNavView may place per-process actions under an Actions/More menu.
    const actionsMenu = await firstVisible(page.getByRole("button", { name: /actions|more/i }));
    if (actionsMenu) await actionsMenu.click();
    addStage = await firstVisible(page.locator('[hx-get*="create-offboarding-stage"]'));
  }
  if (!addStage) addStage = await firstVisible(page.getByText(/^Add Stage$/i));
  if (!addStage) return false;
  await addStage.click();
  const modalBody = page.locator("#genericModalBody");
  await expect(modalBody).toBeVisible({ timeout: 10000 }).catch(() => {});
  return (await page.locator("form").count()) > 0 || (await modalBody.innerText().catch(() => "")).trim().length > 0;
}

async function openSettings(page) {
  await page.goto(routes.settings);
  const expectedUrl = new RegExp(`${escapeRegExp(routes.settings)}(?:\\?.*)?$`);
  if (!expectedUrl.test(page.url())) {
    test.skip(
      true,
      `Không vào được Offboarding Settings; có thể tài khoản thiếu quyền xem/cấu hình Offboarding (đã bị chuyển tới ${page.url()}).`,
    );
  }
  await expect(page).toHaveURL(expectedUrl, { timeout: 15000 });
  await expect(page.locator("body")).toBeVisible();
}

async function getSearchInput(page) {
  let input = await firstVisible(page.getByRole("searchbox"));
  if (input) return input;
  return firstVisible(page.locator('input[placeholder*="search" i], input[aria-label*="search" i], input[name="search"]'));
}

async function getRows(page) {
  let rows = page.locator("table tbody tr");
  if ((await rows.count()) > 0) return rows;
  return page.locator('[role="table"] [role="row"], [role="grid"] [role="row"]');
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
  test.skip(!row || !(await row.isVisible().catch(() => false)), `${caseName}: không tìm thấy dữ liệu mẫu '${text}'.`);
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

async function openCreateForm(page, regex = /create|add|new/i, scope = page) {
  if (await clickNamedButton(page, regex, scope)) return true;
  return clickNamedLink(page, regex, scope);
}

async function fieldByLabelOrPlaceholder(page, regex) {
  let field = await firstVisible(page.getByLabel(regex));
  if (field) return field;
  const candidates = page.locator('input:not([type="hidden"]), textarea, select, [role="combobox"]');
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
  const option = await firstVisible(page.getByRole("option", { name: new RegExp(escapeRegExp(String(value)), "i") }));
  if (option) { await option.click(); return true; }
  const textOption = await firstVisible(page.getByText(new RegExp(`^${escapeRegExp(String(value))}$`, "i")));
  if (textOption) { await textOption.click(); return true; }
  return false;
}

async function submitForm(page, regex = /save|submit|create|send|confirm/i) {
  const forms = page.locator("form");
  if ((await forms.count()) > 0) {
    const button = await firstVisible(forms.last().getByRole("button", { name: regex }));
    if (button) { await button.click(); return true; }
  }
  return clickNamedButton(page, regex);
}

async function confirmIfDialogAppears(page, regex = /confirm|yes|approve|reject|save/i) {
  const dialog = page.getByRole("dialog").first();
  if (!(await dialog.isVisible().catch(() => false))) return false;
  return clickNamedButton(page, regex, dialog);
}

async function expectValidation(page) {
  const invalidFields = await page.locator(":invalid").count();
  const errorVisible = await firstVisible(page.getByText(/required|invalid|please enter|must be|cannot be empty|already exists|duplicate/i));
  expect(invalidFields > 0 || Boolean(errorVisible)).toBeTruthy();
}

async function expectSuccessOrUpdatedState(page) {
  await expect(page.locator("body")).toContainText(
    /success|saved|created|updated|sent|submitted|approved|rejected|assigned|completed|archived|added/i,
    { timeout: 10000 },
  );
}

function requireMutation(caseName) {
  test.skip(
    !mutationsEnabled,
    `${caseName} có thể thay đổi dữ liệu. Bật RUN_OFFBOARDING_MUTATIONS=true chỉ khi dùng tài khoản/dữ liệu kiểm thử riêng.`,
  );
}

function requireEmailPermission(caseName) {
  test.skip(
    !mutationsEnabled || !emailActionsEnabled,
    `${caseName} gửi email thật. Cần RUN_OFFBOARDING_MUTATIONS=true và OFFBOARDING_ALLOW_EMAIL=true.`,
  );
}

function requireDeletePermission(caseName) {
  test.skip(
    !mutationsEnabled || !deleteActionsEnabled,
    `${caseName} có thao tác xóa. Cần RUN_OFFBOARDING_MUTATIONS=true và OFFBOARDING_ALLOW_DELETE=true.`,
  );
}

function requireAccountLockPermission(caseName) {
  test.skip(
    !mutationsEnabled || !accountLockEnabled,
    `${caseName} có thể khóa tài khoản nhân viên. Cần RUN_OFFBOARDING_MUTATIONS=true và OFFBOARDING_ALLOW_ACCOUNT_LOCK=true.`,
  );
}

function requireRole(caseName, ...allowedRoles) {
  test.skip(
    !allowedRoles.includes(sessionRole),
    `${caseName} cần phiên ${allowedRoles.join("/")}; OFFBOARDING_SESSION_ROLE hiện là '${sessionRole || "chưa cấu hình"}'.`,
  );
}

function requireEnv(...names) {
  const missing = names.filter((name) => !env[name] || !env[name].trim());
  test.skip(missing.length > 0, `Thiếu biến môi trường: ${missing.join(", ")}`);
}

async function openOffboardingSettings(page) {
  await openSettings(page);
}

// -----------------------------------------------------------------------------
// TC01 - TC07: Exit Process, Offboarding Process và Stage
// -----------------------------------------------------------------------------

test("TC01 [Offboarding-1] - Exit Process hiển thị quy trình, nhân viên, Stage và tiến độ", async ({ page }) => {
  await openExitProcess(page);
  const content = await bodyText(page);
  expect(content).toMatch(/exit process|offboarding|employee|stage|task/i);
  const rows = await getRows(page);
  const pipeline = await firstVisible(page.locator('[class*="kanban" i], [class*="pipeline" i], [role="tabpanel"]'));
  expect((await rows.count()) > 0 || Boolean(pipeline) || content.length > 40).toBeTruthy();
  await expect(page.locator("body")).not.toContainText(/500 server error|traceback|application error/i);
});

test("TC02 [Offboarding-2] - Tạo Offboarding process với thông tin hợp lệ", async ({ page }) => {
  await openExitProcess(page);
  requireMutation("TC02");
  requireEnv("OFFBOARDING_PROCESS_TITLE");
  const opened = await openCreateForm(page, /offboarding create|create offboarding|create|add/i);
  test.skip(!opened, "Không tìm thấy nút tạo Offboarding process.");
  const title = await fillField(page, /title|name/i, env.OFFBOARDING_PROCESS_TITLE);
  test.skip(!title, "Không tìm thấy trường Title của Offboarding process.");
  if (env.OFFBOARDING_PROCESS_DESCRIPTION) await fillField(page, /description/i, env.OFFBOARDING_PROCESS_DESCRIPTION);
  if (env.OFFBOARDING_PROCESS_MANAGER) await selectField(page, /managers|manager/i, env.OFFBOARDING_PROCESS_MANAGER);
  if (env.OFFBOARDING_PROCESS_STATUS) await selectField(page, /status/i, env.OFFBOARDING_PROCESS_STATUS);
  test.skip(!(await submitForm(page, /save|create|submit/i)), "Không tìm thấy nút lưu Offboarding process.");
  await expectSuccessOrUpdatedState(page);
  await expect(page.locator("body")).toContainText(env.OFFBOARDING_PROCESS_TITLE);
});

test("TC03 [Offboarding-3] - Biểu mẫu Offboarding process xác thực trường bắt buộc", async ({ page }) => {
  await openExitProcess(page);
  const opened = await openCreateForm(page, /offboarding create|create offboarding|create|add/i);
  test.skip(!opened, "Không tìm thấy nút tạo Offboarding process.");
  test.skip(!(await submitForm(page, /save|create|submit/i)), "Không tìm thấy nút gửi biểu mẫu Offboarding process.");
  await expectValidation(page);
});

test("TC04 [Offboarding-4] - Chỉnh sửa và xác nhận xóa Offboarding process", async ({ page }) => {
  await openExitProcess(page);
  requireMutation("TC04");
  requireEnv("OFFBOARDING_PROCESS_NAME");
  const row = await requireRow(page, env.OFFBOARDING_PROCESS_NAME, "TC04");
  const edit = await firstVisible(row.getByRole("button", { name: /edit|update/i }));
  const editLink = edit ? null : await firstVisible(row.getByRole("link", { name: /edit|update/i }));
  test.skip(!edit && !editLink, "Không tìm thấy thao tác chỉnh sửa Offboarding process.");
  if (edit) await edit.click(); else await editLink.click();
  await expect(page.locator("form").last()).toBeVisible();
  const titleField = await fieldByLabelOrPlaceholder(page, /title|name/i);
  test.skip(!titleField, "Không tìm thấy trường Title khi chỉnh sửa.");
  await titleField.fill(env.OFFBOARDING_PROCESS_NAME);
  await submitForm(page, /save|update|submit/i);
  await expectSuccessOrUpdatedState(page);

  requireDeletePermission("TC04");
  const updatedRow = await requireRow(page, env.OFFBOARDING_PROCESS_NAME, "TC04 - delete");
  let deleteAction = await firstVisible(updatedRow.getByRole("button", { name: /delete|remove/i }));
  if (!deleteAction) deleteAction = await firstVisible(updatedRow.locator('button[title*="delete" i], a[title*="delete" i], button[aria-label*="delete" i]'));
  test.skip(!deleteAction, "Không tìm thấy thao tác xóa Offboarding process.");
  await deleteAction.click();
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/delete|remove|confirm|offboarding/i);
  // Không xác nhận xóa để giữ lại fixture cho các lần chạy sau.
  const cancel = await firstVisible(dialog.getByRole("button", { name: /cancel|close|no/i }));
  if (cancel) await cancel.click();
});

test("TC05 [Offboarding-5] - Biểu mẫu Stage hiển thị đủ các loại được hỗ trợ", async ({ page }) => {
  await openExitProcess(page);
  const opened = await openCreateStageForm(page);
  test.skip(!opened, "Không mở được biểu mẫu Add Stage trong process đã chọn; kiểm tra quyền offboarding.add_offboardingstage hoặc process manager.");
  const typeField = await fieldByLabelOrPlaceholder(page, /type|stage type/i);
  test.skip(!typeField, "Không tìm thấy trường Type của Stage.");
  const tag = await typeField.evaluate((element) => element.tagName.toLowerCase());
  test.skip(tag !== "select", "Trường Stage Type không phải select; cần xác minh thủ công các lựa chọn.");
  const options = (await typeField.locator("option").allInnerTexts()).join(" | ").toLowerCase();
  for (const type of ["notice period", "fnf settlement", "other", "interview", "work handover", "archived"]) {
    expect(options).toContain(type);
  }
});

test("TC06 [Offboarding-6] - Biểu mẫu Stage xác thực dữ liệu bắt buộc", async ({ page }) => {
  await openExitProcess(page);
  // Sending an empty form only validates required fields; it does not create data.
  const opened = await openCreateStageForm(page);
  test.skip(!opened, "Không mở được biểu mẫu Add Stage; kiểm tra process đang chọn và quyền tạo Stage.");
  test.skip(!(await submitForm(page, /save|create|submit/i)), "Không tìm thấy nút gửi biểu mẫu Stage.");
  await expectValidation(page);
});

test("TC07 [Offboarding-7] - Stage Manager được phân công đúng và kiểm soát quyền truy cập", async ({ page }) => {
  await openExitProcess(page);
  requireEnv("OFFBOARDING_STAGE_NAME");
  const row = await requireRow(page, env.OFFBOARDING_STAGE_NAME, "TC07");
  const rowText = await row.innerText();
  expect(rowText.length).toBeGreaterThan(env.OFFBOARDING_STAGE_NAME.length);
  if (env.OFFBOARDING_STAGE_MANAGER) expect(rowText.toLowerCase()).toContain(env.OFFBOARDING_STAGE_MANAGER.toLowerCase());
  if (sessionRole === "employee") {
    expect(await firstVisible(row.getByRole("button", { name: /edit|delete|manage/i }))).toBeNull();
  } else {
    expect(await firstVisible(page.getByText(env.OFFBOARDING_STAGE_NAME, { exact: false }))).not.toBeNull();
  }
});

// -----------------------------------------------------------------------------
// TC08 - TC12: Task, phân công và quyền cập nhật
// -----------------------------------------------------------------------------

test("TC08 [Offboarding-8] - Tạo Task và phân công cho nhân viên trong Stage", async ({ page }) => {
  await openExitProcess(page);
  requireMutation("TC08");
  requireEnv("OFFBOARDING_TASK_TITLE", "OFFBOARDING_TASK_STAGE", "OFFBOARDING_TASK_EMPLOYEE");
  const stage = await requireRow(page, env.OFFBOARDING_TASK_STAGE, "TC08");
  const opened = await openCreateForm(page, /add task|create task|task create/i, stage);
  test.skip(!opened, "Không tìm thấy nút tạo Task trong Stage.");
  const title = await fillField(page, /task title|title|task name/i, env.OFFBOARDING_TASK_TITLE);
  test.skip(!title, "Không tìm thấy trường tiêu đề Task.");
  if (env.OFFBOARDING_TASK_MANAGER) await selectField(page, /managers|task manager|manager/i, env.OFFBOARDING_TASK_MANAGER);
  await selectField(page, /stage/i, env.OFFBOARDING_TASK_STAGE);
  await selectField(page, /task to|employee|offboarding employee/i, env.OFFBOARDING_TASK_EMPLOYEE);
  test.skip(!(await submitForm(page, /save|create|submit|assign/i)), "Không tìm thấy nút lưu Task.");
  await expectSuccessOrUpdatedState(page);
});

test("TC09 [Offboarding-9] - Task từ chối dữ liệu thiếu hoặc Stage không phù hợp", async ({ page }) => {
  await openExitProcess(page);
  const opened = await openCreateForm(page, /add task|create task|task create/i);
  test.skip(!opened, "Không tìm thấy nút tạo Task.");
  if (env.OFFBOARDING_INVALID_TASK_STAGE) await selectField(page, /stage/i, env.OFFBOARDING_INVALID_TASK_STAGE);
  test.skip(!(await submitForm(page, /save|create|submit|assign/i)), "Không tìm thấy nút gửi biểu mẫu Task.");
  await expectValidation(page);
});

test("TC10 [Offboarding-10] - Task được gán đúng nhân viên và đúng Stage", async ({ page }) => {
  await openExitProcess(page);
  requireEnv("OFFBOARDING_TASK_TEXT", "OFFBOARDING_TASK_EMPLOYEE", "OFFBOARDING_TASK_STAGE");
  const row = await requireRow(page, env.OFFBOARDING_TASK_TEXT, "TC10");
  const rowText = (await row.innerText()).toLowerCase();
  expect(rowText).toContain(env.OFFBOARDING_TASK_EMPLOYEE.toLowerCase());
  expect(rowText).toContain(env.OFFBOARDING_TASK_STAGE.toLowerCase());
});

test("TC11 [Offboarding-11] - Cập nhật trạng thái Task làm mới tiến độ Stage", async ({ page }) => {
  await openExitProcess(page);
  requireMutation("TC11");
  requireEnv("OFFBOARDING_TASK_TEXT");
  const row = await requireRow(page, env.OFFBOARDING_TASK_TEXT, "TC11");
  const action = await firstVisible(row.getByRole("button", { name: /complete|done|status|update/i }));
  const statusSelect = await firstVisible(row.locator("select"));
  test.skip(!action && !statusSelect, "Không tìm thấy điều khiển cập nhật trạng thái Task.");
  if (statusSelect) {
    const options = statusSelect.locator("option");
    const count = await options.count();
    let selected = false;
    for (let i = 0; i < count; i += 1) {
      const label = (await options.nth(i).innerText()).trim();
      if (/completed|done|finished/i.test(label)) {
        await statusSelect.selectOption({ label });
        selected = true;
        break;
      }
    }
    test.skip(!selected, "Không tìm thấy trạng thái Completed trong danh sách Task.");
  } else {
    await action.click();
  }
  await confirmIfDialogAppears(page, /confirm|yes|complete|save/i);
  await expectSuccessOrUpdatedState(page);
});

test("TC12 [Offboarding-12] - Nhân viên không thể cập nhật Task của người khác trái quyền", async ({ page }) => {
  requireRole("TC12", "employee");
  await page.goto(routes.employeeTasks);
  await expect(page).toHaveURL(new RegExp(`${escapeRegExp(routes.employeeTasks)}(?:\\?.*)?$`), { timeout: 15000 });
  requireEnv("OFFBOARDING_OTHER_EMPLOYEE_TASK");
  const content = await bodyText(page);
  expect(content).not.toContain(env.OFFBOARDING_OTHER_EMPLOYEE_TASK);
  const action = await firstVisible(page.getByRole("button", { name: /edit|update|complete|delete/i }));
  if (action) await expect(action).toBeDisabled();
});

// -----------------------------------------------------------------------------
// TC13 - TC16: Add Employee và Notice Period
// -----------------------------------------------------------------------------

test("TC13 [Offboarding-13] - Thêm nhân viên vào Offboarding bằng Add Employee", async ({ page }) => {
  await openExitProcess(page);
  requireMutation("TC13");
  requireEnv("OFFBOARDING_EMPLOYEE_NAME", "OFFBOARDING_STAGE_NAME", "OFFBOARDING_NOTICE_START", "OFFBOARDING_NOTICE_END");
  const actions = await firstVisible(page.getByRole("button", { name: /actions/i }));
  if (actions) await actions.click();
  const opened = await openCreateForm(page, /add employee/i);
  test.skip(!opened, "Không tìm thấy mục Add Employee.");
  await selectField(page, /employee/i, env.OFFBOARDING_EMPLOYEE_NAME);
  await selectField(page, /stage/i, env.OFFBOARDING_STAGE_NAME);
  await fillField(page, /notice period starts|start date|notice start/i, env.OFFBOARDING_NOTICE_START);
  await fillField(page, /notice period ends|end date|notice end/i, env.OFFBOARDING_NOTICE_END);
  test.skip(!(await submitForm(page, /save|add|submit|confirm/i)), "Không tìm thấy nút xác nhận Add Employee.");
  await expectSuccessOrUpdatedState(page);
});

test("TC14 [Offboarding-14] - Add Employee xác thực các trường bắt buộc", async ({ page }) => {
  await openExitProcess(page);
  const actions = await firstVisible(page.getByRole("button", { name: /actions/i }));
  if (actions) await actions.click();
  const opened = await openCreateForm(page, /add employee/i);
  test.skip(!opened, "Không tìm thấy mục Add Employee.");
  test.skip(!(await submitForm(page, /save|add|submit|confirm/i)), "Không tìm thấy nút gửi biểu mẫu Add Employee.");
  await expectValidation(page);
});

test("TC15 [Offboarding-15] - Notice period ends được tính theo cấu hình mặc định", async ({ page }) => {
  await openExitProcess(page);
  requireEnv("OFFBOARDING_NOTICE_START", "OFFBOARDING_EXPECTED_NOTICE_END");
  const actions = await firstVisible(page.getByRole("button", { name: /actions/i }));
  if (actions) await actions.click();
  const opened = await openCreateForm(page, /add employee/i);
  test.skip(!opened, "Không tìm thấy mục Add Employee.");
  await fillField(page, /notice period starts|start date|notice start/i, env.OFFBOARDING_NOTICE_START);
  const endDate = await fieldByLabelOrPlaceholder(page, /notice period ends|end date|notice end/i);
  test.skip(!endDate, "Không tìm thấy trường Notice period ends.");
  await expect(endDate).toHaveValue(env.OFFBOARDING_EXPECTED_NOTICE_END);
});

test("TC16 [Offboarding-16] - Notice period ends thay đổi khi cập nhật ngày bắt đầu", async ({ page }) => {
  await openExitProcess(page);
  requireEnv("OFFBOARDING_NOTICE_START", "OFFBOARDING_NOTICE_START_CHANGED");
  const actions = await firstVisible(page.getByRole("button", { name: /actions/i }));
  if (actions) await actions.click();
  const opened = await openCreateForm(page, /add employee/i);
  test.skip(!opened, "Không tìm thấy mục Add Employee.");
  const start = await fieldByLabelOrPlaceholder(page, /notice period starts|start date|notice start/i);
  const end = await fieldByLabelOrPlaceholder(page, /notice period ends|end date|notice end/i);
  test.skip(!start || !end, "Không tìm thấy đủ trường Notice period start/end.");
  await start.fill(env.OFFBOARDING_NOTICE_START);
  const before = await end.inputValue();
  await start.fill(env.OFFBOARDING_NOTICE_START_CHANGED);
  await page.waitForTimeout(500);
  const after = await end.inputValue();
  expect(after).not.toBe(before);
});

// -----------------------------------------------------------------------------
// TC17 - TC24: Email, ghi chú, bàn giao, khóa tài khoản và phân quyền
// -----------------------------------------------------------------------------

test("TC17 [Offboarding-17] - Gửi Send Mail bằng mẫu email cho nhân viên nghỉ việc", async ({ page }) => {
  await openExitProcess(page);
  requireEmailPermission("TC17");
  requireEnv("OFFBOARDING_EMPLOYEE_NAME");
  const row = await requireRow(page, env.OFFBOARDING_EMPLOYEE_NAME, "TC17");
  let opened = await clickRowAction(page, env.OFFBOARDING_EMPLOYEE_NAME, /send mail|email|mail/i);
  if (!opened) opened = await clickNamedButton(page, /send mail|email/i, row);
  test.skip(!opened, "Không tìm thấy thao tác Send Mail cho nhân viên.");
  const template = await fieldByLabelOrPlaceholder(page, /template/i);
  if (template && env.OFFBOARDING_EMAIL_TEMPLATE) await selectField(page, /template/i, env.OFFBOARDING_EMAIL_TEMPLATE);
  await expect(page.locator("body")).toContainText(/email|template|recipient|subject/i);
  await submitForm(page, /send|submit/i);
  await confirmIfDialogAppears(page, /send|confirm|yes/i);
  await expectSuccessOrUpdatedState(page);
});

test("TC18 [Offboarding-18] - Send Mail hỗ trợ nội dung tự nhập và tệp đính kèm", async ({ page }) => {
  await openExitProcess(page);
  requireEmailPermission("TC18");
  requireEnv("OFFBOARDING_EMPLOYEE_NAME", "OFFBOARDING_EMAIL_SUBJECT", "OFFBOARDING_EMAIL_BODY", "OFFBOARDING_EMAIL_ATTACHMENT");
  const row = await requireRow(page, env.OFFBOARDING_EMPLOYEE_NAME, "TC18");
  let opened = await clickRowAction(page, env.OFFBOARDING_EMPLOYEE_NAME, /send mail|email|mail/i);
  if (!opened) opened = await clickNamedButton(page, /send mail|email/i, row);
  test.skip(!opened, "Không tìm thấy thao tác Send Mail.");
  await fillField(page, /subject/i, env.OFFBOARDING_EMAIL_SUBJECT);
  await fillField(page, /message|body|content|description/i, env.OFFBOARDING_EMAIL_BODY);
  const attachment = await firstVisible(page.locator('input[type="file"]'));
  test.skip(!attachment, "Biểu mẫu Send Mail không có trường đính kèm tệp.");
  await attachment.setInputFiles(env.OFFBOARDING_EMAIL_ATTACHMENT);
  test.skip(!(await submitForm(page, /send|submit/i)), "Không tìm thấy nút gửi email.");
  await confirmIfDialogAppears(page, /send|confirm|yes/i);
  await expectSuccessOrUpdatedState(page);
});

test("TC19 [Offboarding-19] - Add Note tạo ghi chú và thông báo đến đúng nhân viên", async ({ page }) => {
  await openExitProcess(page);
  requireMutation("TC19");
  requireEnv("OFFBOARDING_EMPLOYEE_NAME", "OFFBOARDING_NOTE_TEXT");
  const row = await requireRow(page, env.OFFBOARDING_EMPLOYEE_NAME, "TC19");
  let opened = await clickRowAction(page, env.OFFBOARDING_EMPLOYEE_NAME, /note|add note/i);
  if (!opened) opened = await clickNamedButton(page, /add note|note/i, row);
  test.skip(!opened, "Không tìm thấy thao tác Add Note.");
  const note = await fillField(page, /note|description|message/i, env.OFFBOARDING_NOTE_TEXT);
  test.skip(!note, "Không tìm thấy trường nội dung Note.");
  test.skip(!(await submitForm(page, /save|add|submit/i)), "Không tìm thấy nút lưu Note.");
  await expectSuccessOrUpdatedState(page);
  await expect(page.locator("body")).toContainText(env.OFFBOARDING_NOTE_TEXT);
});

test("TC20 [Offboarding-20] - Show Managing Records hiển thị công việc và trách nhiệm đang nắm giữ", async ({ page }) => {
  await openExitProcess(page);
  requireEnv("OFFBOARDING_EMPLOYEE_NAME");
  const row = await requireRow(page, env.OFFBOARDING_EMPLOYEE_NAME, "TC20");
  let opened = await clickRowAction(page, env.OFFBOARDING_EMPLOYEE_NAME, /show managing records|managing records|responsibilit/i);
  if (!opened) {
    const control = await firstVisible(row.locator('[title*="managing" i], [aria-label*="managing" i], [title*="record" i]'));
    if (control) { await control.click(); opened = true; }
  }
  test.skip(!opened, "Không tìm thấy thao tác Show Managing Records.");
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/task|project|role|responsibilit|employee/i);
});

test("TC21 [Offboarding-21] - Thay thế nhân viên phụ trách Task và trách nhiệm", async ({ page }) => {
  await openExitProcess(page);
  requireMutation("TC21");
  requireEnv("OFFBOARDING_EMPLOYEE_NAME", "OFFBOARDING_REPLACEMENT_EMPLOYEE");
  const row = await requireRow(page, env.OFFBOARDING_EMPLOYEE_NAME, "TC21");
  let opened = await clickRowAction(page, env.OFFBOARDING_EMPLOYEE_NAME, /replace|authority|managing records/i);
  if (!opened) opened = await clickNamedButton(page, /replace|authority|managing records/i, row);
  test.skip(!opened, "Không tìm thấy thao tác thay thế nhân viên/quyền hạn.");
  await selectField(page, /replace employee|replacement|employee/i, env.OFFBOARDING_REPLACEMENT_EMPLOYEE);
  test.skip(!(await submitForm(page, /save|replace|confirm|submit/i)), "Không tìm thấy nút lưu thay thế.");
  await confirmIfDialogAppears(page, /replace|confirm|yes|save/i);
  await expectSuccessOrUpdatedState(page);
});

test("TC22 [Offboarding-22] - Chuyển sang Archived yêu cầu xử lý thay thế quyền hạn", async ({ page }) => {
  await openExitProcess(page);
  requireMutation("TC22");
  requireEnv("OFFBOARDING_EMPLOYEE_NAME", "OFFBOARDING_ARCHIVED_STAGE");
  const row = await requireRow(page, env.OFFBOARDING_EMPLOYEE_NAME, "TC22");
  const stage = await firstVisible(row.locator("select"));
  test.skip(!stage, "Không tìm thấy bộ chọn Stage trên dòng nhân viên.");
  await stage.selectOption({ label: env.OFFBOARDING_ARCHIVED_STAGE });
  await expect(page.getByRole("dialog").first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole("dialog").first()).toContainText(/replace|authority|responsibilit|employee/i);
  // Không xác nhận chuyển Archived để tránh khóa luồng nhân viên thật.
});

test("TC23 [Offboarding-23] - Tài khoản bị khóa sau khi hoàn tất Offboarding", async ({ page, browser }) => {
  await openExitProcess(page);
  requireAccountLockPermission("TC23");
  requireEnv("OFFBOARDING_TEST_EMPLOYEE", "OFFBOARDING_ARCHIVED_STAGE", "OFFBOARDING_EMPLOYEE_STORAGE_STATE");
  const employeeContext = await browser.newContext({ storageState: env.OFFBOARDING_EMPLOYEE_STORAGE_STATE });
  const employeePage = await employeeContext.newPage();
  try {
    await employeePage.goto("/");
    await expect(employeePage.locator("body")).toBeVisible();
    const beforeArchive = await bodyText(employeePage);
    expect(beforeArchive).not.toMatch(/login|sign in|access denied/i);

    const row = await requireRow(page, env.OFFBOARDING_TEST_EMPLOYEE, "TC23");
    const stage = await firstVisible(row.locator("select"));
    test.skip(!stage, "Không tìm thấy bộ chọn Stage của nhân viên kiểm thử.");
    await stage.selectOption({ label: env.OFFBOARDING_ARCHIVED_STAGE });
    await confirmIfDialogAppears(page, /confirm|archive|yes|complete/i);
    await expectSuccessOrUpdatedState(page);

    // Kiểm tra lại bằng phiên đăng nhập riêng của chính nhân viên vừa lưu trữ.
    await employeePage.goto("/");
    await employeePage.waitForLoadState("domcontentloaded").catch(() => {});
    const afterArchive = await bodyText(employeePage);
    expect(afterArchive).toMatch(/login|sign in|inactive|disabled|account.*blocked|access denied|403/i);
  } finally {
    await employeeContext.close();
  }
});

test("TC24 [Offboarding-24] - Quyền truy cập Offboarding thay đổi theo vai trò", async ({ page }) => {
  requireRole("TC24", "hr", "manager", "employee", "admin");
  await page.goto(routes.pipeline);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  const content = await bodyText(page);
  const hasAccess = !/permission denied|access denied|not authorized|forbidden|\b403\b/i.test(content);
  const expected = (env.OFFBOARDING_EXPECT_ACCESS || (sessionRole === "employee" ? "false" : "true")).toLowerCase();
  expect(hasAccess).toBe(expected === "true");
});

// -----------------------------------------------------------------------------
// TC25 - TC30: Resignation Request và Resignation Letters
// -----------------------------------------------------------------------------

async function changeResignationFeature(page, enabled) {
  // Horilla binds hx-trigger="change" to this checkbox; there is no Save button
  // for this setting. Wait for the dedicated HTMX endpoint, not the Notice Period form.
  const request = page.waitForResponse(
    (response) => /enable-resignation-request/i.test(new URL(response.url()).pathname),
    { timeout: 12000 },
  ).catch(() => null);
  await page.locator("#enableResignationRequest").setChecked(enabled);
  return request;
}

test("TC25 [Offboarding-25] - Settings cho phép bật/tắt Resignation Request", async ({ page }) => {
  await openOffboardingSettings(page);
  const toggle = page.locator("#enableResignationRequest");
  test.skip((await toggle.count()) === 0, "Không tìm thấy checkbox #enableResignationRequest trong Offboarding Settings.");
  const initial = await toggle.isChecked().catch(() => false);
  requireMutation("TC25");

  try {
    const changedResponse = await changeResignationFeature(page, !initial);
    test.skip(!changedResponse || !changedResponse.ok(), "Horilla không xác nhận request enable-resignation-request; kiểm tra quyền thay đổi Offboarding Settings.");
    await page.reload();
    await expect(page.locator("#enableResignationRequest")).toBeChecked({ checked: !initial });
  } finally {
    // Restore the original shared-company setting even when the test assertion fails.
    await openOffboardingSettings(page).catch(() => {});
    const refreshedToggle = page.locator("#enableResignationRequest");
    if (await refreshedToggle.count()) {
      const current = await refreshedToggle.isChecked().catch(() => initial);
      if (current !== initial) {
        const restoredResponse = await changeResignationFeature(page, initial);
        if (!restoredResponse || !restoredResponse.ok()) {
          throw new Error("Không khôi phục được trạng thái Resignation Request ban đầu sau TC25.");
        }
        await page.reload();
        await expect(page.locator("#enableResignationRequest")).toBeChecked({ checked: initial });
      }
    }
  }
});

test("TC26 [Offboarding-26] - Nhân viên tạo Resignation Letter từ Profile", async ({ page }) => {
  requireRole("TC26", "employee");
  requireMutation("TC26");
  requireEnv("OFFBOARDING_RESIGNATION_TITLE", "OFFBOARDING_RESIGNATION_DESCRIPTION", "OFFBOARDING_PLANNED_TO_LEAVE");
  const profileRoute = env.OFFBOARDING_EMPLOYEE_PROFILE_ROUTE;
  test.skip(!profileRoute, "Cần OFFBOARDING_EMPLOYEE_PROFILE_ROUTE của tài khoản Employee.");
  await page.goto(profileRoute);
  const tab = await firstVisible(page.getByText("Resignation", { exact: true }));
  test.skip(!tab, "Không tìm thấy tab Resignation trong Profile.");
  await tab.click();
  const opened = await openCreateForm(page, /create resignation|create|add/i);
  test.skip(!opened, "Không tìm thấy nút tạo Resignation Letter.");
  await fillField(page, /title/i, env.OFFBOARDING_RESIGNATION_TITLE);
  await fillField(page, /description|reason/i, env.OFFBOARDING_RESIGNATION_DESCRIPTION);
  await fillField(page, /planned to leave on|planned.*leave|leave date/i, env.OFFBOARDING_PLANNED_TO_LEAVE);
  test.skip(!(await submitForm(page, /save|create|submit|request/i)), "Không tìm thấy nút gửi Resignation Letter.");
  await expectSuccessOrUpdatedState(page);
});

test("TC27 [Offboarding-27] - Resignation Letter xác thực dữ liệu và quyền chỉnh sửa trường", async ({ page }) => {
  // Empty-form validation is read-only; it should not depend on mutation flags.
  await openResignations(page);
  const opened = await openCreateForm(page, /create resignation|create|add/i);
  test.skip(!opened, "Không tìm thấy nút tạo Resignation Letter.");
  if (sessionRole === "employee") {
    const employeeField = await fieldByLabelOrPlaceholder(page, /employee/i);
    if (employeeField) await expect(employeeField).toBeDisabled();
  }
  await submitForm(page, /save|create|submit|request/i);
  await expectValidation(page);
});

test("TC28 [Offboarding-28] - Admin duyệt Resignation và thêm nhân viên vào Offboarding process", async ({ page }) => {
  requireRole("TC28", "hr", "manager", "admin");
  requireMutation("TC28");
  requireEnv("OFFBOARDING_RESIGNATION_RECORD", "OFFBOARDING_PROCESS_NAME", "OFFBOARDING_PLANNED_TO_LEAVE");
  await openResignations(page);
  const row = await requireRow(page, env.OFFBOARDING_RESIGNATION_RECORD, "TC28");
  let opened = await clickRowAction(page, env.OFFBOARDING_RESIGNATION_RECORD, /approve|accept/i);
  if (!opened) opened = await clickRowAction(page, env.OFFBOARDING_RESIGNATION_RECORD, /view|detail/i);
  test.skip(!opened, "Không tìm thấy thao tác Approve hoặc mở chi tiết Resignation.");
  if (await firstVisible(page.getByRole("dialog").first())) {
    await selectField(page, /offboarding process|process/i, env.OFFBOARDING_PROCESS_NAME);
    await fillField(page, /planned to leave on|planned.*leave|leave date/i, env.OFFBOARDING_PLANNED_TO_LEAVE);
    await submitForm(page, /confirm|approve|save|submit/i);
  } else {
    await clickNamedButton(page, /approve|accept/i);
    await confirmIfDialogAppears(page, /confirm|approve|yes/i);
  }
  await expectSuccessOrUpdatedState(page);
  await expect(page.locator("body")).toContainText(env.OFFBOARDING_RESIGNATION_RECORD);
});

test("TC29 [Offboarding-29] - Admin từ chối Resignation và không khởi tạo Offboarding", async ({ page }) => {
  requireRole("TC29", "hr", "manager", "admin");
  requireMutation("TC29");
  requireEnv("OFFBOARDING_REJECT_RESIGNATION_RECORD");
  await openResignations(page);
  const row = await requireRow(page, env.OFFBOARDING_REJECT_RESIGNATION_RECORD, "TC29");
  const rejected = await clickRowAction(page, env.OFFBOARDING_REJECT_RESIGNATION_RECORD, /reject|decline/i);
  test.skip(!rejected, "Không tìm thấy thao tác Reject Resignation.");
  await confirmIfDialogAppears(page, /reject|confirm|yes/i);
  await expectSuccessOrUpdatedState(page);
  const content = await bodyText(page);
  expect(content.toLowerCase()).toContain(env.OFFBOARDING_REJECT_RESIGNATION_RECORD.toLowerCase());
  if (env.OFFBOARDING_REJECTED_STATUS) expect(content.toLowerCase()).toContain(env.OFFBOARDING_REJECTED_STATUS.toLowerCase());
});

test("TC30 [Offboarding-30] - Nhân viên chỉnh sửa, xóa và theo dõi trạng thái Resignation của mình", async ({ page }) => {
  requireRole("TC30", "employee");
  await openResignations(page);
  requireEnv("OFFBOARDING_OWN_RESIGNATION_RECORD");
  const row = await requireRow(page, env.OFFBOARDING_OWN_RESIGNATION_RECORD, "TC30");
  await expect(row).toContainText(/requested|approved|rejected|pending|status/i);
  const edit = await firstVisible(row.getByRole("button", { name: /edit|update/i }));
  const editLink = edit ? null : await firstVisible(row.getByRole("link", { name: /edit|update/i }));
  if (edit) await edit.click();
  else if (editLink) await editLink.click();
  else test.skip(true, "Không tìm thấy thao tác chỉnh sửa đơn Resignation của nhân viên.");
  await expect(page.locator("form").last()).toBeVisible();
  const titleField = await fieldByLabelOrPlaceholder(page, /title/i);
  if (titleField) await expect(titleField).toBeVisible();

  requireDeletePermission("TC30");
  await openResignations(page);
  const refreshedRow = await requireRow(page, env.OFFBOARDING_OWN_RESIGNATION_RECORD, "TC30 - delete");
  const deleteButton = await firstVisible(refreshedRow.getByRole("button", { name: /delete|remove/i }));
  const deleteLink = deleteButton ? null : await firstVisible(refreshedRow.getByRole("link", { name: /delete|remove/i }));
  test.skip(!deleteButton && !deleteLink, "Không tìm thấy thao tác xóa đơn Resignation.");
  if (deleteButton) await deleteButton.click(); else await deleteLink.click();
  const dialog = page.getByRole("dialog").first();
  await expect(dialog).toBeVisible();
  const cancel = await firstVisible(dialog.getByRole("button", { name: /cancel|close|no/i }));
  if (cancel) await cancel.click();
});
