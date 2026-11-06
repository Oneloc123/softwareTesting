import { caseTitle, test, expect } from '../../src/utils/test-case';
import { excelText } from '../../src/utils/file-utils';
test(caseTitle('AST-V2-16', 'Chi tiết xác định đúng tài sản theo Serial', { write: true }), async ({ data, assetsPage: p }) => {
    const item = await data.asset();
    await p.details(item);
    for (const expected of [item.serial, item.category, item.status, item.purchaseDate])
        await expect(p.modal).toContainText(expected);
    await expect(p.modal).toContainText('1500');
});
test(caseTitle('AST-V2-25', 'Hủy Delete tài sản', { write: true }), async ({ data, assetsPage: p }) => {
    const item = await data.asset();
    await p.delete(item, false);
    await p.find(item);
    await expect(p.row(item.serial)).toHaveCount(1);
});
test(caseTitle('AST-V2-26', 'Xóa đúng tài sản và giữ đối chứng', { write: true }), async ({ data, assetsPage: p }) => {
    const item = await data.asset();
    const other = await data.asset();
    await p.delete(item);
    await p.find(item);
    await expect(p.row(item.serial)).toHaveCount(0);
    await p.find(other);
    await expect(p.row(other.serial)).toHaveCount(1);
});
test(caseTitle('AST-V2-27', 'Export XLSX có dữ liệu fixture', { write: true }), async ({ data, assetsPage: p }, info) => {
    const item = await data.asset();
    const other = await data.asset();
    await p.goto();
    await p.search(item.name);
    const text = excelText(await p.exportExcel(info));
    expect(text).toContain(item.serial);
    expect(text).toContain(item.name);
    expect(text).not.toContain(other.serial);
    expect(text).toMatch(/Serial/i);
});
