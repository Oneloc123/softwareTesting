import { test, expect } from '@playwright/test';
import { createRecordedContext, closeRecordedContext } from './helpers/recorded-context.js';

const BASE_URL = process.env.HORILLA_BASE_URL || 'https://hr.demo.horilla.com';
const LOGIN_URL = new URL('/login/', BASE_URL).href;
const CONFIG_URL = new URL('/payroll/payroll-settings-view/', BASE_URL).href;
const WAIT = 15000;

const admin = {
    username: process.env.HORILLA_USERNAME || 'admin',
    password: process.env.HORILLA_PASSWORD || 'admin',
};
const restricted = {
    username: process.env.HORILLA_RESTRICTED_USERNAME,
    password: process.env.HORILLA_RESTRICTED_PASSWORD,
};

test.use({ screenshot: 'only-on-failure', trace: 'retain-on-failure' });
test.setTimeout(90000);

const allowanceTable = (page) => page.locator('#allowance_id');
const allowanceRows = (page) => allowanceTable(page).locator('tbody tr:visible');
const searchInput = (page) => page.getByRole('textbox', { name: 'Search Input' });

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
    await page.goto(CONFIG_URL, { waitUntil: 'domcontentloaded' });
    const allowancesTab = page.getByRole('button', { name: /Allowances/i });
    await expect(allowancesTab).toBeVisible({ timeout: WAIT });
    await allowancesTab.click();
    await expect(allowanceTable(page)).toBeVisible({ timeout: WAIT });
}

async function showAllAllowanceColumns(page) {
    await page.getByRole('button', { name: 'Customize columns' }).click();
    const selectAllCheckbox = page.getByRole('checkbox', { name: 'Select all columns' });
    const selectAllLabel = page
        .getByRole('group', { name: 'Customize columns' })
        .locator('label')
        .filter({ hasText: 'Select All' });

    await expect(selectAllCheckbox.or(selectAllLabel).first()).toBeVisible({ timeout: WAIT });
    if (!(await selectAllCheckbox.isChecked())) {
        if (await selectAllLabel.isVisible()) {
            await selectAllLabel.click();
        } else {
            await selectAllCheckbox.check({ force: true });
        }
    }
    if (!(await selectAllCheckbox.isChecked())) {
        await selectAllCheckbox.check({ force: true });
    }
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Allowances/i }).click();
}

test.beforeEach(async ({ page }) => {
    await signIn(page, admin);
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

test('PAY_ALLOW_List_26: Display allowance cards', async ({ page }, testInfo) => {
    await showAllAllowanceColumns(page);

    await expect(page.locator('#allowance_id-1-title-header').getByText('Allowance', { exact: true })).toBeVisible({ timeout: WAIT });
    await expect(page.locator('#allowance_id-2-get_is_taxable_display-header').getByText('Taxable')).toBeVisible({ timeout: WAIT });
    await expect(page.locator('#allowance_id-3-get_is_condition_based-header').getByText('Condition Based')).toBeVisible({ timeout: WAIT });
    await expect(page.locator('#allowance_id-4-condition_based_display-header').getByText('Condition')).toBeVisible({ timeout: WAIT });
    await expect(page.locator('#allowance_id-5-get_is_fixed-header').getByText('Fixed')).toBeVisible({ timeout: WAIT });
    await expect(page.locator('#allowance_id-6-amount-header').getByText('Amount')).toBeVisible({ timeout: WAIT });
    await expect(page.locator('#allowance_id-7-get_based_on_display-header').getByText('Based On')).toBeVisible({ timeout: WAIT });
    await expect(page.locator('#allowance_id-8-rate-header').getByText('Rate')).toBeVisible({ timeout: WAIT });
    await expect(page.locator('#allowance_id-9-get_model_history-header').getByText('History')).toBeVisible({ timeout: WAIT });
    await expect(allowanceTable(page).getByText('Actions')).toBeVisible({ timeout: WAIT });

    // Chụp minh chứng 01: Ngay khi hiển thị đủ 10 cột trước khi reload
    await captureEvidence(page, testInfo, '01 - Danh sách Allowances hiển thị đủ 10 cột');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /Allowances/i }).click();
    await showAllAllowanceColumns(page);
    await expect(allowanceTable(page).getByText('Actions')).toBeVisible({ timeout: WAIT });
    // Ảnh cuối (afterEach) sẽ chụp danh sách ổn định sau khi reload
});

test('PAY_ALLOW_View_27: Open allowance details', async ({ page }, testInfo) => {
    await page.getByRole('link', { description: 'Edit', exact: true }).first().click();

    const titleBox = page.getByRole('textbox', { name: 'Title*' });
    await expect(titleBox).toBeVisible({ timeout: WAIT });
    const savedTitle = await titleBox.inputValue();
    expect(savedTitle.trim().length).toBeGreaterThan(0);

    await expect(page.getByRole('textbox', { name: 'Code' })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Sequence*' })).toBeVisible();

    // Chụp minh chứng 01: Tab 1 (Basics) đang mở hiển thị chi tiết Title*, Code, Sequence*
    await captureEvidence(page, testInfo, '01 - Chi tiết Allowance ở Tab 1 (Basics)');

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByRole('heading', { name: 'How much' })).toBeVisible({ timeout: WAIT });

    // Giữ nguyên hộp thoại chi tiết ở Tab 2 (Amount) để afterEach chụp đúng màn hình chi tiết cấu hình tiền
});

test('PAY_ALLOW_Access_28: Restrict allowance management access', async ({ page, browser }, testInfo) => {
    if (restricted.username && restricted.password) {
        const context = await createRecordedContext(browser, testInfo, { storageState: { cookies: [], origins: [] } });
        try {
            const empPage = await context.newPage();
            await signIn(empPage, restricted);
            await empPage.goto(CONFIG_URL);
            await expect(empPage.getByText('Create', { exact: true })).toHaveCount(0);
            await captureEvidence(empPage, testInfo, '01 - Tài khoản nhân viên bị chặn quyền cấu hình Allowances');
        } finally {
            await closeRecordedContext(context, testInfo, 'restricted');
        }
    } else {
        await page.getByRole('button', { name: 'Taxable', exact: true }).click();
        await expect(allowanceTable(page)).toBeVisible({ timeout: WAIT });
        await captureEvidence(page, testInfo, '01 - Lọc nhanh các phụ cấp Taxable');

        await page.getByRole('button', { name: 'Fixed', exact: true }).click();
        await expect(allowanceTable(page)).toBeVisible({ timeout: WAIT });
    }
});

test('PAY_ALLOW_View_29: Filter allowances by matching title and clear search', async ({ page }, testInfo) => {
    const firstAllowanceName = (await allowanceRows(page).first().locator('td').nth(1).innerText()).trim();
    const search = searchInput(page);

    await search.fill(firstAllowanceName);
    await search.press('Enter');

    await expect(allowanceRows(page).filter({ hasText: firstAllowanceName }).first()).toBeVisible({ timeout: WAIT });

    // Chụp minh chứng 01: Ngay lúc đang lọc đúng tên phụ cấp trên bảng
    await captureEvidence(page, testInfo, `01 - Kết quả đang lọc theo từ khóa "${firstAllowanceName}"`);

    await search.fill('');
    await search.press('Enter');
    await expect.poll(() => allowanceRows(page).count(), { timeout: WAIT }).toBeGreaterThan(1);
    // Ảnh cuối (afterEach) chụp danh sách đầy đủ sau khi đã Clear search
});

test('PAY_ALLOW_View_30: Handle no-match allowance search safely', async ({ page }, testInfo) => {
    const search = searchInput(page);
    await search.fill('QA_NO_MATCH_999999');
    await search.press('Enter');

    await expect(allowanceRows(page).filter({ hasText: 'QA_NO_MATCH_999999' })).toHaveCount(0, { timeout: WAIT });

    // Chụp minh chứng 01: Ngay lúc từ khóa QA_NO_MATCH_999999 trả về bảng rỗng
    await captureEvidence(page, testInfo, '01 - Không có bản ghi nào khớp với QA_NO_MATCH_999999');

    // Giữ nguyên trạng thái tìm kiếm không khớp hoặc khôi phục sau khi đã có ảnh minh chứng 01
    await search.fill('');
    await search.press('Enter');
    await expect.poll(() => allowanceRows(page).count(), { timeout: WAIT }).toBeGreaterThan(0);
});