import { caseTitle, test, expect } from '../../src/utils/test-case';
test(caseTitle('MTG-V2-19', 'Details hiển thị đúng dữ liệu cuộc họp', { write: true }), async ({ data, meetingsPage: p }) => {
    const item = await data.meeting();
    await p.details(item.title);
    await expect(p.modal).toContainText(item.title);
    await expect(p.modal).toContainText('Daniel Nguyen');
    await expect(p.modal).toContainText('Marcus Johnson');
    await expect(p.modal).toContainText('Minutes of Meeting');
});
test(caseTitle('MTG-V2-20', 'Lưu biên bản qua Add Response', { write: true }), async ({ data, meetingsPage: p, token }) => {
    const item = await data.meeting();
    const other = await data.meeting();
    const text = `Nhân viên đạt KPI 95%, cần cải thiện giao tiếp. ${token}`;
    await p.writeMoM(item.title, text);
    await p.details(item.title);
    await expect(p.modal).toContainText(text);
    await p.details(other.title);
    await expect(p.modal).not.toContainText(text);
});
test(caseTitle('MTG-V2-21', 'Đóng editor MoM không lưu', { write: true }), async ({ data, meetingsPage: p, page, token }) => {
    const item = await data.meeting();
    const text = `Unsaved Response ${token}`;
    await p.openMoM(item.title);
    await page.locator('.note-editable[contenteditable="true"]').fill(text);
    await p.closeModal();
    await p.details(item.title);
    await expect(p.modal).not.toContainText(text);
});
test(caseTitle('MTG-V2-22', 'Answer vô hiệu khi không có Template', { write: true }), async ({ data, meetingsPage: p }) => {
    const item = await data.meeting();
    await p.goto();
    await p.search(item.title);
    const answer = p.row(item.title).getByTitle('Answer', { exact: true });
    await expect(answer).toHaveClass(/disabled|cursor-not-allowed/);
    expect(await answer.getAttribute('hx-get')).toBeNull();
    await p.edit(item.title);
    await expect(p.meetingForm.locator('[name="question_template"]')).toHaveValue('');
});
