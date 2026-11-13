import { randomUUID } from 'node:crypto';

import { test, expect } from '@playwright/test';

import { createRecordedContext, closeRecordedContext } from './helpers/recorded-context.js';



const BASE_URL = process.env.HORILLA_BASE_URL || 'https://hr.demo.horilla.com';

const LOGIN_URL = new URL('/login/', BASE_URL).href;

const ALLOWANCES_URL = new URL('/payroll/view-allowance/', BASE_URL).href;

const WAIT = 15000;

const admin = {

    username: process.env.HORILLA_USERNAME || 'admin',

    password: process.env.HORILLA_PASSWORD || 'admin',

};

const restricted = {

    username: process.env.HORILLA_RESTRICTED_USERNAME,

    password: process.env.HORILLA_RESTRICTED_PASSWORD,

};

const DELETE_ACTION = 'a[hx-get*="/generic-delete/"][hx-get*="model=payroll.Allowance"]'

    + '[hx-target="#deleteConfirmationBody"]';



test.use({ screenshot: 'only-on-failure', trace: 'retain-on-failure' });

test.setTimeout(90000);



const allowanceTable = (page) => page.locator('#allowance_id');

const allowanceRows = (page) => allowanceTable(page).locator('tbody tr:visible');

const allowanceRow = (page, title) => allowanceRows(page).filter({

    has: page.getByRole('cell', { name: title, exact: true }),

});



async function signIn(page, { username, password }) {

    await page.goto(LOGIN_URL);

    await page.getByRole('textbox', { name: 'Username' }).fill(username);

    await page.locator('input[type="password"]:visible').fill(password);

    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.waitForURL(url => url.origin === new URL(LOGIN_URL).origin && !/^\/login\/?$/.test(url.pathname),

        { waitUntil: 'domcontentloaded', timeout: 30000 });

}



async function openAllowances(page) {

    await signIn(page, admin);

    await page.waitForURL('**/dashboard/**', { timeout: 30000 });



    const configLink = page.getByRole('link', { name: 'Configuration' });

    if (!(await configLink.isVisible())) {

        await page.getByRole('button', { name: 'Payroll' }).first().click();

    }

    await expect(configLink).toBeVisible({ timeout: WAIT });

    await configLink.click();



    await showAllowances(page);

}



async function showAllowances(page) {

    const activeTabSearch = page.locator('.oh-tabs__content--active')

        .getByRole('textbox', { name: 'Search Input' }).first();

    await expect(activeTabSearch).toBeVisible({ timeout: WAIT });



    if (!(await allowanceTable(page).isVisible())) {

        await page.getByRole('button', { name: 'Allowances' }).click({ timeout: WAIT });

    }

    await expect(allowanceTable(page)).toBeVisible({ timeout: WAIT });

}



async function reloadAllowances(page) {

    await page.reload({ waitUntil: 'domcontentloaded' });

    await showAllowances(page);

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

    const save = page.getByRole('button', { name: 'Save', exact: true });

    await save.click();

    await expect(save).toBeHidden({ timeout: WAIT });



    const row = allowanceRow(page, title);

    await expect(row).toHaveCount(1, { timeout: WAIT });

    return { title, row };

}



async function openDeleteConfirmation(page, { title, row }) {

    await expect(row).toHaveCount(1, { timeout: WAIT });



    const deleteAction = row.locator(DELETE_ACTION);

    await expect(deleteAction, `Delete icon for ${title}`).toBeVisible({ timeout: WAIT });

    const deleteUrl = new URL(await deleteAction.getAttribute('hx-get'), BASE_URL);

    const rowId = await row.getAttribute('data-instance-id');

    expect(rowId, 'Allowance row ID').toMatch(/^\d+$/);

    expect(deleteUrl.searchParams.get('pk')).toBe(rowId);

    await deleteAction.click({ timeout: WAIT });



    const dialog = page.locator('#deleteConfirmation:visible');

    await expect(dialog).toHaveCount(1, { timeout: WAIT });

    await expect(dialog.getByText('Delete Confirmation', { exact: true })).toBeVisible({ timeout: WAIT });

    await dialog.getByText('Summary', { exact: true }).click({ timeout: WAIT });

    const summary = dialog.locator('#summary');

    await expect(summary).toBeVisible({ timeout: WAIT });

    await expect(summary.getByText(/Deleting the record/i)).toContainText(title);

    return { dialog, summary, deleteUrl };

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



test('PAY_ALLOW_Delete_57: Delete a disposable allowance and preserve other records', async ({ page }) => {

    const target = await createDisposableAllowance(page, 'QA Target');

    const control = await createDisposableAllowance(page, 'QA Control');

    const controlValues = await control.row.innerText();



    const { summary, deleteUrl } = await openDeleteConfirmation(page, target);

    const protectedHeading = summary.locator('h5:visible, h6:visible')

        .filter({ hasText: /Protected Records/i });

    await expect(protectedHeading).toBeVisible({ timeout: WAIT });

    const protectedCount = (await protectedHeading.innerText()).match(/\d+/g);

    expect(protectedCount, 'The QA allowance must show exactly zero protected records').toEqual(['0']);

    const deleteForm = summary.locator('form[hx-post*="/generic-delete/"]:visible');

    await expect(deleteForm).toBeVisible({ timeout: WAIT });

    const submitUrl = new URL(await deleteForm.getAttribute('hx-post'), BASE_URL);

    expect(submitUrl.origin).toBe(deleteUrl.origin);

    expect(submitUrl.pathname).toBe(deleteUrl.pathname);

    expect(submitUrl.searchParams.get('model')).toBe('payroll.Allowance');

    expect(submitUrl.searchParams.get('pk'), 'The form must submit for the selected QA allowance')

        .toBe(deleteUrl.searchParams.get('pk'));



    const confirmBtn = deleteForm.locator('#deleteConfirmBtn');

    await test.step('Tick and verify all three checkboxes in Summary', async () => {

        const checkboxes = ['action', 'revert', 'confirm'].map(name =>

            deleteForm.locator(`input[type="checkbox"][name="${name}"]:visible`),

        );



        await expect(confirmBtn).toBeDisabled({ timeout: WAIT });

        for (const checkbox of checkboxes) {

            await checkbox.check({ timeout: WAIT });

        }

        for (const checkbox of checkboxes) {

            await expect(checkbox).toBeChecked({ timeout: WAIT });

        }

        await expect(confirmBtn, 'Delete must be enabled after all three checkboxes are checked')

            .toBeEnabled({ timeout: WAIT });

    });

    const [response] = await Promise.all([

        page.waitForResponse(response => {

            const url = new URL(response.url());

            return response.request().method() === 'POST'

                && url.origin === deleteUrl.origin

                && url.pathname === deleteUrl.pathname

                && url.searchParams.get('model') === deleteUrl.searchParams.get('model')

                && url.searchParams.get('pk') === deleteUrl.searchParams.get('pk');

        }, { timeout: WAIT }),

        confirmBtn.click({ timeout: WAIT }),

    ]);

    expect(response.ok(), 'Delete response for the QA allowance').toBe(true);



    await reloadAllowances(page);

    await expect(target.row).toHaveCount(0, { timeout: WAIT });

    await expect(control.row).toHaveCount(1, { timeout: WAIT });

    await expect(control.row).toHaveText(controlValues, { useInnerText: true, timeout: WAIT });

});



async function findAllowance(page, title) {

    const search = page.getByRole('textbox', { name: 'Search Input', exact: true });

    await search.fill(title, { timeout: WAIT });

    await search.press('Enter', { timeout: WAIT });

    const row = allowanceRow(page, title);

    await expect(row).toHaveCount(1, { timeout: WAIT });

    return row;

}



async function expectRestrictedDeleteBlocked(page, title, targetId) {

    const response = await page.goto(ALLOWANCES_URL, { waitUntil: 'domcontentloaded' });

    await expect(page, 'The restricted session must stay signed in').not.toHaveURL(/\/login\/?(?:[?#]|$)/);

    if (response?.status() === 403) return;

    expect(response?.ok(), 'Allowances must open or show a permission denial').toBe(true);



    const table = page.locator('#allowance_id:visible');

    const cards = page.locator('#allowance_card:visible');

    const denied = page.getByText(/^(?:Access Denied|You (?:do not|don['’]t) have permission to view this page)[.!]?$/i)

        .first();

    await expect(table.or(cards).or(denied).first()).toBeVisible({ timeout: WAIT });

    if (await denied.isVisible()) return;

    if (await cards.isVisible()) {

        await page.locator('li[title="List"]:visible').click({ timeout: WAIT });

        await expect(table).toBeVisible({ timeout: WAIT });

    }



    const row = await findAllowance(page, title);

    await expect(row).toHaveAttribute('data-instance-id', targetId);

    const deleteAction = row.locator(DELETE_ACTION + ':visible:not([aria-disabled="true"])')

        .or(row.getByRole('button', { name: 'Delete', exact: true, disabled: false }))

        .or(row.getByRole('link', { name: 'Delete', exact: true, disabled: false }));

    await expect(deleteAction, 'The restricted user must have no enabled Delete action on this allowance')

        .toHaveCount(0, { timeout: WAIT });

}



test.describe(() => {

    test.skip(!restricted.username || !restricted.password,

        'Set HORILLA_RESTRICTED_USERNAME and HORILLA_RESTRICTED_PASSWORD for a user without Delete Allowance.');



    test('PAY_ALLOW_Access_58: Block unauthorized allowance deletion', async ({ page, browser }, testInfo) => {

        expect(restricted.username.toLowerCase(), 'Use a separate restricted account')

            .not.toBe(admin.username.toLowerCase());



        const target = await createDisposableAllowance(page, 'QA ProtectedAuth');

        const targetId = await target.row.getAttribute('data-instance-id');

        expect(targetId, 'The QA allowance ID').toMatch(/^\d+$/);

        const before = await target.row.innerText();



        const context = await createRecordedContext(browser, testInfo, { storageState: { cookies: [], origins: [] } });

        try {

            const limitedPage = await context.newPage();

            await signIn(limitedPage, restricted);

            await expectRestrictedDeleteBlocked(limitedPage, target.title, targetId);

        } finally {

            await closeRecordedContext(context, testInfo, 'restricted');

        }



        await reloadAllowances(page);

        const saved = await findAllowance(page, target.title);

        await expect(saved).toHaveAttribute('data-instance-id', targetId);

        await expect(saved).toHaveText(before, { useInnerText: true, timeout: WAIT });

    });

});



test('PAY_ALLOW_Delete_59: Cancel allowance deletion dialog', async ({ page }) => {

    const target = await createDisposableAllowance(page, 'QA CancelDel');

    const { dialog, summary } = await openDeleteConfirmation(page, target);



    const cancel = summary.getByText('Cancel', { exact: true });

    const close = dialog.getByRole('button', { name: 'Close', exact: true });

    await (await cancel.isVisible() ? cancel : close).click({ timeout: WAIT });

    await expect(dialog).toHaveCount(0, { timeout: WAIT });

    await reloadAllowances(page);

    await expect(target.row).toHaveCount(1, { timeout: WAIT });

});



test('PAY_ALLOW_Delete_60: Block deletion of protected standard pay items', async ({ page }) => {
    const search = page.locator('.oh-tabs__content--active')
        .getByRole('textbox', { name: 'Search Input', exact: true })
        .or(page.getByRole('textbox', { name: 'Search Input', exact: true }))
        .first();

    await search.fill('Basic Pay');
    await search.press('Enter');

    const standardRow = allowanceRow(page, 'Basic Pay').first();
    await expect(standardRow).toBeVisible({ timeout: WAIT });

    const { dialog, summary } = await openDeleteConfirmation(page, {
        title: 'Basic Pay',
        row: standardRow,
    });

    const protectedHeading = summary.locator('h5:visible, h6:visible').filter({ hasText: /Protected Records/i });
    await expect(protectedHeading).toBeVisible({ timeout: WAIT });

    const confirmBtn = summary.locator('#deleteConfirmBtn');
    await expect(confirmBtn).toBeVisible({ timeout: WAIT });
    await expect(confirmBtn).toBeDisabled({ timeout: WAIT });

    const cancel = summary.getByRole('button', { name: 'Cancel', exact: true })
        .or(summary.getByText('Cancel', { exact: true }));
    const close = dialog.locator('button.oh-modal__close, button[aria-label="Close"]').first();
    await (await cancel.isVisible() ? cancel : close).click({ timeout: WAIT });
    await expect(dialog).toHaveCount(0, { timeout: WAIT });
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
