import { expect, type Locator, type Page, type Response } from '@playwright/test';

export class BasePage {
  constructor(public readonly page: Page) {}

  get modal(): Locator { return this.page.locator('.oh-modal--show').filter({ visible: true }).last(); }
  get form(): Locator { return this.page.locator('form').filter({ has: this.page.locator('button[type="submit"]') }).filter({ visible: true }).filter({ hasNot: this.page.locator('#filterForm') }).first(); }
  get filter(): Locator { return this.page.locator('#filterForm'); }
  get empty(): Locator { return this.page.getByText(/No filtered records found|No records available/i).first(); }

  async open(route: string, ready: string): Promise<void> {
    const response = await this.page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `GET ${route}`).toBe(200);
    await expect(this.page.locator(ready).first()).toBeVisible();
  }

  async listReady(rows: Locator): Promise<void> {
    await expect(rows.first().or(this.empty).first(), 'Initial HTMX list must finish loading before the next action').toBeVisible({ timeout: 30_000 });
    await this.page.waitForFunction(() => !document.querySelector('.htmx-request:not([type="hidden"])'));
  }

  async update(action: () => Promise<unknown>, pattern: RegExp): Promise<Response> {
    const responsePromise = this.page.waitForResponse(r => pattern.test(new URL(r.url()).pathname) && r.request().method() === 'GET')
      .then(response => ({ response, error: undefined })).catch((error: Error) => ({ response: undefined, error }));
    await action();
    const outcome = await responsePromise;
    if (outcome.error) throw outcome.error;
    const response = outcome.response!;
    expect(response.status(), response.url()).toBe(200);
    await response.finished();
    await this.page.waitForFunction(() => !document.querySelector('.htmx-request:not([type="hidden"])'));
    return response;
  }

  async submit(form: Locator): Promise<Response> {
    const endpoint = (await form.getAttribute('hx-post')) || (await form.getAttribute('action')) || this.page.url();
    const pathname = new URL(endpoint, this.page.url()).pathname;
    const responsePromise = this.page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === pathname)
      .then(response => ({ response, error: undefined })).catch((error: Error) => ({ response: undefined, error }));
    await form.locator('button[type="submit"]').filter({ hasText: /^\s*Save\s*$/ }).click();
    const outcome = await responsePromise;
    if (outcome.error) throw outcome.error;
    const response = outcome.response!;
    expect(response.status(), `POST ${pathname}`).toBeLessThan(400);
    await response.finished();
    return response;
  }

  async closeModal(): Promise<void> {
    await this.modal.locator('button[aria-label="Close"],button.oh-modal__close,button.oh-modal__close--custom').first().click();
    await expect(this.page.locator('.oh-modal--show').filter({ visible: true })).toHaveCount(0);
  }

  async openFilter(): Promise<void> {
    const panel = this.page.locator('#modernFilterPanel');
    const onScreen = () => panel.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.right > 0 && rect.left < innerWidth && getComputedStyle(el).visibility !== 'hidden';
    });
    // A closed sliding panel can be CSS-visible while entirely outside the viewport.
    if (!await onScreen()) await this.page.locator('#modernFilterTrigger').click();
    await expect.poll(onScreen).toBe(true);
    await expect(this.filter.locator('#applyFilter')).toBeVisible();
  }

  async select2(scope: Locator, name: string, labels: string | string[], searchTerm?: string): Promise<void> {
    const select = scope.locator(`select[name="${name}"]`).first();
    await expect(select).toBeAttached();
    const targets = Array.isArray(labels) ? labels : [labels];
    for (const label of targets) {
      const container = select.locator('xpath=following-sibling::span[contains(@class,"select2-container")]').first();
      if (!await container.count()) {
        await select.selectOption(targets.map(text => ({ label: text })));
        break;
      }
      await container.click();
      const search = this.page.locator('.select2-container--open .select2-search__field').last();
      // AJAX search matches the stored field, not necessarily its decorated label.
      const ajaxUrl = await select.getAttribute('data-ajax-url');
      const query = searchTerm ?? (/meeting-(employee|manager)/.test(ajaxUrl || '') ? label.split(' ')[0] : label.replace(/\s+-\s+\([^)]*\)$/, ''));
      if (await search.isVisible()) await search.fill(query);
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Prefix + boundary: No must not match Unknown, Available must not match Not-Available.
      const result = this.page.locator('.select2-container--open [role="option"]').filter({ hasText: new RegExp(`^\\s*${escaped}(?=\\s*(?:$|[-(]))`, 'i') }).first();
      await expect(result).toBeVisible();
      await result.click();
      // A single-select may remain open after a site change-handler error; Escape also closes Horilla's modal.
      // Subsequent field/button interaction closes it naturally. Multi-selects still need their dropdown closed.
      if (await select.getAttribute('multiple') !== null && await this.page.locator('.select2-container--open').count()) await this.page.keyboard.press('Escape');
    }
    for (const label of targets) await expect.poll(async () => (await select.locator('option:checked').allTextContents()).some(t => t.includes(label)), { message: `Selected ${name}: ${label}` }).toBe(true);
  }

  async selectValue(scope: Locator, name: string, label: string): Promise<void> {
    await this.select2(scope, name, label);
  }

  async revealAccordionField(field: Locator): Promise<void> {
    if (!await field.isVisible()) {
      const accordion = field.locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," oh-accordion ")][1]');
      await accordion.locator('.oh-accordion-header').first().click();
    }
    await expect(field).toBeVisible();
  }

  async fieldError(name: string, form: Locator): Promise<void> {
    const field = form.locator(`[name="${name}"]`).first();
    await expect.poll(async () => {
      const invalid = await field.evaluate((el: HTMLInputElement) => !el.validity.valid);
      const explicit = form.locator(`[id="id_${name}_error"]`);
      const errors = await explicit.count() ? await explicit.innerText() : await field.locator('xpath=..').innerText();
      return invalid || /This field is required\.|required/i.test(errors);
    }, { message: `Expected validation error for ${name}` }).toBe(true);
  }

  async confirmAction(action: () => Promise<unknown>, accept: boolean, diagnostic?: string): Promise<void> {
    let observed = false;
    const handler = async (dialog: import('@playwright/test').Dialog) => {
      observed = true;
      if (accept) await dialog.accept(); else await dialog.dismiss();
    };
    this.page.once('dialog', handler);
    try {
      await action();
      if (!observed) {
        const dialog = this.page.locator('.swal2-popup:visible,[role="dialog"]:visible').last();
        await expect(dialog, diagnostic || 'Expected a deletion/archive confirmation').toBeVisible();
        await dialog.getByRole('button', { name: accept ? /^(Yes|Confirm|Delete|OK)/i : /Cancel|No/i }).first().click();
      }
    } finally { this.page.off('dialog', handler); }
  }

  async assertInputLimit(field: Locator, max: number): Promise<void> {
    await expect(field).toHaveAttribute('maxlength', String(max));
    await field.fill('A'.repeat(max));
    await field.press('End');
    await field.pressSequentially('B');
    expect((await field.inputValue()).length).toBe(max);
  }

  async exportExcel(info: import('@playwright/test').TestInfo): Promise<Buffer> {
    const checkboxes = this.page.locator('tr[data-instance-id] input[type="checkbox"]').filter({ visible: true });
    expect(await checkboxes.count(), 'Export needs a nonempty, deliberately filtered fixture scope').toBeGreaterThan(0);
    for (const checkbox of await checkboxes.all()) await checkbox.check();
    await this.page.getByRole('button', { name: /Actions/ }).first().click();
    await this.page.getByText('Export', { exact: true }).filter({ visible: true }).first().click();
    const exportForm = this.page.locator('form').filter({ has: this.page.locator('[name="hlv_export_name"]') }).filter({ visible: true }).last();
    await expect(exportForm).toBeVisible();
    await exportForm.locator('[name="hlv_export_format"]').selectOption('xlsx');
    const all = exportForm.locator('#select-all-export-fields');
    if (await all.count()) await all.check();
    else for (const checkbox of await exportForm.locator('input[name="selected_fields"]').all()) await checkbox.check();
    await info.attach('export-scope', { body: await exportForm.innerText(), contentType: 'text/plain' });
    const downloadPromise = this.page.waitForEvent('download');
    await exportForm.locator('button[type="submit"]').click();
    const { saveDownload } = await import('../utils/file-utils');
    return saveDownload(await downloadPromise, info);
  }
}
