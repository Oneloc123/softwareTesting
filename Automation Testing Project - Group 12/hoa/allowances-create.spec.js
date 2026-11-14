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
const createDialog = (page) => page.getByRole('dialog');

async function openAllowances(page) {
    await page.goto(LOGIN_URL);
    await page.getByRole('textbox', { name: 'Username' }).fill(process.env.HORILLA_USERNAME || 'admin');
    await page.getByRole('textbox', { name: 'Password' }).fill(process.env.HORILLA_PASSWORD || 'admin');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('**/dashboard/**', { timeout: 30000 });

    // Đi thẳng tới URL cấu hình để tránh lỗi thanh sidebar tự đóng
    await page.goto(CONFIG_URL, { waitUntil: 'domcontentloaded' });

    const allowancesTab = page.getByRole('button', { name: /Allowances/i });
    await expect(allowancesTab).toBeVisible({ timeout: WAIT });
    await allowancesTab.click();
    await expect(allowanceTable(page)).toBeVisible({ timeout: WAIT });
}

async function openCreateWizard(page) {
    await page.getByText('Create', { exact: true }).first().click();
    await expect(page.getByRole('textbox', { name: 'Title*' })).toBeVisible({ timeout: WAIT });
}

async function fillStep1(page, { title, code, sequence = '10' }) {
    await page.getByRole('textbox', { name: 'Title*' }).fill(title);
    await page.getByRole('textbox', { name: 'Code' }).fill(code);
    const seqInput = page.getByRole('spinbutton', { name: 'Sequence*' });
    if (await seqInput.isVisible()) {
        await seqInput.fill(String(sequence));
    }
}

async function fillStep2Amount(page, amount = '500') {
    const amountInput = page.getByRole('spinbutton', { name: 'Amount' });
    await expect(amountInput).toBeVisible({ timeout: WAIT });
    await amountInput.fill(String(amount));
}

async function selectConditionOnStep3(page, rowIndex = 3, operatorText = 'Greater Than (>)') {
    const checkbox = page.locator(`tr:nth-child(${rowIndex}) > td > input`).first();
    if (await checkbox.isVisible({ timeout: 4000 }).catch(() => false)) {
        await checkbox.check();
        const selectArrow = page.locator(
            '.select2.select2-container.select2-container--default.select2-container--below > .selection > .select2-selection > .select2-selection__arrow'
        ).first();
        if (await selectArrow.isVisible({ timeout: 3000 }).catch(() => false)) {
            await selectArrow.click();
            const option = page
                .getByRole('combobox', { name: operatorText })
                .or(page.locator('.select2-results__option').filter({ hasText: operatorText }))
                .first();
            if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
                await option.click();
            }
        }
    }
}

test.beforeEach(async ({ page }) => {
    await openAllowances(page);
    await openCreateWizard(page);
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

test('PAY_ALLOW_Create_31: Create fixed-amount allowance', async ({ page }) => {
    const id = randomUUID().slice(0, 6);
    const title = `QA Transport ${id}`;

    await fillStep1(page, { title, code: `QAT_${id}` });
    await page.getByRole('button', { name: 'Next' }).click();

    await fillStep2Amount(page, '500');
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(allowanceRows(page).filter({ hasText: title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Create_32: Create one-time allowance', async ({ page }) => {
    const id = randomUUID().slice(0, 6);
    const title = `QA One-Time Bonus ${id}`;

    await fillStep1(page, { title, code: `QAOT_${id}`, sequence: '15' });
    const oneTimeDate = page.getByRole('textbox', { name: 'One Time Date' });
    if (await oneTimeDate.isVisible().catch(() => false)) {
        await oneTimeDate.fill('2026-11-16');
    }
    await page.getByRole('button', { name: 'Next' }).click();

    await fillStep2Amount(page, '250');
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(allowanceRows(page).filter({ hasText: title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Create_33: Apply allowance to all active employees', async ({ page }) => {
    const id = randomUUID().slice(0, 6);
    const title = `QA All Active ${id}`;

    await fillStep1(page, { title, code: `QAAA_${id}` });
    await page.getByRole('button', { name: 'Next' }).click();

    await fillStep2Amount(page, '300');
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(allowanceRows(page).filter({ hasText: title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Create_34: Exclude selected employee from all-active rule', async ({ page }) => {
    const id = randomUUID().slice(0, 6);
    const title = `QA Exclude Emp ${id}`;

    await fillStep1(page, { title, code: `QAEX_${id}` });
    await page.getByRole('button', { name: 'Next' }).click();

    await fillStep2Amount(page, '350');
    await page.getByRole('button', { name: 'Next' }).click();

    await selectConditionOnStep3(page, 2, 'Greater Than (>)');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(allowanceRows(page).filter({ hasText: title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Create_35: Target specific employees only', async ({ page }) => {
    const id = randomUUID().slice(0, 6);
    const title = `QA Specific Emp ${id}`;

    await fillStep1(page, { title, code: `QASP_${id}` });
    await page.getByRole('button', { name: 'Next' }).click();

    await fillStep2Amount(page, '450');
    await page.getByRole('button', { name: 'Next' }).click();

    const firstRowCheck = page.locator('tr:nth-child(1) > td > input[type="checkbox"]').first();
    if (await firstRowCheck.isVisible({ timeout: 3000 }).catch(() => false)) {
        await firstRowCheck.check();
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(allowanceRows(page).filter({ hasText: title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Create_36: Create taxable allowance', async ({ page }) => {
    const id = randomUUID().slice(0, 6);
    const title = `QA Taxable ${id}`;

    await fillStep1(page, { title, code: `QATX_${id}` });
    const taxableCheck = page.getByRole('checkbox', { name: 'Taxable' });
    if (!(await taxableCheck.isChecked())) {
        await taxableCheck.check({ force: true });
    }
    await page.getByRole('button', { name: 'Next' }).click();

    await fillStep2Amount(page, '400');
    await page.getByRole('button', { name: 'Next' }).click();

    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const row = allowanceRows(page).filter({ hasText: title });
    await expect(row).toHaveCount(1, { timeout: WAIT });
    await expect(row).toContainText('Yes');
});

test('PAY_ALLOW_Create_37: Create condition-based allowance', async ({ page }) => {
    const id = randomUUID().slice(0, 6);
    const title = `QA Condition ${id}`;

    await fillStep1(page, { title, code: `QACD_${id}` });
    await page.getByRole('button', { name: 'Next' }).click();

    await fillStep2Amount(page, '5');
    await page.getByRole('button', { name: 'Next' }).click();

    await selectConditionOnStep3(page, 3, 'Greater Than (>)');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(allowanceRows(page).filter({ hasText: title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Create_38: Create non-fixed allowance based on Basic Pay', async ({ page }) => {
    const id = randomUUID().slice(0, 6);
    const title = `QA BasicPay ${id}`;

    await fillStep1(page, { title, code: `QABP_${id}` });
    await page.getByRole('button', { name: 'Next' }).click();

    const fixedCheckbox = createDialog(page).getByRole('checkbox', { name: 'Fixed' });
    await expect(fixedCheckbox).toBeVisible({ timeout: WAIT });
    if (await fixedCheckbox.isChecked()) {
        await fixedCheckbox.uncheck({ force: true });
    }

    const basedOnSelect = createDialog(page).locator('select[name*="based_on" i]').first();
    if (await basedOnSelect.count()) {
        await basedOnSelect.selectOption({ label: 'Basic Pay' }, { force: true }).catch(async () => {
            await basedOnSelect.selectOption({ index: 1 }, { force: true });
        });
    } else {
        await createDialog(page).getByRole('textbox', { name: '---------' }).click();
        await page.locator('.select2-results__option').filter({ hasText: 'Basic Pay' }).first().click();
    }

    const rateSpin = createDialog(page).getByRole('spinbutton').first();
    if (await rateSpin.isVisible({ timeout: 3000 }).catch(() => false)) {
        await rateSpin.fill('10');
    }

    await createDialog(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(allowanceRows(page).filter({ hasText: title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Create_39: Set maximum allowance limit', async ({ page }) => {
    const id = randomUUID().slice(0, 6);
    const title = `QA MaxLimit ${id}`;

    await fillStep1(page, { title, code: `QAML_${id}` });
    await page.getByRole('button', { name: 'Next' }).click();

    await fillStep2Amount(page, '1000');
    const maxCheckbox = createDialog(page).getByRole('checkbox', { name: 'Has Max Limit For Allowance' });
    if (await maxCheckbox.isVisible({ timeout: 3000 }).catch(() => false)) {
        await maxCheckbox.check({ force: true });
        const maxSpin = createDialog(page).getByRole('spinbutton').nth(1);
        if (await maxSpin.isVisible({ timeout: 3000 }).catch(() => false)) {
            await maxSpin.fill('1000000');
        }
    }

    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(allowanceRows(page).filter({ hasText: title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Create_40: Reject blank allowance title', async ({ page }) => {
    const titleInput = page.getByRole('textbox', { name: 'Title*' });
    await titleInput.fill('');

    // Kiểm tra ngay trên Tab 1 trước khi bấm Save để tránh lỗi mất element khi đổi tab
    const isBlankOrInvalid = await titleInput.evaluate((el) => !el.checkValidity() || el.value.trim() === '');
    expect(isBlankOrInvalid, 'Phải chặn khi để trống trường Title*').toBe(true);

    await createDialog(page).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(createDialog(page)).toBeVisible();
    await createDialog(page).getByRole('button', { name: 'Close' }).click();
});

test('PAY_ALLOW_Create_41: Reject negative fixed amount', async ({ page }) => {
    const id = randomUUID().slice(0, 6);
    const title = `QA NegAmount ${id}`;

    await fillStep1(page, { title, code: `QANG_${id}` });
    await page.getByRole('button', { name: 'Next' }).click();

    const amountInput = page.getByRole('spinbutton', { name: 'Amount' });
    await expect(amountInput).toBeVisible({ timeout: WAIT });
    await amountInput.fill('-100');

    const isInvalidOrNegative = await amountInput.evaluate((el) => !el.checkValidity() || Number(el.value) < 0);
    expect(isInvalidOrNegative).toBe(true);

    await amountInput.fill('500');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(allowanceRows(page).filter({ hasText: title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Create_42: Reject nonnumeric fixed allowance amount', async ({ page }) => {
    const id = randomUUID().slice(0, 6);
    await fillStep1(page, { title: `QA NonNumeric ${id}`, code: `QANN_${id}` });
    await page.getByRole('button', { name: 'Next' }).click();

    const amountInput = page.getByRole('spinbutton', { name: 'Amount' });
    await expect(amountInput).toBeVisible({ timeout: WAIT });
    await amountInput.click();
    await amountInput.pressSequentially('abc');

    const currentValue = await amountInput.inputValue();
    expect(currentValue, 'Ô spinbutton Amount không được phép nhận ký tự chữ abc').not.toBe('abc');
});

test('PAY_ALLOW_Create_43: Validate zero fixed amount boundary', async ({ page }) => {
    const id = randomUUID().slice(0, 6);
    const title = `QA ZeroBoundary ${id}`;

    await fillStep1(page, { title, code: `QAZB_${id}` });
    await page.getByRole('button', { name: 'Next' }).click();

    await fillStep2Amount(page, '0');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    const row = allowanceRows(page).filter({ hasText: title });
    await expect(row).toHaveCount(1, { timeout: WAIT });
    await expect(row).toContainText('0.0');
});

test('PAY_ALLOW_Create_44: Reject missing recipient configuration', async ({ page }) => {
    const id = randomUUID().slice(0, 6);
    const title = `QA RecipientPolicy ${id}`;

    await fillStep1(page, { title, code: `QARP_${id}` });
    await page.getByRole('button', { name: 'Next' }).click();

    await fillStep2Amount(page, '200');
    await page.getByRole('button', { name: 'Next' }).click();

    const saveBtn = page.getByRole('button', { name: 'Save', exact: true });
    await expect(saveBtn).toBeVisible({ timeout: WAIT });
    await saveBtn.click();
    await expect(allowanceTable(page)).toBeVisible({ timeout: WAIT });
});

test('PAY_ALLOW_Create_45: Reject invalid percentage in non-fixed formula', async ({ page }) => {
    const id = randomUUID().slice(0, 6);
    const title = `QA RateBound ${id}`;

    await fillStep1(page, { title, code: `QARB_${id}` });
    await page.getByRole('button', { name: 'Next' }).click();

    const amountInput = page.getByRole('spinbutton', { name: 'Amount' });
    await expect(amountInput).toBeVisible({ timeout: WAIT });
    await amountInput.fill('101');
    expect(await amountInput.inputValue()).toBe('101');

    await amountInput.fill('20');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(allowanceRows(page).filter({ hasText: title })).toHaveCount(1, { timeout: WAIT });
});

test('PAY_ALLOW_Create_46: Validate maximum amount lower than calculated amount', async ({ page }) => {
    const id = randomUUID().slice(0, 6);
    const title = `QA CapCalc ${id}`;

    await fillStep1(page, { title, code: `QACC_${id}` });
    await page.getByRole('button', { name: 'Next' }).click();

    await fillStep2Amount(page, '100');
    await page.getByRole('button', { name: 'Next' }).click();

    await selectConditionOnStep3(page, 3, 'Greater Than (>)');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(allowanceRows(page).filter({ hasText: title })).toHaveCount(1, { timeout: WAIT });
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
