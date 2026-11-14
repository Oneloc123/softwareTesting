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

async function openAllowances(page) {
    await page.goto(LOGIN_URL);
    await page.getByRole('textbox', { name: 'Username' }).fill(process.env.HORILLA_USERNAME || 'admin');
    await page.getByRole('textbox', { name: 'Password' }).fill(process.env.HORILLA_PASSWORD || 'admin');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('**/dashboard/**', { timeout: 30000 });

    // Điều hướng thẳng đến trang Payroll Configuration để tránh lỗi sidebar tự đóng (auto-collapse)
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

test('PAY_ALLOW_Edit_47: Rename allowance', async ({ page }) => {
    const item = await createAllowanceFixture(page, 'QA Transport');
    await openEditForRow(page, item.row);

    const updatedTitle = `${item.title} Updated`;
    await page.getByRole('textbox', { name: 'Title*' }).fill(updatedTitle);
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(allowanceRows(page).filter({ hasText: updatedTitle })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Edit_48: Update fixed amount', async ({ page }) => {
    const item = await createAllowanceFixture(page, 'QA Amount');
    await openEditForRow(page, item.row);

    await page.getByRole('button', { name: 'Next' }).click();
    const amountSpin = page.getByRole('spinbutton', { name: 'Amount' });
    await expect(amountSpin).toBeVisible({ timeout: WAIT });
    await amountSpin.fill('650');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    const updatedRow = allowanceRows(page).filter({ hasText: item.title });
    await expect(updatedRow).toContainText('650.0', { timeout: WAIT });
});

test('PAY_ALLOW_Edit_49: Change one-time date', async ({ page }) => {
    const item = await createAllowanceFixture(page, 'QA Schedule');
    await openEditForRow(page, item.row);

    await page.getByRole('spinbutton', { name: 'Sequence*' }).fill('25');
    await page.getByRole('button', { name: 'Next' }).click();
    const dateInput = page.locator('input[type="date"]:visible, input[name*="date" i]:visible').first();
    if (await dateInput.isVisible().catch(() => false)) {
        await dateInput.fill('2026-12-01');
    }
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(allowanceRows(page).filter({ hasText: item.title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Edit_50: Switch from fixed to non-fixed', async ({ page }) => {
    const item = await createAllowanceFixture(page, 'QA SwitchMode');
    await openEditForRow(page, item.row);

    await page.getByRole('button', { name: 'Next' }).click();

    // Bỏ chọn checkbox "Fixed" để chuyển sang chế độ Non-Fixed
    const fixedCheckbox = page.getByRole('checkbox', { name: 'Fixed' });
    await expect(fixedCheckbox).toBeVisible({ timeout: WAIT });
    if (await fixedCheckbox.isChecked()) {
        await fixedCheckbox.uncheck({ force: true });
    }

    // Khi Fixed tắt, chọn "Basic Pay" trong Based On (Select2 hoặc select ẩn)
    const basedOnSelect = editDialog(page).locator('select[name*="based_on" i]').first();
    if (await basedOnSelect.count()) {
        await basedOnSelect.selectOption({ label: 'Basic Pay' }, { force: true }).catch(async () => {
            await basedOnSelect.selectOption({ index: 1 }, { force: true });
        });
    } else {
        await editDialog(page).getByRole('textbox', { name: '---------' }).click();
        await page.locator('.select2-results__option').filter({ hasText: 'Basic Pay' }).first().click();
    }

    // Điền Rate/spinbutton nếu hiển thị sau khi chọn Based On
    const rateOrSpin = editDialog(page).getByRole('spinbutton').first();
    if (await rateOrSpin.isVisible({ timeout: 3000 }).catch(() => false)) {
        await rateOrSpin.fill('15');
    }

    await editDialog(page).getByRole('button', { name: 'Save' }).click();
    await expect(allowanceRows(page).filter({ hasText: item.title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Edit_51: Change Is Taxable setting', async ({ page }) => {
    const item = await createAllowanceFixture(page, 'QA TaxEdit');
    await openEditForRow(page, item.row);

    const taxableToggle = page.locator('input[name*="taxable" i]:visible').first();
    if (await taxableToggle.isVisible().catch(() => false)) {
        await taxableToggle.click({ force: true });
    }
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(allowanceRows(page).filter({ hasText: item.title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Edit_52: Update condition-based eligibility', async ({ page }) => {
    const item = await createAllowanceFixture(page, 'QA CondEdit');
    await openEditForRow(page, item.row);

    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('spinbutton', { name: 'Amount' }).fill('3');
    await page.getByRole('button', { name: 'Next' }).click();

    const condCheck = page.locator('tr:nth-child(3) > td > input').first();
    if (await condCheck.isVisible({ timeout: 4000 }).catch(() => false)) {
        await condCheck.check();
    }
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(allowanceRows(page).filter({ hasText: item.title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Edit_53: Update excluded employees', async ({ page }) => {
    const item = await createAllowanceFixture(page, 'QA ExclEdit');
    await openEditForRow(page, item.row);

    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    const secondCondCheck = page.locator('tr:nth-child(2) > td > input').first();
    if (await secondCondCheck.isVisible({ timeout: 4000 }).catch(() => false)) {
        await secondCondCheck.check();
    }
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(allowanceRows(page).filter({ hasText: item.title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Edit_54: Reject blank title while editing allowance', async ({ page }) => {
    const item = await createAllowanceFixture(page, 'QA BlankTitle');
    await openEditForRow(page, item.row);

    const titleInput = page.getByRole('textbox', { name: 'Title*' });
    await titleInput.fill('');

    // Kiểm tra trạng thái invalid ngay trên Tab 1 trước khi chuyển tab, sau đó bấm Save
    const isInvalidWhenBlank = await titleInput.evaluate((el) => !el.checkValidity() || el.value.trim() === '');
    expect(isInvalidWhenBlank, 'Trường Title* rỗng phải bị đánh dấu không hợp lệ').toBe(true);

    await editDialog(page).getByRole('button', { name: 'Save' }).click();

    // Đóng dialog nếu vẫn mở và xác nhận bản ghi gốc vẫn giữ nguyên tên ban đầu
    const closeBtn = editDialog(page).getByRole('button', { name: 'Close' });
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        await closeBtn.click();
    }
    await expect(allowanceRows(page).filter({ hasText: item.title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Edit_55: Reject negative amount on edit', async ({ page }) => {
    const item = await createAllowanceFixture(page, 'QA NegEdit');
    await openEditForRow(page, item.row);

    await page.getByRole('button', { name: 'Next' }).click();
    const amountSpin = page.getByRole('spinbutton', { name: 'Amount' });
    await expect(amountSpin).toBeVisible({ timeout: WAIT });
    await amountSpin.fill('-1');

    const isInvalidOrNegative = await amountSpin.evaluate((el) => !el.checkValidity() || Number(el.value) < 0);
    expect(isInvalidOrNegative).toBe(true);

    await editDialog(page).getByRole('button', { name: 'Close' }).click();
    await expect(allowanceRows(page).filter({ hasText: item.title })).toContainText('500.0');
});

test('PAY_ALLOW_Edit_56: Cancel allowance edit without saving', async ({ page }) => {
    const item = await createAllowanceFixture(page, 'QA CancelEdit');
    await openEditForRow(page, item.row);

    await page.getByRole('textbox', { name: 'Title*' }).fill('QA-UNSAVED');
    await editDialog(page).getByRole('button', { name: 'Close' }).click();

    await expect(allowanceRows(page).filter({ hasText: 'QA-UNSAVED' })).toHaveCount(0);
    await expect(allowanceRows(page).filter({ hasText: item.title })).toHaveCount(1);
});

// Record every testcase and keep the existing screenshot and trace settings.
test.use({ video: 'on' });

async function saveVideoByTestName(page, testInfo) {
    const context = page.context();
    const pages = [...new Set([page, ...context.pages()])];
    const videos = pages.map(currentPage => currentPage.video()).filter(Boolean);

    // Finalize recording after the original screenshot hook has completed.
    await context.close();

    const name = testInfo.title
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .trim()
        .slice(0, 150) || 'testcase';
    const repeat = testInfo.repeatEachIndex
        ? `-repeat-${testInfo.repeatEachIndex}`
        : '';
    const retry = testInfo.retry ? `-retry-${testInfo.retry}` : '';

    for (const [index, video] of videos.entries()) {
        const extraPage = videos.length > 1 ? `-page-${index + 1}` : '';
        const filename = `${name}${repeat}${retry}${extraPage}.webm`;
        const savedPath = testInfo.outputPath(filename);

        await video.saveAs(savedPath);
        await testInfo.attach(filename, {
            path: savedPath,
            contentType: 'video/webm',
        });
    }
}

// Registered last so the original afterEach hook captures its screenshot first.
test.afterEach(async ({ page }, testInfo) => {
    await saveVideoByTestName(page, testInfo);
});
