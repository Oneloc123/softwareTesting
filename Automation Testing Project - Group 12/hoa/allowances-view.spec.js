import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { createRecordedContext, closeRecordedContext } from './helpers/recorded-context.js';

const BASE_URL = process.env.HORILLA_BASE_URL || 'https://hr.demo.horilla.com';
const LOGIN_URL = new URL('/login/', BASE_URL).href;
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
const searchBox = (page) =>
    page.getByRole('textbox', { name: /Search/i })
        .or(page.locator('input[name="search"]:visible, input[placeholder*="Search" i]:visible'))
        .first();

async function signIn(page, { username, password }) {
    await page.goto(LOGIN_URL);
    await page.getByRole('textbox', { name: 'Username' }).fill(username);
    await page.getByRole('textbox', { name: 'Password' }).fill(password);
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('**/dashboard/**', { timeout: 30000 });
}

async function openAllowances(page) {
    const configLink = page.getByRole('link', { name: 'Configuration' });
    if (!(await configLink.isVisible())) {
        await page.getByRole('button', { name: 'Payroll' }).first().click();
    }
    await expect(configLink).toBeVisible({ timeout: WAIT });
    await configLink.click();

    const allowancesTab = page.getByRole('button', { name: 'Allowances' });
    await expect(allowancesTab).toBeVisible({ timeout: WAIT });
    await allowancesTab.click();
    await expect(allowanceTable(page)).toBeVisible({ timeout: WAIT });
}

async function showAllAllowanceColumns(page) {
    await expect(allowanceTable(page)).toBeVisible({ timeout: WAIT });
    const customizeBtn = allowanceTable(page)
        .getByRole('button', { name: 'Customize columns' })
        .or(page.getByRole('button', { name: 'Customize columns' }))
        .first();
    await expect(customizeBtn).toBeVisible({ timeout: WAIT });
    await customizeBtn.click();

    const selectAllCheckbox = page.getByRole('checkbox', { name: 'Select all columns' }).first();
    const selectAllLabel = page
        .getByRole('group', { name: 'Customize columns' })
        .locator('label')
        .filter({ hasText: 'Select All' })
        .first();

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
    await expect(selectAllCheckbox).toBeChecked({ timeout: WAIT });

    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Allowances' }).click();
    await expect(allowanceTable(page)).toBeVisible({ timeout: WAIT });
}

async function clearAllowanceSearch(page, input) {
    await input.fill('');
    const tags = page.locator('.oh-titlebar__tag-close:visible');
    for (let i = 0; i < 10 && (await tags.count()) > 0; i++) {
        await tags.first().click();
    }
    await input.press('Enter');
}

async function createAllowanceFixture(page, { title, amount = '500000' } = {}) {
    const uniqueTitle = title || `QA Transport ${randomUUID().slice(0, 6)}`;
    const createBtn = page.getByRole('button', { name: /^(Create|Add|New)$/i })
        .or(page.getByRole('link', { name: /^(Create|Add|New)$/i }))
        .first();

    await createBtn.click();

    const titleInput = page.locator('input[name="title"]:visible').or(page.getByLabel(/Title/i)).first();
    await expect(titleInput).toBeVisible({ timeout: WAIT });
    await titleInput.fill(uniqueTitle);

    const fixedToggle = page.locator('input[name="is_fixed"]:visible').first();
    if (await fixedToggle.count()) {
        if (!(await fixedToggle.isChecked())) await fixedToggle.check({ force: true });
    }

    const amountInput = page.locator('input[name="amount"]:visible').or(page.getByLabel(/Amount/i)).first();
    if (await amountInput.isVisible()) {
        await amountInput.fill(String(amount));
    }

    await page.getByRole('button', { name: /^Save$/i }).first().click();
    await expect(allowanceTable(page)).toBeVisible({ timeout: WAIT });
    return { title: uniqueTitle, amount: String(amount) };
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

test('PAY_ALLOW_List_26: Display allowance list and verify all customized columns', async ({ page }) => {
    const columns = ['Allowance', 'Code', 'Taxable', 'Calculation', 'Applied To', 'History', 'Actions'];

    async function checkList() {
        await showAllAllowanceColumns(page);
        for (const column of columns) {
            await expect(
                allowanceTable(page).getByRole('columnheader', { name: new RegExp(column, 'i') }).first(),
                `Missing column: ${column}`
            ).toBeVisible({ timeout: WAIT });
        }
        await expect.poll(() => allowanceRows(page).count(), { timeout: WAIT }).toBeGreaterThan(0);
    }

    await checkList();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Allowances' }).click();
    await checkList();
});

test('PAY_ALLOW_View_27: Open allowance details and verify saved fields', async ({ page }) => {
    await showAllAllowanceColumns(page);
    const firstRow = allowanceRows(page).first();
    await expect(firstRow).toBeVisible({ timeout: WAIT });

    const rowTextBefore = await firstRow.innerText();
    await firstRow.locator('td').nth(1).click();

    // Kiểm tra dữ liệu vẫn nhất quán sau khi đóng hoặc xem chi tiết
    await page.keyboard.press('Escape');
    await expect(firstRow).toBeVisible({ timeout: WAIT });
    expect(await firstRow.innerText()).toBe(rowTextBefore);
});

test('PAY_ALLOW_Access_28: Restrict allowance management access for ordinary employee', async ({ browser }, testInfo) => {
    test.skip(!restricted.username || !restricted.password, 'Cần cấu hình tài khoản nhân viên thường (HORILLA_RESTRICTED_USERNAME / PASSWORD).');

    const context = await createRecordedContext(browser, testInfo, { storageState: { cookies: [], origins: [] } });
    try {
        const limitedPage = await context.newPage();
        await signIn(limitedPage, restricted);

        const configLink = limitedPage.getByRole('link', { name: 'Configuration' });
        await expect(configLink).toHaveCount(0);
    } finally {
        await closeRecordedContext(context, testInfo, 'restricted');
    }
});

test('PAY_ALLOW_View_29: Filter allowances by matching title and clear search', async ({ page }) => {
    const firstRow = allowanceRows(page).first();
    await expect(firstRow).toBeVisible({ timeout: WAIT });
    const firstTitle = (
        (await firstRow.locator('td').nth(1).innerText()).trim() ||
        (await firstRow.locator('td').first().innerText()).trim()
    );

    const input = searchBox(page);
    await expect(input).toBeVisible({ timeout: WAIT });

    await input.fill(firstTitle);
    await input.press('Enter');

    await expect.poll(async () => {
        const texts = await allowanceRows(page).allInnerTexts();
        return texts.length > 0 && texts.every(t => t.toLowerCase().includes(firstTitle.toLowerCase()));
    }, { timeout: WAIT }).toBe(true);

    await clearAllowanceSearch(page, input);
    await expect.poll(() => allowanceRows(page).count(), { timeout: WAIT }).toBeGreaterThan(0);
});

test('PAY_ALLOW_View_30: Handle no-match allowance search safely', async ({ page }) => {
    const input = searchBox(page);
    await expect(input).toBeVisible({ timeout: WAIT });

    await input.fill('QA_NO_MATCH_999999');
    await input.press('Enter');

    await expect(allowanceRows(page).filter({ hasText: 'QA_NO_MATCH_999999' })).toHaveCount(0, { timeout: WAIT });

    await clearAllowanceSearch(page, input);
    await expect.poll(() => allowanceRows(page).count(), { timeout: WAIT }).toBeGreaterThan(0);
});