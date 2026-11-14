"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
// Demo Horilla chậm + HTMX nạp bất đồng bộ -> nới timeout để không fail oan.
const expect = test_1.expect.configure({ timeout: 15_000 });
test_1.test.describe.configure({ timeout: 600_000 });
/* =====================================================================
 *  Horilla HRMS – Tickets > Configuration  (TC_TicketsConfig_01 … 28)
 *  3 tab: Department Managers | Ticket Types | Ticket Tags
 *  Tác giả: Nguyễn Đình Hiếu – Group12
 *
 *  Nguyên tắc: KHÔNG fix cứng dữ liệu nền. Mọi dữ liệu (phòng ban, quản lý,
 *  loại ticket, prefix, tag, tổng số bản ghi...) đọc trực tiếp từ giao diện
 *  rồi so sánh. Chỉ dữ liệu test do chính script tạo ra mới có giá trị cố định.
 *
 *  .env (tuỳ chọn):
 *    TICKETS_URL=/helpdesk/helpdesk-settings-view/
 *    EMP_USER / EMP_PASS  -> tài khoản nhân viên thường (TC_27, không có thì skip)
 * ===================================================================== */
const TICKETS_URL = process.env.TICKETS_URL ?? '/helpdesk/helpdesk-settings-view/';
const EMP_USER = process.env.EMP_USER ?? '';
const EMP_PASS = process.env.EMP_PASS ?? '';
/** Timeout riêng cho các TC thêm Department Manager (08, 09, 10): 1 phút – chỉnh số này (ms) nếu cần */
const DEPT_CREATE_TIMEOUT = 60_000;
const RUN = Date.now().toString().slice(-5); // hậu tố để tên dữ liệu test không đụng nhau
/** browser.newContext() KHÔNG kế thừa baseURL của project -> tự truyền vào (beforeAll/afterAll dọn dẹp trước đây bị lỗi im lặng vì thiếu baseURL) */
const baseURL = () => test_1.test.info().project.use.baseURL ?? process.env.BASE_URL ?? 'https://hr.demo.horilla.com';
const ctxOpts = (admin = true) => ({ baseURL: baseURL(), ...(admin ? { storageState: '.auth/admin.json' } : {}) });
const DEPT = { key: 'dept', idx: 0, label: 'Department Managers', title: 'Department managers', desc: 'Assign managers responsible for helpdesk tickets per department.', cols: ['Department', 'Manager'] };
const TYPES = { key: 'types', idx: 1, label: 'Ticket Types', title: 'Ticket Type', desc: 'Define categories of helpdesk tickets.', cols: ['Ticket Type', 'Type', 'Prefix'] };
const TAGS = { key: 'tags', idx: 2, label: 'Ticket Tags', title: 'Ticket Tags', desc: 'Create tags for classifying tickets.', cols: ['Title', 'Color'] };
const ALL_TABS = [DEPT, TYPES, TAGS];
const F = {
    dept: { department: { names: ['department'], label: 'Department' }, manager: { names: ['manager'], label: 'Manager' } },
    type: { title: { names: ['title', 'name'], label: 'Title' }, type: { names: ['type'], label: 'Type' }, prefix: { names: ['prefix'], label: 'Prefix' } },
    tag: { title: { names: ['title', 'name'], label: 'Title' }, color: { names: ['color'], label: 'Color' } },
};
const SEL = {
    tabBtn: 'button.oh-tabs__tab',
    pane: '.oh-tabs__content--active',
    rows: 'table tbody tr[data-instance-id]',
    headers: 'table thead th',
    search: 'input[name="search"]',
    rowCheck: 'input.list-table-row',
    allCheck: 'table thead input.bulk-list-table-row',
    selectBtn: 'button[id^="select_"]',
    modal: '#genericModalBody',
    modalWrap: '#genericModal',
    toast: '#reloadMessages > *, .oh-alert, .oh-toast, .swal2-popup, [role="alert"]',
};
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const low = (s) => norm(s).toLowerCase();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sameText = (a, b) => low(a) === low(b) || low(a).includes(low(b)) || low(b).includes(low(a));
const parseEmp = (s) => { const m = norm(s).match(/^(.+?)\s*\((.+)\)$/); return { name: m?.[1] ?? norm(s), badge: m?.[2] ?? '' }; };
const note = (description) => test_1.test.info().annotations.push({ type: 'note', description });
const anyCol = (kw) => (r) => Object.entries(r).some(([k, v]) => k !== 'id' && low(v).includes(kw.toLowerCase()));
const rowStr = (r) => JSON.stringify(Object.entries(r).sort());
/** Bản ghi test do script tạo ra – dùng chung giữa các TC nối tiếp & dọn dẹp ở afterAll */
const created = { dept: [], types: [], tags: [] };
const STATE = { dept: null, type: null, tag: null, restore: [] };
const forget = (t, id) => {
    const i = created[t.key].indexOf(id);
    if (i >= 0)
        created[t.key].splice(i, 1);
};
/* ---------------------- helper thao tác với <select> ---------------------- */
async function nativeOptions(loc) {
    return loc.evaluate(el => {
        if (el.tagName.toLowerCase() !== 'select')
            return [];
        return Array.from(el.options)
            .filter(o => o.value !== '' && !/^[-\s]*$/.test(o.text))
            .map(o => ({ value: o.value, text: o.text.replace(/\s+/g, ' ').trim() }));
    });
}
async function setNative(loc, value) {
    await loc.evaluate((el, v) => {
        const s = el;
        s.value = v;
        s.dispatchEvent(new Event('input', { bubbles: true }));
        s.dispatchEvent(new Event('change', { bubbles: true }));
        const jq = window.jQuery ?? window.$;
        jq?.(s).trigger('change').trigger('change.select2');
    }, value);
}
const isSorted = (vals, key, dir) => vals.every((v, i) => i === 0 || (dir === 'asc' ? key(vals[i - 1]) <= key(v) : key(vals[i - 1]) >= key(v)));
class TicketsPage {
    page;
    errors = []; // mọi response >= 500
    constructor(page) {
        this.page = page;
        page.on('response', r => {
            if (r.status() >= 500)
                this.errors.push(`${r.status()} ${r.url()}`);
        });
    }
    /* ------------------------------ điều hướng ------------------------------ */
    async goto(t = DEPT) {
        await this.page.goto(TICKETS_URL);
        await expect(this.page.locator(SEL.tabBtn).first()).toBeVisible();
        await this.openTab(t);
    }
    /** Chờ HTMX xong việc (không còn request/swap đang chạy). Giới hạn thời gian để không treo nếu có loader luôn bật. */
    async idle(timeout = 8000) {
        await this.page.waitForFunction(() => !document.querySelector('.htmx-request, .htmx-swapping'), null, { timeout }).catch(() => { });
    }
    async settle(timeout = 8000) {
        await this.idle(timeout);
        await this.page.waitForLoadState('networkidle').catch(() => { });
    }
    /** Đếm số dòng sau khi DOM đã ổn định (tránh đọc đúng lúc HTMX đang swap bảng) */
    async stableRows() {
        let prev = -1;
        for (let i = 0; i < 20; i++) {
            const n = await this.rows.count();
            if (n === prev)
                return n;
            prev = n;
            await this.page.waitForTimeout(150);
        }
        return prev;
    }
    async gotoViaMenu() {
        const menu = this.page.locator('button.sideboxmain').filter({ hasText: /Tickets/i })
            .or(this.page.locator('button.sideboxmain[data-menu*="Ticket" i], button.sideboxmain[data-menu*="Helpdesk" i]')).first();
        try {
            await menu.hover({ timeout: 5000 });
            await this.page.locator('#sidebarFlyout').locator('a').filter({ hasText: /^\s*Configuration\s*$/ }).first().click({ timeout: 5000 });
        }
        catch {
            note('Không bấm được menu Tickets > Configuration trên sidebar -> vào thẳng bằng URL');
            await this.page.goto(TICKETS_URL);
        }
        await expect(this.page.locator(SEL.tabBtn).first()).toBeVisible();
        await this.openTab(DEPT);
    }
    tabBtn(t) { return this.page.locator(SEL.tabBtn).nth(t.idx); }
    // Chỉ lấy pane đang hiển thị. Selector dạng dấu phẩy trước đây có thể
    // chọn nhầm pane mang class active nhưng đã bị ẩn sau lần HTMX chuyển tab.
    get pane() { return this.page.locator('.oh-tabs__content:visible').first(); }
    /** Trang có thể đang tự khôi phục tab / đang nạp HTMX ngay sau khi load -> phải chờ yên rồi mới bấm,
     *  nếu không click bị ghi đè (tab không bao giờ có class --active). Bấm lại tối đa 4 lần. */
    async openTab(t) {
        const btn = this.tabBtn(t);
        const active = async () => ((await btn.getAttribute('class')) ?? '').includes('oh-tabs__tab--active');
        await this.settle();
        for (let i = 0; i < 4 && !(await active()); i++) {
            await btn.click();
            await expect.poll(active, { timeout: 8000 }).toBe(true).catch(() => { });
            await this.settle();
        }
        await expect(btn).toHaveClass(/oh-tabs__tab--active/);
        await expect(this.rows.first()).toBeVisible();
        await this.settle();
    }
    /** Tải lại trang rồi mở đúng tab (F5 luôn quay về tab đầu tiên) */
    async reopen(t) { await this.goto(t); }
    async badge(t) {
        const txt = await this.tabBtn(t).locator('.tab-badge').first().innerText();
        return Number(txt.replace(/\D/g, ''));
    }
    /* ---------------------------- đọc dữ liệu bảng --------------------------- */
    get rows() { return this.pane.locator(SEL.rows); }
    row(id) { return this.pane.locator(`${SEL.rows}[data-instance-id="${id}"]`); }
    async ids() { return this.rows.evaluateAll(els => els.map(e => e.getAttribute('data-instance-id') ?? '')); }
    async columnIndex(header) {
        const heads = (await this.pane.locator(SEL.headers).allInnerTexts()).map(low);
        const i = heads.findIndex(h => h === header.toLowerCase());
        expect(i, `Không tìm thấy cột "${header}" trong ${heads.join('|')}`).toBeGreaterThanOrEqual(0);
        return i;
    }
    async column(header) {
        const i = await this.columnIndex(header);
        const cells = this.rows.locator(`td:nth-child(${i + 1})`);
        if (header === 'Color') {
            return cells.evaluateAll(els => els.map(e => {
                const s = e.querySelector('span[style*="background-color"]');
                return s ? getComputedStyle(s).backgroundColor : '';
            }));
        }
        return (await cells.allInnerTexts()).map(norm);
    }
    async snapshot(t) {
        // Đọc ID và các ô của từng hàng trong cùng một lần evaluate để tránh
        // lệch dữ liệu khi HTMX đang thay nội dung bảng giữa nhiều lệnh locator.
        await expect(this.pane).toBeVisible();
        if ((await this.stableRows()) === 0)
            return []; // trạng thái rỗng (tìm không ra): bảng/ header có thể không còn
        const headers = (await this.pane.locator(SEL.headers).allInnerTexts()).map(low);
        const indexes = t.cols.map(h => {
            const i = headers.findIndex(x => x === low(h));
            expect(i, `Không tìm thấy cột "${h}" trong ${headers.join('|')}`).toBeGreaterThanOrEqual(0);
            return i;
        });
        return this.rows.evaluateAll((rows, args) => rows.map(row => {
            const cells = Array.from(row.querySelectorAll(':scope > td'));
            const result = { id: row.getAttribute('data-instance-id') ?? '' };
            args.cols.forEach((header, n) => {
                const cell = cells[args.indexes[n]];
                if (!cell) {
                    result[header] = '';
                    return;
                }
                if (header === 'Color') {
                    const swatch = cell.querySelector('span[style*="background-color"]');
                    result[header] = swatch ? getComputedStyle(swatch).backgroundColor : '';
                }
                else {
                    result[header] = (cell.innerText ?? '').replace(/\s+/g, ' ').trim();
                }
            });
            return result;
        }), { cols: t.cols, indexes });
    }
    async selectCount() {
        const t = await this.pane.locator(SEL.selectBtn).innerText();
        return Number(t.match(/\((\d+)\)/)[1]);
    }
    checked() { return this.rows.locator(`${SEL.rowCheck}:checked`); }
    /** id các dòng có ô `header` chứa thẻ HTML (dữ liệu bẩn: hiển thị khác với giá trị lưu trong DB) */
    async dirtyIds(header) {
        const i = await this.columnIndex(header);
        const flags = await this.rows.evaluateAll((els, idx) => els.map(e => {
            const td = e.querySelector(`td:nth-child(${idx + 1})`);
            return /<(b|i|u|s|em|strong|script|iframe|font|marquee|h\d)[\s>\/]/i.test(td?.innerHTML ?? '') ? (e.getAttribute('data-instance-id') ?? '') : '';
        }), i);
        return new Set(flags.filter(Boolean));
    }
    /* ----------------------------- tìm kiếm / sắp xếp ----------------------- */
    async search(text, field) {
        const box = this.pane.locator(SEL.search).first();
        const sig = () => this.pane.evaluate(el => `${el.querySelectorAll('tr[data-instance-id]').length}|${el.querySelector('table tbody')?.innerHTML ?? ''}`).catch(() => '');
        await expect(box).toBeVisible();
        const before = await sig();
        await box.fill(text);
        let used = false;
        const dd = this.pane.locator('.search-field-dropdown');
        if (text && (await dd.count())) { // Department Managers có dropdown chọn trường tìm kiếm
            await dd.waitFor({ state: 'visible', timeout: 1500 }).catch(() => { });
            if (await dd.isVisible().catch(() => false)) {
                const opts = dd.locator('a.search-field-option');
                const option = field ? opts.filter({ hasText: field }).first() : opts.first();
                await option.click();
                used = true;
            }
        }
        if (!used)
            await box.press('Enter');
        // Chờ bảng thực sự được cập nhật thay vì chỉ chờ một khoảng thời gian cố định.
        // Nếu kết quả mới có HTML giống hệt kết quả cũ (ví dụ tìm ra toàn bộ dòng),
        // không để test timeout chỉ vì DOM không đổi; networkidle là điều kiện dự phòng.
        await expect.poll(sig, { timeout: 2500 }).not.toBe(before).catch(() => { });
        await this.page.waitForLoadState('networkidle').catch(() => { });
        await this.page.waitForTimeout(200);
        await expect(this.pane).toBeVisible();
    }
    /** exact: kết quả phải đúng bằng tập `match` của dữ liệu nền. Mặc định (subset): chỉ yêu cầu mọi dòng trả về đều khớp,
     *  và phải chứa các dòng `must` (nếu có) – dùng khi ô Search có thể không hỗ trợ tìm theo mọi cột */
    async expectSearch(t, kw, base, match, o = {}) {
        await this.search(kw, o.field);
        const got = await this.snapshot(t);
        const gotIds = got.map(r => r.id);
        got.forEach(r => expect(match(r), `Từ khóa "${kw}" trả về dòng không khớp: ${rowStr(r)}`).toBeTruthy());
        const must = o.exact ? base.filter(match) : (o.must ? base.filter(o.must) : []);
        must.forEach(r => expect(gotIds, `Từ khóa "${kw}" thiếu dòng ${rowStr(r)}`).toContain(r.id));
        if (o.exact)
            expect(gotIds.sort()).toEqual(base.filter(match).map(r => r.id).sort());
        else if (got.length === 0 && base.some(match))
            note(`Ô Search không tìm theo nội dung này ("${kw}") – thực tế 0 kết quả`);
        return got;
    }
    async sortBy(header) {
        const th = this.pane.locator(SEL.headers).filter({ hasText: new RegExp(`^\\s*${escapeRe(header)}\\s*$`) });
        const resp = this.page.waitForResponse(r => r.url().includes('sortby='), { timeout: 10000 }).catch(() => null);
        await th.locator('div[hx-get]').first().click();
        await resp;
        await this.page.waitForLoadState('networkidle');
    }
    /* --------------------------------- form ---------------------------------- */
    get modal() { return this.page.locator('.oh-modal--show #genericModalBody').or(this.page.locator('#genericModalBody')).first(); }
    field(f) {
        const css = f.names.flatMap(n => [`select[name="${n}"]`, `input[name="${n}"]:not([type="hidden"])`, `textarea[name="${n}"]`, `#id_${n}`]).join(', ');
        return this.modal.locator(css).or(this.modal.getByLabel(f.label, { exact: false })).first();
    }
    createBtn() { return this.pane.locator('a[hx-get]').filter({ hasText: /^\s*Create\s*$/ }).first(); }
    async clickCreate() {
        // Modal sót từ thao tác trước có thể phủ lên nút Create và chặn click.
        await this.closeModalIfOpen();
        const create = this.createBtn();
        await create.waitFor({ state: 'visible' });
        await create.click();
        await expect(this.modal.locator('form').first()).toBeVisible();
    }
    async openEdit(id) {
        await this.closeModalIfOpen();
        const btn = this.row(id).locator('[title="Edit"]');
        await btn.scrollIntoViewIfNeeded();
        await btn.click({ force: true });
        await expect(this.modal.locator('form').first()).toBeVisible();
    }
    saveBtn() {
        const form = this.modal.locator('form').first();
        return form.locator('button, input[type="submit"]').filter({ hasText: /^\s*Save\s*$/i })
            .or(form.locator('input[type="submit"][value="Save"]'))
            .or(form.locator('button[type="submit"]').filter({ hasNotText: /another/i })).first();
    }
    async modalOpen() {
        return this.page.locator(SEL.modalWrap).evaluate(e => e.classList.contains('oh-modal--show')).catch(() => false);
    }
    async closeModalIfOpen() {
        const wrap = this.page.locator(SEL.modalWrap);
        if (!(await this.modalOpen()))
            return;
        const close = wrap.locator('.oh-modal__close, [data-dismiss="modal"], [aria-label="Close"]').first();
        if (await close.isVisible().catch(() => false)) {
            await close.click();
        }
        else {
            await this.page.keyboard.press('Escape');
        }
        // Một số modal HTMX giữ lại class hiển thị dù aria-hidden đã bật.
        const closed = await expect.poll(() => this.modalOpen(), { timeout: 1500 })
            .toBe(false).then(() => true).catch(() => false);
        if (!closed) {
            await this.page.evaluate(() => {
                const modal = document.querySelector('#genericModal');
                modal?.classList.remove('oh-modal--show');
                modal?.setAttribute('aria-hidden', 'true');
                document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                document.body.classList.remove('modal-open');
                document.body.style.removeProperty('padding-right');
            });
        }
    }
    async choose(f, o = {}) {
        const loc = this.field(f);
        const ex = (o.exclude ?? []).map(low);
        const ok = (t) => !/^\s*-{2,}/.test(t) && !ex.includes(low(t)) && (!o.match || o.match.test(t)); // bỏ placeholder "---Choose ...---"
        const native = await nativeOptions(loc);
        const s2 = loc.locator('xpath=following-sibling::span[contains(@class,"select2")]').first();
        const hasSelect2 = await s2.isVisible().catch(() => false);
        if (native.length && !hasSelect2) {
            const hit = native.find(x => ok(x.text));
            if (!hit)
                throw new Error(`Không có option phù hợp cho "${f.label}" (có: ${native.map(x => x.text).join(' | ')})`);
            await setNative(loc, hit.value);
            return hit.text;
        }
        // Chỉ thao tác với Select2 đang hiển thị và danh sách option thuộc dropdown
        // đang mở; tránh click nhầm option ẩn còn sót từ modal/tab trước.
        const select2Container = loc.locator('xpath=following-sibling::span[contains(@class,"select2")]').first();
        await select2Container.waitFor({ state: 'visible', timeout: 5000 });
        await select2Container.click();
        const openResults = this.page.locator('.select2-container--open .select2-results__option[role="option"]:visible');
        await expect(openResults.first()).toBeVisible({ timeout: 5000 });
        const texts = (await openResults.allInnerTexts()).map(norm);
        const i = texts.findIndex(ok);
        if (i < 0) {
            await this.page.keyboard.press('Escape');
            throw new Error(`Không có option phù hợp cho "${f.label}" (có: ${texts.join(' | ')})`);
        }
        await openResults.nth(i).click();
        await expect(select2Container.locator('.select2-selection__rendered')).toContainText(texts[i]);
        return texts[i];
    }
    /** Chọn option có nội dung đúng bằng `text`; nếu không có thì chọn option chứa tên (bỏ phần "(mã NV)") */
    async chooseLike(f, text) {
        try {
            return await this.choose(f, { match: new RegExp(`^${escapeRe(text)}$`, 'i') });
        }
        catch {
            return this.choose(f, { match: new RegExp(escapeRe(parseEmp(text).name), 'i') });
        }
    }
    async optionTexts(f) {
        const loc = this.field(f);
        const native = await nativeOptions(loc);
        if (native.length)
            return native.map(x => x.text);
        await loc.locator('xpath=following-sibling::span[contains(@class,"select2")]').first().click();
        const items = this.page.locator('.select2-results__option[role="option"]');
        await expect(items.first()).toBeVisible();
        const texts = (await items.allInnerTexts()).map(norm);
        await this.page.keyboard.press('Escape');
        return texts;
    }
    async selectedText(f) {
        return norm(await this.field(f).evaluate(el => el.tagName.toLowerCase() === 'select'
            ? ((el.selectedOptions[0]?.value ?? '') !== '' ? el.selectedOptions[0].text : '')
            : el.value));
    }
    async setText(f, v) { const l = this.field(f); await l.fill(''); await l.fill(v); }
    /** Ô Color có thể là input color / select / text: tự nhận biết. Trả về loại ô & giá trị đã đặt */
    async setColor(hex, exclude = []) {
        const loc = this.field(F.tag.color);
        if (!(await loc.count()))
            return { kind: 'none', value: '' };
        const info = await loc.evaluate(el => ({ tag: el.tagName.toLowerCase(), type: el.type ?? '' }));
        if (info.tag === 'select')
            return { kind: 'select', value: await this.choose(F.tag.color, { exclude }) };
        await loc.fill(hex);
        return { kind: info.type === 'color' ? 'color' : 'text', value: hex };
    }
    async save() {
        const form = this.modal.locator('form').first();
        await expect(form).toBeVisible();
        const button = this.saveBtn();
        await button.waitFor({ state: 'visible' });
        await button.click();
        await this.page.waitForLoadState('networkidle').catch(() => { });
    }
    /** Lưu form -> đóng modal -> tải lại đúng tab -> trả về bản ghi MỚI xuất hiện (rỗng nếu bị từ chối) */
    async submitAndDiff(t, opts = {}) {
        const before = new Set(await this.ids());
        await this.save();
        if (opts.toast) {
            const shown = await this.page.locator(SEL.toast).first().waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false);
            if (!shown)
                note('Không bắt được thông báo thành công (toast) sau khi lưu');
        }
        await this.closeModalIfOpen();
        await this.reopen(t);
        const fresh = (await this.snapshot(t)).filter(r => !before.has(r.id));
        created[t.key].push(...fresh.map(r => r.id));
        return fresh;
    }
    async attempt(t, fill) {
        await this.clickCreate();
        await fill();
        return this.submitAndDiff(t);
    }
    async attemptEdit(t, id, fill) {
        await this.openEdit(id);
        await fill();
        // Xác nhận form vẫn mở và thao tác sửa không bị nhắm nhầm vào modal ẩn.
        await expect(this.modal.locator('form').first()).toBeVisible();
        await this.save();
        await this.closeModalIfOpen();
        await this.reopen(t);
        return (await this.snapshot(t)).find(r => r.id === id);
    }
    /* --------------------------------- xoá ----------------------------------- */
    async withDialog(action, accept = true) {
        let msg = '';
        const handler = async (d) => { msg = d.message(); accept ? await d.accept() : await d.dismiss(); };
        this.page.on('dialog', handler);
        try {
            await action();
            await this.page.waitForLoadState('networkidle');
        }
        finally {
            this.page.off('dialog', handler);
        }
        return msg;
    }
    /** Xoá 1 dòng. Hai kiểu xác nhận trong Horilla:
     *  - Department Managers & Ticket Tags: nút có hx-confirm -> hiện popup SweetAlert2 (.swal2-popup, nút .swal2-confirm / .swal2-cancel)
     *    (KHÔNG phải confirm() của trình duyệt nên page.on('dialog') không bắt được)
     *  - Ticket Types: nút hx-get /generic-delete/ -> modal #deleteConfirmation (tab Summary/Ticket + nút xác nhận)
     *  Trả về nội dung thông điệp xác nhận ('' nếu không có hộp thoại nào). */
    async deleteRow(id, accept = true) {
        let msg = '';
        const handler = async (d) => { msg = d.message(); accept ? await d.accept() : await d.dismiss(); }; // dự phòng: confirm() gốc
        this.page.on('dialog', handler);
        try {
            await this.closeModalIfOpen();
            const link = this.row(id).locator('[title="Delete"]');
            await link.scrollIntoViewIfNeeded();
            const swal = (await link.getAttribute('hx-confirm')) !== null;
            await link.click();
            if (swal) {
                const popup = this.page.locator('.swal2-popup').first();
                const shown = await popup.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
                if (shown) {
                    msg = norm(await this.page.locator('#swal2-html-container').innerText());
                    await this.page.locator(accept ? '.swal2-confirm' : '.swal2-cancel').click();
                    await popup.waitFor({ state: 'hidden', timeout: 8000 }).catch(() => { });
                }
            }
            else {
                const body = this.page.locator('#deleteConfirmationBody');
                await expect(body.locator('*').first(), 'Modal xác nhận xoá không nạp được nội dung').toBeAttached({ timeout: 10000 });
                await this.idle();
                msg = norm(await body.innerText());
                if (accept) {
                    const candidates = [
                        body.getByRole('button', { name: /^\s*(confirm|delete|yes|ok|remove|proceed)\b/i }),
                        body.locator('form button[type="submit"], form input[type="submit"]'),
                        body.locator('button.oh-btn--danger, a.oh-btn--danger, [hx-post], [hx-delete]'),
                    ];
                    let clicked = false;
                    for (const c of candidates) {
                        const btn = c.first();
                        if (await btn.isVisible().catch(() => false)) {
                            await btn.click();
                            clicked = true;
                            break;
                        }
                    }
                    if (!clicked)
                        throw new Error(`Modal xoá không có nút xác nhận (có thể bản ghi đang được ticket sử dụng). Nội dung: ${msg}`);
                }
                else {
                    const cancel = body.getByRole('button', { name: /^\s*(cancel|close|no)\s*$/i })
                        .or(this.page.locator('#deleteConfirmation .oh-modal__close, #deleteConfirmation [aria-label="Close"]')).first();
                    if (await cancel.isVisible().catch(() => false))
                        await cancel.click();
                    else
                        await this.page.keyboard.press('Escape');
                }
            }
            await this.settle();
        }
        finally {
            this.page.off('dialog', handler);
        }
        await this.page.evaluate(() => {
            document.querySelector('#deleteConfirmation')?.classList.remove('oh-modal--show');
            document.querySelectorAll('.swal2-container').forEach(el => el.remove());
        }).catch(() => { });
        return msg;
    }
    /** Khôi phục các dòng Department Manager được xoá tạm trước TC_08. */
    async restoreDept() {
        const restoreRows = [...STATE.restore];
        if (!restoreRows.length)
            return;
        await this.reopen(DEPT);
        for (const r of restoreRows) {
            const rows = await this.snapshot(DEPT);
            // Nếu phòng ban đã có lại đúng quản lý thì không tạo trùng.
            if (rows.some(x => low(x.Department) === low(r.Department) && low(x.Manager) === low(r.Manager)))
                continue;
            await this.clickCreate();
            await this.chooseLike(F.dept.department, r.Department);
            await this.chooseLike(F.dept.manager, r.Manager);
            await this.save();
            await this.closeModalIfOpen();
            await this.reopen(DEPT);
        }
        STATE.restore = [];
    }
    async deleteIfExists(t, id) {
        await this.reopen(t);
        if (await this.row(id).isVisible().catch(() => false)) {
            await this.deleteRow(id, true);
            await this.reopen(t);
        }
    }
    async purge(t, ids) {
        for (const id of ids) {
            await this.deleteIfExists(t, id);
            forget(t, id);
        }
    }
    /* ------------------------------ dữ liệu test ----------------------------- */
    /** Prefix 3 ký tự chưa tồn tại trong danh sách hiện có */
    uniquePrefix(existing, skip = []) {
        const used = [...existing, ...skip].map(low);
        for (const a of 'QXZ')
            for (const b of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
                const p = `${a}${b}${RUN.slice(-1)}`.replace(/\d/, 'T');
                if (!used.includes(low(p)))
                    return p;
            }
        return 'ZZZ';
    }
}
async function login(page, user, pass) {
    await page.goto('/login/');
    await page.locator('input[name="username"], #id_username, input[type="text"]').first().fill(user);
    await page.locator('input[type="password"]').first().fill(pass);
    await page.getByText('Sign In', { exact: false }).last().click();
    await page.waitForURL(u => !/login/.test(u.toString()));
}
let tp;
test_1.test.beforeEach(async ({ page }) => { tp = new TicketsPage(page); });
/** Dữ liệu rác do các lần chạy trước để lại (tên có hậu tố 5 chữ số của RUN) */
const STALE = [
    [TYPES, 'Ticket Type', /^(Hardware Request|Only Title|No Prefix|Dup Prefix|Prefix Test) \d{5}/],
    [TAGS, 'Title', /^((Software|No Color) \d{5}|tag \d{5}$)/i], // "<b>tag</b> 12345" hiển thị thành "tag 12345"
];
async function sweepStale(browser) {
    const ctx = await browser.newContext(ctxOpts(true));
    const page = await ctx.newPage();
    const cleaner = new TicketsPage(page);
    try {
        for (const [t, col, re] of STALE) {
            for (let guard = 0; guard < 25; guard++) {
                await cleaner.reopen(t);
                const hit = (await cleaner.snapshot(t)).find(r => re.test(r[col]));
                if (!hit)
                    break;
                await cleaner.deleteRow(hit.id, true);
            }
        }
    }
    finally {
        await ctx.close();
    }
}
test_1.test.beforeAll(async ({ browser }) => {
    test_1.test.setTimeout(180000);
    await sweepStale(browser).catch(() => { });
});
test_1.test.afterAll(async ({ browser }) => {
    test_1.test.setTimeout(180000);
    const ctx = await browser.newContext(ctxOpts(true));
    const page = await ctx.newPage();
    const cleaner = new TicketsPage(page);
    for (const t of ALL_TABS)
        for (const id of [...created[t.key]])
            await cleaner.deleteIfExists(t, id).catch(() => { });
    await cleaner.restoreDept().catch(() => { });
    await ctx.close();
    await sweepStale(browser).catch(() => { });
});
/* ============================ 3.1 Tổng quan trang ======================== */
test_1.test.describe('3.1 Page layout', () => {
    (0, test_1.test)('TC_TicketsConfig_01 – Điều hướng, Breadcrumb, 3 tab & tab mặc định', async ({ page }) => {
        await page.goto('/dashboard/');
        await tp.gotoViaMenu();
        const crumb = page.locator('ul.breadcrumb');
        await expect(crumb).toContainText('Horilla');
        const crumbCurrent = crumb.locator('.oh-breadcrumb-current').or(crumb).or(page.locator('.oh-main-header, .oh-inner-sidebar, h4, h5'));
        await expect(crumbCurrent.first()).toContainText('Configuration');
        await expect(page.locator('#sidebar a.oh-sidebar-active-link[href*="helpdesk-settings"]').first()).toBeAttached();
        if (!/Tickets/i.test(await crumb.innerText()))
            note('Breadcrumb thực tế không có cấp "Tickets" (kỳ vọng Excel: Horilla > Tickets > Configuration)');
        const tabs = page.locator(SEL.tabBtn);
        await expect(tabs).toHaveCount(3);
        for (const t of ALL_TABS) {
            await expect(tp.tabBtn(t)).toContainText(t.label);
            expect(await tp.badge(t), `Badge của tab ${t.label} phải là số`).toBeGreaterThanOrEqual(0);
        }
        await tp.openTab(DEPT);
        await expect(tp.pane).toContainText(DEPT.title);
        await expect(tp.rows.first()).toBeVisible();
        expect(await tp.rows.count()).toBeGreaterThan(0);
        expect(tp.errors).toEqual([]);
    });
    (0, test_1.test)('TC_TicketsConfig_02 – Chuyển tab: tiêu đề, mô tả, cột & badge', async ({ page }) => {
        await tp.goto();
        for (const t of [TYPES, TAGS, DEPT]) {
            await tp.openTab(t);
            await expect(tp.pane).toContainText(t.title);
            await expect(tp.pane).toContainText(t.desc);
            const heads = (await tp.pane.locator(SEL.headers).allInnerTexts()).map(norm);
            for (const c of [...t.cols, 'Actions'])
                expect(heads, `Tab ${t.label} thiếu cột ${c}`).toContain(c);
            await expect(tp.pane.locator(SEL.search).first()).toBeVisible();
            await expect(tp.createBtn()).toBeVisible();
            expect(await tp.rows.count(), `Số dòng tab ${t.label} phải bằng badge`).toBe(await tp.badge(t));
            await expect(page.locator(SEL.tabBtn).nth(t.idx)).toHaveClass(/oh-tabs__tab--active/);
        }
        expect(tp.errors).toEqual([]);
    });
    (0, test_1.test)('TC_TicketsConfig_03 – Chọn bản ghi & Select All trên cả 3 tab', async ({ page }) => {
        await tp.goto();
        for (const t of ALL_TABS) {
            await tp.reopen(t);
            const total = await tp.rows.count();
            const one = tp.rows.first();
            const oneCb = one.locator(SEL.rowCheck);
            await oneCb.check();
            await expect(oneCb).toBeChecked();
            await expect(one).toHaveClass(/highlight-selected/);
            const all = tp.pane.locator(SEL.allCheck);
            await all.check();
            await expect(tp.checked()).toHaveCount(total);
            await all.uncheck();
            await expect(tp.checked()).toHaveCount(0);
            await expect(tp.pane.locator(SEL.selectBtn)).toBeVisible();
            expect(await tp.selectCount(), `Tab ${t.label}: nút Select phải bằng tổng số bản ghi`).toBe(total);
            expect(total).toBe(await tp.badge(t));
        }
        await tp.reopen(DEPT); // chọn ở tab này rồi sang tab khác
        const n = Math.min(2, await tp.rows.count());
        for (let i = 0; i < n; i++)
            await tp.rows.nth(i).locator(SEL.rowCheck).check();
        await tp.openTab(TYPES);
        await expect(tp.checked(), 'Lựa chọn của tab trước không được lan sang tab khác').toHaveCount(0);
        await tp.openTab(DEPT);
        note(`Quay lại tab Department Managers: còn ${await tp.checked().count()}/${n} dòng đang chọn`);
        expect(tp.errors).toEqual([]);
    });
    (0, test_1.test)('TC_TicketsConfig_04 – Sắp xếp theo cột trên cả 3 tab', async () => {
        for (const t of ALL_TABS) {
            await tp.reopen(t);
            const total = await tp.rows.count();
            for (const h of t.cols) {
                if (h === 'Color') {
                    await expect(tp.pane.locator(SEL.headers).filter({ hasText: /^\s*Color\s*$/ }).locator('div[hx-get]')).toHaveCount(0);
                    continue;
                }
                await tp.sortBy(h);
                expect(await tp.rows.count()).toBe(total);
            }
        }
        expect(tp.errors).toEqual([]);
    });
    (0, test_1.test)('TC_TicketsConfig_05 – Tìm kiếm không kết quả & ký tự đặc biệt (3 tab)', async ({ page }) => {
        for (const t of ALL_TABS) {
            await tp.reopen(t);
            const total = await tp.rows.count();
            await tp.search('xyz123abc');
            await expect(tp.rows, `Tab ${t.label}: không được có kết quả`).toHaveCount(0);
            await tp.search('!@#$%^&*()');
            await expect(tp.pane).toBeVisible();
            await tp.search('<b>test</b>');
            await expect(tp.pane.locator('table b')).toHaveCount(0); // HTML phải hiển thị như văn bản thường
            await tp.search('');
            await expect(tp.rows).toHaveCount(total);
        }
        expect(tp.errors, 'Không được có lỗi 500').toEqual([]);
    });
});
/* ========================= 3.2 Tab Department Managers =================== */
test_1.test.describe('3.2 Department Managers', () => {
    test_1.test.describe.configure({ mode: 'serial' });
    (0, test_1.test)('TC_TicketsConfig_06 – Hiển thị danh sách Department Managers', async () => {
        await tp.reopen(DEPT);
        const recs = await tp.snapshot(DEPT);
        expect(recs.length).toBeGreaterThan(0);
        expect(recs.length).toBe(await tp.badge(DEPT));
        expect(await tp.selectCount()).toBe(recs.length);
        for (const r of recs) {
            expect(r.Department).not.toBe('');
            expect(r.Manager, 'Manager phải dạng "Họ tên (Mã nhân viên)"').toMatch(/^.+\(.+\)$/);
        }
        await expect(tp.rows.locator('[title="Edit"]')).toHaveCount(recs.length);
        await expect(tp.rows.locator('[title="Delete"]')).toHaveCount(recs.length);
        const depts = recs.map(r => low(r.Department));
        if (new Set(depts).size !== depts.length)
            note('Một phòng ban có nhiều dòng quản lý (hệ thống cho phép nhiều quản lý/phòng ban)');
    });
    (0, test_1.test)('TC_TicketsConfig_07 – Tìm kiếm Department Managers', async () => {
        await tp.reopen(DEPT);
        const base = await tp.snapshot(DEPT);
        const dept = base[0].Department.slice(0, 3).toLowerCase();
        const mgrFirst = parseEmp(base[Math.min(1, base.length - 1)].Manager).name.split(' ')[0];
        const badge = parseEmp(base[Math.min(2, base.length - 1)].Manager).badge;
        await tp.expectSearch(DEPT, dept, base, r => low(r.Department).includes(dept), { exact: false, field: 'Department' });
        await tp.search('');
        await tp.expectSearch(DEPT, mgrFirst.toUpperCase(), base, r => low(r.Manager).includes(mgrFirst.toLowerCase()), { exact: false, field: 'Manager' });
        await tp.search('');
        if (badge)
            await tp.expectSearch(DEPT, badge, base, r => low(r.Manager).includes(badge.toLowerCase()), { exact: false, field: 'Manager' }); // ô tìm Manager theo first_name: 0 kết quả với mã NV là hợp lệ
        await tp.search('');
        expect((await tp.snapshot(DEPT)).length).toBe(base.length);
    });
    (0, test_1.test)('TC_TicketsConfig_08 – Xoá mapping Engineering cũ rồi tạo Department Manager hợp lệ', async ({ page }) => {
        test_1.test.setTimeout(DEPT_CREATE_TIMEOUT);
        await tp.reopen(DEPT);
        let before = await tp.snapshot(DEPT);
        // Engineering được ưu tiên làm dữ liệu thử. Nếu đang có manager gán cho
        // Engineering, xoá mapping cũ trước để không phụ thuộc nhân viên đang được gán.
        const engineeringRows = before.filter(r => low(r.Department) === 'engineering');
        if (engineeringRows.length) {
            for (const old of engineeringRows) {
                await tp.deleteRow(old.id, true);
                STATE.restore.push(old);
                note(`Đã xoá mapping Engineering cũ (${old.Manager}) để tạo mapping mới; sẽ khôi phục sau test`);
            }
            await tp.reopen(DEPT);
            before = await tp.snapshot(DEPT);
        }
        else {
            note('Engineering chưa có mapping Department Manager; bỏ qua bước xoá và tạo mới trực tiếp');
        }
        await tp.clickCreate();
        await expect(tp.field(F.dept.department)).toBeAttached();
        await expect(tp.field(F.dept.manager)).toBeAttached();
        await expect(tp.saveBtn()).toBeVisible();
        const depts = await tp.optionTexts(F.dept.department);
        const managers = await tp.optionTexts(F.dept.manager);
        await tp.closeModalIfOpen();
        // Chọn Engineering nếu tồn tại trong danh sách phòng ban; nếu không thì
        // fallback sang phòng ban chưa có mapping để test vẫn có thể chạy.
        let dept = depts.find(d => low(d) === 'engineering') ??
            depts.find(d => !before.some(e => low(e.Department) === low(d))) ?? '';
        if (!dept) {
            // Không còn phòng ban trống: tạm xoá một mapping khác và ghi lại để restore.
            const victim = before[before.length - 1];
            if (!victim)
                throw new Error('Không có Department nào khả dụng để tạo Department Manager');
            await tp.deleteRow(victim.id, true);
            STATE.restore.push(victim);
            note(`Không còn phòng ban trống -> tạm xoá mapping của "${victim.Department}" để tạo mới; sẽ khôi phục sau test`);
            await tp.reopen(DEPT);
            before = await tp.snapshot(DEPT);
            dept = victim.Department;
        }
        // Thử toàn bộ option Manager do ứng dụng trả về. Không giả định mọi nhân
        // viên đều hợp lệ; chỉ ghi nhận manager khi backend thực sự lưu thành công.
        let fresh = [];
        let manager = '';
        for (const m of managers) {
            try {
                fresh = await tp.attempt(DEPT, async () => {
                    await tp.chooseLike(F.dept.department, dept);
                    await tp.chooseLike(F.dept.manager, m);
                });
                if (fresh.length) {
                    manager = m;
                    break;
                }
            }
            catch (error) {
                await tp.closeModalIfOpen().catch(() => { });
                note(`Bỏ qua Manager "${m}" vì không chọn/lưu được: ${String(error).slice(0, 180)}`);
            }
        }
        expect(fresh, `Không tạo được Department Manager cho ${dept} với các Manager khả dụng`).toHaveLength(1);
        expect(sameText(fresh[0].Department, dept)).toBeTruthy();
        expect(sameText(fresh[0].Manager, manager)).toBeTruthy();
        STATE.dept = fresh[0];
        await page.reload();
        await tp.openTab(DEPT);
        const after = await tp.snapshot(DEPT);
        expect(after.length).toBe(before.length + 1);
        expect(await tp.badge(DEPT)).toBe(before.length + 1);
        expect(await tp.selectCount()).toBe(before.length + 1);
        expect(after.filter(r => r.id !== fresh[0].id)).toEqual(before);
    });
    (0, test_1.test)('TC_TicketsConfig_09 – Trường bắt buộc khi tạo Department Manager', async () => {
        test_1.test.setTimeout(DEPT_CREATE_TIMEOUT);
        await tp.reopen(DEPT);
        const before = (await tp.ids()).length;
        expect(await tp.attempt(DEPT, async () => { })).toHaveLength(0);
        expect(await tp.attempt(DEPT, async () => { await tp.choose(F.dept.department); })).toHaveLength(0);
        expect(await tp.attempt(DEPT, async () => { await tp.choose(F.dept.manager); })).toHaveLength(0);
        expect((await tp.ids()).length).toBe(before);
        expect(tp.errors).toEqual([]);
    });
    (0, test_1.test)('TC_TicketsConfig_10 – Trùng phòng ban / trùng cả phòng ban & quản lý', async () => {
        test_1.test.setTimeout(DEPT_CREATE_TIMEOUT);
        await tp.reopen(DEPT);
        const base = await tp.snapshot(DEPT);
        const d = base[0];
        const mark = created.dept.length;
        const deptRe = new RegExp(`^${escapeRe(d.Department)}$`, 'i');
        try {
            const a = await tp.attempt(DEPT, async () => {
                await tp.choose(F.dept.department, { match: deptRe });
                await tp.choose(F.dept.manager, { exclude: [d.Manager] });
            });
            note(`Cùng phòng ban "${d.Department}", quản lý khác -> ${a.length ? 'hệ thống cho phép tạo' : 'hệ thống chặn'}`);
            expect(tp.errors).toEqual([]);
            await tp.attempt(DEPT, async () => {
                await tp.choose(F.dept.department, { match: deptRe });
                await tp.choose(F.dept.manager, { match: new RegExp(escapeRe(parseEmp(d.Manager).name), 'i') });
            });
            expect(tp.errors).toEqual([]);
            const now = await tp.snapshot(DEPT);
            expect(now.find(r => r.id === d.id), 'Bản ghi gốc bị mất/ghi đè').toEqual(d);
            const same = now.filter(r => low(r.Department) === low(d.Department) && low(r.Manager) === low(d.Manager));
            expect(same.length, 'Bản ghi trùng hoàn toàn phải bị chặn').toBe(1);
        }
        finally {
            await tp.purge(DEPT, created.dept.slice(mark));
        }
    });
    (0, test_1.test)('TC_TicketsConfig_11 – Chỉnh sửa Department Manager', async () => {
        test_1.test.skip(!STATE.dept, 'Cần chạy TC_TicketsConfig_08 trước (bản ghi test)');
        const rec = STATE.dept;
        await tp.reopen(DEPT);
        const others = (await tp.snapshot(DEPT)).filter(r => r.id !== rec.id);
        await tp.openEdit(rec.id);
        expect(sameText(await tp.selectedText(F.dept.department), rec.Department), 'Form Edit phải điền sẵn Department').toBeTruthy();
        expect(sameText(await tp.selectedText(F.dept.manager), rec.Manager), 'Form Edit phải điền sẵn Manager').toBeTruthy();
        const managers = await tp.optionTexts(F.dept.manager);
        await tp.closeModalIfOpen();
        let saved = rec; // thử lần lượt các quản lý khác tới khi lưu được
        for (const m of managers.filter(x => !sameText(x, rec.Manager)).slice(0, 5)) {
            const s = await tp.attemptEdit(DEPT, rec.id, async () => { await tp.chooseLike(F.dept.manager, m); });
            if (s && !sameText(s.Manager, rec.Manager)) {
                saved = s;
                break;
            }
        }
        if (saved === rec)
            note('Không đổi được sang quản lý khác (hệ thống từ chối các lựa chọn thử)');
        else
            expect(saved.Department).toBe(rec.Department);
        STATE.dept = saved;
        await tp.openEdit(rec.id); // đổi nhưng đóng, không lưu
        await tp.choose(F.dept.manager, { exclude: [saved.Manager] });
        await tp.closeModalIfOpen();
        await tp.reopen(DEPT);
        const now = await tp.snapshot(DEPT);
        expect(now.find(r => r.id === rec.id).Manager).toBe(saved.Manager);
        expect(now.filter(r => r.id !== rec.id)).toEqual(others);
    });
    (0, test_1.test)('TC_TicketsConfig_12 – Xoá Department Manager (có xác nhận)', async ({ page }) => {
        test_1.test.skip(!STATE.dept, 'Cần chạy TC_TicketsConfig_08 trước (bản ghi test)');
        const rec = STATE.dept;
        await tp.reopen(DEPT);
        const before = await tp.snapshot(DEPT);
        const msg = await tp.deleteRow(rec.id, false); // Hủy
        expect(msg, 'Phải có hộp thoại xác nhận trước khi xóa').not.toBe('');
        await expect(tp.row(rec.id)).toBeVisible();
        await tp.deleteRow(rec.id, true); // Xác nhận
        await page.reload();
        await tp.openTab(DEPT);
        const after = await tp.snapshot(DEPT);
        expect(after.find(r => r.id === rec.id)).toBeUndefined();
        expect(after).toEqual(before.filter(r => r.id !== rec.id));
        expect(await tp.badge(DEPT)).toBe(before.length - 1);
        expect(await tp.selectCount()).toBe(before.length - 1);
        forget(DEPT, rec.id);
        STATE.dept = null;
        await tp.restoreDept(); // khôi phục các mapping đã xoá tạm ở TC_08
    });
});
/* ============================ 3.3 Tab Ticket Types ======================= */
test_1.test.describe('3.3 Ticket Types', () => {
    test_1.test.describe.configure({ mode: 'serial' });
    const TT1 = `Hardware Request ${RUN}`;
    (0, test_1.test)('TC_TicketsConfig_13 – Hiển thị danh sách Ticket Types', async () => {
        await tp.reopen(TYPES);
        const recs = await tp.snapshot(TYPES);
        expect(recs.length).toBeGreaterThan(0);
        expect(recs.length).toBe(await tp.badge(TYPES));
        expect(await tp.selectCount()).toBe(recs.length);
        for (const r of recs) {
            expect(r['Ticket Type']).not.toBe('');
            expect(r.Type).not.toBe('');
        }
        const prefixes = recs.map(r => low(r.Prefix));
        expect(new Set(prefixes).size, 'Prefix của các loại ticket phải khác nhau').toBe(prefixes.length);
        await expect(tp.rows.locator('[title="Edit"]')).toHaveCount(recs.length);
        await expect(tp.rows.locator('[title="Delete"]')).toHaveCount(recs.length);
    });
    (0, test_1.test)('TC_TicketsConfig_14 – Tìm kiếm Ticket Types', async () => {
        await tp.reopen(TYPES);
        const base = await tp.snapshot(TYPES);
        const word = (STATE.type?.['Ticket Type'] ?? base[0]['Ticket Type']).split(' ').pop().toLowerCase();
        const prefix = base[Math.min(1, base.length - 1)].Prefix;
        const type = base[Math.min(2, base.length - 1)].Type.toLowerCase();
        await tp.expectSearch(TYPES, word, base, anyCol(word), { must: r => low(r['Ticket Type']).includes(word) });
        await tp.expectSearch(TYPES, prefix, base, anyCol(prefix));
        await tp.expectSearch(TYPES, type, base, anyCol(type));
        await tp.search('');
        expect((await tp.snapshot(TYPES)).length).toBe(base.length);
    });
    (0, test_1.test)('TC_TicketsConfig_15 – Tạo Ticket Type hợp lệ', async ({ page }) => {
        await tp.reopen(TYPES);
        const before = await tp.snapshot(TYPES);
        const prefix = tp.uniquePrefix(before.map(r => r.Prefix));
        await tp.clickCreate();
        for (const f of [F.type.title, F.type.type, F.type.prefix])
            await expect(tp.field(f), `Thiếu trường "${f.label}"`).toBeAttached();
        await tp.setText(F.type.title, TT1);
        const type = await tp.choose(F.type.type);
        await tp.setText(F.type.prefix, prefix);
        const fresh = await tp.submitAndDiff(TYPES, { toast: true });
        expect(fresh, 'Không tạo được Ticket Type hợp lệ').toHaveLength(1);
        expect(fresh[0]['Ticket Type']).toBe(TT1);
        expect(sameText(fresh[0].Type, type)).toBeTruthy();
        expect(low(fresh[0].Prefix)).toBe(low(prefix));
        STATE.type = fresh[0];
        await page.reload();
        await tp.openTab(TYPES);
        const after = await tp.snapshot(TYPES);
        expect(after.length).toBe(before.length + 1);
        expect(await tp.badge(TYPES)).toBe(before.length + 1);
        expect(await tp.selectCount()).toBe(before.length + 1);
        expect(after.filter(r => r.id !== fresh[0].id)).toEqual(before);
    });
    (0, test_1.test)('TC_TicketsConfig_16 – Trường bắt buộc khi tạo Ticket Type', async () => {
        await tp.reopen(TYPES);
        const existing = (await tp.snapshot(TYPES)).map(r => r.Prefix);
        const prefix = tp.uniquePrefix(existing);
        const before = (await tp.ids()).length;
        expect(await tp.attempt(TYPES, async () => { })).toHaveLength(0);
        expect(await tp.attempt(TYPES, async () => { await tp.setText(F.type.title, `Only Title ${RUN}`); })).toHaveLength(0);
        expect(await tp.attempt(TYPES, async () => {
            await tp.setText(F.type.title, `No Prefix ${RUN}`);
            await tp.choose(F.type.type);
        })).toHaveLength(0);
        expect(await tp.attempt(TYPES, async () => {
            await tp.setText(F.type.title, '   ');
            await tp.choose(F.type.type);
            await tp.setText(F.type.prefix, prefix);
        })).toHaveLength(0);
        expect((await tp.ids()).length).toBe(before);
        expect(tp.errors).toEqual([]);
    });
    (0, test_1.test)('TC_TicketsConfig_17 – Trùng tên / trùng Prefix', async () => {
        await tp.reopen(TYPES);
        const base = await tp.snapshot(TYPES);
        const mark = created.types.length;
        try {
            const a = await tp.attempt(TYPES, async () => {
                await tp.setText(F.type.title, base[0]['Ticket Type']);
                await tp.choose(F.type.type);
                await tp.setText(F.type.prefix, tp.uniquePrefix(base.map(r => r.Prefix)));
            });
            note(`Trùng tên "${base[0]['Ticket Type']}" -> ${a.length ? 'hệ thống cho phép tạo' : 'hệ thống chặn'}`);
            expect(tp.errors).toEqual([]);
            const b = await tp.attempt(TYPES, async () => {
                await tp.setText(F.type.title, `Dup Prefix ${RUN}`);
                await tp.choose(F.type.type);
                await tp.setText(F.type.prefix, base[0].Prefix);
            });
            note(`Trùng prefix "${base[0].Prefix}" -> ${b.length ? 'hệ thống cho phép tạo' : 'hệ thống chặn'}`);
            expect(tp.errors).toEqual([]);
            const now = await tp.snapshot(TYPES);
            for (const old of base)
                expect(now.find(r => r.id === old.id), `Bản ghi cũ #${old.id} bị mất/ghi đè`).toEqual(old);
        }
        finally {
            await tp.purge(TYPES, created.types.slice(mark));
        }
    });
    (0, test_1.test)('TC_TicketsConfig_18 – Định dạng Prefix (độ dài, ký tự đặc biệt, HTML)', async () => {
        await tp.reopen(TYPES);
        const mark = created.types.length;
        const outcome = [];
        try {
            for (const [i, v] of ['A', 'ab', 'AB1', 'A-B', 'ABCDEFGHIJKLMNOP', '<b>'].map((v, i) => [i, v])) {
                const fresh = await tp.attempt(TYPES, async () => {
                    await tp.setText(F.type.title, `Prefix Test ${RUN} ${i}`);
                    await tp.choose(F.type.type);
                    await tp.setText(F.type.prefix, v);
                });
                outcome.push(`"${v}" -> ${fresh.length ? 'chấp nhận' : 'từ chối'}`);
                expect(tp.errors, `Prefix "${v}" gây lỗi 500`).toEqual([]);
            }
            note('Kết quả định dạng Prefix: ' + outcome.join('; '));
        }
        finally {
            await tp.purge(TYPES, created.types.slice(mark));
        }
    });
    (0, test_1.test)('TC_TicketsConfig_19 – Chỉnh sửa Ticket Type', async () => {
        test_1.test.skip(!STATE.type, 'Cần chạy TC_TicketsConfig_15 trước (bản ghi test)');
        const rec = STATE.type;
        await tp.reopen(TYPES);
        const all = await tp.snapshot(TYPES);
        const others = all.filter(r => r.id !== rec.id);
        await tp.openEdit(rec.id);
        expect(await tp.field(F.type.title).inputValue(), 'Form Edit phải điền sẵn Title').toBe(rec['Ticket Type']);
        expect(sameText(await tp.selectedText(F.type.type), rec.Type)).toBeTruthy();
        expect(low(await tp.field(F.type.prefix).inputValue())).toBe(low(rec.Prefix));
        await tp.closeModalIfOpen();
        const newPrefix = tp.uniquePrefix(all.map(r => r.Prefix), [rec.Prefix]);
        const saved = await tp.attemptEdit(TYPES, rec.id, async () => {
            await tp.setText(F.type.title, `${TT1} Updated`);
            await tp.choose(F.type.type, { exclude: [rec.Type] });
            await tp.setText(F.type.prefix, newPrefix);
        });
        expect(saved).toBeTruthy();
        expect(saved['Ticket Type']).toBe(`${TT1} Updated`);
        expect(saved.Type).not.toBe(rec.Type);
        expect(low(saved.Prefix)).toBe(low(newPrefix));
        STATE.type = saved;
        await tp.openEdit(rec.id); // sửa nhưng đóng, không lưu
        await tp.setText(F.type.title, `${TT1} Discarded`);
        await tp.closeModalIfOpen();
        await tp.reopen(TYPES);
        const now = await tp.snapshot(TYPES);
        expect(now.find(r => r.id === rec.id)['Ticket Type']).toBe(`${TT1} Updated`);
        expect(now.filter(r => r.id !== rec.id)).toEqual(others);
    });
    (0, test_1.test)('TC_TicketsConfig_20 – Xoá Ticket Type (có xác nhận)', async ({ page }) => {
        test_1.test.skip(!STATE.type, 'Cần chạy TC_TicketsConfig_15 trước (bản ghi test)');
        const rec = STATE.type;
        await tp.reopen(TYPES);
        const before = await tp.snapshot(TYPES);
        const msg = await tp.deleteRow(rec.id, false);
        expect(msg, 'Phải có hộp thoại xác nhận trước khi xóa').not.toBe('');
        await expect(tp.row(rec.id)).toBeVisible();
        await tp.deleteRow(rec.id, true);
        await page.reload();
        await tp.openTab(TYPES);
        const after = await tp.snapshot(TYPES);
        expect(after.find(r => r.id === rec.id)).toBeUndefined();
        expect(after).toEqual(before.filter(r => r.id !== rec.id));
        expect(await tp.badge(TYPES)).toBe(before.length - 1);
        note('Bước xoá Ticket Type đang được ticket sử dụng không chạy tự động (cần ticket thật ở module Helpdesk)');
        forget(TYPES, rec.id);
        STATE.type = null;
    });
});
/* ============================= 3.4 Tab Ticket Tags ======================= */
test_1.test.describe('3.4 Ticket Tags', () => {
    test_1.test.describe.configure({ mode: 'serial' });
    const TAG1 = `Software ${RUN}`;
    (0, test_1.test)('TC_TicketsConfig_21 – Hiển thị danh sách Ticket Tags', async () => {
        await tp.reopen(TAGS);
        const recs = await tp.snapshot(TAGS);
        expect(recs.length).toBeGreaterThan(0);
        expect(recs.length).toBe(await tp.badge(TAGS));
        expect(await tp.selectCount()).toBe(recs.length);
        for (const r of recs) {
            expect(r.Title).not.toBe('');
            expect(r.Color, `Tag "${r.Title}" phải có chấm màu`).not.toBe('');
        }
        await expect(tp.rows.locator('span[style*="background-color"]')).toHaveCount(recs.length);
        await expect(tp.rows.locator('[title="Edit"]')).toHaveCount(recs.length);
        await expect(tp.rows.locator('[title="Delete"]')).toHaveCount(recs.length);
    });
    (0, test_1.test)('TC_TicketsConfig_22 – Tìm kiếm Ticket Tags', async () => {
        await tp.reopen(TAGS);
        const all = await tp.snapshot(TAGS);
        const dirty = await tp.dirtyIds('Title'); // tag có tiêu đề chứa HTML: hiển thị khác giá trị lưu
        const base = all.filter(r => !dirty.has(r.id));
        expect(base.length).toBeGreaterThan(0);
        const t0 = base[0].Title.slice(0, 3).toLowerCase();
        const t1 = base[Math.min(1, base.length - 1)].Title;
        const t2 = base[Math.min(2, base.length - 1)].Title;
        const mid = t2.length > 5 ? t2.slice(2, 6).toLowerCase() : t2.toLowerCase();
        const has = (kw) => (r) => dirty.has(r.id) || low(r.Title).includes(kw.toLowerCase());
        const must = (kw) => (r) => !dirty.has(r.id) && low(r.Title).includes(kw.toLowerCase());
        await tp.expectSearch(TAGS, t0, all, has(t0), { must: must(t0) });
        await tp.expectSearch(TAGS, t1.toUpperCase(), all, has(t1), { must: must(t1) });
        await tp.expectSearch(TAGS, mid, all, has(mid), { must: must(mid) });
        await tp.search('');
        expect((await tp.snapshot(TAGS)).length).toBe(all.length);
    });
    (0, test_1.test)('TC_TicketsConfig_23 – Tạo Ticket Tag hợp lệ', async ({ page }) => {
        await tp.reopen(TAGS);
        const before = await tp.snapshot(TAGS);
        await tp.clickCreate();
        await expect(tp.field(F.tag.title)).toBeAttached();
        await expect(tp.field(F.tag.color)).toBeAttached();
        await tp.setText(F.tag.title, TAG1);
        const color = await tp.setColor('#ffd700');
        const fresh = await tp.submitAndDiff(TAGS, { toast: true });
        expect(fresh, 'Không tạo được Ticket Tag hợp lệ').toHaveLength(1);
        expect(fresh[0].Title).toBe(TAG1);
        expect(fresh[0].Color, 'Tag mới phải hiển thị chấm màu').not.toBe('');
        if (color.kind === 'color')
            expect(fresh[0].Color).toBe('rgb(255, 215, 0)');
        STATE.tag = fresh[0];
        await page.reload();
        await tp.openTab(TAGS);
        const after = await tp.snapshot(TAGS);
        expect(after.length).toBe(before.length + 1);
        expect(await tp.badge(TAGS)).toBe(before.length + 1);
        expect(after.filter(r => r.id !== fresh[0].id)).toEqual(before);
    });
    (0, test_1.test)('TC_TicketsConfig_24 – Validation khi tạo Ticket Tag', async () => {
        await tp.reopen(TAGS);
        const base = await tp.snapshot(TAGS);
        const mark = created.tags.length;
        try {
            expect(await tp.attempt(TAGS, async () => { await tp.setColor('#0000ff'); }), 'Thiếu Title phải bị từ chối').toHaveLength(0);
            expect(await tp.attempt(TAGS, async () => { await tp.setText(F.tag.title, '   '); await tp.setColor('#0000ff'); }), 'Title toàn khoảng trắng phải bị từ chối').toHaveLength(0);
            const dup = await tp.attempt(TAGS, async () => { await tp.setText(F.tag.title, base[0].Title); await tp.setColor('#0000ff'); });
            note(`Trùng tên tag "${base[0].Title}" -> ${dup.length ? 'hệ thống cho phép tạo' : 'hệ thống chặn'}`);
            const html = await tp.attempt(TAGS, async () => { await tp.setText(F.tag.title, `<b>tag</b> ${RUN}`); await tp.setColor('#0000ff'); });
            note(`Title chứa HTML -> ${html.length ? 'chấp nhận (hiển thị văn bản/element)' : 'từ chối'}`);
            const noColor = await tp.attempt(TAGS, async () => { await tp.setText(F.tag.title, `No Color ${RUN}`); });
            note(`Không chọn Color -> ${noColor.length ? 'hệ thống cho phép tạo (có màu mặc định)' : 'hệ thống chặn'}`);
            expect(tp.errors).toEqual([]);
            const now = await tp.snapshot(TAGS);
            for (const old of base)
                expect(now.find(r => r.id === old.id), `Bản ghi cũ #${old.id} bị mất/ghi đè`).toEqual(old);
        }
        finally {
            await tp.purge(TAGS, created.tags.slice(mark));
        }
    });
    (0, test_1.test)('TC_TicketsConfig_25 – Chỉnh sửa Ticket Tag', async () => {
        test_1.test.skip(!STATE.tag, 'Cần chạy TC_TicketsConfig_23 trước (bản ghi test)');
        const rec = STATE.tag;
        await tp.reopen(TAGS);
        const others = (await tp.snapshot(TAGS)).filter(r => r.id !== rec.id);
        await tp.openEdit(rec.id);
        expect(await tp.field(F.tag.title).inputValue(), 'Form Edit phải điền sẵn Title').toBe(rec.Title);
        await tp.closeModalIfOpen();
        let color = { kind: 'none', value: '' };
        const updatedTitle = `${TAG1} Updated`;
        const saved = await tp.attemptEdit(TAGS, rec.id, async () => {
            await tp.setText(F.tag.title, updatedTitle);
            await expect(tp.field(F.tag.title)).toHaveValue(updatedTitle);
            color = await tp.setColor('#40e0d0');
        });
        expect(saved).toBeTruthy();
        expect(saved.Title).toBe(updatedTitle);
        if (color.kind === 'color')
            expect(saved.Color).toBe('rgb(64, 224, 208)');
        else
            expect(saved.Color).not.toBe('');
        STATE.tag = saved;
        await tp.openEdit(rec.id); // sửa nhưng đóng, không lưu
        await tp.setText(F.tag.title, `${TAG1} Discarded`);
        await tp.closeModalIfOpen();
        await tp.reopen(TAGS);
        const now = await tp.snapshot(TAGS);
        expect(now.find(r => r.id === rec.id).Title).toBe(updatedTitle);
        expect(now.filter(r => r.id !== rec.id)).toEqual(others);
    });
    (0, test_1.test)('TC_TicketsConfig_26 – Xoá Ticket Tag (có xác nhận)', async ({ page }) => {
        test_1.test.skip(!STATE.tag, 'Cần chạy TC_TicketsConfig_23 trước (bản ghi test)');
        const rec = STATE.tag;
        await tp.reopen(TAGS);
        const before = await tp.snapshot(TAGS);
        const msg = await tp.deleteRow(rec.id, false);
        expect(msg, 'Phải có hộp thoại xác nhận trước khi xóa').not.toBe('');
        await expect(tp.row(rec.id)).toBeVisible();
        await tp.deleteRow(rec.id, true);
        await page.reload();
        await tp.openTab(TAGS);
        const after = await tp.snapshot(TAGS);
        expect(after.find(r => r.id === rec.id)).toBeUndefined();
        expect(after).toEqual(before.filter(r => r.id !== rec.id));
        expect(await tp.badge(TAGS)).toBe(before.length - 1);
        forget(TAGS, rec.id);
        STATE.tag = null;
    });
});
/* ===================== 3.5 Phân quyền & Responsive ======================= */
test_1.test.describe('3.5 Security & Compatibility', () => {
    (0, test_1.test)('TC_TicketsConfig_27 – Phân quyền theo vai trò', async ({ browser }) => {
        const hasEmp = !!EMP_USER && !!EMP_PASS;
        const ctx = await browser.newContext(ctxOpts(false));
        const page = await ctx.newPage();
        try {
            if (!hasEmp) {
                // Không có tài khoản nhân viên thường: kiểm tra mức tối thiểu – chưa đăng nhập thì không được vào trang cấu hình
                note('Thiếu EMP_USER / EMP_PASS -> chỉ kiểm tra truy cập khi CHƯA đăng nhập (phải bị chuyển về trang login)');
                await page.goto(TICKETS_URL);
                await page.waitForLoadState('networkidle').catch(() => { });
                const toLogin = /login/i.test(page.url()) || (await page.locator('input[type="password"]').count()) > 0;
                expect(toLogin, 'Chưa đăng nhập mà vẫn vào được trang Tickets > Configuration').toBeTruthy();
                expect(await page.locator(SEL.tabBtn).count(), 'Không được thấy tab cấu hình khi chưa đăng nhập').toBe(0);
                return;
            }
            await login(page, EMP_USER, EMP_PASS);
            await page.goto(TICKETS_URL);
            await page.waitForLoadState('networkidle');
            const redirected = !/helpdesk-settings/.test(page.url());
            const denied = /403|forbidden|not have permission|không có quyền/i.test(await page.locator('body').innerText());
            const canCreate = await page.locator('.oh-tabs__content--active a[hx-get]').filter({ hasText: /^\s*Create\s*$/ }).first().isVisible().catch(() => false);
            const edits = await page.locator(`${SEL.pane} ${SEL.rows} [title="Edit"]`).count();
            const dels = await page.locator(`${SEL.pane} ${SEL.rows} [title="Delete"]`).count();
            expect(redirected || denied || (!canCreate && edits === 0 && dels === 0), 'Nhân viên thường không được thấy Create/Edit/Delete hoặc phải bị chặn khi vào bằng URL').toBeTruthy();
        }
        finally {
            await ctx.close();
        }
    });
    (0, test_1.test)('TC_TicketsConfig_28 – Responsive Tablet / Mobile', async ({ page }) => {
        for (const vp of [{ name: 'iPad Air', width: 820, height: 1180 }, { name: 'iPhone 14', width: 390, height: 844 }]) {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await tp.goto();
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            expect(overflow, `${vp.name}: trang tràn khung ngang ${overflow}px`).toBeLessThanOrEqual(24);
            await expect(page.locator(SEL.tabBtn).first()).toBeVisible();
            await expect(tp.pane.locator(SEL.search).first()).toBeVisible();
            await expect(tp.createBtn()).toBeVisible();
            await tp.clickCreate();
            const box = await tp.modal.boundingBox();
            expect(box, `${vp.name}: không đo được form`).toBeTruthy();
            expect(box.x).toBeGreaterThanOrEqual(-1);
            expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
            await expect(tp.saveBtn()).toBeVisible();
            await tp.closeModalIfOpen();
        }
    });
});
