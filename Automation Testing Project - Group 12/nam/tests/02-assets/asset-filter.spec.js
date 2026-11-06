"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_case_js_1 = require("../../src/utils/test-case.js");
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-17', 'Tìm Asset Name với đối chứng', { write: true }), async ({ data, assetsPage: p }) => {
    const item = await data.asset();
    const other = await data.asset();
    await p.goto();
    await p.search(item.name);
    await (0, test_case_js_1.expect)(p.row(item.serial)).toHaveCount(1);
    await (0, test_case_js_1.expect)(p.row(other.serial)).toHaveCount(0);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-18', 'Lọc Serial No.', { write: true }), async ({ data, assetsPage: p }) => {
    const item = await data.asset();
    const other = await data.asset();
    await p.goto();
    await p.openFilter();
    await p.filter.locator('[name="asset_tracking_id"]').fill(item.serial);
    await p.apply();
    await (0, test_case_js_1.expect)(p.row(item.serial)).toHaveCount(1);
    await (0, test_case_js_1.expect)(p.row(other.serial)).toHaveCount(0);
    for (const row of await p.rows.all())
        await (0, test_case_js_1.expect)(row.locator('td').nth(4)).toHaveText(item.serial);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-19', 'Search tài sản không tồn tại', { smoke: true }), async ({ assetsPage: p, token }) => {
    await p.goto();
    await p.search(`notfoundasset_${token}`);
    await (0, test_case_js_1.expect)(p.rows).toHaveCount(0);
    await (0, test_case_js_1.expect)(p.empty).toBeVisible();
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-20', 'Lọc Category với đối chứng', { write: true }), async ({ data, assetsPage: p, token }) => {
    const yes = await data.asset();
    const no = await data.asset({ category: 'Phones' });
    await p.goto();
    await p.search(token);
    await p.openFilter();
    await p.select2(p.filter, 'asset_category_id', 'Laptops');
    await p.apply();
    await (0, test_case_js_1.expect)(p.row(yes.serial)).toHaveCount(1);
    await (0, test_case_js_1.expect)(p.row(no.serial)).toHaveCount(0);
    for (const row of await p.rows.all())
        await (0, test_case_js_1.expect)(row.locator('td').nth(2)).toHaveText('Laptops');
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-21', 'Lọc Available với đối chứng', { write: true }), async ({ data, assetsPage: p, token }) => {
    const yes = await data.asset();
    const no = await data.allocation();
    await p.find(no);
    await (0, test_case_js_1.expect)(p.row(no.serial).locator('td').nth(3)).toHaveText('In Use');
    await p.goto();
    await p.search(token);
    await p.openFilter();
    await p.select2(p.filter, 'asset_status', 'Available');
    await p.apply();
    await (0, test_case_js_1.expect)(p.row(yes.serial)).toHaveCount(1);
    await (0, test_case_js_1.expect)(p.row(no.serial)).toHaveCount(0);
    for (const row of await p.rows.all())
        await (0, test_case_js_1.expect)(row.locator('td').nth(3)).toHaveText('Available');
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-22', 'Kết hợp Category và Status là phép AND', { write: true }), async ({ data, assetsPage: p, token }) => {
    const yes = await data.asset();
    const onlyCategory = await data.allocation();
    await p.find(onlyCategory);
    await (0, test_case_js_1.expect)(p.row(onlyCategory.serial).locator('td').nth(3)).toHaveText('In Use');
    const onlyStatus = await data.asset({ category: 'Phones' });
    await p.goto();
    await p.search(token);
    await p.openFilter();
    await p.select2(p.filter, 'asset_category_id', 'Laptops');
    await p.select2(p.filter, 'asset_status', 'Available');
    await p.apply();
    await (0, test_case_js_1.expect)(p.row(yes.serial)).toHaveCount(1);
    await (0, test_case_js_1.expect)(p.row(onlyCategory.serial)).toHaveCount(0);
    await (0, test_case_js_1.expect)(p.row(onlyStatus.serial)).toHaveCount(0);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-23', 'Phân trang đúng nhóm Category', {}), async ({ assetsPage: p, page }) => {
    await p.goto();
    const group = page.locator('[id^="asset-category-grouped-list-node-"]').first();
    const next = group.getByRole('button', { name: '', exact: true });
    (0, test_case_js_1.blockedIf)(!await next.count() || !await next.isEnabled(), 'First category needs at least two pages.');
    const before = await group.locator('tr[data-instance-id]').evaluateAll(rows => rows.map(e => e.getAttribute('data-instance-id')));
    await p.refreshList(() => next.click());
    await (0, test_case_js_1.expect)(group.getByRole('spinbutton')).toHaveValue('2');
    const after = await group.locator('tr[data-instance-id]').evaluateAll(rows => rows.map(e => e.getAttribute('data-instance-id')));
    (0, test_case_js_1.expect)(after.length).toBeGreaterThan(0);
    (0, test_case_js_1.expect)(after.filter(id => before.includes(id))).toEqual([]);
    await p.refreshList(() => group.getByRole('button', { name: '', exact: true }).click());
    (0, test_case_js_1.expect)(await group.locator('tr[data-instance-id]').evaluateAll(rows => rows.map(e => e.getAttribute('data-instance-id')))).toEqual(before);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-24', 'Collapse All và Expand All giữ các nhóm', {}), async ({ assetsPage: p, page }) => {
    await p.goto();
    const groups = page.locator('[id^="asset-category-grouped-list-node-"]');
    const count = await groups.count();
    (0, test_case_js_1.expect)(count).toBeGreaterThan(1);
    await page.getByRole('button', { name: 'Collapse All', exact: true }).click();
    await (0, test_case_js_1.expect)(p.rows).toHaveCount(0);
    await page.getByRole('button', { name: 'Expand All', exact: true }).click();
    await test_case_js_1.expect.poll(() => p.rows.count()).toBeGreaterThan(0);
    await (0, test_case_js_1.expect)(groups).toHaveCount(count);
});
