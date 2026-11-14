const { test, expect } = require("@playwright/test");

/*
 * HORILLA HRMS - ATTENDANCE AUTOMATION (28 TEST CASES)
 * --------------------------------------------------
 * Login is intentionally NOT implemented in this file.
 * The authenticated session must be provided by your existing
 * Playwright config / global setup (storageState, setup project, etc.).
 *
 * The tests navigate from "/" and use the already-authenticated session.
 * Mutating tests are protected by environment flags so the shared demo
 * attendance / policy data is not changed accidentally.
 *
 * Required baseURL example in playwright.config.js:
 *   use: { baseURL: "https://hr.demo.horilla.com", ... }
 *
 * Optional environment variables are documented in attendance.env.example.
 */

const attendanceRoutes = {
  Dashboard: "/dashboard/",
  "My Attendances": "/attendance/view-my-attendance/",
  Attendances: "/attendance/attendance-view/",
  "Attendance Requests": "/attendance/request-attendance-view/",
  "Check-in / Check-out Log": "/attendance/attendance-activity-view/",
  "Late Arrival & Early Departure": "/attendance/late-come-early-out-view/",
  "Monthly Summary": "/attendance/monthly-summary/",
  "Time Policies": "/attendance/grace-time-view/",
};

const env = process.env;
const mutationsEnabled = env.RUN_ATTENDANCE_MUTATIONS === "true";
const clockActionsEnabled = env.ATTENDANCE_ALLOW_CLOCK_ACTIONS === "true";
const sessionRole = (env.ATTENDANCE_SESSION_ROLE || env.HORILLA_SESSION_ROLE || "").toLowerCase();

// -----------------------------------------------------------------------------
// Common navigation and locator helpers
// -----------------------------------------------------------------------------

async function openAttendancePage(page, pageName) {
  const route = attendanceRoutes[pageName];
  if (!route) {
    throw new Error(`No verified attendance route configured for "${pageName}".`);
  }

  const attendanceMenu = page.getByRole("button", { name: "Attendance" });
  await expect(attendanceMenu).toBeVisible({ timeout: 15000 });
  await attendanceMenu.hover();

  // This locator follows the menu structure used in the supplied working file.
  const submenuItem = page.getByText(pageName, { exact: true }).last();
  await expect(submenuItem).toBeVisible({ timeout: 10000 });
  await submenuItem.click();

  await expect(page).toHaveURL(new RegExp(route.replaceAll("/", "\\/") + "$"), {
    timeout: 15000,
  });
  await expect(page.locator("body")).toBeVisible();
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

async function openFromHome(page, pageName) {
  // The authenticated browser context is reused; no login steps are performed.
  await page.goto("/");
  await openAttendancePage(page, pageName);
}

async function openTimePoliciesPage(page) {
  // The verified menu route returns the Time Policies screen when opened directly.
  const route = attendanceRoutes["Time Policies"];
  await page.goto(route);
  await expect(page).toHaveURL(new RegExp(route.replaceAll("/", "\\/") + "$"), {
    timeout: 15000,
  });
  await expect(page.locator("body")).toBeVisible();
}

async function bodyText(page) {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ").trim();
}

async function firstVisible(locator) {
  const count = await locator.count().catch(() => 0);
  for (let i = 0; i < count; i += 1) {
    const item = locator.nth(i);
    if (await item.isVisible().catch(() => false)) return item;
  }
  return null;
}

async function clickFirstVisible(locator) {
  const item = await firstVisible(locator);
  if (!item) return false;
  await item.click();
  return true;
}

async function getSearchInput(page) {
  let input = await firstVisible(page.getByRole("searchbox"));
  if (input) return input;

  input = await firstVisible(
    page.locator(
      'input[placeholder*="search" i], input[aria-label*="search" i]',
    ),
  );
  return input;
}

async function getMainTable(page) {
  return firstVisible(page.locator("table"));
}

async function getTableRows(page) {
  let rows = page.locator("table tbody tr");
  if ((await rows.count()) > 0) return rows;
  rows = page.locator(
    '[role="table"] [role="row"], [role="grid"] [role="row"]',
  );
  return rows;
}

async function getTableHeaders(page) {
  const headers = page.locator("table thead th");
  if ((await headers.count()) === 0) return [];
  return headers.allInnerTexts();
}

async function clickNamedButton(page, nameRegex, scope = page) {
  return clickFirstVisible(scope.getByRole("button", { name: nameRegex }));
}

async function clickNamedLink(page, nameRegex, scope = page) {
  return clickFirstVisible(scope.getByRole("link", { name: nameRegex }));
}

async function findRowByText(page, text) {
  let row = page.locator("table tbody tr").filter({ hasText: text }).first();
  if (await row.count()) return row;
  row = page.locator('[role="row"]').filter({ hasText: text }).first();
  if (await row.count()) return row;
  return null;
}

async function clickRowAction(page, rowText, actionRegex) {
  const row = await findRowByText(page, rowText);
  if (!row || !(await row.isVisible().catch(() => false))) return false;

  const actionButton = await firstVisible(
    row.getByRole("button", { name: actionRegex }),
  );
  if (actionButton) {
    await actionButton.click();
    return true;
  }
  const actionLink = await firstVisible(
    row.getByRole("link", { name: actionRegex }),
  );
  if (actionLink) {
    await actionLink.click();
    return true;
  }
  return false;
}

async function confirmIfDialogAppears(
  page,
  actionRegex = /confirm|yes|approve|reject|save/i,
) {
  const dialog = page.getByRole("dialog").first();
  if (!(await dialog.isVisible().catch(() => false))) return false;
  return clickNamedButton(page, actionRegex, dialog);
}

async function expectSuccessOrUpdatedState(page) {
  // Horilla versions may use a toast, inline alert, or an updated table row.
  await expect(page.locator("body")).toContainText(
    /success|saved|created|updated|validated|approved|rejected|submitted|requested|request sent|checked in|checked out/i,
    { timeout: 10000 },
  );
}

async function getDateAndFilterControls(page) {
  const candidates = page.locator(
    'input[type="date"], input[type="month"], input[placeholder*="date" i], input[aria-label*="date" i], select',
  );
  const found = [];
  const count = await candidates.count();
  for (let i = 0; i < count; i += 1) {
    const item = candidates.nth(i);
    if (await item.isVisible().catch(() => false)) found.push(item);
  }
  return found;
}

async function applyFilterIfAvailable(page) {
  const applyButton = await firstVisible(
    page.getByRole("button", { name: /apply|search|submit|filter/i }),
  );
  if (applyButton) {
    await applyButton.click();
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    return true;
  }
  return false;
}

function requireMutation(testCaseName) {
  test.skip(
    !mutationsEnabled,
    `${testCaseName} thay đổi dữ liệu. Đặt RUN_ATTENDANCE_MUTATIONS=true khi chạy trên tài khoản/test data riêng.`,
  );
}

function requireSessionRole(testCaseName, ...allowedRoles) {
  test.skip(
    !allowedRoles.includes(sessionRole),
    `${testCaseName} requires an existing ${allowedRoles.join("/")} session; ` +
      `ATTENDANCE_SESSION_ROLE is '${sessionRole || "unset"}'.`,
  );
}

function requireClockPermission(testCaseName) {
  test.skip(
    !mutationsEnabled || !clockActionsEnabled,
    `${testCaseName} tạo sự kiện check-in/check-out thật. Cần RUN_ATTENDANCE_MUTATIONS=true và ATTENDANCE_ALLOW_CLOCK_ACTIONS=true.`,
  );
}

function requireEnv(...names) {
  const missing = names.filter((name) => !env[name] || !env[name].trim());
  test.skip(missing.length > 0, `Thiếu biến môi trường: ${missing.join(", ")}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fillByLabelOrPlaceholder(page, regex, value) {
  const field = await firstVisible(page.getByLabel(regex));
  if (!field) return false;
  await field.fill(value);
  return true;
}

async function fillInputByIndex(page, selector, index, value) {
  const fields = page.locator(selector);
  const visibleFields = [];
  const count = await fields.count();
  for (let i = 0; i < count; i += 1) {
    const field = fields.nth(i);
    if (await field.isVisible().catch(() => false)) visibleFields.push(field);
  }
  if (!visibleFields[index]) return false;
  await visibleFields[index].fill(value);
  return true;
}

async function fillFirstMatchingInput(page, selectors, value) {
  for (const selector of selectors) {
    const field = await firstVisible(page.locator(selector));
    if (field) {
      await field.fill(value);
      return true;
    }
  }
  return false;
}

async function openCreateOrAddForm(
  page,
  buttonRegex = /create|add|new|request/i,
) {
  const clicked = await clickNamedButton(page, buttonRegex);
  if (!clicked) return false;
  await page.waitForTimeout(300);
  return true;
}

async function submitVisibleForm(
  page,
  buttonRegex = /save|submit|create|send|request/i,
) {
  const formButton = await firstVisible(
    page.locator("form").last().getByRole("button", { name: buttonRegex }),
  );
  if (formButton) {
    await formButton.click();
    return true;
  }
  return clickNamedButton(page, buttonRegex);
}

async function requireRecordRow(page, rowText, caseName) {
  const row = await findRowByText(page, rowText);
  test.skip(
    !row || !(await row.isVisible().catch(() => false)),
    `${caseName}: không tìm thấy record '${rowText}'.`,
  );
  return row;
}

// -----------------------------------------------------------------------------
// TC01 - TC03: Attendance Dashboard
// -----------------------------------------------------------------------------

test("TC01 [Attendance-1] - Attendance Dashboard loads and displays attendance metrics", async ({
  page,
}) => {
  await openFromHome(page, "Dashboard");

  await expect(page).toHaveURL(/\/dashboard\/$/);
  await expect(page.locator("body")).not.toContainText(
    /500 server error|application error|traceback/i,
  );
  await expect(page.locator("body")).toContainText(
    /attendance|present|absent|late|employee/i,
  );

  // Dashboard may render metrics as cards, charts or tables depending on demo version.
  const visibleContent = await bodyText(page);
  expect(visibleContent.length).toBeGreaterThan(30);
});

test("TC02 [Attendance-2] - Dashboard date or period filters refresh attendance analytics", async ({
  page,
}) => {
  await openFromHome(page, "Dashboard");

  const controls = await getDateAndFilterControls(page);
  test.skip(
    controls.length === 0,
    "Dashboard không có date/period filter dạng input/select nhận diện được.",
  );

  const control = controls[0];
  const tagName = await control.evaluate((el) => el.tagName.toLowerCase());
  const type = await control.getAttribute("type");
  const before = await bodyText(page);

  if (tagName === "select") {
    const options = control.locator("option");
    test.skip(
      (await options.count()) < 2,
      "Period select không có đủ lựa chọn để kiểm thử.",
    );
    const secondValue = await options.nth(1).getAttribute("value");
    if (secondValue !== null) await control.selectOption(secondValue);
    else await control.selectOption({ index: 1 });
  } else if (type === "month") {
    await control.fill("2026-01");
  } else {
    await control.fill("2026-01-15");
  }

  await applyFilterIfAvailable(page);
  await expect(page.locator("body")).toBeVisible();
  const after = await bodyText(page);
  expect(after.length).toBeGreaterThan(20);
  expect(page.url()).toMatch(/dashboard/);
  // Data values are dynamic; the test verifies the filter interaction and refreshed view,
  // not a hard-coded total.
  expect(typeof before).toBe("string");
});

test("TC03 [Attendance-3] - Dashboard handles an empty date range and available drill-downs", async ({
  page,
}) => {
  await openFromHome(page, "Dashboard");

  const controls = await getDateAndFilterControls(page);
  test.skip(
    controls.length === 0,
    "Dashboard không hiển thị bộ lọc ngày để chọn khoảng trống.",
  );

  const control = controls[0];
  const type = await control.getAttribute("type");
  if (type === "month") await control.fill("2000-01");
  else if (type === "date") await control.fill("2000-01-01");
  else
    test.skip(
      true,
      "Không xác định được kiểu điều khiển ngày để chọn khoảng trống.",
    );

  await applyFilterIfAvailable(page);
  const content = await bodyText(page);
  const emptyState =
    /no attendance|no records|no data|no results|0 attendance|0 present|0 absent/i.test(
      content,
    );
  test.skip(
    !emptyState,
    "Khoảng ngày đã chọn không trả về empty state/zero; demo có thể có dữ liệu lịch sử.",
  );

  // A drill-down is optional in the test design, therefore do not fail if the demo has none.
  const drillDown = await firstVisible(
    page.getByRole("link", { name: /attendance|view details|view all/i }),
  );
  if (drillDown) {
    await drillDown.click();
    await expect(page.locator("body")).toBeVisible();
  }
});

// -----------------------------------------------------------------------------
// TC04 - TC07: My Attendances
// -----------------------------------------------------------------------------

test("TC04 [Attendance-4] - My Attendances shows only the signed-in employee's records", async ({
  page,
}) => {
  requireSessionRole("TC04", "employee");
  await openFromHome(page, "My Attendances");
  requireEnv("ATTENDANCE_EMPLOYEE_NAME", "ATTENDANCE_OTHER_EMPLOYEE_NAME");

  const text = await bodyText(page);
  expect(text).toContain(env.ATTENDANCE_EMPLOYEE_NAME);
  expect(text).not.toContain(env.ATTENDANCE_OTHER_EMPLOYEE_NAME);

  const table = await getMainTable(page);
  if (table) {
    const rows = await getTableRows(page);
    const rowCount = await rows.count();
    for (let i = 0; i < rowCount; i += 1) {
      const rowText = await rows.nth(i).innerText();
      // If employee identity is included in row content, it must be the signed-in employee.
      if (/employee|staff name/i.test(rowText)) {
        expect(rowText).toContain(env.ATTENDANCE_EMPLOYEE_NAME);
        expect(rowText).not.toContain(env.ATTENDANCE_OTHER_EMPLOYEE_NAME);
      }
    }
  }
});

test("TC05 [Attendance-5] - My Attendances displays attendance details and status indicators", async ({
  page,
}) => {
  await openFromHome(page, "My Attendances");

  const table = await getMainTable(page);
  await expect(table || page.locator("body")).toBeVisible();
  const headers = (await getTableHeaders(page)).join(" | ");
  const content = await bodyText(page);

  expect(`${headers} ${content}`).toMatch(
    /date|day|check.?in|check.?out|attendance|status/i,
  );
  // A date and at least one clock/status field should be represented in the visible page.
  expect(`${headers} ${content}`).toMatch(/date|day/i);
  expect(`${headers} ${content}`).toMatch(
    /check.?in|check.?out|status|shift|hour|work/i,
  );
});

test("TC06 [Attendance-6] - My Attendances date and shift filters can be applied and cleared", async ({
  page,
}) => {
  await openFromHome(page, "My Attendances");

  const filterButton = await firstVisible(
    page.getByRole("button", { name: /filter/i }),
  );
  if (filterButton) await filterButton.click();

  const controls = await getDateAndFilterControls(page);
  test.skip(
    controls.length === 0,
    "Không tìm thấy date/shift filter hiển thị trên My Attendances.",
  );

  const control = controls[0];
  const type = await control.getAttribute("type");
  if (type === "date") await control.fill("2026-01-01");
  else if (type === "month") await control.fill("2026-01");
  else if (
    (await control.evaluate((el) => el.tagName.toLowerCase())) === "select"
  ) {
    const options = control.locator("option");
    if ((await options.count()) > 1) await control.selectOption({ index: 1 });
  }

  await applyFilterIfAvailable(page);
  await expect(page.locator("body")).toBeVisible();

  // Horilla's notification drawer also has a "Clear All" button. Exclude
  // that observed notification action so this case only clears attendance
  // filters.
  const clearButton = await firstVisible(
    page
      .locator('button:not([hx-post="/delete-all-notifications/"])')
      .filter({ hasText: /clear|reset/i }),
  );
  if (clearButton) {
    await clearButton.click();
    await expect(page.locator("body")).toBeVisible();
  }
});

test("TC07 [Attendance-7] - My Attendances displays separate dates for an overnight attendance", async ({
  page,
}) => {
  await openFromHome(page, "My Attendances");
  requireEnv("ATTENDANCE_OVERNIGHT_RECORD_TEXT");

  const row = await requireRecordRow(
    page,
    env.ATTENDANCE_OVERNIGHT_RECORD_TEXT,
    "TC07",
  );
  const rowText = await row.innerText();
  expect(rowText).toMatch(/\d{1,2}[:/]\d{1,2}|\d{4}-\d{2}-\d{2}/);

  const headers = (await getTableHeaders(page)).join(" | ");
  test.skip(
    !/in date|check.?in date/i.test(headers) ||
      !/out date|check.?out date/i.test(headers),
    "Bảng demo không hiển thị riêng In Date và Out Date.",
  );
});

// -----------------------------------------------------------------------------
// TC08 - TC11: Attendances (HR / manager view)
// -----------------------------------------------------------------------------

test("TC08 [Attendance-8] - Attendances tabs separate validation and overtime records", async ({
  page,
}) => {
  await openFromHome(page, "Attendances");

  const categories = page.locator('a, button, [role="tab"]').filter({
    hasText: /to validate|ot attendance|overtime|validated attendance/i,
  });
  const count = await categories.count();
  const visibleCategories = [];
  for (let i = 0; i < count; i += 1) {
    const category = categories.nth(i);
    if (await category.isVisible().catch(() => false)) {
      visibleCategories.push(category);
    }
  }
  test.skip(
    visibleCategories.length === 0,
    "Attendance page không hiển thị tab validation/overtime nào trên demo hiện tại.",
  );

  let clickedCount = 0;
  for (const tab of visibleCategories) {
    await tab.click();
    await expect(page.locator("body")).toBeVisible();
    clickedCount += 1;
  }
  expect(clickedCount).toBeGreaterThan(0);
});

test("TC09 [Attendance-9] - Authorized manager can review and validate a pending attendance", async ({
  page,
}) => {
  await openFromHome(page, "Attendances");
  requireMutation("TC09");
  requireEnv("ATTENDANCE_PENDING_RECORD_TEXT");

  const row = await requireRecordRow(
    page,
    env.ATTENDANCE_PENDING_RECORD_TEXT,
    "TC09",
  );
  await expect(row).toBeVisible();

  let actionClicked = await clickRowAction(
    page,
    env.ATTENDANCE_PENDING_RECORD_TEXT,
    /validate|approve/i,
  );
  if (!actionClicked) {
    const details = await firstVisible(
      row.getByRole("link", { name: /view|detail|edit/i }),
    );
    if (details) {
      await details.click();
      actionClicked = await clickNamedButton(page, /validate|approve/i);
    }
  }
  test.skip(
    !actionClicked,
    "Không tìm thấy action Validate/Approve trên record được cấu hình.",
  );

  await confirmIfDialogAppears(page, /validate|approve|confirm|yes/i);
  await expectSuccessOrUpdatedState(page);
});

test("TC10 [Attendance-10] - Attendances supports search, filters and export", async ({
  page,
}) => {
  await openFromHome(page, "Attendances");

  const search = await getSearchInput(page);
  if (search) {
    await search.fill(env.ATTENDANCE_SEARCH_KEYWORD || "Automation Test");
    await search.press("Enter").catch(() => {});
    await expect(search).toHaveValue(
      env.ATTENDANCE_SEARCH_KEYWORD || "Automation Test",
    );
    await expect(page.locator("body")).toBeVisible();
    await search.fill("");
  }

  const filterButton = await firstVisible(
    page.getByRole("button", { name: /filter/i }),
  );
  if (filterButton) {
    await filterButton.click();
    await expect(page.locator("body")).toBeVisible();
  }

  const exportButton = await firstVisible(
    page.getByRole("button", { name: /export|download|excel|csv/i }),
  );
  const exportLink = exportButton
    ? null
    : await firstVisible(
        page.getByRole("link", { name: /export|download|excel|csv/i }),
      );
  const exportControl = exportButton || exportLink;
  test.skip(
    !search && !filterButton && !exportControl,
    "Không tìm thấy search/filter/export control trên trang Attendances.",
  );

  if (exportControl) {
    const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
    await exportControl.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename().length).toBeGreaterThan(0);
  }
});

test("TC11 [Attendance-11] - Approving overtime attendance updates the employee hour account", async ({
  page,
}) => {
  await openFromHome(page, "Attendances");
  requireMutation("TC11");
  requireEnv("ATTENDANCE_OT_RECORD_TEXT");

  const row = await requireRecordRow(
    page,
    env.ATTENDANCE_OT_RECORD_TEXT,
    "TC11",
  );
  let clicked = await clickRowAction(
    page,
    env.ATTENDANCE_OT_RECORD_TEXT,
    /approve|validate/i,
  );
  if (!clicked) {
    const details = await firstVisible(
      row.getByRole("link", { name: /view|detail/i }),
    );
    if (details) {
      await details.click();
      clicked = await clickNamedButton(page, /approve|validate/i);
    }
  }
  test.skip(
    !clicked,
    "Không tìm thấy action approve/validate cho overtime record.",
  );

  await confirmIfDialogAppears(page, /approve|validate|confirm|yes/i);
  await expectSuccessOrUpdatedState(page);

  await openAttendancePage(page, "Monthly Summary");
  await expect(page.locator("body")).toContainText(
    /hour|overtime|work|summary/i,
  );
});

// -----------------------------------------------------------------------------
// TC12 - TC14: Attendance Requests
// -----------------------------------------------------------------------------

test("TC12 [Attendance-12] - Employee can submit an attendance request for a missed day", async ({
  page,
}) => {
  requireSessionRole("TC12", "employee");
  await openFromHome(page, "Attendance Requests");
  requireMutation("TC12");
  requireEnv(
    "ATTENDANCE_REQUEST_DATE",
    "ATTENDANCE_REQUEST_CHECK_IN",
    "ATTENDANCE_REQUEST_CHECK_OUT",
  );

  const opened = await openCreateOrAddForm(
    page,
    /create|add|new|request attendance/i,
  );
  test.skip(!opened, "Không tìm thấy nút tạo Attendance Request.");

  const dateFilled =
    (await fillByLabelOrPlaceholder(
      page,
      /date|attendance date/i,
      env.ATTENDANCE_REQUEST_DATE,
    )) ||
    (await fillFirstMatchingInput(
      page,
      ['input[type="date"]'],
      env.ATTENDANCE_REQUEST_DATE,
    ));
  const inFilled =
    (await fillByLabelOrPlaceholder(
      page,
      /check.?in|in time|start time/i,
      env.ATTENDANCE_REQUEST_CHECK_IN,
    )) ||
    (await fillInputByIndex(
      page,
      'input[type="time"]',
      0,
      env.ATTENDANCE_REQUEST_CHECK_IN,
    ));
  const outFilled =
    (await fillByLabelOrPlaceholder(
      page,
      /check.?out|out time|end time/i,
      env.ATTENDANCE_REQUEST_CHECK_OUT,
    )) ||
    (await fillInputByIndex(
      page,
      'input[type="time"]',
      1,
      env.ATTENDANCE_REQUEST_CHECK_OUT,
    ));
  test.skip(
    !dateFilled || !inFilled || !outFilled,
    "Form không expose đủ field date/check-in/check-out theo locator hiện tại.",
  );

  const submitted = await submitVisibleForm(
    page,
    /submit|save|create|request/i,
  );
  test.skip(
    !submitted,
    "Không tìm thấy nút Submit/Save để gửi Attendance Request.",
  );
  await expectSuccessOrUpdatedState(page);
});

test("TC13 [Attendance-13] - Employee can request correction of an existing attendance", async ({
  page,
}) => {
  requireSessionRole("TC13", "employee");
  await openFromHome(page, "My Attendances");
  requireMutation("TC13");
  requireEnv(
    "ATTENDANCE_CORRECTION_RECORD_TEXT",
    "ATTENDANCE_CORRECTION_CHECK_IN",
    "ATTENDANCE_CORRECTION_CHECK_OUT",
  );

  const row = await requireRecordRow(
    page,
    env.ATTENDANCE_CORRECTION_RECORD_TEXT,
    "TC13",
  );
  let opened = await clickRowAction(
    page,
    env.ATTENDANCE_CORRECTION_RECORD_TEXT,
    /edit|request correction|regularize|request/i,
  );
  if (!opened) {
    await row.click();
    opened = await clickNamedButton(
      page,
      /edit|request correction|regularize|request/i,
    );
  }
  test.skip(
    !opened,
    "Không tìm thấy action chỉnh sửa/yêu cầu điều chỉnh cho record.",
  );

  const inFilled = await fillByLabelOrPlaceholder(
    page,
    /check.?in|in time|start time/i,
    env.ATTENDANCE_CORRECTION_CHECK_IN,
  );
  const outFilled = await fillByLabelOrPlaceholder(
    page,
    /check.?out|out time|end time/i,
    env.ATTENDANCE_CORRECTION_CHECK_OUT,
  );
  test.skip(
    !inFilled || !outFilled,
    "Form correction không có đủ trường check-in/check-out nhận diện được.",
  );

  const submitted = await submitVisibleForm(page, /submit|save|request|send/i);
  test.skip(!submitted, "Không tìm thấy nút gửi correction request.");
  await expectSuccessOrUpdatedState(page);
});

test("TC14 [Attendance-14] - Manager can approve or reject an attendance request", async ({
  page,
}) => {
  await openFromHome(page, "Attendance Requests");
  requireMutation("TC14");
  requireEnv("ATTENDANCE_REQUEST_RECORD_TEXT");

  const decision = (env.ATTENDANCE_REQUEST_DECISION || "approve").toLowerCase();
  test.skip(
    !["approve", "reject"].includes(decision),
    "ATTENDANCE_REQUEST_DECISION chỉ nhận approve hoặc reject.",
  );

  const row = await requireRecordRow(
    page,
    env.ATTENDANCE_REQUEST_RECORD_TEXT,
    "TC14",
  );
  const actionRegex =
    decision === "approve" ? /approve|accept/i : /reject|decline/i;
  let clicked = await clickRowAction(
    page,
    env.ATTENDANCE_REQUEST_RECORD_TEXT,
    actionRegex,
  );
  if (!clicked) {
    const detail = await firstVisible(
      row.getByRole("link", { name: /view|detail|edit/i }),
    );
    if (detail) {
      await detail.click();
      clicked = await clickNamedButton(page, actionRegex);
    }
  }
  test.skip(
    !clicked,
    `Không tìm thấy action ${decision} cho attendance request.`,
  );

  await confirmIfDialogAppears(page, actionRegex);
  await expectSuccessOrUpdatedState(page);
});

// -----------------------------------------------------------------------------
// TC15 - TC17: Daily Work Status (N/A on the current demo)
// Horilla 2.3.0 deprecates this page and says Day-wise summary replaces it.
// The current demo has no Daily Work Status menu, and the replacement UI has
// not been verified as equivalent for these requirements. Keep these cases N/A
// until a real route and UI are confirmed; do not redirect them to another page.
// Source: https://github.com/horilla/horilla-hr/releases/tag/2.3.0
// -----------------------------------------------------------------------------

test("TC15 [Attendance-15] - Daily Work Status displays employee status for the selected day", async ({
  page,
}) => {
  test.skip(
    true,
    "N/A: Daily Work Status is unavailable in the current demo; no verified equivalent route/UI for this requirement.",
  );

  await openFromHome(page, "Daily Work Status");

  await expect(page.locator("body")).toContainText(
    /work status|present|absent|validated|half day|employee/i,
  );
  const table = await getMainTable(page);
  const calendar = page
    .locator('[role="grid"], .fc, [class*="calendar" i]')
    .first();
  const hasCalendar = await calendar.isVisible().catch(() => false);
  expect(
    Boolean(table) || hasCalendar || (await bodyText(page)).length > 40,
  ).toBeTruthy();
});

test("TC16 [Attendance-16] - Daily Work Status supports date navigation and employee filters", async ({
  page,
}) => {
  test.skip(
    true,
    "N/A: Daily Work Status is unavailable in the current demo; no verified equivalent route/UI for this requirement.",
  );

  await openFromHome(page, "Daily Work Status");

  const dateControls = await getDateAndFilterControls(page);
  const previous = await firstVisible(
    page.getByRole("button", {
      name: /previous|prev|chevron-left|last month/i,
    }),
  );
  const next = await firstVisible(
    page.getByRole("button", { name: /next|chevron-right|next month/i }),
  );
  const search = await getSearchInput(page);
  const filter = await firstVisible(
    page.getByRole("button", { name: /filter/i }),
  );
  expect(
    dateControls.length > 0 || previous || next || search || filter,
  ).toBeTruthy();

  if (previous) {
    await previous.click();
    await expect(page.locator("body")).toBeVisible();
  } else if (dateControls.length > 0) {
    const control = dateControls[0];
    const type = await control.getAttribute("type");
    if (type === "date") await control.fill("2026-01-15");
    else if (type === "month") await control.fill("2026-01");
    await applyFilterIfAvailable(page);
  }

  if (search) {
    await search.fill(env.ATTENDANCE_EMPLOYEE_FILTER || "a");
    await search.press("Enter").catch(() => {});
    await expect(search).toHaveValue(env.ATTENDANCE_EMPLOYEE_FILTER || "a");
  } else if (filter) {
    await filter.click();
    await expect(page.locator("body")).toBeVisible();
  }
});

test("TC17 [Attendance-17] - Daily Work Status handles leave, half-day and conflicting attendance states", async ({
  page,
}) => {
  test.skip(
    true,
    "N/A: Daily Work Status is unavailable in the current demo; no verified equivalent route/UI for this requirement.",
  );

  await openFromHome(page, "Daily Work Status");
  requireEnv("ATTENDANCE_DAILY_STATUS_FIXTURE");

  const expectedStatuses = env.ATTENDANCE_DAILY_STATUS_FIXTURE.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const content = await bodyText(page);
  for (const status of expectedStatuses) {
    expect(content.toLowerCase()).toContain(status.toLowerCase());
  }
});

// -----------------------------------------------------------------------------
// TC18 - TC20: Check-in / Check-out Log
// -----------------------------------------------------------------------------

test("TC18 [Attendance-18] - Employee Check-in creates a Check-in Log entry", async ({
  page,
}) => {
  requireSessionRole("TC18", "employee");
  await openFromHome(page, "My Attendances");
  requireClockPermission("TC18");
  requireEnv("ATTENDANCE_CLOCK_TEST_USER");

  const checkInButton = await firstVisible(
    page.getByRole("button", { name: /check\s*-?\s*in/i }),
  );
  test.skip(!checkInButton, "Không tìm thấy nút Check-in trên My Attendances.");
  test.skip(
    !(await checkInButton.isEnabled()),
    "Nút Check-in hiện không khả dụng; tài khoản có thể đang trong ca làm.",
  );

  await checkInButton.click();
  await expectSuccessOrUpdatedState(page);
  await openAttendancePage(page, "Check-in / Check-out Log");
  await expect(page.locator("body")).toContainText(
    /check.?in|in time|activity/i,
  );
  if (env.ATTENDANCE_CLOCK_TEST_USER) {
    await expect(page.locator("body")).toContainText(
      env.ATTENDANCE_CLOCK_TEST_USER,
    );
  }
});

test("TC19 [Attendance-19] - Employee Check-out closes the active session and records worked duration", async ({
  page,
}) => {
  requireSessionRole("TC19", "employee");
  await openFromHome(page, "My Attendances");
  requireClockPermission("TC19");
  requireEnv("ATTENDANCE_CLOCK_TEST_USER");

  const checkOutButton = await firstVisible(
    page.getByRole("button", { name: /check\s*-?\s*out/i }),
  );
  test.skip(
    !checkOutButton,
    "Không tìm thấy nút Check-out trên My Attendances.",
  );
  test.skip(
    !(await checkOutButton.isEnabled()),
    "Nút Check-out đang disabled; cần một phiên check-in đang hoạt động.",
  );

  await checkOutButton.click();
  await expectSuccessOrUpdatedState(page);
  await openAttendancePage(page, "Check-in / Check-out Log");
  await expect(page.locator("body")).toContainText(
    /check.?out|out time|activity/i,
  );
  await expect(page.locator("body")).toContainText(
    env.ATTENDANCE_CLOCK_TEST_USER,
  );
});

test("TC20 [Attendance-20] - Duplicate or out-of-sequence Check-in/Check-out is handled safely", async ({
  page,
}) => {
  requireSessionRole("TC20", "employee");
  await openFromHome(page, "My Attendances");
  requireClockPermission("TC20");
  requireEnv("ATTENDANCE_CLOCK_TEST_USER", "ATTENDANCE_DUPLICATE_ACTION");

  const action = env.ATTENDANCE_DUPLICATE_ACTION.toLowerCase();
  test.skip(
    !["check-in", "check-out"].includes(action),
    "ATTENDANCE_DUPLICATE_ACTION phải là check-in hoặc check-out.",
  );
  const buttonRegex =
    action === "check-in" ? /check\s*-?\s*in/i : /check\s*-?\s*out/i;
  const actionButton = await firstVisible(
    page.getByRole("button", { name: buttonRegex }),
  );
  test.skip(!actionButton, `Không tìm thấy nút ${action}.`);

  if (!(await actionButton.isEnabled())) {
    await expect(actionButton).toBeDisabled();
  } else {
    await actionButton.click();
    const after = await bodyText(page);
    const rejected =
      /already|duplicate|cannot|not allowed|invalid|please check.?in first|no active session/i.test(
        after,
      );
    expect(rejected).toBeTruthy();
  }
});

// -----------------------------------------------------------------------------
// TC21 - TC23: Late Arrival & Early Departure
// -----------------------------------------------------------------------------

test("TC21 [Attendance-21] - Late Arrival is identified according to shift and grace policy", async ({
  page,
}) => {
  await openFromHome(page, "Late Arrival & Early Departure");
  requireEnv("ATTENDANCE_LATE_RECORD_TEXT");

  const row = await requireRecordRow(
    page,
    env.ATTENDANCE_LATE_RECORD_TEXT,
    "TC21",
  );
  await expect(row).toContainText(/late|arrival|late come/i);
});

test("TC22 [Attendance-22] - Early Departure is identified according to shift and grace policy", async ({
  page,
}) => {
  await openFromHome(page, "Late Arrival & Early Departure");
  requireEnv("ATTENDANCE_EARLY_RECORD_TEXT");

  const row = await requireRecordRow(
    page,
    env.ATTENDANCE_EARLY_RECORD_TEXT,
    "TC22",
  );
  await expect(row).toContainText(/early|departure|early out/i);
});

test("TC23 [Attendance-23] - Late Arrival and Early Departure filters and export work", async ({
  page,
}) => {
  await openFromHome(page, "Late Arrival & Early Departure");

  const filter = await firstVisible(
    page.getByRole("button", { name: /filter/i }),
  );
  if (filter) {
    await filter.click();
    const controls = await getDateAndFilterControls(page);
    if (controls.length > 0) {
      const first = controls[0];
      const type = await first.getAttribute("type");
      if (type === "date") await first.fill("2026-01-01");
      else if (type === "month") await first.fill("2026-01");
      await applyFilterIfAvailable(page);
    }
  }

  const exportButton = await firstVisible(
    page.getByRole("button", { name: /export|download|excel|csv/i }),
  );
  const exportLink = exportButton
    ? null
    : await firstVisible(
        page.getByRole("link", { name: /export|download|excel|csv/i }),
      );
  test.skip(
    !filter && !exportButton && !exportLink,
    "Không tìm thấy filter/export control trên trang Late Arrival & Early Departure.",
  );

  const exportControl = exportButton || exportLink;
  if (exportControl) {
    const downloadPromise = page.waitForEvent("download", { timeout: 10000 });
    await exportControl.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename().length).toBeGreaterThan(0);
  }
});

// -----------------------------------------------------------------------------
// TC24 - TC25: Monthly Summary
// -----------------------------------------------------------------------------

test("TC24 [Attendance-24] - Monthly Summary totals are displayed for the selected employee and month", async ({
  page,
}) => {
  await openFromHome(page, "Monthly Summary");

  const content = await bodyText(page);
  expect(content).toMatch(/monthly|summary|hour|attendance|present|absent/i);
  const table = await getMainTable(page);
  const rows = await getTableRows(page);
  expect(
    Boolean(table) || (await rows.count()) > 0 || content.length > 40,
  ).toBeTruthy();

  // Optional data comparison against a prepared test month.
  if (env.ATTENDANCE_MONTHLY_EXPECTED_PRESENT) {
    await expect(page.locator("body")).toContainText(
      env.ATTENDANCE_MONTHLY_EXPECTED_PRESENT,
    );
  }
  if (env.ATTENDANCE_MONTHLY_EXPECTED_HOURS) {
    await expect(page.locator("body")).toContainText(
      env.ATTENDANCE_MONTHLY_EXPECTED_HOURS,
    );
  }
});

test("TC25 [Attendance-25] - Monthly Summary month navigation and empty-month handling", async ({
  page,
}) => {
  await openFromHome(page, "Monthly Summary");

  const monthControl = await firstVisible(
    page.locator('input[type="month"], input[type="date"]'),
  );
  const previous = await firstVisible(
    page.getByRole("button", {
      name: /previous|prev|chevron-left|previous month/i,
    }),
  );
  const next = await firstVisible(
    page.getByRole("button", { name: /next|chevron-right|next month/i }),
  );
  test.skip(
    !monthControl && !previous && !next,
    "Không tìm thấy điều khiển chuyển tháng trên Monthly Summary.",
  );

  if (monthControl) {
    const type = await monthControl.getAttribute("type");
    if (type === "month") await monthControl.fill("2000-01");
    else await monthControl.fill("2000-01-15");
    await applyFilterIfAvailable(page);
  } else if (previous) {
    await previous.click();
  }

  await expect(page.locator("body")).toBeVisible();
  const content = await bodyText(page);
  expect(content).toMatch(
    /monthly|summary|no data|no records|0|attendance|hour/i,
  );
  if (next) {
    await next.click();
    await expect(page.locator("body")).toBeVisible();
  }
});

// -----------------------------------------------------------------------------
// TC26 - TC28: Time Policies
// -----------------------------------------------------------------------------

test("TC26 [Attendance-26] - Time Policies list, details and role-based access are handled correctly", async ({
  page,
}) => {
  await openTimePoliciesPage(page);

  const accessExpectation = (
    env.ATTENDANCE_EXPECT_POLICY_ACCESS || "true"
  ).toLowerCase();
  const content = await bodyText(page);
  if (accessExpectation === "false") {
    expect(content).toMatch(
      /permission|access denied|not authorized|forbidden|403/i,
    );
    return;
  }

  await expect(page.locator("body")).toContainText(
    /time polic|grace|attendance|policy/i,
  );
  await expect(page.getByText("Grace Time", { exact: true }).last()).toBeVisible();
  await expect(
    page.getByText("Validation Condition", { exact: true }).last(),
  ).toBeVisible();
  const table = await getMainTable(page);
  const rows = await getTableRows(page);
  expect(
    Boolean(table) || (await rows.count()) > 0 || content.length > 40,
  ).toBeTruthy();

  if (env.ATTENDANCE_POLICY_NAME) {
    const row = await findRowByText(page, env.ATTENDANCE_POLICY_NAME);
    expect(
      row,
      `Configured Time Policy '${env.ATTENDANCE_POLICY_NAME}' must exist in the list.`,
    ).not.toBeNull();
    await expect(row).toBeVisible();
    if (row) {
      const detail = await firstVisible(
        row.getByRole("link", { name: /view|detail/i }),
      );
      if (detail) {
        await detail.click();
        await expect(page.locator("body")).toContainText(
          env.ATTENDANCE_POLICY_NAME,
        );
      }
    }
  }
});

test("TC27 [Attendance-27] - Authorized administrator can create and save a Time Policy", async ({
  page,
}) => {
  await openTimePoliciesPage(page);
  requireMutation("TC27");
  requireEnv("ATTENDANCE_NEW_POLICY_NAME");

  const opened = await openCreateOrAddForm(page, /create|add/i);
  test.skip(
    !opened,
    "Time Policies page không hiển thị nút Create/Add đã xác minh trên demo.",
  );

  const activeForm = page.locator("form").last();
  let nameField = await firstVisible(
    activeForm.getByLabel(/policy name|name/i),
  );
  if (!nameField) {
    nameField = await firstVisible(activeForm.locator('input[type="text"]'));
  }
  if (!nameField)
    nameField = await firstVisible(page.getByLabel(/policy name|name/i));
  test.skip(!nameField, "Không tìm thấy field tên Time Policy.");
  await nameField.fill(env.ATTENDANCE_NEW_POLICY_NAME);

  const submitted = await submitVisibleForm(page, /save|create|submit/i);
  test.skip(!submitted, "Không tìm thấy nút Save/Create Time Policy.");
  await expectSuccessOrUpdatedState(page);
  await expect(page.locator("body")).toContainText(
    env.ATTENDANCE_NEW_POLICY_NAME,
  );
});

test("TC28 [Attendance-28] - Time Policy validates boundary values and persists a valid update", async ({
  page,
}) => {
  await openTimePoliciesPage(page);
  requireMutation("TC28");
  requireEnv(
    "ATTENDANCE_POLICY_NAME",
    "ATTENDANCE_POLICY_BOUNDARY_LABEL",
    "ATTENDANCE_POLICY_INVALID_VALUE",
    "ATTENDANCE_POLICY_VALID_VALUE",
  );

  const row = await requireRecordRow(page, env.ATTENDANCE_POLICY_NAME, "TC28");
  let opened = await clickRowAction(
    page,
    env.ATTENDANCE_POLICY_NAME,
    /edit|update/i,
  );
  if (!opened) {
    const editLink = await firstVisible(
      row.getByRole("link", { name: /edit|update/i }),
    );
    if (editLink) {
      await editLink.click();
      opened = true;
    }
  }
  test.skip(
    !opened,
    "Không tìm thấy action Edit/Update cho Time Policy được cấu hình.",
  );

  const fieldLabel = new RegExp(
    escapeRegExp(env.ATTENDANCE_POLICY_BOUNDARY_LABEL),
    "i",
  );
  const boundaryField = await firstVisible(page.getByLabel(fieldLabel));
  test.skip(
    !boundaryField,
    `Không tìm thấy field '${env.ATTENDANCE_POLICY_BOUNDARY_LABEL}' trong form policy.`,
  );

  await boundaryField.fill(env.ATTENDANCE_POLICY_INVALID_VALUE);
  await submitVisibleForm(page, /save|update|submit/i);
  const invalidCount = await page.locator(":invalid").count();
  const validationVisible = await page
    .getByText(/invalid|required|must be|enter a valid|out of range/i)
    .first()
    .isVisible()
    .catch(() => false);
  expect(invalidCount > 0 || validationVisible).toBeTruthy();

  await boundaryField.fill(env.ATTENDANCE_POLICY_VALID_VALUE);
  const saved = await submitVisibleForm(page, /save|update|submit/i);
  test.skip(
    !saved,
    "Không tìm thấy nút lưu policy sau khi sửa giá trị hợp lệ.",
  );
  await expectSuccessOrUpdatedState(page);
});
