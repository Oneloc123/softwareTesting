"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_case_js_1 = require("../../src/utils/test-case.js");
const data_generator_js_1 = require("../../src/utils/data-generator.js");
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-23', 'Search theo Title', { write: true }), async ({ data, meetingsPage: p }) => {
    const item = await data.meeting();
    const other = await data.meeting();
    await p.goto();
    await p.search(item.title);
    await (0, test_case_js_1.expect)(p.row(item.title)).toHaveCount(1);
    await (0, test_case_js_1.expect)(p.row(other.title)).toHaveCount(0);
    await (0, test_case_js_1.expect)(p.rows).toHaveCount(1);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-24', 'Search không tồn tại trả empty state', { smoke: true }), async ({ meetingsPage: p, token }) => {
    await p.goto();
    await p.search(`notfoundmeeting_${token}`);
    await (0, test_case_js_1.expect)(p.rows).toHaveCount(0);
    await (0, test_case_js_1.expect)(p.empty).toContainText('No filtered records found at the moment');
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-25', 'Bỏ từ khóa Search', { write: true }), async ({ data, meetingsPage: p, token }) => {
    const item = await data.meeting();
    await p.goto();
    await p.search(`notfound_${token}`);
    await (0, test_case_js_1.expect)(p.rows).toHaveCount(0);
    await p.search('');
    await p.search(item.title);
    await (0, test_case_js_1.expect)(p.row(item.title)).toHaveCount(1);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-26', 'Lọc theo Employee với đối chứng', { write: true }), async ({ data, meetingsPage: p, token }) => {
    const yes = await data.meeting();
    const no = await data.meeting({ employees: ['Emily Carter (NTI0001)'] });
    await p.goto();
    await p.search(token);
    await p.openFilter();
    await p.select2(p.filter, 'employee_id', 'Daniel Nguyen');
    await p.apply();
    await (0, test_case_js_1.expect)(p.row(yes.title)).toHaveCount(1);
    await (0, test_case_js_1.expect)(p.row(no.title)).toHaveCount(0);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-27', 'Lọc theo Manager với đối chứng', { write: true }), async ({ data, meetingsPage: p, token }) => {
    const yes = await data.meeting();
    const no = await data.meeting({ managers: ['Priya Raman (NTI0003)'] });
    await p.goto();
    await p.search(token);
    await p.openFilter();
    await p.select2(p.filter, 'manager', 'Marcus Johnson');
    await p.apply();
    await (0, test_case_js_1.expect)(p.row(yes.title)).toHaveCount(1);
    await (0, test_case_js_1.expect)(p.row(no.title)).toHaveCount(0);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-28', 'Lọc theo Question Template', { write: true }), async ({ data, meetingsPage: p, token }) => {
    const yes = await data.meeting({ template: 'Performance Review' });
    const no = await data.meeting();
    await p.goto();
    await p.search(token);
    await p.openFilter();
    await p.select2(p.filter, 'question_template', 'Performance Review');
    await p.apply();
    await (0, test_case_js_1.expect)(p.row(yes.title)).toHaveCount(1);
    await (0, test_case_js_1.expect)(p.row(no.title)).toHaveCount(0);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-29', 'Date Range bao gồm hai đầu', { write: true }), async ({ data, meetingsPage: p, token }) => {
    const first = await data.meeting({ date: (0, data_generator_js_1.meetingDate)(1, 12) });
    const last = await data.meeting({ date: (0, data_generator_js_1.meetingDate)(2, 12) });
    const outside = await data.meeting({ date: (0, data_generator_js_1.meetingDate)(3, 12) });
    await p.goto();
    await p.search(token);
    await p.openFilter();
    await p.filter.locator('#id_date_greater').fill((0, data_generator_js_1.localDate)(1));
    await p.filter.locator('#id_date_less').fill((0, data_generator_js_1.localDate)(2));
    await p.apply();
    await (0, test_case_js_1.expect)(p.row(first.title)).toHaveCount(1);
    await (0, test_case_js_1.expect)(p.row(last.title)).toHaveCount(1);
    await (0, test_case_js_1.expect)(p.row(outside.title)).toHaveCount(0);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-30', 'Active=Yes loại cuộc họp archived', { write: true }), async ({ data, meetingsPage: p, token }) => {
    const active = await data.meeting();
    const archived = await data.meeting();
    await p.archive(archived.title);
    await p.goto();
    await p.search(token);
    await p.openFilter();
    await p.select2(p.filter, 'is_active', 'Yes');
    await p.apply();
    await (0, test_case_js_1.expect)(p.row(active.title)).toHaveCount(1);
    await (0, test_case_js_1.expect)(p.row(archived.title)).toHaveCount(0);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-31', 'Date sort tăng và giảm đúng thứ tự', { write: true }), async ({ data, meetingsPage: p, page, token }) => {
    const first = await data.meeting({ date: (0, data_generator_js_1.meetingDate)(1) });
    const second = await data.meeting({ date: (0, data_generator_js_1.meetingDate)(2) });
    const third = await data.meeting({ date: (0, data_generator_js_1.meetingDate)(3) });
    await p.goto();
    await p.search(token);
    const orders = [];
    for (let i = 0; i < 2; i++) {
        await p.update(() => page.getByRole('columnheader', { name: /Date/ }).click(), /\/meetings-list\//);
        orders.push(await p.rows.evaluateAll(rows => rows.map(r => r.getAttribute('data-instance-id'))));
    }
    const asc = [first.id, second.id, third.id];
    (0, test_case_js_1.expect)(orders).toContainEqual(asc);
    (0, test_case_js_1.expect)(orders).toContainEqual([...asc].reverse());
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('MTG-V2-35', 'Employee và Manager kết hợp AND', { write: true }), async ({ data, meetingsPage: p, token }) => {
    const yes = await data.meeting();
    const onlyEmployee = await data.meeting({ managers: ['Priya Raman (NTI0003)'] });
    const onlyManager = await data.meeting({ employees: ['Emily Carter (NTI0001)'] });
    await p.goto();
    await p.search(token);
    await p.openFilter();
    await p.select2(p.filter, 'employee_id', 'Daniel Nguyen');
    await p.select2(p.filter, 'manager', 'Marcus Johnson');
    await p.apply();
    await (0, test_case_js_1.expect)(p.row(yes.title)).toHaveCount(1);
    await (0, test_case_js_1.expect)(p.row(onlyEmployee.title)).toHaveCount(0);
    await (0, test_case_js_1.expect)(p.row(onlyManager.title)).toHaveCount(0);
});
