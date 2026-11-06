"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_case_js_1 = require("../../src/utils/test-case.js");
const file_utils_js_1 = require("../../src/utils/file-utils.js");
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-16', 'Chi tiết xác định đúng tài sản theo Serial', { write: true }), async ({ data, assetsPage: p }) => {
    const item = await data.asset();
    await p.details(item);
    for (const expected of [item.serial, item.category, item.status, item.purchaseDate])
        await (0, test_case_js_1.expect)(p.modal).toContainText(expected);
    await (0, test_case_js_1.expect)(p.modal).toContainText('1500');
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-25', 'Hủy Delete tài sản', { write: true }), async ({ data, assetsPage: p }) => {
    const item = await data.asset();
    await p.delete(item, false);
    await p.find(item);
    await (0, test_case_js_1.expect)(p.row(item.serial)).toHaveCount(1);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-26', 'Xóa đúng tài sản và giữ đối chứng', { write: true }), async ({ data, assetsPage: p }) => {
    const item = await data.asset();
    const other = await data.asset();
    await p.delete(item);
    await p.find(item);
    await (0, test_case_js_1.expect)(p.row(item.serial)).toHaveCount(0);
    await p.find(other);
    await (0, test_case_js_1.expect)(p.row(other.serial)).toHaveCount(1);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-27', 'Export XLSX có dữ liệu fixture', { write: true }), async ({ data, assetsPage: p }, info) => {
    const item = await data.asset();
    const other = await data.asset();
    await p.goto();
    await p.search(item.name);
    const text = (0, file_utils_js_1.excelText)(await p.exportExcel(info));
    (0, test_case_js_1.expect)(text).toContain(item.serial);
    (0, test_case_js_1.expect)(text).toContain(item.name);
    (0, test_case_js_1.expect)(text).not.toContain(other.serial);
    (0, test_case_js_1.expect)(text).toMatch(/Serial/i);
});
