"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_case_js_1 = require("../../src/utils/test-case.js");
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-28', 'Cấp phát tài sản có ảnh bàn giao', { write: true }), async ({ data, assetsPage: p }) => {
    const item = await data.allocation();
    await (0, test_case_js_1.expect)(p.row(item.serial)).toContainText('Daniel Nguyen');
    await p.find(item);
    await (0, test_case_js_1.expect)(p.row(item.serial).locator('td').nth(3)).toHaveText('In Use');
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-29', 'Allocation thiếu Assigned To', { write: true }), async ({ data, assetsPage: p }) => {
    const item = await data.asset();
    await p.openAllocate();
    await p.fillAllocation(item, '', true);
    item.allocated = true; // Cleanup also covers an unexpected successful negative submission.
    await p.submit(p.allocationForm);
    await p.fieldError('assigned_to_employee_id', p.allocationForm);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-30', 'Allocation thiếu ảnh bàn giao', { write: true }), async ({ data, assetsPage: p }) => {
    const item = await data.asset();
    await p.openAllocate();
    await p.fillAllocation(item, 'Daniel Nguyen (NTI0002)', false);
    item.allocated = true;
    await p.submit(p.allocationForm);
    await p.fieldError('assign_images', p.allocationForm);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-31', 'Tài sản In Use không thể cấp phát lại', { write: true }), async ({ data, assetsPage: p }) => {
    const assigned = await data.allocation();
    const available = await data.asset();
    await p.openAllocate();
    const options = await p.allocationForm.locator('[name="asset_id"] option').allTextContents();
    (0, test_case_js_1.expect)(options.some(s => s.includes(assigned.serial))).toBe(false);
    (0, test_case_js_1.expect)(options.some(s => s.includes(available.serial))).toBe(true);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-32', 'Return Healthy và tài sản sẵn sàng cấp phát lại', { write: true }), async ({ data, assetsPage: p }) => {
    const item = await data.returned('Healthy');
    await p.history(item);
    await (0, test_case_js_1.expect)(p.row(item.serial)).toContainText('Healthy');
    await p.find(item);
    await (0, test_case_js_1.expect)(p.row(item.serial).locator('td').nth(3)).toHaveText('Available');
    await p.openAllocate();
    (0, test_case_js_1.expect)((await p.allocationForm.locator('[name="asset_id"] option').allTextContents()).some(s => s.includes(item.serial))).toBe(true);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-33', 'Return Major damage được lưu vào lịch sử', { write: true }), async ({ data, assetsPage: p }) => {
    const item = await data.returned('Major damage');
    await p.history(item);
    await (0, test_case_js_1.expect)(p.row(item.serial)).toHaveCount(1);
    await (0, test_case_js_1.expect)(p.row(item.serial)).toContainText('Major damage');
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-34', 'Asset History liên kết đúng người và Serial', { write: true }), async ({ data, assetsPage: p }) => {
    const item = await data.returned();
    await p.history(item);
    await (0, test_case_js_1.expect)(p.row(item.serial)).toHaveCount(1);
    await (0, test_case_js_1.expect)(p.row(item.serial)).toContainText('Daniel Nguyen');
    await (0, test_case_js_1.expect)(p.row(item.serial)).toContainText('Healthy');
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('AST-V2-35', 'Assigned By mặc định là Admin hiện tại', { smoke: true }), async ({ assetsPage: p }) => {
    await p.openAllocate();
    await (0, test_case_js_1.expect)(p.allocationForm.locator('[name="assigned_by_employee_id"] option:checked')).toHaveText('Adam Admin');
    await p.closeModal();
});
