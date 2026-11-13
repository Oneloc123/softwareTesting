// Complete Employees view/filter suite: 10 tests.
// Save as tests/employees-view.spec.js and replace the existing file.
// Run: npx playwright test tests/employees-view.spec.js --project=chromium --headed --workers=1
// Video is enabled in this file for both passing and failing tests.
// Required independent QA fixtures must match the assertions below.
// Filter_121 requires HORILLA_121_TAG (and matching HORILLA_121_TAG_BADGES).
// Filter_126 requires HORILLA_126_GROUP and HORILLA_126_PERMISSION.
// Non-demo origins require HORILLA_USERNAME and HORILLA_PASSWORD.

import { test, expect, errors } from '@playwright/test';

const demo = 'https://hr.demo.horilla.com';
const base = new URL(process.env.HORILLA_BASE_URL || demo);
const user = process.env.HORILLA_USERNAME || (base.origin === demo ? 'admin' : '');
const password = process.env.HORILLA_PASSWORD || (base.origin === demo ? 'admin' : '');
const wait = 15000;
const listPath = '/employee/employees-list/';

const ids = { emily: 'NTI0001', daniel: 'NTI0002', priya: 'NTI0003', marcus: 'NTI0004', wei: 'NTI0006' };
const qa = {
    tag: process.env.HORILLA_121_TAG || '',
    tagBadges: (process.env.HORILLA_121_TAG_BADGES || ids.daniel).split(',').map(id => id.trim()),
    jobPosition: process.env.HORILLA_121_JOB_POSITION || '',
    group: process.env.HORILLA_126_GROUP || '',
    permission: process.env.HORILLA_126_PERMISSION || '',
    working: process.env.HORILLA_128_WORKING || 'Yes',
    notWorking: process.env.HORILLA_128_NOT_WORKING || 'No',
    unknown: process.env.HORILLA_128_UNKNOWN || 'Unknown',
    unknownBadges: (process.env.HORILLA_128_UNKNOWN_BADGES ?? [ids.daniel, ids.priya].join(','))
        .split(',').map(id => id.trim()).filter(Boolean),
};

test.use({
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
});
test.setTimeout(150000);

const list = page => page.locator('#view-container');
const rows = page => list(page).locator('tbody tr:visible');
const panel = page => page.locator('#modernFilterPanel');
const sorted = values => [...values].sort();
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exact = value => new RegExp('^\\s*' + escapeRegex(value) + '\\s*$');
const field = (page, label) => panel(page).locator('.oh-input-group').filter({
    has: page.locator('.oh-label').filter({ hasText: exact(label) }),
});
const section = (page, label) => panel(page).getByText(label, { exact: true }).first();
const openClass = /oh-filter-panel--open/;

function required(value, label) {
    expect(value.trim(), 'Missing QA configuration: ' + label).not.toBe('');
    return value;
}

async function openEmployees(page) {
    await page.goto(new URL('/employee/employee-view/', base).href);
    const header = list(page).locator('thead').first();
    await expect(header.or(page.locator('li[title="List"]')).first()).toBeVisible({ timeout: wait });
    if (!(await header.isVisible())) await page.locator('li[title="List"]').click();
    await expect(header).toBeVisible({ timeout: wait });
}

test.beforeEach(async ({ page }) => {
    required(user, 'HORILLA_USERNAME');
    required(password, 'HORILLA_PASSWORD');
    await page.goto(new URL('/login/', base).href);
    await page.getByRole('textbox', { name: 'Username', exact: true }).fill(user);
    await page.locator('input[type=password]:visible').fill(password);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).toHaveURL(url => url.origin === base.origin && /^\/dashboard(?:\/|$)/.test(url.pathname),
        { timeout: 30000 });
    await openEmployees(page);
});

async function column(page, label) {
    const header = list(page).getByRole('columnheader', { name: new RegExp('(?:^|\\s)' + escapeRegex(label) + '$') });
    await expect(header, 'Column ' + label + ' in Employees List').toHaveCount(1, { timeout: wait });
    return header.evaluate(th => th.cellIndex + 1);
}

async function employeeCells(page) {
    const index = await column(page, 'Employee');
    return rows(page).locator('td:nth-child(' + index + ')');
}

async function expectBadges(page, expected) {
    const cells = await employeeCells(page);
    await expect.poll(async () => {
        const names = await cells.allTextContents();
        return sorted(names.map(name => name.trim().match(/\(([^()]*)\)$/)?.[1] || name.trim()));
    }, { timeout: wait, message: 'Badge IDs in the filtered results' }).toEqual(sorted(expected));
}

async function expectEmployees(page, expected) {
    const cells = await employeeCells(page);
    await expect.poll(async () => sorted((await cells.allTextContents()).map(name => name.trim())),
        { timeout: wait, message: 'Restore the original Employees list' }).toEqual(sorted(expected));
}

async function workValue(page, badge, label) {
    const employeeIndex = await column(page, 'Employee');
    const valueIndex = await column(page, label);
    const employee = rows(page).filter({
        has: page.locator('td:nth-child(' + employeeIndex + ')').filter({
            hasText: new RegExp('\\(' + escapeRegex(badge) + '\\)\\s*$'),
        }),
    });
    return (await employee.locator('td:nth-child(' + valueIndex + ')').innerText({ timeout: wait })).trim();
}

async function openFilter(page) {
    if (!openClass.test((await panel(page).getAttribute('class')) || '')) {
        await page.locator('#modernFilterTrigger').click();
    }
    await expect(panel(page)).toHaveClass(openClass);
}

async function updateList(page, action) {
    const [response] = await Promise.all([
        page.waitForResponse(res => {
            const url = new URL(res.url());
            return url.origin === base.origin && url.pathname === listPath;
        }, { timeout: wait }),
        action(),
    ]);
    expect(response.ok(), 'Employees List response').toBe(true);
    await response.finished();
}

async function apply(page) {
    await updateList(page, () => panel(page).getByRole('button', { name: 'Apply', exact: true }).click());
    await expect(panel(page)).not.toHaveClass(openClass);
}

async function clear(page) {
    await openFilter(page);
    await updateList(page, () => panel(page).getByRole('button', { name: 'Clear all', exact: true }).click());
}

async function setFilter(page, label, value) {
    const group = field(page, label);
    if (!(await group.isVisible()) && label !== 'Name or Badge ID') {
        await section(page, ['Groups', 'Permissions'].includes(label) ? 'Groups & Permissions' : 'Work Info').click();
    }
    await expect(group).toBeVisible();

    if (label === 'Active?') {
        await group.locator('label.oh-segmented__item').filter({ hasText: exact(value) }).click();
        return;
    }

    const select = group.locator('select');
    if (!(await select.count())) {
        await group.getByRole('textbox').fill(value);
        return;
    }

    const widget = group.locator('.select2-selection:visible');
    const optionName = typeof value === 'string' ? exact(value) : value.pattern;
    if (!(await widget.count())) {
        const option = select.locator('option').filter({ hasText: optionName });
        await expect(option, 'Option ' + label).toHaveCount(1);
        await select.selectOption({ value: await option.getAttribute('value') });
        return;
    }

    await widget.click();
    const search = page.locator('.select2-container--open .select2-search__field:visible').last();
    if (await search.isVisible()) await search.fill(typeof value === 'string' ? value : value.text);
    const options = page.locator('.select2-results:visible');
    await options.getByRole('option', { name: optionName }).click({ timeout: wait });
    if (await options.isVisible()) await page.keyboard.press('Escape');
}

async function removeChoice(page, label, value) {
    const group = field(page, label);
    if (!(await group.isVisible())) await section(page, 'Work Info').click();
    await group.locator('.select2-selection__choice').filter({ hasText: value })
        .locator('.select2-selection__choice__remove').click();
}

async function runFilters(page, fields, scope = []) {
    await clear(page);
    await openFilter(page);
    if (scope.length) await setFilter(page, 'Name or Badge ID', scope.join(', '));
    for (const [label, value] of Object.entries(fields)) await setFilter(page, label, value);
    await apply(page);
}

const EMILY = { name: 'Emily Carter', badge: 'NTI0001' };
const PRIYA = { name: 'Priya Raman', badge: 'NTI0003' };
const MARCUS = { name: 'Marcus Johnson', badge: 'NTI0004' };

const searchBox = (page) => page.getByRole('textbox', { name: 'Search Input' });
const employeeRow = (page, emp) => rows(page).filter({ hasText: emp.name }).filter({ hasText: emp.badge });

async function ensureListView(page) {
    const header = page.locator('#view-container thead').first();
    if (!(await header.isVisible())) await page.locator('li[title="List"]').click();
    await expect(header).toBeVisible({ timeout: 15000 });
}

async function searchBy(page, field, value) {
    const input = searchBox(page);
    await input.fill(value);
    if (field === 'Name') {
        await input.press('Enter');
        return;
    }
    await input.dispatchEvent('keyup');
    const option = page.getByRole('link', { name: new RegExp(`Search\\s+${field}\\s+for:\\s*${value}`, 'i') });
    await expect(option).toBeVisible({ timeout: 10000 });
    await option.click();
}

async function clearSearch(page) {
    await searchBox(page).fill('');
    const tags = page.locator('.oh-titlebar__tag-close:visible');
    for (let i = 0; i < 10 && (await tags.count()) > 0; i++) await tags.first().click();
    await searchBox(page).press('Enter');
}

async function openProfile(page, emp) {
    const row = employeeRow(page, emp);
    await expect(row).toHaveCount(1, { timeout: 20000 });
    await row.getByText(emp.name, { exact: false }).first().click();
    const heading = page.locator('.emp-profile-card h2:visible, .oh-profile__info-name:visible').first();
    await expect(heading).toContainText(emp.name, { timeout: 15000 });
    await expect(heading).toContainText(emp.badge);
}

test('EMP_MGT_List_01 - Display employee list', async ({ page }) => {
    const columns = ['Employee', 'Email', 'Department', 'Phone', 'Shift', 'Employee Type', 'Reporting Manager', 'Company', 'Actions'];

    async function checkList() {
        await ensureListView(page);
        const headers = await page.locator('#view-container thead th').allInnerTexts();
        for (const column of columns) expect(headers.some(h => h.trim().includes(column)), `Missing column: ${column}`).toBe(true);
        await expect.poll(() => rows(page).count(), { timeout: 15000 }).toBeGreaterThanOrEqual(3);
    }

    await checkList();
    await page.reload();
    await checkList();
});

test('EMP_MGT_List_02 - Find employee by full name', async ({ page }) => {
    await searchBy(page, 'Name', EMILY.name);
    await expect(employeeRow(page, EMILY)).toHaveCount(1, { timeout: 20000 });
    await expect.poll(async () => { const results = await rows(page).allInnerTexts(); return results.length > 0 && results.every(r => r.includes(EMILY.name)); }, { timeout: 20000 }).toBe(true);
    await clearSearch(page);
    await expect.poll(() => rows(page).count(), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
    await searchBy(page, 'Name', EMILY.name);
    await openProfile(page, EMILY);
});

test('EMP_MGT_List_03 - Find employee by Badge ID', async ({ page }) => {
    await searchBy(page, 'Badge ID', PRIYA.badge);
    await expect(employeeRow(page, PRIYA)).toHaveCount(1, { timeout: 20000 });
    const count = await rows(page).count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) await expect(rows(page).nth(i)).toContainText(PRIYA.badge);
    await clearSearch(page);
    await expect.poll(() => rows(page).count(), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
    await searchBy(page, 'Badge ID', PRIYA.badge);
    await openProfile(page, PRIYA);
});

test('EMP_MGT_List_04 - Find employees by Department (Sales)', async ({ page }) => {
    await searchBy(page, 'Department', 'Sales');
    await expect(employeeRow(page, MARCUS)).toHaveCount(1, { timeout: 20000 });
    const headers = await page.locator('#view-container thead th').allInnerTexts();
    const deptIndex = headers.findIndex(h => h.includes('Department'));
    expect(deptIndex, 'Department column not found').toBeGreaterThanOrEqual(0);
    await expect.poll(async () => { const values = await rows(page).locator(`td:nth-child(${deptIndex + 1})`).allInnerTexts(); return values.length > 0 && values.every(v => v.trim() === 'Sales'); }, { timeout: 20000 }).toBe(true);
    await clearSearch(page);
    await expect.poll(() => rows(page).count(), { timeout: 15000 }).toBeGreaterThanOrEqual(2);
    await searchBy(page, 'Department', 'Sales');
    await openProfile(page, MARCUS);
    const tab = page.locator('[id$="profileTab"]:visible').first();
    const dept = tab.locator('dt', { hasText: /^\s*Department\s*$/ }).first();
    await expect(dept.locator('xpath=following-sibling::dd[1]')).toContainText('Sales');
});
test('EMP_MGT_Filter_05 - Filter name or Badge ID', async ({ page }) => {
    const filterButton = page.getByRole('button', { name: 'Filter', exact: true }).or(page.locator('#modernFilterTrigger'));
    await filterButton.click();
    await expect(page.locator('#modernFilterPanel')).toHaveClass(/oh-filter-panel--open/, { timeout: 10000 });

    const searchInput = page.getByRole('textbox', { name: 'Name or Badge ID' });
    await searchInput.fill('NTI)');
    const applyButton = page.locator('#applyFilter');
    await Promise.all([
        page.waitForResponse(res => res.url().includes('/employee/employees-list/')),
        applyButton.click(),
    ]);
    await expect(rows(page)).toHaveCount(0);

    await filterButton.click();
    await searchInput.fill('NTI0');
    await Promise.all([
        page.waitForResponse(res => res.url().includes('/employee/employees-list/')),
        applyButton.click(),
    ]);
    await expect.poll(() => rows(page).count()).toBeGreaterThanOrEqual(2);

    await filterButton.click();
    await searchInput.fill(EMILY.badge);
    await Promise.all([
        page.waitForResponse(res => res.url().includes('/employee/employees-list/')),
        applyButton.click(),
    ]);

    await expect(employeeRow(page, EMILY)).toHaveCount(1, { timeout: 20000 });
    const resultText = await rows(page).first().innerText();
    expect(resultText).toContain(EMILY.name);
    expect(resultText).toContain(EMILY.badge);
});

test('EMP_MGT_Filter_06 - Find, apply, discard and clear employee filters', async ({ page }) => {
    const { emily, daniel, priya, marcus, wei } = ids;
    const engineering = [emily, daniel, priya];
    const baseline = (await (await employeeCells(page)).allTextContents()).map(name => name.trim());
    expect(baseline.length).toBeGreaterThan(0);

    await openFilter(page);
    for (const label of ['Name or Badge ID', 'Work Info', 'Groups & Permissions', 'Advanced', 'Group By']) {
        await expect(section(page, label)).toBeVisible();
    }

    const find = panel(page).getByPlaceholder('Find a filter');
    for (const [label, group] of [['Reporting Manager', 'Work Info'], ['Permissions', 'Groups & Permissions']]) {
        await find.fill(label);
        if (!(await field(page, label).isVisible())) await section(page, group).click();
        await expect(field(page, label)).toBeVisible();
    }
    await find.fill('QA-no-filter-9Z');
    await expect(panel(page).locator('.oh-input-group:visible')).toHaveCount(0);
    await find.clear();
    await expectEmployees(page, baseline);

    await setFilter(page, 'Name or Badge ID', [...engineering, marcus, wei].join(', '));
    await setFilter(page, 'Department', 'Engineering');
    await apply(page);
    await expectBadges(page, engineering);

    await openFilter(page);
    const draftRequests = [];
    const isList = request => {
        const url = new URL(request.url());
        return url.origin === base.origin && url.pathname === listPath;
    };
    const capture = request => { if (isList(request)) draftRequests.push(request); };
    page.on('request', capture);
    try {
        await removeChoice(page, 'Department', 'Engineering');
        await setFilter(page, 'Department', 'Sales');
        const delayedRequest = page.waitForRequest(isList, { timeout: 1500 }).catch(error => {
            if (!(error instanceof errors.TimeoutError)) throw error;
        });
        await panel(page).getByRole('button', { name: 'Close', exact: true }).click();
        await expect(panel(page)).not.toHaveClass(openClass);
        await delayedRequest;
        expect.soft(draftRequests.length, 'Sales is an unapplied draft. Only Apply should reload the filtered results.').toBe(0);
        await expectBadges(page, engineering);
    } finally {
        page.off('request', capture);
        await clear(page);
        await expectEmployees(page, baseline);
    }
});

test('EMP_MGT_Filter_117 - Filter by name, Badge ID or email', async ({ page }) => {
    const { emily, priya } = ids;
    const baseline = (await (await employeeCells(page)).allTextContents()).map(name => name.trim());
    expect(baseline.length).toBeGreaterThan(0);

    await runFilters(page, { 'Name or Badge ID': 'Emily Carter' });
    await expectBadges(page, [emily]);
    const email = await workValue(page, emily, 'Email');
    expect(email, 'Complete email from the Emily record').toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);

    await runFilters(page, { 'Name or Badge ID': emily });
    await expectBadges(page, [emily]);
    await (await employeeCells(page)).filter({ hasText: exact('Emily Carter (NTI0001)') }).click();
    const profile = page.locator('.emp-profile-card h2:visible, .oh-profile__info-name:visible').first();
    await expect(profile).toContainText('Emily Carter', { timeout: wait });
    await expect(profile).toContainText(emily);
    await openEmployees(page);

    await runFilters(page, { 'Name or Badge ID': [emily, priya].join(', ') });
    await expectBadges(page, [emily, priya]);
    await runFilters(page, { Email: email });
    await expectBadges(page, [emily]);
    await runFilters(page, { Email: 'emp117-absent@example.invalid' });
    await expectBadges(page, []);
    await clear(page);
    await expectEmployees(page, baseline);
});

test('EMP_MGT_Filter_121 - Apply individual and combined Work Info selectors', async ({ page }) => {
    const { daniel, priya, marcus, wei } = ids;
    const scope = [daniel, priya, marcus, wei];
    const tag = required(qa.tag, 'HORILLA_121_TAG');
    expect(qa.tagBadges.every(id => scope.includes(id)), 'Tagged Badge IDs must belong to the comparison scope').toBe(true);
    await runFilters(page, {}, scope);
    await expectBadges(page, scope);

    const company = await workValue(page, daniel, 'Company');
    const jobInTable = await workValue(page, daniel, 'Job Position');
    const job = qa.jobPosition || jobInTable;
    const companyMatches = [];
    const jobMatches = [];
    for (const badge of scope) {
        if (await workValue(page, badge, 'Company') === company) companyMatches.push(badge);
        if (await workValue(page, badge, 'Job Position') === jobInTable) jobMatches.push(badge);
    }

    const filters = [
        ['Company', company, companyMatches],
        ['Department', 'Engineering', [daniel, priya]],
        ['Reporting Manager', { text: 'Emily Carter', pattern: /^Emily Carter(?:\s*\(NTI0001\))?$/ }, [daniel, priya]],
        ['Shift', 'Regular Shift', [daniel, wei]],
        ['Job Position', job, jobMatches],
        ['Employee Tag', tag, qa.tagBadges],
    ];
    for (const [label, value, expected] of filters) {
        await test.step('Filter individually: ' + label, async () => {
            await runFilters(page, { [label]: value }, scope);
            await expectBadges(page, expected);
        });
    }

    const combined = { Company: company, Department: 'Engineering', 'Job Position': job };
    const expected = [daniel, priya].filter(id => companyMatches.includes(id) && jobMatches.includes(id));
    await runFilters(page, combined, scope);
    await expectBadges(page, expected);

    await openFilter(page);
    await setFilter(page, 'Shift', 'Evening Shift');
    await apply(page);
    await expectBadges(page, []);

    await openFilter(page);
    await removeChoice(page, 'Shift', 'Evening Shift');
    await apply(page);
    await expectBadges(page, expected);
});

test('EMP_MGT_Filter_126 - Filter employees by Groups and Permissions', async ({ page }) => {
    const { daniel, priya, marcus } = ids;
    const group = required(qa.group, 'HORILLA_126_GROUP');
    const permission = required(qa.permission, 'HORILLA_126_PERMISSION');
    const scope = [daniel, priya, marcus];

    await runFilters(page, { Groups: group }, scope);
    await expectBadges(page, [daniel]);
    await runFilters(page, { Permissions: permission }, scope);
    await expectBadges(page, [priya]);
    await runFilters(page, {}, scope);
    await expectBadges(page, scope);
});

test('EMP_MGT_Filter_128 - Filter Active and Currently Working independently', async ({ page }) => {
    const { daniel, priya, marcus } = ids;
    const scope = [daniel, priya, marcus];
    expect(qa.working, 'The two Currently Working labels must be different').not.toBe(qa.notWorking);
    expect(qa.unknownBadges.every(id => [daniel, priya].includes(id)), 'Unknown compares only active employee records').toBe(true);

    for (const [active, expected] of [['Yes', [daniel, priya]], ['No', [marcus]], ['Any', scope]]) {
        await test.step('Active? = ' + active, async () => {
            await runFilters(page, { 'Active?': active }, scope);
            await expectBadges(page, expected);
        });
    }

    for (const [status, expected] of [
        [qa.working, [daniel]],
        [qa.notWorking, [priya]],
        [qa.unknown, qa.unknownBadges],
    ]) {
        await test.step('Currently Working = ' + status, async () => {
            await runFilters(page, { 'Active?': 'Yes', 'Currently Working': status }, scope);
            await expectBadges(page, expected);
        });
    }
});

test.afterEach(async ({ page }, testInfo) => {
    const context = page.context();
    const videos = [...new Set([page, ...context.pages()])]
        .map(currentPage => currentPage.video())
        .filter(Boolean);

    if (!page.isClosed()) {
        try {
            await testInfo.attach(`Result - ${testInfo.title}`, {
                body: await page.screenshot({ fullPage: true, timeout: 5000 }),
                contentType: 'image/png',
            });
        } catch {
            // Screenshot failure must not hide the testcase result.
        }
    }

    // Finish recording before waiting for video.saveAs().
    await context.close();

    const name = testInfo.title
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .trim()
        .slice(0, 150) || 'testcase';
    const retry = testInfo.retry ? `-retry-${testInfo.retry}` : '';
    const repeat = testInfo.repeatEachIndex ? `-repeat-${testInfo.repeatEachIndex}` : '';

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
});
