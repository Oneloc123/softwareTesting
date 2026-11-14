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
exports.BasePage = void 0;
const test_1 = require("@playwright/test");
class BasePage {
    page;
    constructor(page) {
        this.page = page;
    }
    get modal() { return this.page.locator('.oh-modal--show').filter({ visible: true }).last(); }
    get form() { return this.page.locator('form').filter({ has: this.page.locator('button[type="submit"]') }).filter({ visible: true }).filter({ hasNot: this.page.locator('#filterForm') }).first(); }
    get filter() { return this.page.locator('#filterForm'); }
    get empty() { return this.page.getByText(/No filtered records found|No records available/i).first(); }
    async open(route, ready) {
        const response = await this.page.goto(route, { waitUntil: 'domcontentloaded' });
        (0, test_1.expect)(response?.status(), `GET ${route}`).toBe(200);
        await (0, test_1.expect)(this.page.locator(ready).first()).toBeVisible();
    }
    async listReady(rows) {
        await (0, test_1.expect)(rows.first().or(this.empty).first(), 'Initial HTMX list must finish loading before the next action').toBeVisible({ timeout: 30_000 });
        await this.page.waitForFunction(() => !document.querySelector('.htmx-request:not([type="hidden"])'));
    }
    async update(action, pattern) {
        const responsePromise = this.page.waitForResponse(r => pattern.test(new URL(r.url()).pathname) && r.request().method() === 'GET')
            .then(response => ({ response, error: undefined })).catch((error) => ({ response: undefined, error }));
        await action();
        const outcome = await responsePromise;
        if (outcome.error)
            throw outcome.error;
        const response = outcome.response;
        (0, test_1.expect)(response.status(), response.url()).toBe(200);
        await response.finished();
        await this.page.waitForFunction(() => !document.querySelector('.htmx-request:not([type="hidden"])'));
        return response;
    }
    async submit(form) {
        const endpoint = (await form.getAttribute('hx-post')) || (await form.getAttribute('action')) || this.page.url();
        const pathname = new URL(endpoint, this.page.url()).pathname;
        const responsePromise = this.page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === pathname)
            .then(response => ({ response, error: undefined })).catch((error) => ({ response: undefined, error }));
        await form.locator('button[type="submit"]').filter({ hasText: /^\s*Save\s*$/ }).click();
        const outcome = await responsePromise;
        if (outcome.error)
            throw outcome.error;
        const response = outcome.response;
        (0, test_1.expect)(response.status(), `POST ${pathname}`).toBeLessThan(400);
        await response.finished();
        return response;
    }
    async closeModal() {
        await this.modal.locator('button[aria-label="Close"],button.oh-modal__close,button.oh-modal__close--custom').first().click();
        await (0, test_1.expect)(this.page.locator('.oh-modal--show').filter({ visible: true })).toHaveCount(0);
    }
    async openFilter() {
        const panel = this.page.locator('#modernFilterPanel');
        const onScreen = () => panel.evaluate(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.right > 0 && rect.left < innerWidth && getComputedStyle(el).visibility !== 'hidden';
        });
        // A closed sliding panel can be CSS-visible while entirely outside the viewport.
        if (!await onScreen())
            await this.page.locator('#modernFilterTrigger').click();
        await test_1.expect.poll(onScreen).toBe(true);
        await (0, test_1.expect)(this.filter.locator('#applyFilter')).toBeVisible();
    }
    async select2(scope, name, labels, searchTerm) {
        const select = scope.locator(`select[name="${name}"]`).first();
        await (0, test_1.expect)(select).toBeAttached();
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
            if (await search.isVisible())
                await search.fill(query);
            const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Prefix + boundary: No must not match Unknown, Available must not match Not-Available.
            const result = this.page.locator('.select2-container--open [role="option"]').filter({ hasText: new RegExp(`^\\s*${escaped}(?=\\s*(?:$|[-(]))`, 'i') }).first();
            await (0, test_1.expect)(result).toBeVisible();
            await result.click();
            // A single-select may remain open after a site change-handler error; Escape also closes Horilla's modal.
            // Subsequent field/button interaction closes it naturally. Multi-selects still need their dropdown closed.
            if (await select.getAttribute('multiple') !== null && await this.page.locator('.select2-container--open').count())
                await this.page.keyboard.press('Escape');
        }
        for (const label of targets)
            await test_1.expect.poll(async () => (await select.locator('option:checked').allTextContents()).some(t => t.includes(label)), { message: `Selected ${name}: ${label}` }).toBe(true);
    }
    async selectValue(scope, name, label) {
        await this.select2(scope, name, label);
    }
    async revealAccordionField(field) {
        if (!await field.isVisible()) {
            const accordion = field.locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," oh-accordion ")][1]');
            await accordion.locator('.oh-accordion-header').first().click();
        }
        await (0, test_1.expect)(field).toBeVisible();
    }
    async fieldError(name, form) {
        const field = form.locator(`[name="${name}"]`).first();
        await test_1.expect.poll(async () => {
            const invalid = await field.evaluate((el) => !el.validity.valid);
            const explicit = form.locator(`[id="id_${name}_error"]`);
            const errors = await explicit.count() ? await explicit.innerText() : await field.locator('xpath=..').innerText();
            return invalid || /This field is required\.|required/i.test(errors);
        }, { message: `Expected validation error for ${name}` }).toBe(true);
    }
    async confirmAction(action, accept, diagnostic) {
        let observed = false;
        const handler = async (dialog) => {
            observed = true;
            if (accept)
                await dialog.accept();
            else
                await dialog.dismiss();
        };
        this.page.once('dialog', handler);
        try {
            await action();
            if (!observed) {
                const dialog = this.page.locator('.swal2-popup:visible,[role="dialog"]:visible').last();
                await (0, test_1.expect)(dialog, diagnostic || 'Expected a deletion/archive confirmation').toBeVisible();
                await dialog.getByRole('button', { name: accept ? /^(Yes|Confirm|Delete|OK)/i : /Cancel|No/i }).first().click();
            }
        }
        finally {
            this.page.off('dialog', handler);
        }
    }
    async assertInputLimit(field, max) {
        await (0, test_1.expect)(field).toHaveAttribute('maxlength', String(max));
        await field.fill('A'.repeat(max));
        await field.press('End');
        await field.pressSequentially('B');
        (0, test_1.expect)((await field.inputValue()).length).toBe(max);
    }
    async exportExcel(info) {
        const checkboxes = this.page.locator('tr[data-instance-id] input[type="checkbox"]').filter({ visible: true });
        (0, test_1.expect)(await checkboxes.count(), 'Export needs a nonempty, deliberately filtered fixture scope').toBeGreaterThan(0);
        for (const checkbox of await checkboxes.all())
            await checkbox.check();
        await this.page.getByRole('button', { name: /Actions/ }).first().click();
        await this.page.getByText('Export', { exact: true }).filter({ visible: true }).first().click();
        const exportForm = this.page.locator('form').filter({ has: this.page.locator('[name="hlv_export_name"]') }).filter({ visible: true }).last();
        await (0, test_1.expect)(exportForm).toBeVisible();
        await exportForm.locator('[name="hlv_export_format"]').selectOption('xlsx');
        const all = exportForm.locator('#select-all-export-fields');
        if (await all.count())
            await all.check();
        else
            for (const checkbox of await exportForm.locator('input[name="selected_fields"]').all())
                await checkbox.check();
        await info.attach('export-scope', { body: await exportForm.innerText(), contentType: 'text/plain' });
        const downloadPromise = this.page.waitForEvent('download');
        await exportForm.locator('button[type="submit"]').click();
        const { saveDownload } = await Promise.resolve().then(() => __importStar(require('../utils/file-utils')));
        return saveDownload(await downloadPromise, info);
    }
}
exports.BasePage = BasePage;
