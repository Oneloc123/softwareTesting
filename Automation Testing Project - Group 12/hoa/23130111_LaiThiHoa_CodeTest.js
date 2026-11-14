"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
const node_crypto_1 = require("node:crypto");
const BASE_URL = process.env.HORILLA_BASE_URL || 'https://hr.demo.horilla.com';
const LOGIN_URL = new URL('/login/', BASE_URL);
const LIST_URL = new URL('/employee/employee-view/', BASE_URL);
const WAIT = 15000;
const admin = {
    username: process.env.HORILLA_USERNAME || 'admin',
    password: process.env.HORILLA_PASSWORD || 'admin',
};
test_1.test.use({ screenshot: 'only-on-failure', trace: 'retain-on-failure' });
test_1.test.setTimeout(120000);
test_1.test.describe.configure({ mode: 'default' });
async function signIn(page, { username, password } = admin) {
    await page.goto(LOGIN_URL.href);
    await page.getByRole('textbox', { name: 'Username', exact: true }).fill(username);
    await page.getByRole('textbox', { name: 'Password', exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.waitForURL('**/dashboard/**', { timeout: 30000 });
}
async function openEmployees(page) {
    await page.goto(LIST_URL.href);
    await (0, test_1.expect)(page).toHaveURL(/\/employee\/employee-view\//);
    await (0, test_1.expect)(page.getByRole('link', { name: /^(Create|Create Create)$/ }).first())
        .toBeVisible({ timeout: WAIT });
}
async function ensureListView(page) {
    const header = page.locator('#view-container thead').first();
    if (!(await header.isVisible()))
        await page.locator('li[title="List"]').click();
    await (0, test_1.expect)(header).toBeVisible({ timeout: WAIT });
}
async function openCreateForm(page) {
    await page.getByRole('link', { name: /^(Create|Create Create)$/ }).first().click();
    await (0, test_1.expect)(page.getByRole('textbox', { name: 'First Name *', exact: true }))
        .toBeVisible({ timeout: WAIT });
}
async function createEmployee(page) {
    await openEmployees(page);
    await openCreateForm(page);
    const id = (0, node_crypto_1.randomUUID)().replaceAll('-', '').slice(0, 12);
    const lastName = 'Employee' + id;
    const name = 'QA ' + lastName;
    const badgeId = 'PEP' + id;
    const employee = {
        name,
        fullName: name,
        lastName,
        badge: badgeId,
        badgeId,
        email: 'qa.' + id + '@example.com',
        phone: '09' + (0, node_crypto_1.randomInt)(10000000, 100000000),
    };
    await page.getByRole('textbox', { name: 'First Name *', exact: true }).fill('QA');
    await page.getByRole('textbox', { name: 'Last Name', exact: true }).fill(lastName);
    await page.getByRole('textbox', { name: 'Badge ID Show' }).fill(employee.badgeId);
    await page.getByRole('textbox', { name: 'Email *', exact: true }).fill(employee.email);
    await page.getByRole('textbox', { name: 'Phone *', exact: true }).fill(employee.phone);
    await page.getByRole('button', { name: 'Save & Continue', exact: true }).first().click();
    await (0, test_1.expect)(page.locator('.oh-alert--success:visible')
        .filter({ hasText: /^New Employee Added\.$/ }).first())
        .toBeVisible({ timeout: WAIT });
    return employee;
}
function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function fullNamePattern(fullName) {
    return new RegExp('^' + escapeRegex(fullName) + '(?:\\s*\\([^()]+\\))?$');
}
test_1.test.beforeEach(async ({ page }) => {
    await signIn(page);
    await openEmployees(page);
});
test_1.test.afterEach(async ({ page }, testInfo) => {
    if (page.isClosed())
        return;
    try {
        await testInfo.attach('Kết quả - ' + testInfo.title, {
            body: await page.screenshot({ fullPage: true, timeout: 5000 }),
            contentType: 'image/png',
        });
    }
    catch {
        // Playwright vẫn giữ ảnh lỗi và trace theo cấu hình phía trên.
    }
});
test_1.test.describe('Employees - List', () => {
    const EMILY = { name: 'Emily Carter', badge: 'NTI0001' };
    const PRIYA = { name: 'Priya Raman', badge: 'NTI0003' };
    const MARCUS = { name: 'Marcus Johnson', badge: 'NTI0004' };
    const rows = (page) => page.locator('#view-container tbody tr:visible');
    const searchBox = (page) => page.getByRole('textbox', { name: 'Search Input' });
    const employeeRow = (page, emp) => rows(page).filter({ hasText: emp.name }).filter({ hasText: emp.badge });
    async function searchBy(page, field, value) {
        const input = searchBox(page);
        await input.fill(value);
        if (field === 'Name') {
            await input.press('Enter');
            return;
        }
        await input.dispatchEvent('keyup');
        const option = page.getByRole('link', { name: new RegExp(`Search\\s+${field}\\s+for:\\s*${value}`, 'i') });
        await (0, test_1.expect)(option).toBeVisible({ timeout: 10000 });
        await option.click();
    }
    async function clearSearch(page) {
        await searchBox(page).fill('');
        const tags = page.locator('.oh-titlebar__tag-close:visible');
        for (let i = 0; i < 10 && (await tags.count()) > 0; i++)
            await tags.first().click();
        await searchBox(page).press('Enter');
    }
    async function openProfile(page, emp) {
        const row = employeeRow(page, emp);
        await (0, test_1.expect)(row).toHaveCount(1, { timeout: 20000 });
        await row.getByText(emp.name, { exact: false }).first().click();
        const heading = page.locator('.emp-profile-card h2:visible, .oh-profile__info-name:visible').first();
        await (0, test_1.expect)(heading).toContainText(emp.name, { timeout: 15000 });
        await (0, test_1.expect)(heading).toContainText(emp.badge);
    }
    test_1.test.beforeEach(async ({ page }) => {
        await ensureListView(page);
    });
    (0, test_1.test)('EMP_MGT_List_01 - Display employee list', async ({ page }) => {
        const columns = ['Employee', 'Email', 'Department', 'Phone', 'Shift', 'Employee Type', 'Reporting Manager', 'Company', 'Actions'];
        async function checkList() {
            await ensureListView(page);
            const headers = await page.locator('#view-container thead th').allInnerTexts();
            for (const column of columns)
                (0, test_1.expect)(headers.some(h => h.trim().includes(column)), `Thiếu cột: ${column}`).toBe(true);
            await test_1.expect.poll(() => rows(page).count(), { timeout: 15000 }).toBeGreaterThanOrEqual(3);
        }
        await checkList();
        await page.reload();
        await checkList();
    });
    // TEST CASE 02
    (0, test_1.test)('EMP_MGT_List_02 - Find employee by full name', async ({ page }) => {
        await searchBy(page, 'Name', EMILY.name);
        await (0, test_1.expect)(employeeRow(page, EMILY)).toHaveCount(1, { timeout: 20000 });
        await test_1.expect.poll(async () => { const results = await rows(page).allInnerTexts(); return results.length > 0 && results.every(r => r.includes(EMILY.name)); }, { timeout: 20000 }).toBe(true);
        await clearSearch(page);
        await test_1.expect.poll(() => rows(page).count(), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
        await searchBy(page, 'Name', EMILY.name);
        await openProfile(page, EMILY);
    });
    // TEST CASE 03
    (0, test_1.test)('EMP_MGT_List_03 - Find employee by Badge ID', async ({ page }) => {
        await searchBy(page, 'Badge ID', PRIYA.badge);
        await (0, test_1.expect)(employeeRow(page, PRIYA)).toHaveCount(1, { timeout: 20000 });
        const count = await rows(page).count();
        (0, test_1.expect)(count).toBeGreaterThan(0);
        for (let i = 0; i < count; i++)
            await (0, test_1.expect)(rows(page).nth(i)).toContainText(PRIYA.badge);
        await clearSearch(page);
        await test_1.expect.poll(() => rows(page).count(), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
        await searchBy(page, 'Badge ID', PRIYA.badge);
        await openProfile(page, PRIYA);
    });
    // TEST CASE 04
    (0, test_1.test)('EMP_MGT_List_04 - Find employees by Department (Sales)', async ({ page }) => {
        await searchBy(page, 'Department', 'Sales');
        await (0, test_1.expect)(employeeRow(page, MARCUS)).toHaveCount(1, { timeout: 20000 });
        const headers = await page.locator('#view-container thead th').allInnerTexts();
        const deptIndex = headers.findIndex(h => h.includes('Department'));
        (0, test_1.expect)(deptIndex, 'Không tìm thấy cột Department').toBeGreaterThanOrEqual(0);
        await test_1.expect.poll(async () => { const values = await rows(page).locator(`td:nth-child(${deptIndex + 1})`).allInnerTexts(); return values.length > 0 && values.every(v => v.trim() === 'Sales'); }, { timeout: 20000 }).toBe(true);
        await clearSearch(page);
        await test_1.expect.poll(() => rows(page).count(), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
        await searchBy(page, 'Department', 'Sales');
        await openProfile(page, MARCUS);
        const tab = page.locator('[id$="profileTab"]:visible').first();
        const dept = tab.locator('dt', { hasText: /^\s*Department\s*$/ }).first();
        await (0, test_1.expect)(dept.locator('xpath=following-sibling::dd[1]')).toContainText('Sales');
    });
});
test_1.test.describe('Employees - Create', () => {
    test_1.test.beforeEach(async ({ page }) => {
        await openCreateForm(page);
    });
    (0, test_1.test)('EMP_MGT_Create_05: Create employee successfully', async ({ page }) => {
        await page.getByRole('textbox', { name: 'First Name *' }).fill('Hoa');
        await page.getByRole('textbox', { name: 'Last Name' }).fill('Lai');
        const timestamp = Date.now();
        const uniqueBadgeId = `PEP${timestamp}`;
        const uniqueEmail = `laithihoa.tc05.${timestamp}@gmail.com`;
        const uniquePhone = `09${timestamp.toString().slice(-8)}`;
        await page.getByRole('textbox', { name: 'Badge ID Show' }).fill(uniqueBadgeId);
        await page.getByRole('textbox', { name: 'Email *' }).fill(uniqueEmail);
        await page.getByRole('textbox', { name: 'Phone *' }).fill(uniquePhone);
        await page.getByRole('button', { name: 'Save & Continue' }).first().click();
        const successMessage = page.locator('.oh-alert--success:visible')
            .filter({ hasText: /^New Employee Added\.$/ }).first();
        await (0, test_1.expect)(successMessage).toBeVisible({ timeout: 10000 });
    });
    (0, test_1.test)('EMP_MGT_Create_06: Reject missing first name', async ({ page }) => {
        await page.getByRole('button', { name: 'Save & Continue' }).click();
        const firstNameInput = page.locator('#id_employee_first_name');
        const validationMessage = await firstNameInput.evaluate((el) => el.validationMessage);
        (0, test_1.expect)(validationMessage).toBe('Please fill out this field.');
    });
    (0, test_1.test)('EMP_MGT_Create_07: Reject invalid email format', async ({ page }) => {
        await page.getByRole('textbox', { name: 'First Name *' }).fill('Hoa');
        await page.getByRole('textbox', { name: 'Last Name' }).fill('Lai');
        const emailInput = page.getByRole('textbox', { name: 'Email *' });
        await emailInput.fill('laithihoagmail.com');
        await page.getByRole('textbox', { name: 'Phone *' }).fill('03847299259');
        await page.getByRole('combobox', { name: 'Male' }).click();
        await page.getByRole('button', { name: 'Save & Continue' }).click();
        const validationMessage = await emailInput.evaluate((el) => el.validationMessage);
        (0, test_1.expect)(validationMessage).toBe("Please include an '@' in the email address. 'laithihoagmail.com' is missing an '@'.");
    });
    (0, test_1.test)('EMP_MGT_Create_08: Prevent duplicate badge ID', async ({ page }) => {
        await page.getByRole('textbox', { name: 'Badge ID Show' }).click();
        await page.getByRole('textbox', { name: 'Badge ID Show' }).fill('NTI0001');
        await page.getByRole('textbox', { name: 'First Name *' }).click();
        await page.getByRole('textbox', { name: 'First Name *' }).fill('Hoa');
        await page.getByRole('textbox', { name: 'Last Name' }).click();
        await page.getByRole('textbox', { name: 'Last Name' }).fill('Lai');
        await page.getByRole('textbox', { name: 'Email *' }).click();
        await page.getByRole('textbox', { name: 'Email *' }).fill('laithihoa@gmail.com');
        await page.getByRole('textbox', { name: 'Phone *' }).click();
        await page.getByRole('textbox', { name: 'Phone *' }).fill('0827642884');
        await page.getByRole('combobox', { name: 'Male' }).click();
        await page.getByRole('button', { name: 'Save & Continue' }).click();
        await (0, test_1.expect)(page.getByText('Badge ID must be unique.')).toBeVisible();
    });
    (0, test_1.test)('EMP_MGT_Create_09: Reject duplicate work email', async ({ page }) => {
        await page.getByRole('textbox', { name: 'First Name *' }).click();
        await page.getByRole('textbox', { name: 'First Name *' }).fill('Hoa');
        await page.getByRole('textbox', { name: 'Last Name' }).click();
        await page.getByRole('textbox', { name: 'Last Name' }).fill('Lai');
        await page.getByRole('textbox', { name: 'Email *' }).click();
        await page.getByRole('textbox', { name: 'Email *' }).fill('emily.carter@northwind-tech.com');
        await page.getByRole('textbox', { name: 'Phone *' }).click();
        await page.getByRole('textbox', { name: 'Phone *' }).fill('02937362734');
        await page.getByRole('button', { name: 'Save & Continue' }).click();
        await (0, test_1.expect)(page.getByText('An Employee with this Email already exists in company Northwind Technologies Inc.')).toBeVisible();
    });
    (0, test_1.test)('EMP_MGT_Create_10: Reject future date of birth', async ({ page }) => {
        await page.getByRole('textbox', { name: 'First Name *' }).fill('Hoa');
        await page.getByRole('textbox', { name: 'Last Name' }).fill('Lai');
        await page.getByRole('textbox', { name: 'Email *' }).fill(`hoa.${Date.now()}@gmail.com`);
        await page.getByRole('textbox', { name: 'Phone *' }).fill('0982737883');
        await page.locator('input[name="dob"]').fill('2027-12-31');
        await page.getByRole('button', { name: 'Save & Continue' }).click();
        await (0, test_1.expect)(page.getByText('Date of Birth cannot be in the future')).toBeVisible({ timeout: 5000 });
        await (0, test_1.expect)(page.getByText('New Employee Added', { exact: false })).toBeHidden();
    });
    (0, test_1.test)('EMP_MGT_Create_11: Update job-position options by department', async ({ page }) => {
        test_1.test.setTimeout(60000);
        const uniqueSuffix = Date.now().toString().slice(-6);
        await page.getByRole('textbox', { name: 'First Name *' }).fill('Hoa');
        await page.getByRole('textbox', { name: 'Last Name' }).fill('Lai');
        await page.getByRole('textbox', { name: 'Email *' }).fill(`hoa.${uniqueSuffix}@mail.com`);
        await page.getByRole('textbox', { name: 'Phone *' }).fill(`0936${uniqueSuffix}`);
        await page.getByRole('button', { name: 'Save & Continue' }).click();
        await (0, test_1.expect)(page.locator('.select2-selection__rendered', { hasText: '---Choose Department---' })).toBeVisible({ timeout: 20000 });
        await page.locator('.select2-selection__rendered', { hasText: '---Choose Department---' }).click();
        await page.locator('.select2-results__option', { hasText: 'Engineering' }).click();
        await (0, test_1.expect)(page.locator('.select2-selection__rendered', { hasText: 'Engineering' })).toBeVisible();
        await page.waitForTimeout(2000);
        await page.locator('.select2-selection__rendered', { hasText: '---Choose Job Position---' }).click();
        const jobOptionsList = page.locator('#select2-id_job_position_id-results .select2-results__option');
        await (0, test_1.expect)(jobOptionsList.filter({ hasText: 'Software Engineer' })).toBeVisible();
        await (0, test_1.expect)(jobOptionsList.filter({ hasText: 'Backend Engineer' })).toBeVisible();
        await (0, test_1.expect)(jobOptionsList.filter({ hasText: 'Frontend Engineer' })).toBeVisible();
        await jobOptionsList.filter({ hasText: 'Software Engineer' }).click();
        await (0, test_1.expect)(page.locator('.select2-selection__rendered', { hasText: 'Software Engineer' })).toBeVisible();
        await page.locator('.select2-selection__rendered', { hasText: 'Engineering' }).click();
        await page.locator('.select2-results__option', { hasText: 'Human Resources' }).click();
        await (0, test_1.expect)(page.locator('.select2-selection__rendered', { hasText: 'Human Resources' })).toBeVisible();
        await page.waitForTimeout(2000);
        const resetJobDropdown = page.locator('.select2-selection__rendered', { hasText: '---Choose Job Position---' });
        await (0, test_1.expect)(resetJobDropdown).toBeVisible();
        await resetJobDropdown.click();
        await (0, test_1.expect)(jobOptionsList.filter({ hasText: 'Software Engineer' })).toBeHidden();
        await (0, test_1.expect)(jobOptionsList.filter({ hasText: 'HR Manager' })).toBeVisible();
        await (0, test_1.expect)(jobOptionsList.filter({ hasText: 'HR Business Partner' })).toBeVisible();
        await (0, test_1.expect)(jobOptionsList.filter({ hasText: 'Recruiter' })).toBeVisible();
        await jobOptionsList.filter({ hasText: 'Recruiter' }).click();
        await (0, test_1.expect)(page.locator('.select2-selection__rendered', { hasText: 'Recruiter' })).toBeVisible();
    });
});
test_1.test.describe('Employees - Edit', () => {
    async function findEmployeeByName(page, fullName) {
        await page.goto(LIST_URL.href);
        const header = page.locator('#view-container thead').first();
        if (!(await header.isVisible()))
            await page.locator('li[title="List"]').click();
        await (0, test_1.expect)(header).toBeVisible({ timeout: 15000 });
        const search = page.getByRole('textbox', { name: 'Search Input' });
        await search.fill(fullName);
        await search.press('Enter');
        const row = page.locator('#view-container tbody tr:visible').filter({
            has: page.getByRole('cell', { name: fullNamePattern(fullName) }),
        });
        await (0, test_1.expect)(row, `Phải tìm thấy đúng một nhân viên tên "${fullName}"`)
            .toHaveCount(1, { timeout: 15000 });
        return row;
    }
    async function openEmployeeEdit(page, fullName, section = 'Personal') {
        const row = await findEmployeeByName(page, fullName);
        await row.getByRole('button', { name: 'Edit', exact: true }).click();
        const heading = page.getByRole('heading', { name: `Edit ${fullName}`, exact: true });
        const editLink = page.getByRole('link', { name: `Edit ${fullName} (` })
            .and(page.locator('a[href*="/employee/employee-view-update/"]:visible'));
        await (0, test_1.expect)(editLink).toBeVisible({ timeout: 15000 });
        const breadcrumbUrl = new URL(await editLink.getAttribute('href'), page.url());
        const editUrl = new URL(breadcrumbUrl.pathname, breadcrumbUrl.origin);
        // Mở trang Edit bằng một lần điều hướng đầy đủ để ổn định biểu mẫu.
        await page.goto(editUrl.href, { waitUntil: 'domcontentloaded' });
        try {
            await (0, test_1.expect)(heading).toBeVisible({ timeout: 4000 });
        }
        catch {
            await page.goto(breadcrumbUrl.href, { waitUntil: 'domcontentloaded' });
            await (0, test_1.expect)(heading).toBeVisible({ timeout: 15000 });
        }
        // Horilla có thể mở lại tab đã dùng trước đó.
        const form = page.locator(`#employeeUpdate${section}Form`);
        if (!(await form.isVisible())) {
            await page.getByRole('link', { name: `${section} Information` }).click();
        }
        await (0, test_1.expect)(form).toBeVisible({ timeout: 15000 });
        return form;
    }
    async function savePersonalInfo(page, form) {
        const action = await form.getAttribute('hx-post') || await form.getAttribute('action');
        const saveUrl = new URL(action, page.url());
        // HTMX thay nội dung form sau khi lưu, nên form có thể vẫn hiện.
        const [response] = await Promise.all([
            page.waitForResponse(response => {
                const request = response.request();
                const url = new URL(response.url());
                return request.method() === 'POST' &&
                    url.origin === saveUrl.origin && url.pathname === saveUrl.pathname;
            }, { timeout: 15000 }),
            form.getByRole('button', { name: 'Save', exact: true }).click(),
        ]);
        await response.finished();
        (0, test_1.expect)(response.status(), `Lưu thông tin cá nhân trả về HTTP ${response.status()}`).toBeLessThan(400);
    }
    async function saveWorkInfo(page, form) {
        await form.getByRole('button', { name: 'Save', exact: true }).click();
        const historySave = page.locator('#historyModalBody:visible').getByText('Save', { exact: true });
        const listHeading = page.getByRole('heading', { name: 'Employees', exact: true });
        await (0, test_1.expect)(historySave.or(listHeading).first()).toBeVisible({ timeout: 15000 });
        if (await historySave.isVisible()) {
            await historySave.click();
            await (0, test_1.expect)(historySave).toBeHidden({ timeout: 15000 });
        }
    }
    (0, test_1.test)('Creat_account: Create employee successfully', async ({ page }) => {
        await createEmployee(page);
    });
    (0, test_1.test)('EMP_MGT_Update_12: Edit employee first name', async ({ page }) => {
        const employee = await createEmployee(page);
        const form = await openEmployeeEdit(page, employee.fullName);
        const newFirstName = 'QAUpdated';
        await form.getByRole('textbox', { name: 'First Name *' }).fill(newFirstName);
        await savePersonalInfo(page, form);
        await test_1.test.step('Mở lại hồ sơ và kiểm tra First Name đã lưu', async () => {
            const savedForm = await openEmployeeEdit(page, `${newFirstName} ${employee.lastName}`);
            await (0, test_1.expect)(savedForm.getByRole('textbox', { name: 'First Name *' }))
                .toHaveValue(newFirstName);
        });
    });
    (0, test_1.test)('EMP_MGT_Update_13: Edit employee work information', async ({ page }) => {
        const employee = await createEmployee(page);
        const form = await openEmployeeEdit(page, employee.fullName, 'Work');
        await form.getByRole('combobox', { name: '---Choose Department---' }).click();
        await page.locator('.select2-results__option').filter({ hasText: /^Sales$/ }).click();
        await saveWorkInfo(page, form);
        await test_1.test.step('Mở lại Work Information và kiểm tra Department đã lưu', async () => {
            const savedForm = await openEmployeeEdit(page, employee.fullName, 'Work');
            await (0, test_1.expect)(savedForm.locator('select[name="department_id"] option:checked'))
                .toHaveText('Sales');
        });
    });
    (0, test_1.test)('EMP_MGT_Update_14: Edit employee email address', async ({ page }) => {
        const employee = await createEmployee(page);
        const form = await openEmployeeEdit(page, employee.fullName);
        const email = `updated.${employee.email}`;
        await form.getByPlaceholder('Email', { exact: true }).fill(email);
        await savePersonalInfo(page, form);
        await test_1.test.step('Mở lại hồ sơ và kiểm tra Email đã lưu', async () => {
            const savedForm = await openEmployeeEdit(page, employee.fullName);
            await (0, test_1.expect)(savedForm.getByPlaceholder('Email', { exact: true }))
                .toHaveValue(email);
        });
    });
    (0, test_1.test)('EMP_MGT_Update_15: Reject invalid bank account number', async ({ page }) => {
        const employee = await createEmployee(page);
        const form = await openEmployeeEdit(page, employee.fullName, 'Bank');
        const account = form.getByRole('textbox', { name: 'Account Number*' });
        const originalNumber = await account.inputValue();
        const invalidDigits = '52978179479174972595';
        const invalidNumber = `!$@%${invalidDigits}`;
        await form.getByRole('textbox', { name: 'Bank Name*' }).fill('BIDV');
        await account.fill(invalidNumber);
        await form.getByRole('textbox', { name: 'Branch*' }).fill('Ho Chi Minh');
        await form.getByRole('textbox', { name: 'Bank Code #1*' }).fill('2932');
        await form.locator('#id_address').fill('Ho Chi Minh');
        await (0, test_1.expect)(account).toHaveValue(invalidNumber);
        // Chờ trình duyệt chặn dữ liệu sai hoặc máy chủ xử lý yêu cầu lưu.
        const response = page.waitForResponse(result => {
            const request = result.request();
            return request.method() === 'POST' && (request.postData() || '').includes(invalidDigits);
        }, { timeout: 15000 });
        const validation = account.and(page.locator(':invalid'))
            .waitFor({ state: 'visible', timeout: 15000 });
        const [savedResponse] = await Promise.all([
            Promise.race([response, validation]),
            form.getByRole('button', { name: 'Save', exact: true }).click(),
        ]);
        if (savedResponse)
            await savedResponse.finished();
        await test_1.test.step('Mở lại Bank Information và kiểm tra số tài khoản vẫn như cũ', async () => {
            const savedForm = await openEmployeeEdit(page, employee.fullName, 'Bank');
            await (0, test_1.expect)(savedForm.getByRole('textbox', { name: 'Account Number*' }))
                .toHaveValue(originalNumber);
        });
    });
    function workSelect(form, field) {
        return form.locator('select[name="' + field + '"]');
    }
    async function chooseDifferentWorkOption(page, select, excludedName = '') {
        const currentName = await select.evaluate(element => element.selectedOptions[0]?.textContent.trim() || '');
        const dropdown = select.locator('xpath=following-sibling::span[contains(@class, "select2")][1]');
        await dropdown.locator('.select2-selection').click();
        const results = page.locator('.select2-container--open .select2-results:visible');
        const options = results.locator('.select2-results__option[role="option"]:not([aria-disabled="true"]):not(.loading-results):visible');
        await (0, test_1.expect)(options.first(), 'Dropdown phải có ít nhất một lựa chọn hợp lệ').toBeVisible();
        const choices = (await options.allTextContents()).map(text => text.trim());
        const nextName = choices.find(name => name && name !== currentName && name !== excludedName &&
            !(excludedName && name.startsWith(excludedName + ' (')));
        (0, test_1.expect)(nextName, 'Cần một lựa chọn khác với giá trị hiện tại').toBeTruthy();
        await results.getByText(nextName, { exact: true }).click();
        await (0, test_1.expect)(select.locator('option:checked')).toHaveText(nextName);
        return nextName;
    }
    (0, test_1.test)('EMP_MGT_Edit_16: Change reporting manager', async ({ page }) => {
        const employee = await createEmployee(page);
        const form = await openEmployeeEdit(page, employee.fullName, 'Work');
        const manager = await chooseDifferentWorkOption(page, workSelect(form, 'reporting_manager_id'), employee.fullName);
        await saveWorkInfo(page, form);
        await test_1.test.step('Mở lại hồ sơ và kiểm tra Reporting Manager', async () => {
            const savedForm = await openEmployeeEdit(page, employee.fullName, 'Work');
            await (0, test_1.expect)(workSelect(savedForm, 'reporting_manager_id').locator('option:checked'))
                .toHaveText(manager);
        });
    });
    (0, test_1.test)('EMP_MGT_Edit_17: Change assigned shift', async ({ page }) => {
        const employee = await createEmployee(page);
        const workForm = await openEmployeeEdit(page, employee.fullName, 'Work');
        const shiftSelect = workSelect(workForm, 'shift_id');
        const availableShifts = await shiftSelect.evaluate(select => Array.from(select.options)
            .filter(option => option.value && !option.matches(':disabled'))
            .map(option => ({ value: option.value, label: option.textContent.trim() })));
        const firstShift = availableShifts[0];
        const newShift = availableShifts.find(shift => shift.value !== firstShift?.value &&
            shift.label !== firstShift?.label);
        (0, test_1.expect)(newShift, 'Horilla cần có ít nhất hai ca làm việc khác nhau').toBeDefined();
        await test_1.test.step('Lưu ca làm việc ban đầu', async () => {
            await shiftSelect.selectOption({ value: firstShift.value }, { force: true });
            await saveWorkInfo(page, workForm);
        });
        const form = await openEmployeeEdit(page, employee.fullName, 'Work');
        const currentShift = workSelect(form, 'shift_id');
        await (0, test_1.expect)(currentShift).toHaveValue(firstShift.value);
        await currentShift.selectOption({ value: newShift.value }, { force: true });
        await saveWorkInfo(page, form);
        await test_1.test.step('Mở lại hồ sơ và kiểm tra ca làm việc mới', async () => {
            const savedForm = await openEmployeeEdit(page, employee.fullName, 'Work');
            const savedShift = workSelect(savedForm, 'shift_id');
            await (0, test_1.expect)(savedShift).toHaveValue(newShift.value);
            await (0, test_1.expect)(savedShift.locator('option:checked')).toHaveText(newShift.label);
        });
    });
    (0, test_1.test)('EMP_MGT_Edit_18: Clear optional Qualification', async ({ page }) => {
        const employee = await createEmployee(page);
        const originalQualification = 'QA Test Certificate';
        await test_1.test.step('Chuẩn bị giá trị Qualification có sẵn', async () => {
            const form = await openEmployeeEdit(page, employee.fullName);
            await form.getByRole('textbox', { name: 'Qualification', exact: true })
                .fill(originalQualification);
            await savePersonalInfo(page, form);
        });
        const form = await openEmployeeEdit(page, employee.fullName);
        const qualification = form.getByRole('textbox', { name: 'Qualification', exact: true });
        await (0, test_1.expect)(qualification).toHaveValue(originalQualification);
        await qualification.clear();
        await savePersonalInfo(page, form);
        await test_1.test.step('Mở lại hồ sơ và kiểm tra Qualification để trống', async () => {
            const savedForm = await openEmployeeEdit(page, employee.fullName);
            await (0, test_1.expect)(savedForm.getByRole('textbox', { name: 'Qualification', exact: true }))
                .toHaveValue('');
        });
    });
});
test_1.test.describe('Employees - Delete', () => {
    const LIST_PATH = '/employee/employees-list/';
    const PROFILE_PATH = /^\/employee\/employee-view\/\d+\/$/;
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
    function employeeNameCell(scope, pattern) {
        // Cột Employee đứng đầu dữ liệu, sau ô chọn hàng nếu có.
        const nameColumn = scope.locator('td:first-child:not(:has(input[type="checkbox"])), td:first-child:has(input[type="checkbox"]) + td');
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
        (0, test_1.expect)(response.ok(), 'Danh sách nhân viên phải tải thành công').toBeTruthy();
        const list = page.locator('#listContainer');
        const empty = page.getByText(/^(?:No records found|No employees found|No filtered records found at the moment)\.?$/i);
        const ready = list.locator('thead:visible').or(empty.locator('visible=true'));
        await (0, test_1.expect)(ready.first()).toBeVisible({ timeout: WAIT });
        const identity = fullNamePattern(name);
        const row = list.locator('tbody tr:visible').filter({ has: employeeNameCell(page, identity) });
        await (0, test_1.expect)(row, 'Kiểm tra họ tên ' + name + ' trong danh sách ' +
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
        (0, test_1.expect)(requestUrl.origin).toBe(LIST_URL.origin);
        (0, test_1.expect)(requestUrl.pathname).toBe('/generic-delete/');
        (0, test_1.expect)(requestUrl.searchParams.get('model')).toBe('employee.Employee');
        (0, test_1.expect)(requestUrl.searchParams.get('pk')).toMatch(/^\d+$/);
        await action.click();
        const modal = page.locator('#deleteConfirmation:visible');
        await (0, test_1.expect)(modal).toHaveCount(1, { timeout: WAIT });
        await modal.getByText('Summary', { exact: true }).click();
        const recordName = new RegExp("Deleting\\s+the\\s+record\\s+['\"‘“]?" + escapeRegex(employee.name) + "(?=\\s*\\(|['\"’”]|$)", 'i');
        const identity = modal.getByText(recordName).locator('visible=true');
        await (0, test_1.expect)(identity, 'Hộp thoại phải hiển thị đúng họ tên nhân viên')
            .toBeVisible({ timeout: WAIT });
        return { modal, requestUrl };
    }
    function parseProtectedCount(text) {
        const heading = /^\s*(?:(\d+)\s*Protected Records|Protected Records\s*\(\s*(\d+)\s*\))\s*$/i;
        const count = text.match(heading);
        if (!count)
            throw new Error('Không đọc được số hồ sơ được bảo vệ: ' + text);
        return Number(count[1] ?? count[2]);
    }
    async function readProtectedCount(modal) {
        const heading = modal.locator('h5:visible, h6:visible').filter({ hasText: /Protected Records/i });
        await (0, test_1.expect)(heading).toHaveCount(1, { timeout: WAIT });
        return parseProtectedCount(await heading.innerText());
    }
    async function closeDelete(modal) {
        const cancel = modal.locator('button:visible').filter({ hasText: /^\s*(Cancel|No)\s*$/i });
        if (await cancel.count()) {
            await cancel.click();
        }
        else {
            await modal.locator('button[aria-label="Close"]:visible').click();
        }
        await (0, test_1.expect)(modal).toHaveCount(0, { timeout: WAIT });
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
                if (!confirm)
                    return;
                const prompted = await Promise.race([
                    posted.then(() => false),
                    confirm.waitFor({ state: 'visible', timeout: WAIT }).then(() => true),
                ]);
                if (prompted)
                    await confirm.click({ timeout: WAIT });
            })()]);
        await response.finished();
        (0, test_1.expect)(response.status(), 'Thao tác phải được máy chủ xử lý').toBeLessThan(400);
        return response;
    }
    async function toggleArchive(page, row, { active = true } = {}) {
        const label = active ? /^Archive$/i : /^(Un[ -]?Archive|Restore)$/i;
        const action = employeeAction(row, label);
        const path = '/employee/employee-archive/';
        const holder = row.locator('[hx-post*="' + path + '"]');
        await (0, test_1.expect)(holder).toHaveCount(1);
        const url = new URL(await holder.getAttribute('hx-post'), LIST_URL);
        (0, test_1.expect)(url.pathname).toMatch(/^\/employee\/employee-archive\/\d+\/$/);
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
        await (0, test_1.expect)(heading).toHaveText(fullNamePattern(employee.name));
    }
    async function assertArchived(page, employee) {
        await employeeRow(page, employee, { present: false });
        return employeeRow(page, employee, { active: false });
    }
    async function expectDeleteDenied(response) {
        const body = await response.text();
        (0, test_1.expect)(body, 'Lỗi CSRF không chứng minh kiểm tra phân quyền').not.toMatch(/csrf verification failed|csrf cookie not set|csrf token missing|csrf token from/i);
        (0, test_1.expect)([401, 403].includes(response.status()) || /don['’]t have permission|permission denied/i.test(body), 'Yêu cầu xóa phải bị từ chối do thiếu quyền').toBeTruthy();
        (0, test_1.expect)(body).not.toContain('id="deleteConfirmBtn"');
    }
    (0, test_1.test)('EMP_MGT_Delete_19: Delete a disposable QA employee with confirmation', async ({ page }, testInfo) => {
        const target = disposableName ? { name: disposableName } : await createEmployee(page);
        if (disposableName) {
            (0, test_1.expect)(disposableName, 'Họ tên hồ sơ thử nghiệm phải bắt đầu bằng QA').toMatch(/^QA\b/i);
        }
        const control = await createEmployee(page);
        const before = await details(await employeeRow(page, control.name));
        const { modal, requestUrl } = await openDelete(page, { name: target.name });
        const count = await readProtectedCount(modal);
        if (disposableName) {
            (0, test_1.expect)(count, 'Hồ sơ QA có sẵn phải có Protected Records = 0').toBe(0);
        }
        else if (count !== 0) {
            (0, test_1.expect)(count, 'Hồ sơ QA mới chỉ được có một hợp đồng tự sinh').toBe(1);
            await (0, test_1.expect)(modal.getByText(/Contracts\s*:\s*1\s*$/i).locator('visible=true'))
                .toBeVisible();
        }
        await modal.getByLabel('I have took manual action for the protected records', { exact: true }).check();
        await modal.getByLabel("I acknowledge, I won't be able to revert this", { exact: true }).check();
        await modal.getByLabel('Confirming to delete the related and protected records', { exact: true }).check();
        const confirmDelete = modal.locator('#deleteConfirmBtn');
        await (0, test_1.expect)(confirmDelete).toBeEnabled();
        await clickAndWaitForPost(page, confirmDelete, requestUrl.pathname, { pk: requestUrl.searchParams.get('pk') });
        await (0, test_1.expect)(modal).toHaveCount(0, { timeout: WAIT });
        await (0, test_1.expect)(page.getByRole('heading', { name: 'Employees', exact: true })).toBeVisible({ timeout: WAIT });
        const deletedRow = page.locator('#listContainer tbody tr:visible').filter({
            has: employeeNameCell(page, fullNamePattern(target.name)),
        });
        await (0, test_1.expect)(deletedRow, 'Nhân viên vừa xóa phải biến mất khỏi danh sách')
            .toHaveCount(0, { timeout: WAIT });
        await testInfo.attach('EMP_MGT_Delete_19 - 01 - Ngay sau khi xóa - ' + target.name, {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png',
        });
        (0, test_1.expect)(await details(await employeeRow(page, control.name))).toEqual(before);
        await employeeRow(page, target.name, { active: false, present: false });
        await employeeRow(page, target.name, { present: false });
        await (0, test_1.expect)(page.getByRole('textbox', { name: 'Search Input', exact: true })).toHaveValue(target.name);
        await testInfo.attach('EMP_MGT_Delete_19 - 02 - Tìm lại tên đã xóa, không có kết quả - ' + target.name, {
            body: await page.screenshot({ fullPage: true }),
            contentType: 'image/png',
        });
    });
    (0, test_1.test)('EMP_MGT_Delete_20: Archive active employee', async ({ page }) => {
        const target = await createEmployee(page);
        await toggleArchive(page, await employeeRow(page, target));
        await assertArchived(page, target);
    });
    (0, test_1.test)('EMP_MGT_Delete_21: Restore archived employee', async ({ page }) => {
        const target = await createEmployee(page);
        const before = await details(await employeeRow(page, target.name));
        await toggleArchive(page, await employeeRow(page, target.name));
        const archived = await assertArchived(page, target.name);
        await toggleArchive(page, archived, { active: false });
        await employeeRow(page, target.name, { active: false, present: false });
        const restored = await employeeRow(page, target.name);
        (0, test_1.expect)(await details(restored)).toEqual(before);
        await openEmployeeProfile(page, restored, target);
    });
    (0, test_1.test)('EMP_MGT_Delete_22: Prevent unauthorized deletion', async ({ page, browser }) => {
        test_1.test.skip(!restricted.username || !restricted.password, 'Cần cấu hình tài khoản có quyền xem nhưng thiếu quyền xóa.');
        const target = await createEmployee(page);
        const before = await details(await employeeRow(page, target.name));
        const row = await employeeRow(page, target.name);
        const deleteUrl = new URL(await deleteAction(row).getAttribute('hx-get'), LIST_URL);
        (0, test_1.expect)(deleteUrl.origin).toBe(LIST_URL.origin);
        (0, test_1.expect)(deleteUrl.pathname).toBe('/generic-delete/');
        (0, test_1.expect)(deleteUrl.searchParams.get('model')).toBe('employee.Employee');
        (0, test_1.expect)(deleteUrl.searchParams.get('pk')).toMatch(/^\d+$/);
        const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
        try {
            const limited = await context.newPage();
            await signIn(limited, restricted);
            const limitedRow = await employeeRow(limited, target.name);
            await (0, test_1.expect)(deleteAction(limitedRow)).toHaveCount(0);
            const preview = await limited.request.get(deleteUrl.href, {
                headers: { 'HX-Request': 'true' },
                maxRedirects: 0,
            });
            await expectDeleteDenied(preview);
            const csrf = await limited.locator('meta[name="csrf-token"]').getAttribute('content');
            (0, test_1.expect)(csrf, 'Phiên đăng nhập cần token CSRF hợp lệ').toBeTruthy();
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
        }
        finally {
            await context.close();
        }
        (0, test_1.expect)(await details(await employeeRow(page, target.name))).toEqual(before);
    });
    (0, test_1.test)('EMP_MGT_Delete_23: Cancel employee deletion confirmation', async ({ page }) => {
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
            (0, test_1.expect)(await details(await employeeRow(page, target))).toEqual(targetBefore);
            (0, test_1.expect)(await details(await employeeRow(page, control))).toEqual(controlBefore);
            (0, test_1.expect)(deletePosts, 'Hủy xác nhận không được gửi yêu cầu xóa').toEqual([]);
        }
        finally {
            page.off('request', trackDelete);
        }
        if (deleteAuditUrl) {
            // URL phải trỏ tới bảng nhật ký đã lọc các lượt xóa thành công.
            const audit = new URL(deleteAuditUrl, BASE_URL);
            (0, test_1.expect)(audit.origin).toBe(LIST_URL.origin);
            await page.goto(audit.href);
            const table = page.getByRole('table');
            await (0, test_1.expect)(table).toBeVisible({ timeout: WAIT });
            await (0, test_1.expect)(table.getByRole('row').filter({
                hasText: new RegExp(escapeRegex(target.name), 'i'),
            })).toHaveCount(0);
        }
    });
    (0, test_1.test)('EMP_MGT_Delete_24: Prevent deleting employee with protected dependencies', async ({ page }) => {
        const employee = protectedFixture;
        test_1.test.skip(!employee.policyEnabled || !employee.name || !employee.url || !employee.text, 'Cần họ tên nhân viên QA có bảng lương/chấm công được bảo vệ, URL, nội dung hồ sơ và chính sách chặn xóa đã bật.');
        (0, test_1.expect)(employee.name, 'Chỉ dùng nhân viên QA cho ca kiểm thử này').toMatch(/^QA\b/i);
        const linkedUrl = new URL(employee.url, BASE_URL);
        (0, test_1.expect)(linkedUrl.origin).toBe(LIST_URL.origin);
        (0, test_1.expect)(linkedUrl.pathname).toMatch(/^\/(payroll|attendance)\//);
        const dependency = linkedUrl.pathname.startsWith('/payroll/')
            ? /\b(?:Pay\s*slips?|Payroll(?:\s+Records?)?)\s*:\s*[1-9]\d*\b/i
            : /\bAttendance(?:\s+(?:Records?|Activities|Activity))?\s*:\s*[1-9]\d*\b/i;
        const record = page.getByText(employee.text, { exact: true }).locator('visible=true');
        const linkedRecordDetails = () => record.evaluate(element => (element.closest('tr, dl') || element).innerText.trim());
        await page.goto(linkedUrl.href);
        await (0, test_1.expect)(record).toBeVisible({ timeout: WAIT });
        const linkedBefore = await linkedRecordDetails();
        const employeeBefore = await details(await employeeRow(page, employee));
        const { modal } = await openDelete(page, employee);
        (0, test_1.expect)(await readProtectedCount(modal), 'Phải có hồ sơ phụ thuộc được bảo vệ').toBeGreaterThan(0);
        await (0, test_1.expect)(modal.getByText(dependency).locator('visible=true'), 'Cảnh báo phải chỉ ra bảng lương hoặc chấm công được bảo vệ').toBeVisible({ timeout: WAIT });
        // Chỉ đánh dấu xác nhận thông thường, giữ nguyên các lựa chọn cho phép xóa hồ sơ phụ thuộc.
        const acknowledgement = modal.getByLabel("I acknowledge, I won't be able to revert this", { exact: true });
        if (await acknowledgement.isVisible())
            await acknowledgement.check({ timeout: WAIT });
        await (0, test_1.expect)(modal.locator('input[name="action"]:checked, input[name="confirm"]:checked')).toHaveCount(0);
        await (0, test_1.expect)(modal.locator('#deleteConfirmBtn:visible:enabled'), 'Nút xác nhận xóa phải bị chặn khi còn dữ liệu được bảo vệ').toHaveCount(0);
        await closeDelete(modal);
        (0, test_1.expect)(await details(await employeeRow(page, employee))).toEqual(employeeBefore);
        await page.goto(linkedUrl.href);
        await (0, test_1.expect)(record).toBeVisible({ timeout: WAIT });
        (0, test_1.expect)(await linkedRecordDetails()).toBe(linkedBefore);
    });
    (0, test_1.test)('EMP_MGT_Delete_25: Archive only the selected employee', async ({ page }) => {
        const target = await createEmployee(page);
        const control = await createEmployee(page);
        const before = await details(await employeeRow(page, control));
        const row = await employeeRow(page, target);
        const archivePath = await row.locator('[hx-post*="/employee/employee-archive/"]').getAttribute('hx-post');
        const targetId = new URL(archivePath, LIST_URL).pathname.match(/\/employee-archive\/(\d+)\/$/)?.[1];
        (0, test_1.expect)(targetId, 'Phải xác định được ID của nhân viên QA đã chọn').toBeTruthy();
        await row.getByRole('checkbox', { name: 'Select Row', exact: true }).check();
        await (0, test_1.expect)(page.locator('#selectedInstances'))
            .toHaveAttribute('data-ids', new RegExp('^\\[\\s*"?' + targetId + '"?\\s*\\]$'));
        const actions = page.getByRole('button', { name: /^Actions(?:\s+Actions)?$/i })
            .or(page.locator('button:visible').filter({ hasText: /^\s*Actions\s*$/i }));
        await actions.click({ timeout: WAIT });
        const result = await clickAndWaitForPost(page, page.locator('#archiveEmployees:visible'), '/employee/employee-bulk-archive/', {
            confirm: page.getByRole('button', { name: 'Confirm', exact: true }),
        });
        const summary = await result.headerValue('x-hlv-bulk-result');
        if (summary)
            (0, test_1.expect)(JSON.parse(summary)).toMatchObject({ done: 1, failed: 0 });
        await assertArchived(page, target);
        await employeeRow(page, control, { active: false, present: false });
        (0, test_1.expect)(await details(await employeeRow(page, control))).toEqual(before);
    });
});
