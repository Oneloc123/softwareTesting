"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetsPage = void 0;
const test_1 = require("@playwright/test");
const base_page_js_1 = require("./base.page.js");
const urls_js_1 = require("../constants/urls.js");
const data_generator_js_1 = require("../utils/data-generator.js");
const file_utils_js_1 = require("../utils/file-utils.js");
class AssetsPage extends base_page_js_1.BasePage {
    async exportExcel(info) {
        await (0, test_1.expect)(this.rows, 'Export starts from one owned asset').toHaveCount(1);
        const serial = (await this.rows.first().locator('td').nth(4).innerText()).trim();
        const id = await this.rows.first().getAttribute('data-instance-id');
        await this.rows.first().getByRole('checkbox').check();
        const selected = JSON.parse((await this.page.locator('#selectedInstances').getAttribute('data-ids')) || '[]');
        (0, test_1.expect)(selected.map(String), 'Export must select exactly the owned asset').toEqual([id]);
        const open = this.page.getByRole('button', { name: /Actions/ }).first();
        await open.click();
        await this.page.getByText('Export', { exact: true }).filter({ visible: true }).first().click();
        const form = this.page.locator('form[action*="/asset-export-excel/"]').filter({ visible: true });
        await (0, test_1.expect)(form).toBeVisible();
        await form.locator('[name="hlv_export_format"]').selectOption('xlsx');
        await form.locator('#select-all-export-fields').check();
        await info.attach('export-scope', { body: JSON.stringify({ format: 'xlsx', serial, selectedIds: selected }), contentType: 'application/json' });
        const download = this.page.waitForEvent('download');
        await form.getByRole('button', { name: 'Export', exact: true, includeHidden: true }).click();
        const { saveDownload } = await Promise.resolve().then(() => __importStar(require('../utils/file-utils')));
        return saveDownload(await download, info);
    }
    get rows() { return this.page.locator('tr[data-instance-id]').filter({ visible: true }); }
    get assetForm() { return this.page.locator('.oh-modal--show form').filter({ has: this.page.locator('input[name="asset_name"]') }).filter({ visible: true }).filter({ has: this.page.locator('button[type="submit"]') }).first(); }
    get allocationForm() { return this.page.locator('form').filter({ has: this.page.locator('input[name="assign_images"]') }).first(); }
    get returnForm() { return this.page.locator('form').filter({ has: this.page.locator('[name="return_date"]') }).filter({ has: this.page.locator('button[type="submit"]') }).first(); }
    row(serial) { return this.rows.filter({ hasText: serial }); }
    async goto() { await this.open(urls_js_1.URLS.assets, '#filterForm'); await (0, test_1.expect)(this.page.locator('#asset-category-grouped-list, #asset-category-list').first()).toBeVisible(); await this.listReady(this.rows); }
    async refreshList(action) { await this.update(action, /\/asset\/(?:asset-category|asset-list|asset-filter)/); }
    async search(value) {
        await this.refreshList(async () => { const input = this.filter.locator('input[name="search"]').first(); await input.fill(value); await input.press('Enter'); });
    }
    async apply() { await this.openFilter(); await this.refreshList(() => this.filter.locator('#applyFilter').click()); }
    async openCreate() {
        await this.goto();
        await this.page.getByText('Create', { exact: true }).first().click();
        await (0, test_1.expect)(this.assetForm.locator('[name="asset_name"]')).toBeVisible();
    }
    async fill(data) {
        const form = this.assetForm;
        for (const [name, value] of Object.entries({ asset_name: data.name, asset_tracking_id: data.serial, asset_purchase_date: data.purchaseDate, asset_purchase_cost: data.cost, quantity: '1' }))
            await form.locator(`[name="${name}"]`).fill(value);
        if (data.category)
            await this.select2(form, 'asset_category_id', data.category);
        await this.select2(form, 'asset_status', data.status);
        if (data.description)
            await form.locator('[name="asset_description"]').fill(data.description);
        if (data.batch)
            await this.select2(form, 'asset_lot_number_id', data.batch);
        if (data.expiry)
            await form.locator('[name="expiry_date"]').fill(data.expiry);
        if (data.notify && await form.locator('[name="notify_before"]').isVisible())
            await form.locator('[name="notify_before"]').fill(data.notify);
    }
    async create(data) {
        await this.openCreate();
        await this.fill(data);
        await this.submit(this.assetForm);
        await this.goto();
        await this.search(data.name);
        await (0, test_1.expect)(this.row(data.serial), 'Created asset should persist').toHaveCount(1);
        return (await this.row(data.serial).getAttribute('data-instance-id'));
    }
    async find(data) { await this.goto(); await this.search(data.name); return this.row(data.serial); }
    async edit(data) {
        const row = await this.find(data);
        await row.getByTitle('Update', { exact: true }).click();
        await (0, test_1.expect)(this.assetForm.locator('[name="asset_name"]')).toBeVisible();
    }
    async details(data) {
        const row = await this.find(data);
        await row.locator('td').nth(1).click();
        await (0, test_1.expect)(this.modal).toContainText(data.serial);
        await (0, test_1.expect)(this.modal).toContainText('Purchase Date');
    }
    async delete(data, accept = true) {
        const row = await this.find(data);
        if (!await row.count())
            return;
        const target = await row.locator('form[hx-post*="/asset-delete/"]').getAttribute('hx-target');
        const diagnostic = target?.startsWith('#') && !await this.page.locator(target).count()
            ? `Delete click must show confirmation; website form references missing ${target}` : undefined;
        await this.confirmAction(() => row.getByTitle('Delete', { exact: true }).click(), accept, diagnostic);
        await this.goto();
        await this.search(data.name);
        await (0, test_1.expect)(this.row(data.serial)).toHaveCount(accept ? 0 : 1);
    }
    async allocations() {
        await this.open(urls_js_1.URLS.allocations, '#ohMainContent');
        await this.page.getByRole('button', { name: /Asset Allocation/ }).click();
        await (0, test_1.expect)(this.page.getByRole('heading', { name: 'Asset Allocation', exact: true })).toBeVisible();
        await (0, test_1.expect)(this.page.locator('tr[data-instance-id]').first()).toBeVisible();
        await this.listReady(this.rows);
    }
    async openAllocate() {
        await this.allocations();
        await this.page.getByText('Create', { exact: true }).first().click();
        await (0, test_1.expect)(this.allocationForm.locator('input[name="assign_images"]')).toBeVisible();
    }
    async fillAllocation(data, employee = 'Daniel Nguyen (NTI0002)', image = true) {
        const asset = this.allocationForm.locator('[name="asset_id"]');
        const option = await asset.locator('option').evaluateAll((items, serial) => items.map(e => ({ value: e.value, text: e.textContent || '' })).find(e => e.text.includes(serial)), data.serial);
        (0, test_1.expect)(option, `Available asset ${data.serial} must be selectable`).toBeDefined();
        await asset.selectOption(option.value);
        if (employee)
            await this.select2(this.allocationForm, 'assigned_to_employee_id', employee);
        if (image)
            await this.allocationForm.locator('[name="assign_images"]').setInputFiles((0, file_utils_js_1.testFile)('assignment.png'));
    }
    async allocate(data) {
        await this.openAllocate();
        await this.fillAllocation(data);
        await this.submit(this.allocationForm);
        await this.allocations();
        await this.searchAllocation(data);
        await (0, test_1.expect)(this.row(data.serial)).toHaveCount(1);
    }
    async searchAllocation(data) {
        const endpoint = await this.filter.getAttribute('hx-get');
        (0, test_1.expect)(endpoint, 'Allocation/history filter must declare its GET endpoint').toBeTruthy();
        const pathname = new URL(endpoint, this.page.url()).pathname;
        const pattern = new RegExp(`^${pathname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
        // Global search defaults to Employee; the Asset dropdown searches asset names.
        // Select by its name, verify the displayed Serial, then submit the exact Asset filter.
        await this.openFilter();
        await this.filter.locator('[name="search"]').first().fill('');
        await this.select2(this.filter, 'asset_id', data.serial, data.name);
        await this.update(() => this.filter.locator('#applyFilter').click(), pattern);
    }
    async openReturn(data) {
        await this.allocations();
        await this.searchAllocation(data);
        await this.row(data.serial).getByRole('button', { name: 'Return', exact: true }).click();
        await (0, test_1.expect)(this.returnForm.locator('[name="return_date"]')).toBeVisible();
    }
    async returnAsset(data, status = 'Healthy') {
        await this.openReturn(data);
        const form = this.returnForm;
        await form.locator('[name="return_status"]').selectOption({ label: status });
        await form.locator('[name="return_date"]').fill((0, data_generator_js_1.localDate)());
        await form.locator('[name="return_condition"]').fill('Synthetic Playwright return condition');
        const images = form.locator('input[type="file"]');
        if (await images.count())
            await images.setInputFiles((0, file_utils_js_1.testFile)('assignment.png'));
        await this.submit(form);
        await this.allocations();
        await this.searchAllocation(data);
        await (0, test_1.expect)(this.row(data.serial)).toContainText('Returned');
        await (0, test_1.expect)(this.row(data.serial)).toContainText(status);
    }
    async history(data) {
        await this.open(urls_js_1.URLS.assetHistory, '#filterForm');
        await this.listReady(this.rows);
        await this.searchAllocation(data);
    }
}
exports.AssetsPage = AssetsPage;
