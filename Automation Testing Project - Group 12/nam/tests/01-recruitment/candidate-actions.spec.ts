import { caseTitle, test, expect, blockedIf } from '../../src/utils/test-case';
import { excelText, testFile, assertSameFile } from '../../src/utils/file-utils';
test(caseTitle('CAN-V2-26', 'About hiển thị đúng ứng viên', { write: true }), async ({ data, candidatesPage: p, page }) => {
    const item = await data.candidate();
    await p.details(item.email);
    await expect(page.getByRole('heading', { name: item.name, exact: true })).toBeVisible();
    await expect(page.getByText(item.email, { exact: true })).toBeVisible();
    await expect(page.getByText(item.recruitment, { exact: true }).last()).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/candidate-view/${item.id}/`));
});
test(caseTitle('CAN-V2-27', 'History ghi nhận thay đổi đã lưu', { write: true }), async ({ data, candidatesPage: p, page }) => {
    const item = await data.candidate({ mobile: '0901234567' });
    await p.edit(item.email);
    await p.candidateForm.locator('[name="mobile"]').fill('0988776655');
    await p.submit(p.candidateForm);
    await p.details(item.email, 'History');
    const target = await page.getByRole('button', { name: 'History', exact: true }).getAttribute('hx-target');
    expect(target, 'History must have a discoverable content target').toMatch(/^#/);
    await expect(page.locator(target!)).toContainText('0988776655');
});
test(caseTitle('CAN-V2-28', 'Cập nhật Mobile tồn tại sau reload', { write: true }), async ({ data, candidatesPage: p }) => {
    const item = await data.candidate({ mobile: '0901234567' });
    await p.edit(item.email);
    await p.candidateForm.locator('[name="mobile"]').fill('0988776655');
    await p.submit(p.candidateForm);
    await p.edit(item.email);
    await expect(p.candidateForm.locator('[name="mobile"]')).toHaveValue('0988776655');
    await expect(p.candidateForm.locator('[name="name"]')).toHaveValue(item.name);
    await expect(p.candidateForm.locator('[name="email"]')).toHaveValue(item.email);
});
test(caseTitle('CAN-V2-29', 'Rời Edit không lưu', { write: true }), async ({ data, candidatesPage: p, page }) => {
    const item = await data.candidate({ mobile: '0901234567' });
    await p.edit(item.email);
    await p.candidateForm.locator('[name="mobile"]').fill('0988776655');
    await page.getByRole('button', { name: /Back/ }).click();
    await p.edit(item.email);
    await expect(p.candidateForm.locator('[name="mobile"]')).toHaveValue('0901234567');
});
test(caseTitle('CAN-V2-31', 'Hủy xóa ứng viên', { write: true }), async ({ data, candidatesPage: p }) => {
    const item = await data.candidate();
    const other = await data.candidate();
    await p.delete(item.email, false);
    await p.findEmail(item.email);
    await expect(p.row(item.email)).toHaveCount(1);
    await p.findEmail(other.email);
    await expect(p.row(other.email)).toHaveCount(1);
});
test(caseTitle('CAN-V2-32', 'Xóa đúng ứng viên và giữ đối chứng', { write: true }), async ({ data, candidatesPage: p }) => {
    const item = await data.candidate();
    const other = await data.candidate();
    await p.delete(item.email);
    await p.findEmail(item.email);
    await expect(p.row(item.email)).toHaveCount(0);
    await p.findEmail(other.email);
    await expect(p.row(other.email)).toHaveCount(1);
});
test(caseTitle('CAN-V2-33', 'Bulk Delete chỉ xóa ba fixture đã chọn', { write: true }), async ({ data, candidatesPage: p, page, token }) => {
    const items = [await data.candidate(), await data.candidate(), await data.candidate()];
    const other = await data.candidate();
    await p.goto();
    await p.search(token);
    for (const item of items)
        await p.row(item.email).getByRole('checkbox').check();
    const selected = await p.rows.locator('input[type="checkbox"]:checked').evaluateAll(inputs => inputs.map(i => (i as HTMLInputElement).value));
    expect(selected.sort()).toEqual(items.map(i => i.id!).sort());
    await page.getByRole('button', { name: /Actions/ }).first().click();
    const action = page.getByText('Delete', { exact: true }).filter({ visible: true }).first();
    blockedIf(!await action.count(), 'Bulk Delete is unavailable in selected state.');
    await p.confirmAction(() => action.click(), true);
    await p.goto();
    await p.search(token);
    for (const item of items)
        await expect(p.row(item.email)).toHaveCount(0);
    await expect(p.row(other.email)).toHaveCount(1);
});
test(caseTitle('CAN-V2-34', 'Export chứa dữ liệu và cột đã chọn', { write: true }), async ({ data, candidatesPage: p }, info) => {
    const item = await data.candidate();
    const other = await data.candidate();
    await p.goto();
    await p.search(item.name);
    const text = excelText(await p.exportExcel(info));
    expect(text).toContain(item.email);
    expect(text).toContain(item.name);
    expect(text).not.toContain(other.email);
    expect(text).toMatch(/Email/i);
});
test(caseTitle('CAN-V2-35', 'Resume đọc đúng file của ứng viên', { write: true }), async ({ data, candidatesPage: p, page }, info) => {
    const original = testFile('sample_cv.pdf');
    const item = await data.candidate({ resume: original });
    await p.details(item.email, 'Resume');
    const fileElement = page.locator('iframe[src*="media"],embed[src*="media"],object[data*="media"],a[href*=".pdf"]').first();
    await expect(fileElement).toBeAttached();
    const url = await fileElement.getAttribute('src') || await fileElement.getAttribute('data') || await fileElement.getAttribute('href');
    expect(url).toBeTruthy();
    const response = await page.request.get(new URL(url!, page.url()).href);
    expect(response.ok()).toBe(true);
    const bytes = await response.body();
    assertSameFile(bytes, original);
    await info.attach('verified-resume', { body: bytes, contentType: 'application/pdf' });
});
