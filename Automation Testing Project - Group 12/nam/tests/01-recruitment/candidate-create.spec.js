"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_case_js_1 = require("../../src/utils/test-case.js");
const data_generator_js_1 = require("../../src/utils/data-generator.js");
const file_utils_js_1 = require("../../src/utils/file-utils.js");
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('CAN-V2-01', 'Tạo ứng viên đầy đủ thông tin', { write: true }), async ({ data, candidatesPage: p }) => {
    const item = await data.candidate({ mobile: '0901234567', portfolio: 'https://example.com/portfolio', address: '12 Đường thử nghiệm', country: 'Vietnam', zip: '70000', dob: '2004-01-15', gender: 'other', source: 'other', resume: (0, file_utils_js_1.testFile)('sample_cv.pdf') });
    await p.edit(item.email);
    for (const [name, expected] of Object.entries({ name: item.name, email: item.email, mobile: item.mobile, portfolio: item.portfolio, address: item.address }))
        await (0, test_case_js_1.expect)(p.candidateForm.locator(`[name="${name}"]`)).toHaveValue(expected);
    await (0, test_case_js_1.expect)(p.candidateForm.locator('[name="gender"]')).toHaveValue('other');
    await (0, test_case_js_1.expect)(p.candidateForm.locator('[name="country"]')).toHaveValue(item.country);
    await (0, test_case_js_1.expect)(p.candidateForm.locator('[name="zip"]')).toHaveValue(item.zip);
    await (0, test_case_js_1.expect)(p.candidateForm.locator('[name="dob"]')).toHaveValue(item.dob);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('CAN-V2-02', 'Tạo ứng viên với trường tối thiểu', { write: true }), async ({ data, candidatesPage: p }) => {
    const item = await data.candidate();
    await p.edit(item.email);
    await (0, test_case_js_1.expect)(p.candidateForm.locator('[name="name"]')).toHaveValue(item.name);
    await (0, test_case_js_1.expect)(p.candidateForm.locator('[name="mobile"]')).toHaveValue('');
    await (0, test_case_js_1.expect)(p.candidateForm.locator('[name="portfolio"]')).toHaveValue('');
    await (0, test_case_js_1.expect)(p.candidateForm.locator('[name="email"]')).toHaveValue(item.email);
    await (0, test_case_js_1.expect)(p.candidateForm.locator('[name="recruitment_id"] option:checked')).toHaveText(item.recruitment);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('CAN-V2-03', 'Form trống bị browser validation chặn', { smoke: true }), async ({ candidatesPage: p, page }) => {
    await p.openCreate();
    let posts = 0;
    page.on('request', r => {
        if (r.method() === 'POST' && r.url().includes('candidate-create'))
            posts++;
    });
    await p.candidateForm.getByRole('button', { name: 'Save', exact: true }).click();
    await (0, test_case_js_1.expect)(p.candidateForm.locator('[name="name"]')).toBeFocused();
    (0, test_case_js_1.expect)(await p.candidateForm.locator('[name="name"]').evaluate((el) => el.validity.valueMissing)).toBe(true);
    (0, test_case_js_1.expect)(posts).toBe(0);
});
for (const item of [
    { id: 'CAN-V2-04', field: 'name', label: 'Name' },
    { id: 'CAN-V2-05', field: 'recruitment_id', label: 'Recruitment' },
    { id: 'CAN-V2-06', field: 'email', label: 'Email' },
])
    (0, test_case_js_1.test)((0, test_case_js_1.caseTitle)(item.id, `Thiếu riêng ${item.label}`, {}), async ({ candidatesPage: p, token }) => {
        await p.openCreate();
        await p.fill((0, data_generator_js_1.candidateData)(token, item.field === 'recruitment_id' ? { recruitment: '' } : {}));
        if (item.field !== 'recruitment_id')
            await p.candidateForm.locator(`[name="${item.field}"]`).fill('');
        await p.candidateForm.getByRole('button', { name: 'Save', exact: true }).click();
        (0, test_case_js_1.expect)(await p.candidateForm.locator(`[name="${item.field}"]`).evaluate((el) => el.validity.valueMissing)).toBe(true);
        await (0, test_case_js_1.expect)(p.candidateForm).toBeVisible();
    });
for (const item of [{ id: 'CAN-V2-07', email: 'vana@' }, { id: 'CAN-V2-08', email: 'vana.com' }]) {
    (0, test_case_js_1.test)((0, test_case_js_1.caseTitle)(item.id, `Email không hợp lệ: ${item.email}`, { smoke: true }), async ({ candidatesPage: p, token }) => {
        await p.openCreate();
        await p.fill((0, data_generator_js_1.candidateData)(token, { email: item.email }));
        await p.candidateForm.getByRole('button', { name: 'Save', exact: true }).click();
        (0, test_case_js_1.expect)(await p.candidateForm.locator('[name="email"]').evaluate((el) => el.validity.typeMismatch)).toBe(true);
        await (0, test_case_js_1.expect)(p.candidateForm).toBeVisible();
    });
}
for (const item of [{ id: 'CAN-V2-09', length: 99 }, { id: 'CAN-V2-10', length: 100 }]) {
    (0, test_case_js_1.test)((0, test_case_js_1.caseTitle)(item.id, `Lưu Name ${item.length} ký tự`, { write: true }), async ({ data, candidatesPage: p, token }) => {
        const name = (0, data_generator_js_1.uniqueText)('CK', token, item.length);
        const record = await data.candidate({ name });
        await p.edit(record.email);
        await (0, test_case_js_1.expect)(p.candidateForm.locator('[name="name"]')).toHaveValue(name);
    });
}
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('CAN-V2-11', 'Chặn ký tự thứ 101 của Name trên UI', { smoke: true }), async ({ candidatesPage: p }) => {
    await p.openCreate();
    await p.assertInputLimit(p.candidateForm.locator('[name="name"]'), 100);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('CAN-V2-12', 'Giới hạn Mobile 15 ký tự trên UI', { smoke: true }), async ({ candidatesPage: p }) => {
    await p.openCreate();
    const input = p.candidateForm.locator('[name="mobile"]');
    await (0, test_case_js_1.expect)(input).toHaveAttribute('maxlength', '15');
    await input.fill('123456789012345');
    await input.press('End');
    await input.pressSequentially('6');
    await (0, test_case_js_1.expect)(input).toHaveValue('123456789012345');
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('CAN-V2-13', 'Portfolio sai định dạng URL', {}), async ({ candidatesPage: p, token }) => {
    await p.openCreate();
    await p.fill((0, data_generator_js_1.candidateData)(token, { portfolio: 'abcxyz123' }));
    await p.candidateForm.getByRole('button', { name: 'Save', exact: true }).click();
    (0, test_case_js_1.expect)(await p.candidateForm.locator('[name="portfolio"]').evaluate((el) => el.validity.typeMismatch)).toBe(true);
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('CAN-V2-14', 'Job Position thay đổi theo Recruitment', { smoke: true }), async ({ candidatesPage: p, token }) => {
    await p.openCreate();
    await p.fill((0, data_generator_js_1.candidateData)(token));
    const job = p.candidateForm.locator('[name="job_position_id"]');
    await (0, test_case_js_1.expect)(job).toContainText('Software Engineer');
    await p.candidateForm.locator('[name="recruitment_id"]').selectOption({ label: 'Sales Representative Hiring' });
    await (0, test_case_js_1.expect)(job).toContainText('Sales Representative');
    await (0, test_case_js_1.expect)(job).not.toContainText('Software Engineer');
});
(0, test_case_js_1.test)((0, test_case_js_1.caseTitle)('CAN-V2-30', 'Lưu Name có dấu tiếng Việt', { write: true }), async ({ data, candidatesPage: p, token }) => {
    const name = `Trần Nguyễn Đăng Khoa ${token}`;
    const item = await data.candidate({ name });
    await p.edit(item.email);
    await (0, test_case_js_1.expect)(p.candidateForm.locator('[name="name"]')).toHaveValue(name);
});
