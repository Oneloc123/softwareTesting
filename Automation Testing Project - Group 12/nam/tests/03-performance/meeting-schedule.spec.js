"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_case_js_1 = require("../../src/utils/test-case.js");
const data_generator_js_1 = require("../../src/utils/data-generator.js");
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-01', 'Tạo họp có Template và Answerable Employees', { write: true }), async ({ data, meetingsPage: p }) => {
    const item = await data.meeting({ template: 'Performance Review', answerable: ['Daniel Nguyen (NTI0002)'] });
    await p.edit(item.title);
    await (0, test_case_js_1.expect)(p.meetingForm.locator('[name="title"]')).toHaveValue(item.title);
    await (0, test_case_js_1.expect)(p.meetingForm.locator('[name="date"]')).toHaveValue(item.date);
    await p.assertSelections(item);
    await (0, test_case_js_1.expect)(p.meetingForm.locator('[name="question_template"] option:checked')).toHaveText('Performance Review');
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-02', 'Tạo họp chỉ nhập trường bắt buộc', { write: true }), async ({ data, meetingsPage: p }) => {
    const item = await data.meeting();
    await p.edit(item.title);
    await p.assertSelections(item);
    await (0, test_case_js_1.expect)(p.meetingForm.locator('[name="question_template"]')).toHaveValue('');
    await (0, test_case_js_1.expect)(p.meetingForm.locator('[name="title"]')).toHaveValue(item.title);
    await (0, test_case_js_1.expect)(p.meetingForm.locator('[name="date"]')).toHaveValue(item.date);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-03', 'Form trống báo bốn trường bắt buộc', { smoke: true }), async ({ meetingsPage: p }) => {
    await p.openCreate();
    await p.submit(p.meetingForm);
    for (const name of ['title', 'date', 'employee_id', 'manager'])
        await p.fieldError(name, p.meetingForm);
    await (0, test_case_js_1.expect)(p.meetingForm.getByText('This field is required.', { exact: true })).toHaveCount(4);
});
for (const item of [
    { id: 'MTG-V2-04', field: 'title', label: 'Title' },
    { id: 'MTG-V2-05', field: 'date', label: 'Date' },
    { id: 'MTG-V2-06', field: 'employee_id', label: 'Employees' },
    { id: 'MTG-V2-07', field: 'manager', label: 'Manager' },
])
    (0, test_case_js_1.test)((0, test_case_js_1.caseTitle)(item.id, `Thiếu riêng ${item.label}`, {}), async ({ meetingsPage: p, token }) => {
        await p.openCreate();
        await p.fill((0, data_generator_js_1.meetingData)(token, { ...(item.field === 'employee_id' ? { employees: [] } : {}), ...(item.field === 'manager' ? { managers: [] } : {}) }));
        if (item.field === 'title' || item.field === 'date')
            await p.meetingForm.locator(`[name="${item.field}"]`).fill('');
        await p.submit(p.meetingForm);
        await p.fieldError(item.field, p.meetingForm);
        await (0, test_case_js_1.expect)(p.meetingForm).toBeVisible();
    });
for (const item of [{ id: 'MTG-V2-08', length: 99 }, { id: 'MTG-V2-09', length: 100 }]) {
    (0, test_case_js_1.test)((0, test_case_js_1.caseTitle)(item.id, `Lưu Title ${item.length} ký tự`, { write: true }), async ({ data, meetingsPage: p, token }) => {
        const title = (0, data_generator_js_1.uniqueText)('CK', token, item.length);
        const record = await data.meeting({ title });
        await p.edit(record.title);
        await (0, test_case_js_1.expect)(p.meetingForm.locator('[name="title"]')).toHaveValue(title);
    });
}
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-10', 'Chặn ký tự thứ 101 của Title', { smoke: true }), async ({ meetingsPage: p }) => {
    await p.openCreate();
    await p.assertInputLimit(p.meetingForm.locator('[name="title"]'), 100);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-11', 'Lưu Title có dấu tiếng Việt', { write: true }), async ({ data, meetingsPage: p, token }) => {
    const title = `Đánh giá hiệu suất quý 4 ${token}`;
    const item = await data.meeting({ title });
    await p.edit(item.title);
    await (0, test_case_js_1.expect)(p.meetingForm.locator('[name="title"]')).toHaveValue(title);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-12', 'Lưu nhiều Employees', { write: true }), async ({ data, meetingsPage: p }) => {
    const item = await data.meeting({ employees: ['Daniel Nguyen (NTI0002)', 'Emily Carter (NTI0001)'] });
    await p.edit(item.title);
    await p.assertSelections(item);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-13', 'Lưu nhiều Manager', { write: true }), async ({ data, meetingsPage: p }) => {
    const item = await data.meeting({ managers: ['Marcus Johnson (NTI0004)', 'Priya Raman (NTI0003)'] });
    await p.edit(item.title);
    await p.assertSelections(item);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-14', 'Lưu Question Template đã chọn', { write: true }), async ({ data, meetingsPage: p }) => {
    const item = await data.meeting({ template: 'Performance Review' });
    await p.edit(item.title);
    await (0, test_case_js_1.expect)(p.meetingForm.locator('[name="question_template"] option:checked')).toHaveText('Performance Review');
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-15', 'Lưu Answerable Employees', { write: true }), async ({ data, meetingsPage: p }) => {
    const item = await data.meeting({ template: 'Performance Review', answerable: ['Daniel Nguyen (NTI0002)'] });
    await p.edit(item.title);
    await p.assertSelections(item);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-16', 'Cập nhật Title không đổi người và ngày', { write: true }), async ({ data, meetingsPage: p, token }) => {
    const item = await data.meeting();
    await p.edit(item.title);
    const title = `CK Updated Meeting ${token}`;
    await p.meetingForm.locator('[name="title"]').fill(title);
    await p.submit(p.meetingForm);
    item.title = title;
    await p.edit(item.title);
    await (0, test_case_js_1.expect)(p.meetingForm.locator('[name="title"]')).toHaveValue(title);
    await (0, test_case_js_1.expect)(p.meetingForm.locator('[name="date"]')).toHaveValue(item.date);
    await p.assertSelections(item);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-17', 'Đổi lịch qua Edit Date', { write: true }), async ({ data, meetingsPage: p }) => {
    const item = await data.meeting();
    await p.edit(item.title);
    const date = (0, data_generator_js_1.meetingDate)(2, 15);
    await p.meetingForm.locator('[name="date"]').fill(date);
    await p.submit(p.meetingForm);
    item.date = date;
    await p.edit(item.title);
    await (0, test_case_js_1.expect)(p.meetingForm.locator('[name="date"]')).toHaveValue(date);
    await p.assertSelections(item);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-18', 'Hủy Edit không lưu', { write: true }), async ({ data, meetingsPage: p }) => {
    const item = await data.meeting();
    await p.edit(item.title);
    await p.meetingForm.locator('[name="title"]').fill('Unsaved draft');
    await p.closeModal();
    await p.edit(item.title);
    await (0, test_case_js_1.expect)(p.meetingForm.locator('[name="title"]')).toHaveValue(item.title);
    await (0, test_case_js_1.expect)(p.meetingForm.locator('[name="date"]')).toHaveValue(item.date);
});
