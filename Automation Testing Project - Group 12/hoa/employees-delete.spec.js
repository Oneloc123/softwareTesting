import { randomInt, randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { createRecordedContext, closeRecordedContext, saveVideoByTestName } from './helpers/recorded-context.js';

const BASE_URL = process.env.HORILLA_BASE_URL || 'https://hr.demo.horilla.com';
const LOGIN_URL = new URL('/login/', BASE_URL);
const LIST_URL = new URL('/employee/employee-view/', BASE_URL);
const LIST_PATH = '/employee/employees-list/';
const PROFILE_PATH = /^\/employee\/employee-view\/\d+\/$/;
const WAIT = 15000;
const admin = {
    username: process.env.HORILLA_USERNAME || 'admin',
    password: process.env.HORILLA_PASSWORD || 'admin',
};
const restricted = {
    username: process.env.HORILLA_RESTRICTED_USERNAME,
    password: process.env.HORILLA_RESTRICTED_PASSWORD,
};
const disposableName = process.env.HORILLA_DELETE_QA_NAME;
const deleteAuditUrl = process.env.HORILLA_DELETE_AUDIT_URL;
const protectedFixture = {
    name: process.env.HORILLA_PROTECTED_QA_NAME,
    url: process.env.HORILLA_PROTECTED_RECORD_URL,
    text: process.env.HORILLA_PROTECTED_RECORD_TEXT,
    policyEnabled: process.env.HORILLA_PROTECTED_DELETE_POLICY_ENABLED === '1',
};

test.use({
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
});

test.setTimeout(120000);

async function signIn(page, { username, password }) {
    await page.goto(LOGIN_URL.href);
    await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.waitForURL('**/dashboard/**', { timeout: 30000 });
}

async function createEmployee(page) {
    await page.goto(LIST_URL.href);
    const id = randomUUID().replaceAll('-', '').slice(0, 12);
    const lastName = 'Delete' + id;
    const employee = {
        name: 'QA ' + lastName,
        badgeId: 'PEP' + id,
        email: 'qa.delete.' + id + '@example.com',
        phone: '09' + randomInt(10000000, 100000000),
    };
    await page.getByRole('link', { name: /^(Create|Create Create)$/ }).first().click();
    await page.getByRole('textbox', { name: 'First Name *', exact: true }).fill('QA');
    await page.getByRole('textbox', { name: 'Last Name', exact: true }).fill(lastName);
    await page.getByRole('textbox', { name: 'Badge ID Show' }).fill(employee.badgeId);
    await page.getByRole('textbox', { name: 'Email *', exact: true }).fill(employee.email);
    await page.getByRole('textbox', { name: 'Phone *', exact: true }).fill(employee.phone);
    await page.getByRole('button', { name: 'Save & Continue', exact: true }).first().click();
    await expect(page.locator('.oh-alert--success:visible')
        .filter({ hasText: /^New Employee Added\.$/ }).first()).toBeVisible({ timeout: WAIT });
    return employee;
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fullNamePattern(fullName) {
    return new RegExp('^' + escapeRegex(fullName) + '(?:\\s*\\([^()]+\\))?$');
}

function employeeNameCell(scope, pattern) {
    // Cột Employee đứng đầu dữ liệu, sau ô chọn hàng nếu có.
    const nameColumn = scope.locator(
        'td:first-child:not(:has(input[type="checkbox"])), td:first-child:has(input[type="checkbox"]) + td'
    );
    return scope.getByRole('cell', { name: pattern }).and(nameColumn);
}

async function employeeRow(page, employee, { active = true, present = true } = {}) {
    const name = typeof employee === 'string' ? employee : employee.name;
    const url = new URL(LIST_URL);
    url.searchParams.set('view', 'list');
    url.searchParams.set('is_active', active ? 'True' : 'False');
    url.searchParams.set('search', name);
    url.searchParams.set('filter_applied', 'on');
    const [response] = await Promise.all([
        page.waitForResponse(result => {
            const requestUrl = new URL(result.url());
            return requestUrl.origin === url.origin && requestUrl.pathname === LIST_PATH &&
                requestUrl.searchParams.getAll('search').at(-1) === name &&
                requestUrl.searchParams.get('is_active') === url.searchParams.get('is_active');
        }, { timeout: WAIT }),
        page.goto(url.href, { waitUntil: 'domcontentloaded' }),
    ]);
    expect(response.ok(), 'Danh sách nhân viên phải tải thành công').toBeTruthy();
    const list = page.locator('#listContainer');
    const empty = page.getByText(/^(?:No records found|No employees found|No filtered records found at the moment)\.?$/i);
    const ready = list.locator('thead:visible').or(empty.locator('visible=true'));
    await expect(ready.first()).toBeVisible({ timeout: WAIT });
    const identity = fullNamePattern(name);
    const row = list.locator('tbody tr:visible').filter({ has: employeeNameCell(page, identity) });
    await expect(row, 'Kiểm tra họ tên ' + name + ' trong danh sách ' +
        (active ? 'đang hoạt động' : 'đã lưu trữ')).toHaveCount(present ? 1 : 0, { timeout: WAIT });
    return row;
}

function employeeAction(row, label) {
    return row.getByRole('button', { name: label, exact: true })
        .or(row.getByTitle(label, { exact: true }));
}

function deleteAction(row) {
    return employeeAction(row, /^(Delete|Remove)$/i);
}

async function details(row) {
    return (await row.getByRole('cell').allTextContents()).map(value => value.trim());
}

async function openDelete(page, employee) {
    const row = await employeeRow(page, employee);
    const action = deleteAction(row);
    const requestUrl = new URL(await action.getAttribute('hx-get'), LIST_URL);
    expect(requestUrl.origin).toBe(LIST_URL.origin);
    expect(requestUrl.pathname).toBe('/generic-delete/');
    expect(requestUrl.searchParams.get('model')).toBe('employee.Employee');
    expect(requestUrl.searchParams.get('pk')).toMatch(/^\d+$/);
    await action.click();
    const modal = page.locator('#deleteConfirmation:visible');
    await expect(modal).toHaveCount(1, { timeout: WAIT });
    await modal.getByText('Summary', { exact: true }).click();
    const recordName = new RegExp(
        String.raw`Deleting\s+the\s+record\s+['"‘“]?${escapeRegex(employee.name)}(?=\s*\(|['"’”]|$)`,
        'i'
    );
    const identity = modal.getByText(recordName).locator('visible=true');
    await expect(identity, 'Hộp thoại phải hiển thị đúng họ tên nhân viên')
        .toBeVisible({ timeout: WAIT });
    return { modal, requestUrl };
}

function parseProtectedCount(text) {
    const heading = /^\s*(?:(\d+)\s*Protected Records|Protected Records\s*\(\s*(\d+)\s*\))\s*$/i;
    const count = text.match(heading);
    if (!count) throw new Error('Không đọc được số hồ sơ được bảo vệ: ' + text);
    return Number(count[1] ?? count[2]);
}

async function readProtectedCount(modal) {
    const heading = modal.locator('h5:visible, h6:visible').filter({ hasText: /Protected Records/i });
    await expect(heading).toHaveCount(1, { timeout: WAIT });
    return parseProtectedCount(await heading.innerText());
}

async function closeDelete(modal) {
    const cancel = modal.locator('button:visible').filter({ hasText: /^\s*(Cancel|No)\s*$/i });
    if (await cancel.count()) {
        await cancel.click();
    } else {
        await modal.locator('button[aria-label="Close"]:visible').click();
    }
    await expect(modal).toHaveCount(0, { timeout: WAIT });
}

async function clickAndWaitForPost(page, button, pathname, { pk, confirm } = {}) {
    const posted = page.waitForResponse(result => {
        const url = new URL(result.url());
        return url.origin === LIST_URL.origin && url.pathname === pathname &&
            result.request().method() === 'POST' &&
            (!pk || url.searchParams.get('pk') === pk);
    }, { timeout: WAIT });
    const [response] = await Promise.all([posted, (async () => {
        await button.click({ timeout: WAIT });
        if (!confirm) return;
        const prompted = await Promise.race([
            posted.then(() => false),
            confirm.waitFor({ state: 'visible', timeout: WAIT }).then(() => true),
        ]);
        if (prompted) await confirm.click({ timeout: WAIT });
    })()]);
    await response.finished();
    expect(response.status(), 'Thao tác phải được máy chủ xử lý').toBeLessThan(400);
    return response;
}

async function toggleArchive(page, row, { active = true } = {}) {
    const label = active ? /^Archive$/i : /^(Un[ -]?Archive|Restore)$/i;
    const action = employeeAction(row, label);
    const path = '/employee/employee-archive/';
    const holder = row.locator('[hx-post*="' + path + '"]');
    await expect(holder).toHaveCount(1);
    const url = new URL(await holder.getAttribute('hx-post'), LIST_URL);
    expect(url.pathname).toMatch(/^\/employee\/employee-archive\/\d+\/$/);
    await clickAndWaitForPost(page, action, url.pathname, {
        confirm: page.getByRole('button', { name: 'Confirm', exact: true }),
    });
}

async function openEmployeeProfile(page, row, employee) {
    await Promise.all([
        page.waitForURL(url => PROFILE_PATH.test(url.pathname)),
        employeeNameCell(row, fullNamePattern(employee.name)).click(),
    ]);
    const heading = page.locator('.emp-profile-card h2:visible, .oh-profile__info-name:visible').first();
    await expect(heading).toHaveText(fullNamePattern(employee.name));
}

async function assertArchived(page, employee) {
    await employeeRow(page, employee, { present: false });
    return employeeRow(page, employee, { active: false });
}

async function expectDeleteDenied(response) {
    const body = await response.text();
    expect(body, 'Lỗi CSRF không chứng minh kiểm tra phân quyền').not.toMatch(/csrf verification failed|csrf cookie not set|csrf token missing|csrf token from/i);
    expect(
        [401, 403].includes(response.status()) || /don['’]t have permission|permission denied/i.test(body),
        'Yêu cầu xóa phải bị từ chối do thiếu quyền'
    ).toBeTruthy();
    expect(body).not.toContain('id="deleteConfirmBtn"');
}

test.beforeEach(async ({ page }) => {
    await signIn(page, admin);
});

test.afterEach(async ({ page }, testInfo) => {
    if (!page.isClosed()) {
        try {
            await testInfo.attach(`Result - ${testInfo.title}`, {
                body: await page.screenshot({ fullPage: true, timeout: 5000 }),
                contentType: 'image/png',
            });
        } catch {
            // Continue saving the video if the screenshot is unavailable.
        }
    }
    await saveVideoByTestName(page, testInfo);
});

test('EMP_MGT_Delete_19: Delete a disposable QA employee with confirmation', async ({ page }, testInfo) => {
    const target = disposableName ? { name: disposableName } : await createEmployee(page);
    if (disposableName) {
        expect(disposableName, 'Họ tên hồ sơ thử nghiệm phải bắt đầu bằng QA').toMatch(/^QA\b/i);
    }
    const control = await createEmployee(page);
    const before = await details(await employeeRow(page, control.name));
    const { modal, requestUrl } = await openDelete(page, { name: target.name });
    const count = await readProtectedCount(modal);
    if (disposableName) {
        expect(count, 'Hồ sơ QA có sẵn phải có Protected Records = 0').toBe(0);
    } else if (count !== 0) {
        expect(count, 'Hồ sơ QA mới chỉ được có một hợp đồng tự sinh').toBe(1);
        await expect(modal.getByText(/Contracts\s*:\s*1\s*$/i).locator('visible=true'))
            .toBeVisible();
    }
    await modal.getByLabel('I have took manual action for the protected records', { exact: true }).check();
    await modal.getByLabel("I acknowledge, I won't be able to revert this", { exact: true }).check();
    await modal.getByLabel('Confirming to delete the related and protected records', { exact: true }).check();
    const confirmDelete = modal.locator('#deleteConfirmBtn');
    await expect(confirmDelete).toBeEnabled();
    await clickAndWaitForPost(page, confirmDelete, requestUrl.pathname, { pk: requestUrl.searchParams.get('pk') });
    await expect(modal).toHaveCount(0, { timeout: WAIT });
    await expect(page.getByRole('heading', { name: 'Employees', exact: true })).toBeVisible({ timeout: WAIT });
    const deletedRow = page.locator('#listContainer tbody tr:visible').filter({
        has: employeeNameCell(page, fullNamePattern(target.name)),
    });
    await expect(deletedRow, 'Nhân viên vừa xóa phải biến mất khỏi danh sách')
        .toHaveCount(0, { timeout: WAIT });
    await testInfo.attach('EMP_MGT_Delete_27 - 01 - Ngay sau khi xóa - ' + target.name, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
    });
    expect(await details(await employeeRow(page, control.name))).toEqual(before);
    await employeeRow(page, target.name, { active: false, present: false });
    await employeeRow(page, target.name, { present: false });
    await expect(page.getByRole('textbox', { name: 'Search Input', exact: true })).toHaveValue(target.name);
    await testInfo.attach('EMP_MGT_Delete_27 - 02 - Tìm lại tên đã xóa, không có kết quả - ' + target.name, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
    });
});

test('EMP_MGT_Delete_20: Archive active employee', async ({ page }) => {
    const target = await createEmployee(page);
    await toggleArchive(page, await employeeRow(page, target));
    await assertArchived(page, target);
});

test('EMP_MGT_Delete_21: Restore archived employee', async ({ page }) => {
    const target = await createEmployee(page);
    const before = await details(await employeeRow(page, target.name));
    await toggleArchive(page, await employeeRow(page, target.name));
    const archived = await assertArchived(page, target.name);
    await toggleArchive(page, archived, { active: false });
    await employeeRow(page, target.name, { active: false, present: false });
    const restored = await employeeRow(page, target.name);
    expect(await details(restored)).toEqual(before);
    await openEmployeeProfile(page, restored, target);
});

test('EMP_MGT_Delete_22: Prevent unauthorized deletion', async ({ page, browser }, testInfo) => {
    test.skip(!restricted.username || !restricted.password, 'Cần cấu hình tài khoản có quyền xem nhưng thiếu quyền xóa.');
    const target = await createEmployee(page);
    const before = await details(await employeeRow(page, target.name));
    const row = await employeeRow(page, target.name);
    const deleteUrl = new URL(await deleteAction(row).getAttribute('hx-get'), LIST_URL);
    expect(deleteUrl.origin).toBe(LIST_URL.origin);
    expect(deleteUrl.pathname).toBe('/generic-delete/');
    expect(deleteUrl.searchParams.get('model')).toBe('employee.Employee');
    expect(deleteUrl.searchParams.get('pk')).toMatch(/^\d+$/);
    const context = await createRecordedContext(browser, testInfo, { storageState: { cookies: [], origins: [] } });
    try {
        const limited = await context.newPage();
        await signIn(limited, restricted);
        const limitedRow = await employeeRow(limited, target.name);
        await expect(deleteAction(limitedRow)).toHaveCount(0);
        const preview = await limited.request.get(deleteUrl.href, {
            headers: { 'HX-Request': 'true' },
            maxRedirects: 0,
        });
        await expectDeleteDenied(preview);
        const csrf = await limited.locator('meta[name="csrf-token"]').getAttribute('content');
        expect(csrf, 'Phiên đăng nhập cần token CSRF hợp lệ').toBeTruthy();
        const request = await limited.request.post(deleteUrl.href, {
            headers: {
                'HX-Request': 'true',
                'X-CSRFToken': csrf,
                Referer: limited.url(),
            },
            form: { action: 'on', revert: 'on', confirm: 'on' },
            maxRedirects: 0,
        });
        await expectDeleteDenied(request);
    } finally {
        await closeRecordedContext(context, testInfo, 'restricted');
    }
    expect(await details(await employeeRow(page, target.name))).toEqual(before);
});

test('EMP_MGT_Delete_23: Cancel employee deletion confirmation', async ({ page }) => {
    const target = await createEmployee(page);
    const control = await createEmployee(page);
    const targetBefore = await details(await employeeRow(page, target));
    const controlBefore = await details(await employeeRow(page, control));
    const deletePosts = [];
    const trackDelete = request => {
        const url = new URL(request.url());
        if (request.method() === 'POST' && url.origin === LIST_URL.origin && url.pathname === '/generic-delete/') {
            deletePosts.push(url.href);
        }
    };
    page.on('request', trackDelete);
    try {
        const { modal } = await openDelete(page, target);
        await closeDelete(modal);
        expect(await details(await employeeRow(page, target))).toEqual(targetBefore);
        expect(await details(await employeeRow(page, control))).toEqual(controlBefore);
        expect(deletePosts, 'Hủy xác nhận không được gửi yêu cầu xóa').toEqual([]);
    } finally {
        page.off('request', trackDelete);
    }
    if (deleteAuditUrl) {
        // URL phải trỏ tới bảng nhật ký đã lọc các lượt xóa thành công.
        const audit = new URL(deleteAuditUrl, BASE_URL);
        expect(audit.origin).toBe(LIST_URL.origin);
        await page.goto(audit.href);
        const table = page.getByRole('table');
        await expect(table).toBeVisible({ timeout: WAIT });
        await expect(table.getByRole('row').filter({
            hasText: new RegExp(escapeRegex(target.name), 'i'),
        })).toHaveCount(0);
    }
});

test('EMP_MGT_Delete_24: Prevent deleting employee with protected dependencies', async ({ page }) => {
    const employee = protectedFixture;
    test.skip(!employee.policyEnabled || !employee.name || !employee.url || !employee.text,
        'Cần họ tên nhân viên QA có bảng lương/chấm công được bảo vệ, URL, nội dung hồ sơ và chính sách chặn xóa đã bật.');
    expect(employee.name, 'Chỉ dùng nhân viên QA cho ca kiểm thử này').toMatch(/^QA\b/i);
    const linkedUrl = new URL(employee.url, BASE_URL);
    expect(linkedUrl.origin).toBe(LIST_URL.origin);
    expect(linkedUrl.pathname).toMatch(/^\/(payroll|attendance)\//);
    const dependency = linkedUrl.pathname.startsWith('/payroll/')
        ? /\b(?:Pay\s*slips?|Payroll(?:\s+Records?)?)\s*:\s*[1-9]\d*\b/i
        : /\bAttendance(?:\s+(?:Records?|Activities|Activity))?\s*:\s*[1-9]\d*\b/i;
    const record = page.getByText(employee.text, { exact: true }).locator('visible=true');
    const linkedRecordDetails = () => record.evaluate(element => (element.closest('tr, dl') || element).innerText.trim());
    await page.goto(linkedUrl.href);
    await expect(record).toBeVisible({ timeout: WAIT });
    const linkedBefore = await linkedRecordDetails();
    const employeeBefore = await details(await employeeRow(page, employee));
    const { modal } = await openDelete(page, employee);
    expect(await readProtectedCount(modal), 'Phải có hồ sơ phụ thuộc được bảo vệ').toBeGreaterThan(0);
    await expect(modal.getByText(dependency).locator('visible=true'),
        'Cảnh báo phải chỉ ra bảng lương hoặc chấm công được bảo vệ').toBeVisible({ timeout: WAIT });
    // Chỉ đánh dấu xác nhận thông thường, giữ nguyên các lựa chọn cho phép xóa hồ sơ phụ thuộc.
    const acknowledgement = modal.getByLabel("I acknowledge, I won't be able to revert this", { exact: true });
    if (await acknowledgement.isVisible()) await acknowledgement.check({ timeout: WAIT });
    await expect(modal.locator('input[name="action"]:checked, input[name="confirm"]:checked')).toHaveCount(0);
    await expect(modal.locator('#deleteConfirmBtn:visible:enabled'),
        'Nút xác nhận xóa phải bị chặn khi còn dữ liệu được bảo vệ').toHaveCount(0);
    await closeDelete(modal);
    expect(await details(await employeeRow(page, employee))).toEqual(employeeBefore);
    await page.goto(linkedUrl.href);
    await expect(record).toBeVisible({ timeout: WAIT });
    expect(await linkedRecordDetails()).toBe(linkedBefore);
});

test('EMP_MGT_Delete_25: Archive only the selected employee', async ({ page }) => {
    const target = await createEmployee(page);
    const control = await createEmployee(page);
    const before = await details(await employeeRow(page, control));
    const row = await employeeRow(page, target);
    const archivePath = await row.locator('[hx-post*="/employee/employee-archive/"]').getAttribute('hx-post');
    const targetId = new URL(archivePath, LIST_URL).pathname.match(/\/employee-archive\/(\d+)\/$/)?.[1];
    expect(targetId, 'Phải xác định được ID của nhân viên QA đã chọn').toBeTruthy();
    await row.getByRole('checkbox', { name: 'Select Row', exact: true }).check();
    await expect(page.locator('#selectedInstances'))
        .toHaveAttribute('data-ids', new RegExp('^\\[\\s*"?' + targetId + '"?\\s*\\]$'));
    const actions = page.getByRole('button', { name: /^Actions(?:\s+Actions)?$/i })
        .or(page.locator('button:visible').filter({ hasText: /^\s*Actions\s*$/i }));
    await actions.click({ timeout: WAIT });
    const result = await clickAndWaitForPost(
        page, page.locator('#archiveEmployees:visible'), '/employee/employee-bulk-archive/', {
        confirm: page.getByRole('button', { name: 'Confirm', exact: true }),
    }
    );
    const summary = await result.headerValue('x-hlv-bulk-result');
    if (summary) expect(JSON.parse(summary)).toMatchObject({ done: 1, failed: 0 });
    await assertArchived(page, target);
    await employeeRow(page, control, { active: false, present: false });
    expect(await details(await employeeRow(page, control))).toEqual(before);
});
