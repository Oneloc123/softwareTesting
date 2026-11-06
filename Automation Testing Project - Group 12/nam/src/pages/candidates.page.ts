import { expect, type Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { URLS } from '../constants/urls';
import type { CandidateData } from '../utils/data-generator';
import { testFile, saveDownload } from '../utils/file-utils';

export class CandidatesPage extends BasePage {
  get rows(): Locator { return this.page.locator('#listContainer tr[data-instance-id]').filter({ visible: true }); }
  get candidateForm(): Locator { return this.page.locator('form').filter({ has: this.page.locator('input[name="name"]') }).first(); }
  row(email: string): Locator { return this.rows.filter({ hasText: email }); }
  async goto(): Promise<void> {
    await this.open(URLS.candidates, '#filterForm');
    await expect(this.page.locator('#listContainer')).toBeVisible();
    // The demo persists List/Card on the account, beyond a browser context.
    const list = this.page.locator('li.nav-view-btn[data-type="list"]');
    await expect(list).toBeVisible();
    await this.page.waitForFunction(() => !document.querySelector('.htmx-request:not([type="hidden"])'));
    await this.update(() => list.click(), /\/list-candidate\//);
    await this.listReady(this.rows);
  }
  async search(value: string): Promise<void> {
    await this.update(async () => {
      const search = this.filter.locator('input[name="search"]').first();
      await search.fill(value); await search.press('Enter');
    }, /\/(list-candidate|card-candidate)\//);
  }
  async findEmail(email: string): Promise<void> {
    await this.goto(); await this.openFilter();
    await this.filter.locator('input[name="email"]').fill(email);
    await this.apply();
  }
  async openCreate(): Promise<void> { await this.open(URLS.candidateCreate, '#id_name'); }
  async fill(data: CandidateData): Promise<void> {
    const form = this.candidateForm;
    await form.locator('[name="name"]').fill(data.name);
    if (data.recruitment) {
      const recruitment = form.locator('[name="recruitment_id"]');
      const value = await recruitment.locator('option').evaluateAll((options, label) => options.find(o => o.textContent?.trim() === label)?.getAttribute('value'), data.recruitment);
      expect(value, `Recruitment option ${data.recruitment}`).toBeTruthy();
      const responsePromise = this.page.waitForResponse(r => {
        const url = new URL(r.url());
        return url.pathname.replace(/\/$/, '') === '/recruitment/get-open-positions' && url.searchParams.get('recId') === value && r.status() === 200;
      });
      await recruitment.selectOption(value!);
      const response = await responsePromise;
      const payload = await response.json() as { openPositions: string };
      const positions = (JSON.parse(payload.openPositions) as { pk: number }[]).map(p => String(p.pk));
      expect(positions.length, 'Recruitment needs at least one open position').toBeGreaterThan(0);
      const positionSelect = form.locator('[name="job_position_id"]');
      await expect.poll(() => positionSelect.locator('option').evaluateAll(options => options.map(o => (o as HTMLOptionElement).value).filter(Boolean).sort())).toEqual([...positions].sort());
      await positionSelect.selectOption(positions[0]);
    }
    await form.locator('[name="email"]').fill(data.email);
    await form.locator('[name="dob"]').fill(data.dob || '');
    for (const [name, value] of Object.entries({ mobile: data.mobile, portfolio: data.portfolio, address: data.address, zip: data.zip })) {
      if (value !== undefined) await form.locator(`[name="${name}"]`).fill(value);
    }
    if (data.country) await form.locator('[name="country"]').selectOption({ label: data.country });
    if (data.gender) await form.locator('[name="gender"]').selectOption(data.gender);
    if (data.source) await form.locator('[name="source"]').selectOption(data.source);
    if (data.canceled !== undefined) await form.locator('[name="canceled"]').setChecked(data.canceled);
    // This recruitment's backend requires both files even though HTML required=false.
    await form.locator('[name="profile"]').setInputFiles(testFile('assignment.png'));
    await form.locator('[name="resume"]').setInputFiles(data.resume || testFile('sample_cv.pdf'));
  }
  async create(data: CandidateData): Promise<string> {
    await this.openCreate(); await this.fill(data); await this.submit(this.candidateForm);
    await expect(this.candidateForm.locator('.errorlist')).toHaveCount(0);
    await this.findEmail(data.email);
    await expect(this.row(data.email), 'Created candidate should persist after reload').toHaveCount(1);
    return (await this.row(data.email).getAttribute('data-instance-id'))!;
  }
  async edit(email: string): Promise<void> {
    await this.findEmail(email);
    await this.row(email).getByTitle('Edit', { exact: true }).click();
    await expect(this.candidateForm.locator('[name="name"]')).toBeVisible();
  }
  async details(email: string, tab = 'About'): Promise<void> {
    await this.findEmail(email);
    await this.row(email).locator('td').nth(1).click();
    await this.page.getByRole('button', { name: tab, exact: true }).click();
    if (tab === 'About') await expect(this.page.getByRole('heading', { name: 'Recruitment Information', exact: true })).toBeVisible();
  }
  async apply(): Promise<void> { await this.openFilter(); await this.update(() => this.filter.locator('#applyFilter').click(), /\/(list-candidate|card-candidate)\//); }
  async delete(email: string, accept = true): Promise<void> {
    await this.findEmail(email);
    const row = this.row(email);
    if (!await row.count()) return;
    await row.getByTitle('Delete', { exact: true }).click();
    await expect(this.page.locator('form[hx-post*="/generic-delete/"]').first()).toBeAttached();
    // Confirmation controls live in Summary; the related-records tab has an Action Required label.
    await this.page.getByRole('button', { name: 'Summary', exact: true, includeHidden: true }).filter({ visible: true }).first().click();
    // The page contains duplicate modal IDs; scope to the form with the visible Cancel control.
    const form = this.page.locator('form[hx-post*="/generic-delete/"]').filter({ has: this.page.getByRole('button', { name: 'Cancel', exact: true, includeHidden: true }).filter({ visible: true }) }).first();
    await expect(form).toBeVisible();
    if (!accept) {
      await form.getByRole('button', { name: 'Cancel', exact: true, includeHidden: true }).click();
      await expect(form).toBeHidden(); return;
    }
    for (const checkbox of await form.locator('input[type="checkbox"][required]').all()) await checkbox.check();
    const confirm = form.getByRole('button', { name: 'Delete', exact: true, includeHidden: true });
    await expect(confirm).toBeVisible();
    const deleted = this.page.waitForResponse(r => r.request().method() === 'POST' && r.url().includes('/generic-delete/'));
    await confirm.click(); await (await deleted).finished();
    await this.findEmail(email);
    await expect(this.row(email)).toHaveCount(0);
  }
  async names(): Promise<string[]> { return this.rows.locator('td:nth-child(2)').allInnerTexts(); }
  override async exportExcel(info: import('@playwright/test').TestInfo): Promise<Buffer> {
    await expect(this.rows, 'Export case must first restrict the list to one owned fixture').toHaveCount(1);
    const email = (await this.rows.first().locator('td').nth(2).innerText()).trim();
    const id = await this.rows.first().getAttribute('data-instance-id');
    await this.rows.first().getByRole('checkbox').check();
    const selected = JSON.parse((await this.page.locator('#selectedInstances').getAttribute('data-ids')) || '[]') as unknown[];
    expect(selected.map(String), 'Export must select exactly the owned candidate').toEqual([id]);
    await this.page.getByRole('button', { name: /Actions/ }).first().click();
    await this.page.getByText('Export', { exact: true }).filter({ visible: true }).first().click();
    // Recruitment uses its own exporter, not the generic quick-export dialog.
    const form = this.page.locator('form[action*="/candidate-info-export/"]').filter({ visible: true });
    await expect(form).toBeVisible();
    const boxes = form.locator('input[name="selected_fields"]');
    for (const box of await boxes.all()) await box.uncheck();
    await form.getByLabel('Name', { exact: true }).and(boxes).check();
    await form.getByLabel('Email', { exact: true }).and(boxes).check();
    // Selected-record export intentionally hides filter accordions and submits instance_ids.
    await info.attach('export-scope', { body: JSON.stringify({ format: 'xlsx', columns: ['name', 'email'], email, selectedIds: selected }), contentType: 'application/json' });
    const download = this.page.waitForEvent('download');
    await form.getByRole('button', { name: 'Export', exact: true, includeHidden: true }).click();
    return saveDownload(await download, info);
  }
}
