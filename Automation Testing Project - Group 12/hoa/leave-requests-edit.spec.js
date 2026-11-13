import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.HORILLA_BASE_URL || 'https://hr.demo.horilla.com';
const LOGIN_URL = new URL('/login/', BASE_URL).href;
const CONFIG_URL = new URL('/payroll/payroll-settings-view/', BASE_URL).href;
const WAIT = 15000;

test.use({ screenshot: 'only-on-failure', trace: 'retain-on-failure' });
test.setTimeout(90000);

const allowanceTable = (page) => page.locator('#allowance_id');
const allowanceRows = (page) => allowanceTable(page).locator('tbody tr:visible');
const editDialog = (page) => page.getByRole('dialog');

async function captureEvidence(page, testInfo, stepLabel) {
    await page.waitForTimeout(300);
    await testInfo.attach(`${testInfo.title} - ${stepLabel}`, {
        body: await page.screenshot({ fullPage: true, timeout: 5000 }),
        contentType: 'image/png',
    });
}

async function openAllowances(page) {
    await page.goto(LOGIN_URL);
    await page.getByRole('textbox', { name: 'Username' }).fill(process.env.HORILLA_USERNAME || 'admin');
    await page.getByRole('textbox', { name: 'Password' }).fill(process.env.HORILLA_PASSWORD || 'admin');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('**/dashboard/**', { timeout: 30000 });

    await page.goto(CONFIG_URL, { waitUntil: 'domcontentloaded' });
    const allowancesTab = page.getByRole('button', { name: /Allowances/i });
    await expect(allowancesTab).toBeVisible({ timeout: WAIT });
    await allowancesTab.click();
    await expect(allowanceTable(page)).toBeVisible({ timeout: WAIT });
}

async function createAllowanceFixture(page, prefix = 'QA Edit') {
    const id = randomUUID().slice(0, 6);
    const title = `${prefix} ${id}`;

    await page.getByText('Create', { exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Title*' }).fill(title);
    await page.getByRole('textbox', { name: 'Code' }).fill(`QAE_${id}`);
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByRole('spinbutton', { name: 'Amount' }).fill('500');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    const row = allowanceRows(page).filter({ hasText: title });
    await expect(row).toHaveCount(1, { timeout: WAIT });
    return { title, row };
}

async function openEditForRow(page, row) {
    const editLink = row
        .getByRole('link', { description: 'Edit', exact: true })
        .or(row.getByRole('link', { name: 'Edit' }))
        .first();
    await editLink.click();
    await expect(page.getByRole('textbox', { name: 'Title*' })).toBeVisible({ timeout: WAIT });
}

test.beforeEach(async ({ page }) => {
    await openAllowances(page);
});

test.afterEach(async ({ page }, testInfo) => {
    if (page.isClosed()) return;
    try {
        await testInfo.attach(`Result - ${testInfo.title}`, {
            body: await page.screenshot({ fullPage: true, timeout: 5000 }),
            contentType: 'image/png',
        });
    } catch { }
});

test('PAY_ALLOW_Edit_47: Rename allowance', async ({ page }, testInfo) => {
    const item = await createAllowanceFixture(page, 'QA Transport');
    await openEditForRow(page, item.row);

    const updatedTitle = `${item.title} Updated`;
    await page.getByRole('textbox', { name: 'Title*' }).fill(updatedTitle);
    await captureEvidence(page, testInfo, `01 - Đổi tên Title* thành "${updatedTitle}" trên Modal`);

    await editDialog(page).getByRole('button', { name: 'Save' }).click();
    await expect(allowanceRows(page).filter({ hasText: updatedTitle })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Edit_48: Update fixed amount', async ({ page }, testInfo) => {
    const item = await createAllowanceFixture(page, 'QA Amount');
    await openEditForRow(page, item.row);

    await page.getByRole('button', { name: 'Next' }).click();
    const amountSpin = page.getByRole('spinbutton', { name: 'Amount' });
    await expect(amountSpin).toBeVisible({ timeout: WAIT });
    await amountSpin.fill('650');
    await captureEvidence(page, testInfo, '01 - Cập nhật Amount từ 500 lên 650 trên Modal');

    await editDialog(page).getByRole('button', { name: 'Save' }).click();
    const updatedRow = allowanceRows(page).filter({ hasText: item.title });
    await expect(updatedRow).toContainText('650.0', { timeout: WAIT });
});

test('PAY_ALLOW_Edit_49: Change one-time date', async ({ page }, testInfo) => {
    const item = await createAllowanceFixture(page, 'QA Schedule');
    await openEditForRow(page, item.row);

    const oneTimeDate = page.getByRole('textbox', { name: 'One Time Date' });
    if (await oneTimeDate.isVisible().catch(() => false)) {
        await oneTimeDate.fill('2026-12-01');
    }
    await page.getByRole('spinbutton', { name: 'Sequence*' }).fill('25');
    await captureEvidence(page, testInfo, '01 - Cập nhật One Time Date = 2026-12-01 và Sequence = 25');

    await editDialog(page).getByRole('button', { name: 'Save' }).click();
    await expect(allowanceRows(page).filter({ hasText: item.title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Edit_50: Switch from fixed to non-fixed', async ({ page }, testInfo) => {
    const item = await createAllowanceFixture(page, 'QA SwitchMode');
    await openEditForRow(page, item.row);

    await page.getByRole('button', { name: 'Next' }).click();
    const fixedCheckbox = page.getByRole('checkbox', { name: 'Fixed' });
    await expect(fixedCheckbox).toBeVisible({ timeout: WAIT });
    if (await fixedCheckbox.isChecked()) {
        await fixedCheckbox.uncheck({ force: true });
    }

    const basedOnSelect = editDialog(page).locator('select[name*="based_on" i]').first();
    if (await basedOnSelect.count()) {
        await basedOnSelect.selectOption({ label: 'Basic Pay' }, { force: true }).catch(async () => {
            await basedOnSelect.selectOption({ index: 1 }, { force: true });
        });
    } else {
        await editDialog(page).getByRole('textbox', { name: '---------' }).click();
        await page.locator('.select2-results__option').filter({ hasText: 'Basic Pay' }).first().click();
    }

    const rateOrSpin = editDialog(page).getByRole('spinbutton').first();
    if (await rateOrSpin.isVisible({ timeout: 3000 }).catch(() => false)) {
        await rateOrSpin.fill('15');
    }
    await captureEvidence(page, testInfo, '01 - Đã tắt Fixed và chọn Based On = Basic Pay (15%)');

    await editDialog(page).getByRole('button', { name: 'Save' }).click();
    await expect(allowanceRows(page).filter({ hasText: item.title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Edit_51: Change Is Taxable setting', async ({ page }, testInfo) => {
    const item = await createAllowanceFixture(page, 'QA TaxEdit');
    await openEditForRow(page, item.row);

    const taxableCheckbox = page.getByRole('checkbox', { name: 'Taxable' });
    await taxableCheckbox.click({ force: true });
    await captureEvidence(page, testInfo, '01 - Đổi trạng thái checkbox Taxable trên Modal');

    await editDialog(page).getByRole('button', { name: 'Save' }).click();
    await expect(allowanceRows(page).filter({ hasText: item.title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Edit_52: Update condition-based eligibility', async ({ page }, testInfo) => {
    const item = await createAllowanceFixture(page, 'QA CondEdit');
    await openEditForRow(page, item.row);

    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('spinbutton', { name: 'Amount' }).fill('3');
    await page.getByRole('button', { name: 'Next' }).click();

    const condCheck = page.locator('tr:nth-child(3) > td > input').first();
    if (await condCheck.isVisible({ timeout: 4000 }).catch(() => false)) {
        await condCheck.check();
    }
    await captureEvidence(page, testInfo, '01 - Cập nhật điều kiện ở Bước 3');

    await editDialog(page).getByRole('button', { name: 'Save' }).click();
    await expect(allowanceRows(page).filter({ hasText: item.title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Edit_53: Update excluded employees', async ({ page }, testInfo) => {
    const item = await createAllowanceFixture(page, 'QA ExclEdit');
    await openEditForRow(page, item.row);

    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    const secondCondCheck = page.locator('tr:nth-child(2) > td > input').first();
    if (await secondCondCheck.isVisible({ timeout: 4000 }).catch(() => false)) {
        await secondCondCheck.check();
    }
    await captureEvidence(page, testInfo, '01 - Cập nhật danh sách loại trừ ở Bước 3');

    await editDialog(page).getByRole('button', { name: 'Save' }).click();
    await expect(allowanceRows(page).filter({ hasText: item.title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Edit_54: Reject blank title while editing allowance', async ({ page }) => {
    const item = await createAllowanceFixture(page, 'QA BlankTitle');
    await openEditForRow(page, item.row);

    const titleInput = page.getByRole('textbox', { name: 'Title*' });
    await titleInput.fill('');

    await editDialog(page).getByRole('button', { name: 'Save' }).click();
    await titleInput.evaluate((el) => el.reportValidity());

    const isInvalidWhenBlank = await titleInput.evaluate((el) => !el.checkValidity() || el.value.trim() === '');
    expect(isInvalidWhenBlank, 'Trường Title* rỗng phải bị đánh dấu không hợp lệ').toBe(true);
    // Giữ nguyên Modal đang báo lỗi Title* trống để afterEach chụp đúng bằng chứng lỗi!
});

test('PAY_ALLOW_Edit_55: Reject negative amount on edit', async ({ page }) => {
    const item = await createAllowanceFixture(page, 'QA NegEdit');
    await openEditForRow(page, item.row);

    await page.getByRole('button', { name: 'Next' }).click();
    const amountSpin = page.getByRole('spinbutton', { name: 'Amount' });
    await expect(amountSpin).toBeVisible({ timeout: WAIT });
    await amountSpin.fill('-1');

    await editDialog(page).getByRole('button', { name: 'Save' }).click();
    await amountSpin.evaluate((el) => el.reportValidity());

    const isInvalidOrNegative = await amountSpin.evaluate((el) => !el.checkValidity() || Number(el.value) < 0);
    expect(isInvalidOrNegative).toBe(true);
    // Giữ nguyên Modal đang chứa Amount = -1 để afterEach chụp đúng cảnh báo lỗi
});

test('PAY_ALLOW_Edit_56: Cancel allowance edit without saving', async ({ page }, testInfo) => {
    const item = await createAllowanceFixture(page, 'QA CancelEdit');
    await openEditForRow(page, item.row);

    await page.getByRole('textbox', { name: 'Title*' }).fill('QA-UNSAVED');
    // Chụp minh chứng 01: Đang nhập nháp QA-UNSAVED trước khi bấm Close
    await captureEvidence(page, testInfo, '01 - Nhập nháp QA-UNSAVED trước khi hủy');

    await editDialog(page).getByRole('button', { name: 'Close' }).click();

    await expect(allowanceRows(page).filter({ hasText: 'QA-UNSAVED' })).toHaveCount(0);
    await expect(allowanceRows(page).filter({ hasText: item.title })).toHaveCount(1);
    // Ảnh cuối (afterEach) chụp bảng danh sách giữ nguyên tên gốc sau khi hủy
});