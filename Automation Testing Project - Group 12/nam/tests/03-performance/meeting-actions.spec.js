"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_case_js_1 = require("../../src/utils/test-case.js");
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-32', 'Archive giữ dữ liệu trong phạm vi inactive', { write: true }), async ({ data, meetingsPage: p }) => {
    const item = await data.meeting();
    await p.archive(item.title);
    await p.goto();
    await p.openFilter();
    await p.select2(p.filter, 'is_active', 'No');
    await p.apply();
    await p.search(item.title);
    await (0, test_case_js_1.expect)(p.row(item.title)).toHaveCount(1);
    await (0, test_case_js_1.expect)(p.row(item.title).getByTitle(/Un.?archive/i)).toBeVisible();
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-33', 'Hủy Delete cuộc họp', { write: true }), async ({ data, meetingsPage: p }) => {
    const item = await data.meeting();
    const other = await data.meeting();
    await p.delete(item.title, false);
    await p.goto();
    await p.search(item.title);
    await (0, test_case_js_1.expect)(p.row(item.title)).toHaveCount(1);
    await p.search(other.title);
    await (0, test_case_js_1.expect)(p.row(other.title)).toHaveCount(1);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-34', 'Delete đúng cuộc họp và giữ đối chứng', { write: true }), async ({ data, meetingsPage: p }) => {
    const item = await data.meeting();
    const other = await data.meeting();
    await p.delete(item.title);
    await p.goto();
    await p.search(item.title);
    await (0, test_case_js_1.expect)(p.row(item.title)).toHaveCount(0);
    await p.search(other.title);
    await (0, test_case_js_1.expect)(p.row(other.title)).toHaveCount(1);
});
