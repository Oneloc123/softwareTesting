import { randomInt, randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { installNamedVideoRecording } from './helpers/named-video.js';

const BASE_URL = process.env.HORILLA_BASE_URL || 'https://hr.demo.horilla.com';
const LOGIN_URL = new URL('/login/', BASE_URL).href;
const LIST_URL = new URL('/employee/employee-view/', BASE_URL).href;

test.use({ screenshot: 'only-on-failure', trace: 'retain-on-failure' });
test.setTimeout(90000);

async function createEmployee(page) {
    const id = randomUUID().replaceAll('-', '').slice(0, 12);
    const lastName = `Employee${id}`;
    const email = `qa.${id}@example.com`;

    await page.getByRole('link', { name: /^(Create|Create Create)$/ }).first().click();
    await page.getByRole('textbox', { name: 'First Name *' }).fill('QA');
    await page.getByRole('textbox', { name: 'Last Name' }).fill(lastName);
    await page.getByRole('textbox', { name: 'Badge ID Show' }).fill(`PEP${id}`);
    await page.getByRole('textbox', { name: 'Email *' }).fill(email);
    await page.getByRole('textbox', { name: 'Phone *' }).fill(`09${randomInt(10000000, 100000000)}`);
    await page.getByRole('button', { name: 'Save & Continue', exact: true }).first().click();

    const success = page.locator('.oh-alert--success:visible')
        .filter({ hasText: /^New Employee Added\.$/ }).first();
    await expect(success).toBeVisible({ timeout: 10000 });
    return { fullName: `QA ${lastName}`, lastName, email };
}

async function findEmployeeByName(page, fullName) {
    await page.goto(LIST_URL);
    const header = page.locator('#view-container thead').first();
    if (!(await header.isVisible())) await page.locator('li[title="List"]').click();
    await expect(header).toBeVisible({ timeout: 15000 });

    const search = page.getByRole('textbox', { name: 'Search Input' });
    await search.fill(fullName);
    await search.press('Enter');

    const row = page.locator('#view-container tbody tr:visible').filter({
        has: page.getByRole('cell', { name: new RegExp(`^${fullName}(?:\\s*\\([^()]+\\))?$`) }),
    });
    await expect(row, `Phải tìm thấy đúng một nhân viên tên "${fullName}"`)
        .toHaveCount(1, { timeout: 15000 });
    return row;
}

async function openEmployeeEdit(page, fullName, section = 'Personal') {
    const row = await findEmployeeByName(page, fullName);
    await row.getByRole('button', { name: 'Edit', exact: true }).click();

    const heading = page.getByRole('heading', { name: `Edit ${fullName}`, exact: true });
    const editLink = page.getByRole('link', { name: `Edit ${fullName} (` })
        .and(page.locator('a[href*="/employee/employee-view-update/"]:visible'));
    await expect(editLink).toBeVisible({ timeout: 15000 });
    const breadcrumbUrl = new URL(await editLink.getAttribute('href'), page.url());
    const editUrl = new URL(breadcrumbUrl.pathname, breadcrumbUrl.origin);

    // Mở trang Edit bằng một lần điều hướng đầy đủ để ổn định biểu mẫu.
    await page.goto(editUrl.href, { waitUntil: 'domcontentloaded' });
    try {
        await expect(heading).toBeVisible({ timeout: 4000 });
    } catch {
        await page.goto(breadcrumbUrl.href, { waitUntil: 'domcontentloaded' });
        await expect(heading).toBeVisible({ timeout: 15000 });
    }

    // Horilla có thể mở lại tab đã dùng trước đó.
    const form = page.locator(`#employeeUpdate${section}Form`);
    if (!(await form.isVisible())) {
        await page.getByRole('link', { name: `${section} Information` }).click();
    }
    await expect(form).toBeVisible({ timeout: 15000 });
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
    expect(response.status(), `Lưu thông tin cá nhân trả về HTTP ${response.status()}`).toBeLessThan(400);
}

async function saveWorkInfo(page, form) {
    await form.getByRole('button', { name: 'Save', exact: true }).click();

    const historySave = page.locator('#historyModalBody:visible').getByText('Save', { exact: true });
    const listHeading = page.getByRole('heading', { name: 'Employees', exact: true });
    await expect(historySave.or(listHeading).first()).toBeVisible({ timeout: 15000 });
    if (await historySave.isVisible()) {
        await historySave.click();
        await expect(historySave).toBeHidden({ timeout: 15000 });
    }
}

test.beforeEach(async ({ page }) => {
    await page.goto(LOGIN_URL);
    await page.getByRole('textbox', { name: 'Username' }).fill(process.env.HORILLA_USERNAME || 'admin');
    await page.getByRole('textbox', { name: 'Password' }).fill(process.env.HORILLA_PASSWORD || 'admin');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.waitForURL('**/dashboard/**', { timeout: 30000 });
    await page.goto(LIST_URL);
});

test.afterEach(async ({ page }, testInfo) => {
    if (page.isClosed()) return;
    try {
        await testInfo.attach(`Result - ${testInfo.title}`, {
            body: await page.screenshot({ fullPage: true, timeout: 5000 }),
            contentType: 'image/png',
        });
    } catch {
        // Tiếp tục lưu kết quả nếu không chụp được ảnh.
    }
});

test('Creat_account: Create employee successfully', async ({ page }) => {
    await createEmployee(page);
});

test('EMP_MGT_Update_12: Edit employee first name', async ({ page }) => {
    const employee = await createEmployee(page);
    const form = await openEmployeeEdit(page, employee.fullName);

    const newFirstName = 'QAUpdated';
    await form.getByRole('textbox', { name: 'First Name *' }).fill(newFirstName);
    await savePersonalInfo(page, form);

    await test.step('Mở lại hồ sơ và kiểm tra First Name đã lưu', async () => {
        const savedForm = await openEmployeeEdit(page, `${newFirstName} ${employee.lastName}`);
        await expect(savedForm.getByRole('textbox', { name: 'First Name *' }))
            .toHaveValue(newFirstName);
    });
});

test('EMP_MGT_Update_13: Edit employee work information', async ({ page }) => {
    const employee = await createEmployee(page);
    const form = await openEmployeeEdit(page, employee.fullName, 'Work');
    await form.getByRole('combobox', { name: '---Choose Department---' }).click();
    await page.locator('.select2-results__option').filter({ hasText: /^Sales$/ }).click();
    await saveWorkInfo(page, form);

    await test.step('Mở lại Work Information và kiểm tra Department đã lưu', async () => {
        const savedForm = await openEmployeeEdit(page, employee.fullName, 'Work');
        await expect(savedForm.locator('select[name="department_id"] option:checked'))
            .toHaveText('Sales');
    });
});

test('EMP_MGT_Update_14: Edit employee email address', async ({ page }) => {
    const employee = await createEmployee(page);
    const form = await openEmployeeEdit(page, employee.fullName);
    const email = `updated.${employee.email}`;

    await form.getByPlaceholder('Email', { exact: true }).fill(email);
    await savePersonalInfo(page, form);

    await test.step('Mở lại hồ sơ và kiểm tra Email đã lưu', async () => {
        const savedForm = await openEmployeeEdit(page, employee.fullName);
        await expect(savedForm.getByPlaceholder('Email', { exact: true }))
            .toHaveValue(email);
    });
});

test('EMP_MGT_Update_15: Reject invalid bank account number', async ({ page }) => {
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
    await expect(account).toHaveValue(invalidNumber);

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
    if (savedResponse) await savedResponse.finished();

    await test.step('Mở lại Bank Information và kiểm tra số tài khoản vẫn như cũ', async () => {
        const savedForm = await openEmployeeEdit(page, employee.fullName, 'Bank');
        await expect(savedForm.getByRole('textbox', { name: 'Account Number*' }))
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
    const options = results.locator(
        '.select2-results__option[role="option"]:not([aria-disabled="true"]):not(.loading-results):visible'
    );

    await expect(options.first(), 'Dropdown phải có ít nhất một lựa chọn hợp lệ').toBeVisible();

    const choices = (await options.allTextContents()).map(text => text.trim());
    const nextName = choices.find(name =>
        name && name !== currentName && name !== excludedName &&
        !(excludedName && name.startsWith(excludedName + ' ('))
    );
    expect(nextName, 'Cần một lựa chọn khác với giá trị hiện tại').toBeTruthy();

    await results.getByText(nextName, { exact: true }).click();
    await expect(select.locator('option:checked')).toHaveText(nextName);
    return nextName;
}

test('EMP_MGT_Edit_16: Change reporting manager', async ({ page }) => {
    const employee = await createEmployee(page);
    const form = await openEmployeeEdit(page, employee.fullName, 'Work');
    const manager = await chooseDifferentWorkOption(
        page, workSelect(form, 'reporting_manager_id'), employee.fullName
    );
    await saveWorkInfo(page, form);

    await test.step('Mở lại hồ sơ và kiểm tra Reporting Manager', async () => {
        const savedForm = await openEmployeeEdit(page, employee.fullName, 'Work');
        await expect(workSelect(savedForm, 'reporting_manager_id').locator('option:checked'))
            .toHaveText(manager);
    });
});

test('EMP_MGT_Edit_17: Change assigned shift', async ({ page }) => {
    const employee = await createEmployee(page);

    const workForm = await openEmployeeEdit(page, employee.fullName, 'Work');
    const shiftSelect = workSelect(workForm, 'shift_id');
    const availableShifts = await shiftSelect.evaluate(select =>
        Array.from(select.options)
            .filter(option => option.value && !option.matches(':disabled'))
            .map(option => ({ value: option.value, label: option.textContent.trim() }))
    );
    const firstShift = availableShifts[0];
    const newShift = availableShifts.find(shift => shift.value !== firstShift?.value &&
        shift.label !== firstShift?.label);
    expect(newShift, 'Horilla cần có ít nhất hai ca làm việc khác nhau').toBeDefined();

    await test.step('Lưu ca làm việc ban đầu', async () => {
        await shiftSelect.selectOption({ value: firstShift.value }, { force: true });
        await saveWorkInfo(page, workForm);
    });

    const form = await openEmployeeEdit(page, employee.fullName, 'Work');
    const currentShift = workSelect(form, 'shift_id');
    await expect(currentShift).toHaveValue(firstShift.value);
    await currentShift.selectOption({ value: newShift.value }, { force: true });
    await saveWorkInfo(page, form);

    await test.step('Mở lại hồ sơ và kiểm tra ca làm việc mới', async () => {
        const savedForm = await openEmployeeEdit(page, employee.fullName, 'Work');
        const savedShift = workSelect(savedForm, 'shift_id');
        await expect(savedShift).toHaveValue(newShift.value);
        await expect(savedShift.locator('option:checked')).toHaveText(newShift.label);
    });
});

test('EMP_MGT_Edit_18: Clear optional Qualification', async ({ page }) => {
    const employee = await createEmployee(page);
    const originalQualification = 'QA Test Certificate';

    await test.step('Chuẩn bị giá trị Qualification có sẵn', async () => {
        const form = await openEmployeeEdit(page, employee.fullName);
        await form.getByRole('textbox', { name: 'Qualification', exact: true })
            .fill(originalQualification);
        await savePersonalInfo(page, form);
    });

    const form = await openEmployeeEdit(page, employee.fullName);
    const qualification = form.getByRole('textbox', { name: 'Qualification', exact: true });
    await expect(qualification).toHaveValue(originalQualification);
    await qualification.clear();
    await savePersonalInfo(page, form);

    await test.step('Mở lại hồ sơ và kiểm tra Qualification để trống', async () => {
        const savedForm = await openEmployeeEdit(page, employee.fullName);
        await expect(savedForm.getByRole('textbox', { name: 'Qualification', exact: true }))
            .toHaveValue('');
    });
});


// Record each testcase after the existing cleanup and screenshot hooks.
installNamedVideoRecording(test);
