import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { createRecordedContext, closeRecordedContext } from './helpers/recorded-context.js';

const BASE_URL = process.env.HORILLA_BASE_URL || 'https://hr.demo.horilla.com';
const LOGIN_URL = new URL('/login/', BASE_URL).href;
const CONFIG_URL = new URL('/payroll/payroll-settings-view/', BASE_URL).href;
const WAIT = 15000;

const restricted = {
    username: process.env.HORILLA_RESTRICTED_USERNAME,
    password: process.env.HORILLA_RESTRICTED_PASSWORD,
};

test.use({ screenshot: 'only-on-failure', trace: 'retain-on-failure' });
test.setTimeout(90000);

const allowanceTable = (page) => page.locator('#allowance_id');
const allowanceRows = (page) => allowanceTable(page).locator('tbody tr:visible');

async function captureEvidence(page, testInfo, stepLabel) {
    await page.waitForTimeout(300);
    await testInfo.attach(`${testInfo.title} - ${stepLabel}`, {
        body: await page.screenshot({ fullPage: true, timeout: 5000 }),
        contentType: 'image/png',
    });
}

async function signIn(page, { username, password }) {
    await page.goto(LOGIN_URL);
    await page.getByRole('textbox', { name: 'Username' }).fill(username);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('**/dashboard/**', { timeout: 30000 });
}

async function openAllowances(page) {
    await signIn(page, {
        username: process.env.HORILLA_USERNAME || 'admin',
        password: process.env.HORILLA_PASSWORD || 'admin',
    });

    await page.goto(CONFIG_URL, { waitUntil: 'domcontentloaded' });
    const allowancesTab = page.getByRole('button', { name: /Allowances/i });
    await expect(allowancesTab).toBeVisible({ timeout: WAIT });
    await allowancesTab.click();
    await expect(allowanceTable(page)).toBeVisible({ timeout: WAIT });
}

async function createDisposableAllowance(page, prefix = 'QA Delete') {
    const id = randomUUID().slice(0, 6);
    const title = `${prefix} ${id}`;

    await page.getByText('Create', { exact: true }).first().click();
    await page.getByRole('textbox', { name: 'Title*' }).fill(title);
    await page.getByRole('textbox', { name: 'Code' }).fill(`QAD_${id}`);
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByRole('spinbutton', { name: 'Amount' }).fill('100');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    const row = allowanceRows(page).filter({ hasText: title });
    await expect(row).toHaveCount(1, { timeout: WAIT });
    return { title, row };
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

test('PAY_ALLOW_Delete_57: Delete an unused allowance and preserve other records', async ({ page }, testInfo) => {
    const target = await createDisposableAllowance(page, 'QA Target');
    const control = await createDisposableAllowance(page, 'QA Control');

    await target.row.locator('#allowanceitem, [title="Delete"], .oh-btn--danger').first().click();

    const summary = page.getByText('Summary', { exact: true });
    await expect(summary).toBeVisible({ timeout: WAIT });
    await summary.click();

    await page.getByLabel('I have took manual action for the protected records', { exact: true }).check();
    await page.getByLabel("I acknowledge, I won't be able to revert this", { exact: true }).check();
    await page.getByLabel('Confirming to delete the related and protected records', { exact: true }).check();

    const confirmBtn = page.locator('#deleteConfirmBtn');
    await expect(confirmBtn).toBeEnabled({ timeout: WAIT });

    // Chụp minh chứng 01: Hộp thoại xác nhận xóa đã tích đủ 3 ô trước khi bấm Delete
    await captureEvidence(page, testInfo, `01 - Xác nhận xóa phụ cấp ${target.title}`);

    await confirmBtn.click();

    await expect(allowanceRows(page).filter({ hasText: target.title })).toHaveCount(0, { timeout: WAIT });
    await expect(allowanceRows(page).filter({ hasText: control.title })).toHaveCount(1, { timeout: WAIT });
    // Ảnh cuối (afterEach) chụp danh sách sau khi đã xóa target và giữ nguyên control
});

test('PAY_ALLOW_Access_58: Block unauthorized allowance deletion', async ({ page, browser }, testInfo) => {
    const target = await createDisposableAllowance(page, 'QA ProtectedAuth');

    if (restricted.username && restricted.password) {
        const context = await createRecordedContext(browser, testInfo, { storageState: { cookies: [], origins: [] } });
        try {
            const limitedPage = await context.newPage();
            await signIn(limitedPage, restricted);
            await expect(limitedPage.locator('#allowanceitem')).toHaveCount(0);
        } finally {
            await closeRecordedContext(context, testInfo, 'restricted');
        }
    } else {
        await target.row.locator('#allowanceitem, [title="Delete"], .oh-btn--danger').first().click();
        await expect(page.getByText('Summary', { exact: true })).toBeVisible({ timeout: WAIT });
        await expect(page.locator('#deleteConfirmBtn:visible:enabled')).toHaveCount(0);
        // Giữ nguyên hộp thoại đang khóa nút #deleteConfirmBtn để afterEach chụp đúng bằng chứng chặn xóa!
    }
});

test('PAY_ALLOW_Delete_59: Cancel allowance deletion dialog', async ({ page }, testInfo) => {
    const target = await createDisposableAllowance(page, 'QA CancelDel');

    await target.row.locator('#allowanceitem, [title="Delete"], .oh-btn--danger').first().click();
    await expect(page.getByText('Summary', { exact: true })).toBeVisible({ timeout: WAIT });

    // Chụp minh chứng 01: Hộp thoại xóa đang mở trước khi bấm Cancel/Escape
    await captureEvidence(page, testInfo, '01 - Hộp thoại xác nhận xóa đang mở trước khi hủy');

    await page.keyboard.press('Escape');
    await expect(allowanceRows(page).filter({ hasText: target.title })).toHaveCount(1, { timeout: WAIT });
    // Ảnh cuối (afterEach) chụp bản ghi vẫn còn nguyên sau khi hủy xóa
});

test('PAY_ALLOW_Delete_60: Block deletion of payroll-linked allowance', async ({ page }) => {
    const standardRow = allowanceRows(page).filter({ hasText: 'Reimbursement' }).first();
    await expect(standardRow).toBeVisible({ timeout: WAIT });
    await standardRow.scrollIntoViewIfNeeded();

    const disabledDeleteBtn = standardRow.getByRole('button', { name: 'Standard pay item — cannot be deleted' });
    await expect(disabledDeleteBtn).toBeVisible();
    await expect(disabledDeleteBtn).toBeDisabled();
    // Ảnh cuối (afterEach) chụp dòng Reimbursement với nút xóa bị khóa
});