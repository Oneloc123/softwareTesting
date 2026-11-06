"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_case_js_1 = require("../../src/utils/test-case.js");
const data_generator_js_1 = require("../../src/utils/data-generator.js");
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-01', 'Tạo tài sản đầy đủ thông tin', { write: true }), async ({ data, assetsPage: p }) => {
    const item = await data.asset({ description: 'Thiết bị kiểm thử', batch: 'LOT-1-2026-01', expiry: (0, data_generator_js_1.localDate)(365), notify: '7' });
    await p.edit(item);
    await (0, test_case_js_1.expect)(p.assetForm.locator('[name="asset_name"]')).toHaveValue(item.name);
    await (0, test_case_js_1.expect)(p.assetForm.locator('[name="asset_tracking_id"]')).toHaveValue(item.serial);
    await (0, test_case_js_1.expect)(p.assetForm.locator('[name="asset_description"]')).toHaveValue(item.description);
    await (0, test_case_js_1.expect)(p.assetForm.locator('[name="asset_lot_number_id"] option:checked')).toHaveText(item.batch);
    await (0, test_case_js_1.expect)(p.assetForm.locator('[name="expiry_date"]')).toHaveValue(item.expiry);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-02', 'Tạo tài sản không có Batch', { write: true }), async ({ data, assetsPage: p }) => {
    const item = await data.asset();
    await p.edit(item);
    await (0, test_case_js_1.expect)(p.assetForm.locator('[name="asset_name"]')).toHaveValue(item.name);
    await (0, test_case_js_1.expect)(p.assetForm.locator('[name="asset_lot_number_id"]')).toHaveValue('');
    await (0, test_case_js_1.expect)(p.assetForm.locator('[name="asset_description"]')).toHaveValue('');
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-03', 'Form mới trả lỗi các trường chưa nhập', { smoke: true }), async ({ assetsPage: p }) => {
    await p.openCreate();
    await p.submit(p.assetForm);
    for (const field of ['asset_name', 'asset_tracking_id', 'asset_purchase_cost', 'asset_category_id'])
        await p.fieldError(field, p.assetForm);
    await (0, test_case_js_1.expect)(p.assetForm).toBeVisible();
});
for (const item of [
    { id: 'AST-V2-04', field: 'asset_purchase_date', label: 'Purchase Date' },
    { id: 'AST-V2-05', field: 'asset_category_id', label: 'Category' },
    { id: 'AST-V2-06', field: 'asset_tracking_id', label: 'Serial No.' },
    { id: 'AST-V2-07', field: 'asset_purchase_cost', label: 'Cost' },
])
    (0, test_case_js_1.test)((0, test_case_js_1.caseTitle)(item.id, `Thiếu riêng ${item.label}`, {}), async ({ assetsPage: p, token }) => {
        await p.openCreate();
        await p.fill((0, data_generator_js_1.assetData)(token, item.field === 'asset_category_id' ? { category: '' } : {}));
        if (item.field !== 'asset_category_id')
            await p.assetForm.locator(`[name="${item.field}"]`).fill('');
        await p.submit(p.assetForm);
        await p.fieldError(item.field, p.assetForm);
        await (0, test_case_js_1.expect)(p.assetForm).toBeVisible();
    });
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-08', 'Cost không nhận chuỗi chữ như số hợp lệ', { smoke: true }), async ({ assetsPage: p }) => {
    await p.openCreate();
    const cost = p.assetForm.locator('[name="asset_purchase_cost"]');
    await cost.pressSequentially('abcxyz');
    (0, test_case_js_1.expect)(await cost.evaluate((e) => e.value === '' || e.validity.badInput)).toBe(true);
});
for (const item of [{ id: 'AST-V2-09', length: 254 }, { id: 'AST-V2-10', length: 255 }]) {
    (0, test_case_js_1.test)((0, test_case_js_1.caseTitle)(item.id, `Lưu Asset Name ${item.length} ký tự`, { write: true }), async ({ data, assetsPage: p, token }) => {
        const name = (0, data_generator_js_1.uniqueText)('CK', token, item.length);
        const record = await data.asset({ name });
        await p.edit(record);
        await (0, test_case_js_1.expect)(p.assetForm.locator('[name="asset_name"]')).toHaveValue(name);
    });
}
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-11', 'Chặn ký tự thứ 256 của Asset Name', { smoke: true }), async ({ assetsPage: p }) => {
    await p.openCreate();
    await p.assertInputLimit(p.assetForm.locator('[name="asset_name"]'), 255);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-12', 'Chặn ký tự thứ 31 của Serial', { smoke: true }), async ({ assetsPage: p }) => {
    await p.openCreate();
    await p.assertInputLimit(p.assetForm.locator('[name="asset_tracking_id"]'), 30);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-13', 'Tên tài sản có dấu và ký tự đặc biệt', { write: true }), async ({ data, assetsPage: p, token }) => {
    const name = `Bàn làm việc thông minh @2026 (#1) ${token}`;
    const item = await data.asset({ name });
    await p.edit(item);
    await (0, test_case_js_1.expect)(p.assetForm.locator('[name="asset_name"]')).toHaveValue(name);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-14', 'Cập nhật Name và Cost', { write: true }), async ({ data, assetsPage: p, token }) => {
    const item = await data.asset();
    await p.edit(item);
    const name = `CK Updated ${token}`;
    await p.assetForm.locator('[name="asset_name"]').fill(name);
    await p.assetForm.locator('[name="asset_purchase_cost"]').fill('1600.50');
    await p.submit(p.assetForm);
    item.name = name;
    await p.edit(item);
    await (0, test_case_js_1.expect)(p.assetForm.locator('[name="asset_name"]')).toHaveValue(name);
    (0, test_case_js_1.expect)(Number(await p.assetForm.locator('[name="asset_purchase_cost"]').inputValue())).toBe(1600.5);
    await (0, test_case_js_1.expect)(p.assetForm.locator('[name="asset_tracking_id"]')).toHaveValue(item.serial);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-15', 'Đóng Create không tạo dữ liệu', {}), async ({ assetsPage: p, token }) => {
    const draft = (0, data_generator_js_1.assetData)(token);
    await p.openCreate();
    await p.fill(draft);
    await p.closeModal();
    await p.goto();
    await p.search(draft.name);
    await (0, test_case_js_1.expect)(p.row(draft.serial)).toHaveCount(0);
});
