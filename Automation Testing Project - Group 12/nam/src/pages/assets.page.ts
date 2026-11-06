import { expect, type Locator } from '@playwright/test';
import { BasePage } from './base.page';
import { URLS } from '../constants/urls';
import type { AssetData } from '../utils/data-generator';
import { localDate } from '../utils/data-generator';
import { testFile } from '../utils/file-utils';

export class AssetsPage extends BasePage {
  override async exportExcel(info: import('@playwright/test').TestInfo): Promise<Buffer> {
    await expect(this.rows, 'Export starts from one owned asset').toHaveCount(1);
    const serial = (await this.rows.first().locator('td').nth(4).innerText()).trim();
    const id = await this.rows.first().getAttribute('data-instance-id');
    await this.rows.first().getByRole('checkbox').check();
    const selected = JSON.parse((await this.page.locator('#selectedInstances').getAttribute('data-ids')) || '[]') as unknown[];
    expect(selected.map(String), 'Export must select exactly the owned asset').toEqual([id]);
    const open = this.page.getByRole('button', { name: /Actions/ }).first();
    await open.click();
    await this.page.getByText('Export', { exact: true }).filter({ visible: true }).first().click();
    const form = this.page.locator('form[action*="/asset-export-excel/"]').filter({ visible: true });
    await expect(form).toBeVisible();
    await form.locator('[name="hlv_export_format"]').selectOption('xlsx');
    await form.locator('#select-all-export-fields').check();
    await info.attach('export-scope', { body: JSON.stringify({ format: 'xlsx', serial, selectedIds: selected }), contentType: 'application/json' });
    const download = this.page.waitForEvent('download');
    await form.getByRole('button', { name: 'Export', exact: true, includeHidden: true }).click();
    const { saveDownload } = await import('../utils/file-utils');
    return saveDownload(await download, info);
  }
  get rows(): Locator { return this.page.locator('tr[data-instance-id]').filter({ visible: true }); }
  get assetForm(): Locator { return this.page.locator('.oh-modal--show form').filter({ has: this.page.locator('input[name="asset_name"]') }).filter({ visible: true }).filter({ has: this.page.locator('button[type="submit"]') }).first(); }
  get allocationForm(): Locator { return this.page.locator('form').filter({ has: this.page.locator('input[name="assign_images"]') }).first(); }
  get returnForm(): Locator { return this.page.locator('form').filter({ has: this.page.locator('[name="return_date"]') }).filter({ has: this.page.locator('button[type="submit"]') }).first(); }
  row(serial: string): Locator { return this.rows.filter({ hasText: serial }); }
  async goto(): Promise<void> { await this.open(URLS.assets, '#filterForm'); await expect(this.page.locator('#asset-category-grouped-list, #asset-category-list').first()).toBeVisible(); await this.listReady(this.rows); }
  async refreshList(action: () => Promise<unknown>): Promise<void> { await this.update(action, /\/asset\/(?:asset-category|asset-list|asset-filter)/); }
  async search(value: string): Promise<void> {
    await this.refreshList(async () => { const input = this.filter.locator('input[name="search"]').first(); await input.fill(value); await input.press('Enter'); });
  }
  async apply(): Promise<void> { await this.openFilter(); await this.refreshList(() => this.filter.locator('#applyFilter').click()); }
  async openCreate(): Promise<void> {
    await this.goto(); await this.page.getByText('Create', { exact: true }).first().click();
    await expect(this.assetForm.locator('[name="asset_name"]')).toBeVisible();
  }
  async fill(data: AssetData): Promise<void> {
    const form = this.assetForm;
    for (const [name, value] of Object.entries({ asset_name: data.name, asset_tracking_id: data.serial, asset_purchase_date: data.purchaseDate, asset_purchase_cost: data.cost, quantity: '1' })) await form.locator(`[name="${name}"]`).fill(value);
    if (data.category) await this.select2(form, 'asset_category_id', data.category);
    await this.select2(form, 'asset_status', data.status);
    if (data.description) await form.locator('[name="asset_description"]').fill(data.description);
    if (data.batch) await this.select2(form, 'asset_lot_number_id', data.batch);
    if (data.expiry) await form.locator('[name="expiry_date"]').fill(data.expiry);
    if (data.notify && await form.locator('[name="notify_before"]').isVisible()) await form.locator('[name="notify_before"]').fill(data.notify);
  }
  async create(data: AssetData): Promise<string> {
    await this.openCreate(); await this.fill(data); await this.submit(this.assetForm);
    await this.goto(); await this.search(data.name);
    await expect(this.row(data.serial), 'Created asset should persist').toHaveCount(1);
    return (await this.row(data.serial).getAttribute('data-instance-id'))!;
  }
  async find(data: AssetData): Promise<Locator> { await this.goto(); await this.search(data.name); return this.row(data.serial); }
  async edit(data: AssetData): Promise<void> {
    const row = await this.find(data); await row.getByTitle('Update', { exact: true }).click();
    await expect(this.assetForm.locator('[name="asset_name"]')).toBeVisible();
  }
  async details(data: AssetData): Promise<void> {
    const row = await this.find(data); await row.locator('td').nth(1).click();
    await expect(this.modal).toContainText(data.serial);
    await expect(this.modal).toContainText('Purchase Date');
  }
  async delete(data: AssetData, accept = true): Promise<void> {
    const row = await this.find(data);
    if (!await row.count()) return;
    const target = await row.locator('form[hx-post*="/asset-delete/"]').getAttribute('hx-target');
    const diagnostic = target?.startsWith('#') && !await this.page.locator(target).count()
      ? `Delete click must show confirmation; website form references missing ${target}` : undefined;
    await this.confirmAction(() => row.getByTitle('Delete', { exact: true }).click(), accept, diagnostic);
    await this.goto(); await this.search(data.name);
    await expect(this.row(data.serial)).toHaveCount(accept ? 0 : 1);
  }
  async allocations(): Promise<void> {
    await this.open(URLS.allocations, '#ohMainContent');
    await this.page.getByRole('button', { name: /Asset Allocation/ }).click();
    await expect(this.page.getByRole('heading', { name: 'Asset Allocation', exact: true })).toBeVisible();
    await expect(this.page.locator('tr[data-instance-id]').first()).toBeVisible();
    await this.listReady(this.rows);
  }
  async openAllocate(): Promise<void> {
    await this.allocations(); await this.page.getByText('Create', { exact: true }).first().click();
    await expect(this.allocationForm.locator('input[name="assign_images"]')).toBeVisible();
  }
  async fillAllocation(data: AssetData, employee = 'Daniel Nguyen (NTI0002)', image = true): Promise<void> {
    const asset = this.allocationForm.locator('[name="asset_id"]');
    const option = await asset.locator('option').evaluateAll((items, serial) => items.map(e => ({ value: (e as HTMLOptionElement).value, text: e.textContent || '' })).find(e => e.text.includes(serial)), data.serial);
    expect(option, `Available asset ${data.serial} must be selectable`).toBeDefined();
    await asset.selectOption(option!.value);
    if (employee) await this.select2(this.allocationForm, 'assigned_to_employee_id', employee);
    if (image) await this.allocationForm.locator('[name="assign_images"]').setInputFiles(testFile('assignment.png'));
  }
  async allocate(data: AssetData): Promise<void> {
    await this.openAllocate(); await this.fillAllocation(data); await this.submit(this.allocationForm);
    await this.allocations(); await this.searchAllocation(data);
    await expect(this.row(data.serial)).toHaveCount(1);
  }
  async searchAllocation(data: AssetData): Promise<void> {
    const endpoint = await this.filter.getAttribute('hx-get');
    expect(endpoint, 'Allocation/history filter must declare its GET endpoint').toBeTruthy();
    const pathname = new URL(endpoint!, this.page.url()).pathname;
    const pattern = new RegExp(`^${pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    // Global search defaults to Employee; the Asset dropdown searches asset names.
    // Select by its name, verify the displayed Serial, then submit the exact Asset filter.
    await this.openFilter();
    await this.filter.locator('[name="search"]').first().fill('');
    await this.select2(this.filter, 'asset_id', data.serial, data.name);
    await this.update(() => this.filter.locator('#applyFilter').click(), pattern);
  }
  async openReturn(data: AssetData): Promise<void> {
    await this.allocations(); await this.searchAllocation(data);
    await this.row(data.serial).getByRole('button', { name: 'Return', exact: true }).click();
    await expect(this.returnForm.locator('[name="return_date"]')).toBeVisible();
  }
  async returnAsset(data: AssetData, status = 'Healthy'): Promise<void> {
    await this.openReturn(data);
    const form = this.returnForm;
    await form.locator('[name="return_status"]').selectOption({ label: status });
    await form.locator('[name="return_date"]').fill(localDate());
    await form.locator('[name="return_condition"]').fill('Synthetic Playwright return condition');
    const images = form.locator('input[type="file"]');
    if (await images.count()) await images.setInputFiles(testFile('assignment.png'));
    await this.submit(form);
    await this.allocations(); await this.searchAllocation(data);
    await expect(this.row(data.serial)).toContainText('Returned');
    await expect(this.row(data.serial)).toContainText(status);
  }
  async history(data: AssetData): Promise<void> {
    await this.open(URLS.assetHistory, '#filterForm');
    await this.listReady(this.rows);
    await this.searchAllocation(data);
  }
}
