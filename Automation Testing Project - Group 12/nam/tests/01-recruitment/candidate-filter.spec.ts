import { caseTitle, test, expect, blockedIf } from '../../src/utils/test-case';
import type { CandidatesPage } from '../../src/pages/candidates.page';
async function seed(p: CandidatesPage) {
    await p.goto();
    blockedIf(await p.rows.count() === 0, 'Candidates seed is empty.');
    const cells = p.rows.first().locator('td');
    return { email: (await cells.nth(2).innerText()).trim(), name: (await cells.nth(1).innerText()).trim(), job: (await cells.nth(6).innerText()).trim() };
}
async function definition(p: CandidatesPage, label: string): Promise<string> {
    return (await p.page.locator('dt').filter({ hasText: new RegExp(`^\\s*${label}\\s*$`, 'i') }).locator('xpath=following-sibling::dd').first().innerText()).trim();
}
async function stageFilter(p: CandidatesPage) {
    const record = await seed(p);
    await p.details(record.email);
    const stage = await definition(p, 'Current Stage');
    blockedIf(!stage || stage === 'None' || stage === 'Not set', 'Seed candidate has no Current Stage.');
    await p.goto();
    await p.openFilter();
    // About renders "Applied - (Recruitment)"; AJAX option renders "Applied (Recruitment)".
    await p.select2(p.filter, 'stage_id', stage.replace(/\s+-\s+\(/, ' ('), stage.split(' - ')[0]);
    return { ...record, stage };
}
async function allCurrentRows(p: CandidatesPage) {
    const records: {
        id: string;
        email: string;
        job: string;
    }[] = [];
    for (let pageNumber = 1; pageNumber <= 100; pageNumber++) {
        for (const row of await p.rows.all())
            records.push({ id: (await row.getAttribute('data-instance-id'))!, email: (await row.locator('td').nth(2).innerText()).trim(), job: (await row.locator('td').nth(6).innerText()).trim() });
        const next = p.page.locator('#listContainer').getByRole('button', { name: '', exact: true }).filter({ visible: true }).first();
        if (!await next.count() || !await next.isEnabled())
            break;
        const before = await p.page.getByRole('spinbutton', { name: 'Enter a page number and press Enter' }).inputValue();
        await p.update(() => next.click(), /\/list-candidate\//);
        await expect(p.page.getByRole('spinbutton', { name: 'Enter a page number and press Enter' })).not.toHaveValue(before);
        if (pageNumber === 100)
            throw new Error('Pagination exceeded bounded traversal');
    }
    return records;
}
test(caseTitle('CAN-V2-15', 'Tìm theo tên đầy đủ', { write: true }), async ({ data, candidatesPage: p }) => {
    const positive = await data.candidate();
    const negative = await data.candidate();
    await p.goto();
    await p.search(positive.name);
    await expect(p.row(positive.email)).toHaveCount(1);
    await expect(p.row(negative.email)).toHaveCount(0);
    for (const name of await p.names())
        expect(name.trim()).toContain(positive.name);
});
test(caseTitle('CAN-V2-16', 'Tìm không có kết quả', { smoke: true }), async ({ candidatesPage: p, token }) => {
    await p.goto();
    await p.search(`notfoundcandidate_${token}`);
    await expect(p.rows).toHaveCount(0);
    await expect(p.empty).toContainText('No filtered records found at the moment');
});
test(caseTitle('CAN-V2-17', 'Bỏ điều kiện Search', { write: true }), async ({ data, candidatesPage: p, token }) => {
    const item = await data.candidate();
    await p.search(`notfound_${token}`);
    await expect(p.rows).toHaveCount(0);
    await p.search('');
    await p.search(item.name);
    await expect(p.row(item.email)).toHaveCount(1);
    await expect(p.filter.locator('[name="is_active"]')).toHaveValue('true');
});
test(caseTitle('CAN-V2-18', 'Lọc Job Position với đối chứng', { write: true }), async ({ data, candidatesPage: p, token }) => {
    const positive = await data.candidate();
    const negative = await data.candidate({ recruitment: 'Sales Representative Hiring' });
    await p.goto();
    await p.search(token);
    await p.openFilter();
    await p.select2(p.filter, 'job_position_id', 'Software Engineer');
    await p.apply();
    await expect(p.row(positive.email)).toHaveCount(1);
    await expect(p.row(negative.email)).toHaveCount(0);
    for (const row of await p.rows.all())
        await expect(row.locator('td').nth(6)).toContainText('Software Engineer');
});
test(caseTitle('CAN-V2-19', 'Lọc Stage và kiểm tra Current Stage', {}), async ({ candidatesPage: p }) => {
    test.setTimeout(300_000);
    const chosen = await stageFilter(p);
    await p.apply();
    const records = await allCurrentRows(p);
    expect(records.length).toBeGreaterThan(0);
    expect(records.some(r => r.email === chosen.email)).toBe(true);
    for (const record of records) {
        await p.details(record.email);
        expect(await definition(p, 'Current Stage')).toBe(chosen.stage);
    }
});
test(caseTitle('CAN-V2-20', 'Lọc Hired=Yes', {}), async ({ candidatesPage: p }) => {
    test.setTimeout(300_000);
    await p.goto();
    await p.openFilter();
    await p.select2(p.filter, 'hired', 'Yes');
    await p.apply();
    const records = await allCurrentRows(p);
    blockedIf(records.length === 0, 'No hired seed fixture is available.');
    for (const record of records) {
        await p.details(record.email);
        expect(await definition(p, 'Hired')).toBe('Yes');
    }
});
test(caseTitle('CAN-V2-21', 'Lọc Canceled với đối chứng', { write: true }), async ({ data, candidatesPage: p, token }) => {
    const positive = await data.candidate();
    const negative = await data.candidate();
    // Establish the filter precondition through Edit; Create currently initializes canceled=false.
    await p.edit(positive.email);
    await p.candidateForm.locator('[name="canceled"]').check();
    await p.submit(p.candidateForm);
    positive.canceled = true;
    await p.edit(positive.email);
    await expect(p.candidateForm.locator('[name="canceled"]'), 'Canceled fixture must persist before testing the filter').toBeChecked();
    await p.edit(negative.email);
    await expect(p.candidateForm.locator('[name="canceled"]')).not.toBeChecked();
    await p.goto();
    await p.search(token);
    await p.openFilter();
    await p.select2(p.filter, 'canceled', 'Yes');
    await p.apply();
    await expect(p.row(positive.email)).toHaveCount(1);
    await expect(p.row(negative.email)).toHaveCount(0);
});
test(caseTitle('CAN-V2-22', 'Kết hợp Job Position và Stage', {}), async ({ candidatesPage: p }) => {
    test.setTimeout(300_000);
    const chosen = await stageFilter(p);
    await p.select2(p.filter, 'job_position_id', chosen.job.split(' - ')[0]);
    await p.apply();
    const records = await allCurrentRows(p);
    expect(records.length).toBeGreaterThan(0);
    for (const record of records) {
        expect(record.job).toBe(chosen.job);
        await p.details(record.email);
        expect(await definition(p, 'Current Stage')).toBe(chosen.stage);
    }
});
test(caseTitle('CAN-V2-23', 'Phân trang không trùng ID', {}), async ({ candidatesPage: p, page }) => {
    await p.goto();
    const next = page.locator('#listContainer').getByRole('button', { name: '', exact: true }).filter({ visible: true }).first();
    blockedIf(!await next.count() || !await next.isEnabled(), 'Need at least two candidate pages.');
    const first = await p.rows.evaluateAll(rows => rows.map(r => r.getAttribute('data-instance-id')));
    await p.update(() => next.click(), /\/list-candidate\//);
    await expect(page.getByRole('spinbutton', { name: 'Enter a page number and press Enter' })).toHaveValue('2');
    const second = await p.rows.evaluateAll(rows => rows.map(r => r.getAttribute('data-instance-id')));
    expect(second.length).toBeGreaterThan(0);
    expect(second.filter(id => first.includes(id))).toEqual([]);
    await p.update(() => page.locator('#listContainer').getByRole('button', { name: '', exact: true }).click(), /\/list-candidate\//);
    expect(await p.rows.evaluateAll(rows => rows.map(r => r.getAttribute('data-instance-id')))).toEqual(first);
});
test(caseTitle('CAN-V2-24', 'Sắp xếp Candidates tăng/giảm', { write: true }), async ({ data, candidatesPage: p, page, token }) => {
    for (const prefix of ['CK Bravo', 'CK Alpha', 'CK Charlie'])
        await data.candidate({ name: `${prefix} ${token} ${data.next()}` });
    await p.goto();
    await p.search(token);
    const header = page.getByRole('columnheader', { name: /Candidates/ });
    const sequences: string[][] = [];
    for (let i = 0; i < 2; i++) {
        await p.update(() => header.click(), /\/list-candidate\//);
        sequences.push((await p.names()).map(s => s.trim()));
    }
    const ascending = [...sequences[0]].sort((a, b) => a.localeCompare(b, 'en'));
    expect(sequences.some(s => JSON.stringify(s) === JSON.stringify(ascending))).toBe(true);
    expect(sequences.some(s => JSON.stringify(s) === JSON.stringify([...ascending].reverse()))).toBe(true);
});
test(caseTitle('CAN-V2-25', 'Chuyển List/Card giữ phạm vi', { write: true }), async ({ data, candidatesPage: p, page }) => {
    const item = await data.candidate();
    await p.goto();
    await p.search(item.name);
    await p.update(() => page.locator('li.nav-view-btn[data-type="card"]').click(), /\/card-candidate\//);
    await expect(page.locator('#listContainer').getByText(item.name, { exact: true }).filter({ visible: true }).first()).toBeVisible();
    await p.update(() => page.locator('li.nav-view-btn[data-type="list"]').click(), /\/list-candidate\//);
    await expect(p.row(item.email)).toHaveCount(1);
});
