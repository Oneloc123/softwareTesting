"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformancePage = void 0;
const test_1 = require("@playwright/test");
const base_page_js_1 = require("./base.page.js");
const urls_js_1 = require("../constants/urls.js");
class PerformancePage extends base_page_js_1.BasePage {
    get rows() { return this.page.locator('#meetingManagerContainer tr[data-instance-id]').filter({ visible: true }); }
    get meetingForm() { return this.page.locator('form').filter({ has: this.page.locator('input[name="title"]') }).first(); }
    get responseForm() { return this.page.locator('form').filter({ has: this.page.locator('[name="response"]') }).first(); }
    row(title) { return this.rows.filter({ has: this.page.getByText(title, { exact: true }) }); }
    async goto() { await this.open(urls_js_1.URLS.meetings, '#filterForm'); await (0, test_1.expect)(this.page.locator('#meetingManagerContainer')).toBeVisible(); await this.listReady(this.rows); }
    async search(value) {
        await this.update(async () => { const search = this.filter.locator('[name="search"]').first(); await search.fill(value); await search.press('Enter'); }, /\/pms\/meetings-list\//);
    }
    async apply() { await this.openFilter(); await this.update(() => this.filter.locator('#applyFilter').click(), /\/pms\/meetings-list\//); }
    async openCreate() {
        await this.goto();
        await this.page.getByText('Create', { exact: true }).first().click();
        await (0, test_1.expect)(this.meetingForm.locator('[name="title"]')).toBeVisible();
    }
    async fill(data) {
        const form = this.meetingForm;
        await form.locator('[name="title"]').fill(data.title);
        await form.locator('[name="date"]').fill(data.date);
        if (data.employees.length)
            await this.select2(form, 'employee_id', data.employees);
        if (data.managers.length)
            await this.select2(form, 'manager', data.managers);
        if (data.answerable?.length)
            await this.select2(form, 'answer_employees', data.answerable);
        if (data.template)
            await this.select2(form, 'question_template', data.template);
    }
    async create(data) {
        await this.openCreate();
        await this.fill(data);
        await this.submit(this.meetingForm);
        await this.goto();
        await this.search(data.title);
        await (0, test_1.expect)(this.row(data.title), 'Created meeting must persist').toHaveCount(1);
        return (await this.row(data.title).getAttribute('data-instance-id'));
    }
    async edit(title) {
        await this.goto();
        await this.search(title);
        await this.row(title).getByTitle('Edit', { exact: true }).click();
        await (0, test_1.expect)(this.meetingForm.locator('[name="title"]')).toBeVisible();
    }
    async details(title) {
        await this.goto();
        await this.search(title);
        await this.row(title).locator('td').nth(1).click();
        await (0, test_1.expect)(this.modal).toContainText(title);
        await (0, test_1.expect)(this.modal).toContainText('Minutes of Meeting');
    }
    async openMoM(title) {
        await this.details(title);
        await this.modal.getByTitle('Add MoM', { exact: true }).click();
        await (0, test_1.expect)(this.page.getByRole('heading', { name: 'Add Response', exact: true, includeHidden: true }).filter({ visible: true })).toBeVisible();
        await (0, test_1.expect)(this.page.locator('.note-editable[contenteditable="true"]')).toBeVisible();
    }
    async writeMoM(title, text) {
        await this.openMoM(title);
        await this.page.locator('.note-editable[contenteditable="true"]').fill(text);
        await this.submit(this.responseForm);
    }
    async archive(title, archived = true) {
        await this.goto();
        await this.search(title);
        const row = this.row(title);
        await this.confirmAction(() => row.getByTitle(archived ? 'Archive' : /Un.?archive/i).click(), true);
    }
    async delete(title, accept = true) {
        await this.goto();
        await this.search(title);
        const row = this.row(title);
        if (!await row.count())
            return;
        await this.confirmAction(() => row.getByTitle('Delete', { exact: true }).click(), accept);
        await this.goto();
        await this.search(title);
        await (0, test_1.expect)(this.row(title)).toHaveCount(accept ? 0 : 1);
    }
    async assertSelections(data) {
        const form = this.meetingForm;
        for (const [name, labels] of Object.entries({ employee_id: data.employees, manager: data.managers, answer_employees: data.answerable || [] })) {
            const actual = await form.locator(`[name="${name}"] option:checked`).allTextContents();
            (0, test_1.expect)(actual.map(s => s.trim()).sort()).toEqual([...labels].sort());
        }
    }
}
exports.PerformancePage = PerformancePage;
