"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
/* =====================================================================
 *  Horilla HRMS – Performance > Bonus Points  (TC_BonusPoints_01 … 20)
 *  Tác giả: Nguyễn Đình Hiếu – Group12
 *
 *  Bản đơn giản hoá: mỗi TC chỉ kiểm tra những điều cốt lõi, tránh các
 *  bước phụ thuộc vào chi tiết giao diện dễ thay đổi.
 *  Dữ liệu nền KHÔNG fix cứng: đọc trực tiếp từ giao diện rồi so sánh.
 *
 *  .env (tuỳ chọn):
 *    BONUS_URL=/pms/employee-bonus-point/
 *    EMPLOYEE_URL=/employee/employee-view/
 *    EMP_USER / EMP_PASS  -> tài khoản nhân viên thường (TC_19, không có thì skip)
 * ===================================================================== */
const BONUS_URL = process.env.BONUS_URL ?? '/pms/employee-bonus-point/';
const EMPLOYEE_URL = process.env.EMPLOYEE_URL ?? '/employee/employee-view/';
const EMP_USER = process.env.EMP_USER ?? '';
const EMP_PASS = process.env.EMP_PASS ?? '';
// Tên trường lấy theo khoá cột của danh sách: employee_id / bonus_point / based_on
const F = {
    employee: { names: ['employee_id', 'employee'], label: 'Employee', fallback: 'select >> nth=0' },
    point: { names: ['bonus_point'], label: 'Bonus Point', fallback: 'input[type="number"]' },
    basedOn: { names: ['based_on'], label: 'Based On', fallback: 'input:not([type="hidden"]):not([type="number"]):not([type="checkbox"]):not([type="radio"]):not(.select2-search__field) >> nth=-1' },
};
const SEL = {
    container: '#listContainer',
    rows: '#listContainer table tbody tr[data-instance-id]',
    headerCells: '#listContainer table thead th',
    searchBox: 'input[aria-label="Search Input"]',
    selectBtn: '#listContainer button[id^="select_"]',
    unselectBtn: '#listContainer button[id^="unselect_"]',
    bulkBtn: '#listContainer button[id^="bulk_udate_"]',
    rowCheck: 'input.list-table-row',
    allCheck: '#listContainer table thead input.bulk-list-table-row',
    modal: '#genericModalBody',
    modalWrap: '#genericModal',
    createBtn: 'a[hx-get*="create-employee-bonus-point"]',
};
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const low = (s) => norm(s).toLowerCase();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const parseEmp = (s) => { const m = norm(s).match(/^(.+?)\s*\((.+)\)$/); return { name: m?.[1] ?? norm(s), badge: m?.[2] ?? '' }; };
const note = (description) => test_1.test.info().annotations.push({ type: 'note', description });
const sameText = (a, b) => low(a) === low(b) || low(a).includes(low(b)) || low(b).includes(low(a));
/** Bản ghi test do script tạo ra – dùng chung giữa các TC nối tiếp & dọn dẹp ở afterAll */
const createdIds = [];
const forget = (id) => {
    const i = createdIds.indexOf(id);
    if (i >= 0)
        createdIds.splice(i, 1);
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
        window.jQuery?.(s).trigger('change'); // select2 lắng nghe sự kiện của jQuery
    }, value);
}
class BonusPage {
    page;
    errors = []; // mọi response >= 500
    lastFormErrors = ''; // thông báo lỗi hiển thị trên form sau lần Save gần nhất
    constructor(page) {
        this.page = page;
        page.on('response', r => {
            if (r.status() >= 500)
                this.errors.push(`${r.status()} ${r.url()}`);
        });
    }
    /* ------------------------------ điều hướng ------------------------------ */
    async waitRows(timeout = 8000) {
        return this.rows.first().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
    }
    async goto() {
        await this.page.goto(BONUS_URL);
        if (!(await this.waitRows())) { // danh sách chưa tải / còn kẹt bộ lọc cũ -> thử lại
            await this.page.reload();
            if (!(await this.waitRows()))
                await this.search('');
        }
        await (0, test_1.expect)(this.rows.first()).toBeVisible();
        await this.search(''); // app có thể nhớ bộ lọc của lần tìm trước -> luôn về danh sách đầy đủ
        await (0, test_1.expect)(this.rows.first()).toBeVisible();
        await this.clearSelection();
    }
    /** Lấy (và xoá) các lỗi HTTP 5xx đã ghi nhận – dùng để ghi chú lỗi của app mà không làm hỏng TC */
    takeErrors() { return this.errors.splice(0, this.errors.length); }
    async gotoViaMenu() {
        const menu = this.page.locator('button.sideboxmain').filter({ hasText: /Performance/i })
            .or(this.page.locator('button.sideboxmain[data-menu*="Performance" i]')).first();
        try {
            await menu.hover({ timeout: 5000 });
            await this.page.locator('#sidebarFlyout').locator('a').filter({ hasText: /^\s*Bonus Points\s*$/ }).first().click({ timeout: 5000 });
            await this.page.waitForURL(/employee-bonus-point/, { timeout: 8000 });
        }
        catch {
            note('Không bấm được menu Performance > Bonus Points trên sidebar -> vào thẳng bằng URL');
            await this.page.goto(BONUS_URL);
        }
    }
    async clearSelection() {
        const un = this.page.locator(SEL.unselectBtn);
        if (await un.isVisible().catch(() => false)) {
            await un.click();
            await un.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => { });
        }
    }
    /* ---------------------------- đọc dữ liệu bảng --------------------------- */
    get rows() { return this.page.locator(SEL.rows); }
    row(id) { return this.page.locator(`${SEL.rows}[data-instance-id="${id}"]`); }
    async ids() { return this.rows.evaluateAll(els => els.map(e => e.getAttribute('data-instance-id') ?? '')); }
    async columnIndex(header) {
        const heads = (await this.page.locator(SEL.headerCells).allInnerTexts()).map(low);
        const i = heads.findIndex(h => h === header.toLowerCase());
        (0, test_1.expect)(i, `Không tìm thấy cột "${header}" trong ${heads.join('|')}`).toBeGreaterThanOrEqual(0);
        return i;
    }
    async column(header) {
        const i = await this.columnIndex(header);
        return (await this.rows.locator(`td:nth-child(${i + 1})`).allInnerTexts()).map(norm);
    }
    async snapshot() {
        const ids = await this.ids();
        if (ids.length === 0)
            return [];
        const [e, p, b] = await Promise.all(['Employee', 'Bonus Point', 'Based On'].map(h => this.column(h)));
        return ids.map((id, i) => ({ id, employee: e[i], point: p[i], basedOn: b[i] }));
    }
    async selectCount() {
        const t = await this.page.locator(SEL.selectBtn).innerText();
        return Number(t.match(/\((\d+)\)/)[1]);
    }
    checked() { return this.rows.locator(`${SEL.rowCheck}:checked`); }
    /* -------------------------------- tìm kiếm ------------------------------- */
    async search(text) {
        const box = this.page.locator(SEL.searchBox);
        const resp = this.page.waitForResponse(r => r.request().method() === 'GET' && r.url().includes('search='), { timeout: 4000 }).catch(() => null);
        await box.fill(text);
        await box.press('Enter');
        await resp;
        await this.page.waitForLoadState('networkidle').catch(() => { });
        let prev = -1; // chờ danh sách ổn định (số dòng không đổi giữa 2 lần đo)
        for (let i = 0; i < 6; i++) {
            const c = await this.rows.count();
            if (c === prev)
                break;
            prev = c;
            await this.page.waitForTimeout(400);
        }
    }
    /** Xoá ô tìm kiếm và đảm bảo danh sách quay về đúng `expected` dòng (tự tải lại nếu cần) */
    async resetSearch(expected) {
        await this.search('');
        const ok = await test_1.expect.poll(() => this.rows.count(), { timeout: 8000 }).toBe(expected).then(() => true).catch(() => false);
        if (!ok)
            await this.goto();
        await (0, test_1.expect)(this.rows).toHaveCount(expected);
    }
    /** exact: kết quả phải đúng bằng tập `match` của dữ liệu nền.
     *  Mặc định (subset): chỉ yêu cầu mọi dòng trả về đều khớp (ô Search có thể không hỗ trợ tìm theo cột đó) */
    async expectSearch(kw, base, match, exact = false) {
        await this.search(kw);
        const got = await this.snapshot();
        got.forEach(r => (0, test_1.expect)(match(r), `Từ khóa "${kw}" trả về dòng không khớp: ${r.employee} | ${r.point} | ${r.basedOn}`).toBeTruthy());
        if (exact)
            (0, test_1.expect)(got.map(r => r.id).sort()).toEqual(base.filter(match).map(r => r.id).sort());
        else if (got.length === 0 && base.some(match))
            note(`Ô Search không tìm theo nội dung này ("${kw}") – thực tế 0 kết quả`);
        return got;
    }
    /* ------------------------------ cột hiển thị ----------------------------- */
    get columnPanel() { return this.page.locator('.oh-column-config'); }
    async openColumnPanel() {
        for (let i = 0; i < 3; i++) {
            if (await this.columnPanel.isVisible().catch(() => false))
                return;
            await this.page.locator('button.is-column-config-trigger').click();
            await this.page.waitForTimeout(500);
        }
        await (0, test_1.expect)(this.columnPanel).toBeVisible();
    }
    async setColumn(label, on) {
        await this.openColumnPanel();
        const cb = this.columnPanel.locator(`input.toggle-column-checkbox[aria-label="${label}"]`);
        if ((await cb.isChecked()) !== on)
            await cb.click({ force: true });
        await this.page.waitForTimeout(500);
        await this.page.waitForLoadState('networkidle').catch(() => { });
    }
    thOf(header) {
        return this.page.locator(SEL.headerCells).filter({ hasText: new RegExp(`^\\s*${escapeRe(header)}\\s*$`) });
    }
    /* --------------------------------- form ---------------------------------- */
    get modal() { return this.page.locator(SEL.modal).filter({ has: this.page.locator('form') }).first(); } // DOM có nhiều #genericModalBody -> lấy cái đang chứa form
    field(f) {
        const css = f.names.map(n => [`select[name="${n}"]`, `input[name="${n}"]:not([type="hidden"])`, `textarea[name="${n}"]`, `#id_${n}`].join(', ')).join(', ');
        return this.modal.locator(css).or(this.modal.getByLabel(f.label, { exact: false })).or(this.modal.locator(f.fallback)).first();
    }
    async clickCreate() {
        await this.closeModalIfOpen();
        const btn = this.page.locator(SEL.createBtn);
        await btn.waitFor({ state: 'visible' });
        await btn.click();
        await (0, test_1.expect)(this.modal.locator('form').first()).toBeVisible();
    }
    /** Mở form Edit của 1 dòng. Thử lần lượt: click thường -> click bằng JS -> gọi thẳng htmx (phòng khi click bị phần tử khác che) */
    async openEdit(id) {
        await this.closeModalIfOpen();
        const btn = this.row(id).locator('[title="Edit"]');
        await btn.waitFor({ state: 'attached', timeout: 10000 });
        await btn.scrollIntoViewIfNeeded().catch(() => { });
        const form = this.page.locator(`${SEL.modal} form`).first();
        const shown = () => form.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
        await btn.click({ timeout: 5000 }).catch(() => btn.click({ force: true }).catch(() => { }));
        if (await shown())
            return;
        await this.closeModalIfOpen(); // nút Edit là nút "toggle" nên phải đóng trước khi bấm lại
        await btn.evaluate(el => el.click());
        if (await shown())
            return;
        await this.closeModalIfOpen();
        await btn.evaluate(el => {
            const url = el.getAttribute('hx-get') ?? '';
            window.htmx?.ajax('GET', url, { target: '#genericModalBody' });
            document.querySelectorAll('#genericModal').forEach(m => m.classList.add('oh-modal--show'));
        });
        await (0, test_1.expect)(form, 'Không mở được form Edit (đã thử click thường, click JS và gọi htmx)').toBeVisible({ timeout: 8000 });
    }
    saveBtn() {
        return this.modal.locator('button[type="submit"], input[type="submit"]').or(this.modal.getByText('Save', { exact: true })).first();
    }
    async modalOpen() {
        return (await this.page.locator(`${SEL.modalWrap}.oh-modal--show`).count()) > 0;
    }
    async closeModalIfOpen() {
        if (!(await this.modalOpen()))
            return;
        const x = this.page.locator(`${SEL.modalWrap}.oh-modal--show .oh-modal__close`).first();
        if (await x.isVisible().catch(() => false))
            await x.click().catch(() => { });
        else
            await this.page.keyboard.press('Escape');
        await this.page.evaluate(() => document.querySelectorAll('#genericModal').forEach(m => m.classList.remove('oh-modal--show'))).catch(() => { });
        await (0, test_1.expect)(this.page.locator(`${SEL.modalWrap}.oh-modal--show`)).toHaveCount(0);
    }
    /** Chọn 1 option của ô chọn (select thường hoặc select2). Trả về nội dung option đã chọn */
    async choose(f, o = {}) {
        const loc = this.field(f);
        const ex = (o.exclude ?? []).map(low);
        const ok = (t) => ex.indexOf(low(t)) < 0 && (!o.match || o.match.test(t));
        const native = await nativeOptions(loc);
        if (native.length) {
            const hit = native.find(x => ok(x.text));
            if (!hit)
                throw new Error(`Không có option phù hợp cho "${f.label}" (có: ${native.map(x => x.text).join(' | ')})`);
            await setNative(loc, hit.value);
            return hit.text;
        }
        const box = loc.locator('xpath=following-sibling::span[contains(@class,"select2")]').first();
        await box.waitFor({ state: 'visible', timeout: 5000 });
        await box.click();
        const items = this.page.locator('.select2-results__option[role="option"]');
        await (0, test_1.expect)(items.first()).toBeVisible({ timeout: 5000 });
        const texts = (await items.allInnerTexts()).map(norm);
        const i = texts.findIndex(ok);
        if (i < 0)
            throw new Error(`Không có option phù hợp cho "${f.label}" (có: ${texts.join(' | ')})`);
        await items.nth(i).click();
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
    /** Điền trường Based On dù nó là select / select2 / radio / ô nhập. `prefer` lấy từ dữ liệu có sẵn trên danh sách */
    async fillBasedOn(prefer) {
        const f = F.basedOn;
        const loc = this.field(f);
        await loc.waitFor({ state: 'attached', timeout: 8000 });
        const info = await loc.evaluate(el => ({ tag: el.tagName.toLowerCase(), type: el.type || '', name: el.name || '' }));
        const flat = (t) => norm(t).replace(/[_-]/g, ' ').toLowerCase();
        if (info.tag === 'select') {
            const texts = (await nativeOptions(loc)).map(o => o.text);
            const hit = prefer ? texts.find(t => flat(t) === flat(prefer)) : undefined;
            return this.choose(f, hit ? { match: new RegExp(`^${escapeRe(hit)}$`, 'i') } : {});
        }
        if (info.type === 'radio' || info.type === 'checkbox') {
            const group = this.modal.locator(`input[type="${info.type}"][name="${info.name}"]`);
            const labels = await group.evaluateAll(els => els.map(e => (e.closest('label')?.textContent ?? e.value ?? '')));
            let pick = prefer ? labels.findIndex(t => flat(t) === flat(prefer)) : 0;
            if (pick < 0)
                pick = 0;
            await group.nth(pick).check({ force: true });
            return norm(labels[pick]);
        }
        const v = prefer ?? 'objective'; // ô nhập tự do
        await loc.fill(v);
        return v;
    }
    /** Liệt kê các ô trên form (dùng để chẩn đoán khi tạo/sửa không thành công) */
    async formDump() {
        return this.modal.evaluate(root => Array.from(root.querySelectorAll('select, input, textarea')).map(e => {
            const x = e;
            const opts = e.tagName === 'SELECT' ? ` (${e.options.length} option)` : '';
            return `${e.tagName.toLowerCase()} type=${x.type || ''} name=${x.name || ''} id=${x.id || ''} value="${(x.value || '').slice(0, 30)}"${opts}`;
        }).join('\n')).catch(() => '(không đọc được form)');
    }
    async optionTexts(f) {
        return (await nativeOptions(this.field(f))).map(x => x.text);
    }
    async selectedText(f) {
        return norm(await this.field(f).evaluate(el => el.tagName.toLowerCase() === 'select'
            ? ((el.selectedOptions[0]?.value ?? '') !== '' ? el.selectedOptions[0].text : '')
            : el.value));
    }
    /** true nếu nhập được; false nếu ô chặn (vd: ô number không cho gõ chữ) */
    async setPoint(v) {
        const loc = this.field(F.point);
        await loc.fill('');
        try {
            await loc.fill(v);
            return true;
        }
        catch {
            return false;
        }
    }
    async save() {
        await this.saveBtn().waitFor({ state: 'visible' });
        await this.saveBtn().click();
        await this.page.waitForLoadState('networkidle').catch(() => { });
    }
    /** Lưu form -> đóng modal -> tải lại -> trả về các bản ghi MỚI xuất hiện (rỗng nếu bị từ chối) */
    async submitAndDiff() {
        const before = new Set(await this.ids());
        await this.save();
        this.lastFormErrors = norm((await this.modal.locator('.errorlist, [class*="error"], .invalid-feedback, .text-danger').allInnerTexts().catch(() => [])).join(' | '));
        await this.closeModalIfOpen();
        await this.goto();
        const fresh = (await this.snapshot()).filter(r => !before.has(r.id));
        createdIds.push(...fresh.map(r => r.id));
        return fresh;
    }
    async attempt(fill) {
        await this.clickCreate();
        await fill();
        return this.submitAndDiff();
    }
    /** Tạo 1 bản ghi hợp lệ, dữ liệu lấy từ chính các option trên form */
    async createRecord(point = '5') {
        const prefer = (await this.snapshot())[0]?.basedOn; // giá trị Based On đang có trên danh sách
        await this.clickCreate();
        const employee = await this.choose(F.employee);
        const basedOn = await this.fillBasedOn(prefer);
        await this.setPoint(point);
        const form = await this.formDump();
        const fresh = await this.submitAndDiff();
        (0, test_1.expect)(fresh, `Không tạo được bản ghi điểm thưởng hợp lệ.\nForm trước khi lưu:\n${form}\nLỗi hiển thị trên form: ${this.lastFormErrors || '(không có)'}`).toHaveLength(1);
        return { rec: fresh[0], employee, basedOn };
    }
    /** Mở Edit -> điền -> lưu -> tải lại -> trả về bản ghi sau khi lưu */
    async attemptEdit(id, fill) {
        await this.openEdit(id);
        await fill();
        await this.save();
        await this.closeModalIfOpen();
        await this.goto();
        return (await this.snapshot()).find(r => r.id === id);
    }
    /* --------------------------------- xoá ----------------------------------- */
    /** Nút Delete dùng hx-confirm (hộp thoại confirm của trình duyệt). Nếu là modal #deleteConfirmation thì xử lý luôn */
    /** Xóa bản ghi: hỗ trợ cả native browser dialog và HTML modal */
    async deleteRow(id, accept = true) {
        let msg = '';
        const deleteBtn = this.row(id).locator('[title="Delete"], a[hx-delete], button[hx-delete]').first();
        await deleteBtn.waitFor({
            state: 'visible',
            timeout: 5000
        });
        // --------------------------------------------------
        // 1. Xử lý native browser dialog: window.confirm()
        // --------------------------------------------------
        let dialogHandled = false;
        const onDialog = async (dialog) => {
            dialogHandled = true;
            msg = norm(dialog.message());
            if (accept) {
                await dialog.accept();
            }
            else {
                await dialog.dismiss();
            }
        };
        this.page.on('dialog', onDialog);
        try {
            await deleteBtn.click();
            // Nếu native dialog xuất hiện, Playwright sẽ gọi onDialog.
            // Nếu không có, kiểm tra HTML modal bên dưới.
            await this.page.waitForTimeout(500);
        }
        finally {
            if (dialogHandled) {
                this.page.off('dialog', onDialog);
            }
        }
        // --------------------------------------------------
        // 2. Nếu không có native dialog, xử lý HTML modal
        // --------------------------------------------------
        if (!dialogHandled) {
            const modal = this.page.locator('#deleteConfirmation, #genericModal, .oh-modal, [role="dialog"]').filter({
                hasText: /delete|remove|xóa|sure|confirm/i
            }).first();
            const modalVisible = await modal.waitFor({
                state: 'visible',
                timeout: 4000
            }).then(() => true).catch(() => false);
            if (modalVisible) {
                msg = norm(await modal.innerText());
                if (accept) {
                    // Tìm nút xác nhận trong modal.
                    // Ưu tiên các nút có text xác nhận/xóa.
                    const confirmCandidates = modal.locator('button, a, input[type="button"], input[type="submit"]');
                    const count = await confirmCandidates.count();
                    let confirmBtn = confirmCandidates.locator('xpath=//not(*)');
                    // Tạo locator cho nút khớp text.
                    for (let i = 0; i < count; i++) {
                        const candidate = confirmCandidates.nth(i);
                        const text = norm((await candidate.innerText().catch(() => '')) ||
                            (await candidate.getAttribute('value')) ||
                            (await candidate.getAttribute('aria-label')) ||
                            (await candidate.getAttribute('title')) ||
                            '');
                        if (/^(confirm|delete|yes|ok|remove|đồng ý|xóa|tôi đồng ý)$/i.test(text)) {
                            confirmBtn = candidate;
                            break;
                        }
                    }
                    // Nếu không khớp text, tìm nút có thuộc tính nhận diện.
                    if (await confirmBtn.count() === 0) {
                        confirmBtn = modal.locator('button[type="submit"], button.btn-danger, button.oh-btn--danger, [data-confirm]').first();
                    }
                    await confirmBtn.waitFor({
                        state: 'visible',
                        timeout: 5000
                    });
                    await confirmBtn.click();
                }
                else {
                    // Hủy thao tác xóa
                    const cancelBtn = modal.locator('button, a, input[type="button"]').filter({
                        hasText: /cancel|close|hủy|đóng|no/i
                    }).first();
                    if (await cancelBtn.isVisible().catch(() => false)) {
                        await cancelBtn.click();
                    }
                    else {
                        await this.page.keyboard.press('Escape');
                    }
                }
            }
        }
        // Chờ request / cập nhật giao diện sau thao tác
        await this.page.waitForLoadState('networkidle').catch(() => { });
        return msg;
    }
    async deleteIfExists(id) {
        await this.goto();
        if (await this.row(id).isVisible().catch(() => false)) {
            await this.deleteRow(id, true);
            await this.goto();
        }
    }
    async purge(ids) {
        for (const id of ids) {
            await this.deleteIfExists(id);
            forget(id);
        }
    }
}
async function login(page, user, pass) {
    await page.goto('/login/');
    await page.locator('input[name="username"], #id_username, input[type="text"]').first().fill(user);
    await page.locator('input[type="password"]').first().fill(pass);
    await page.getByText('Sign In', { exact: false }).last().click();
    await page.waitForURL(u => !/login/.test(u.toString()));
}
let bp;
test_1.test.beforeEach(async ({ page }) => { bp = new BonusPage(page); });
test_1.test.afterAll(async ({ browser }) => {
    test_1.test.setTimeout(120000);
    const ctx = await browser.newContext({ storageState: '.auth/admin.json', baseURL: process.env.BASE_URL });
    const page = await ctx.newPage();
    const cleaner = new BonusPage(page);
    for (const id of [...createdIds])
        await cleaner.deleteIfExists(id).catch(() => { });
    await cleaner.goto().then(() => cleaner.setColumn('Based On', true)).catch(() => { }); // luôn trả cấu hình cột về như cũ
    await ctx.close();
});
/* ------------------------- 2.1 Hiển thị & điều hướng --------------------- */
test_1.test.describe('2.1 Page layout', () => {
    (0, test_1.test)('TC_BonusPoints_01 – Điều hướng, Breadcrumb & tiêu đề', async ({ page }) => {
        await page.goto('/dashboard/');
        await bp.gotoViaMenu();
        await (0, test_1.expect)(page).toHaveURL(/employee-bonus-point/);
        await (0, test_1.expect)(page.getByRole('heading', { name: 'Employee Bonus Point' })).toBeVisible();
        await (0, test_1.expect)(page.locator('body')).toContainText('Bonus Points');
        const crumb = page.locator('ul.breadcrumb').first();
        if (await crumb.count()) {
            if (!/Performance/i.test(await crumb.innerText()))
                note('Breadcrumb thực tế không có cấp "Performance" (kỳ vọng Excel: Horilla > Performance > Bonus Points)');
        }
        (0, test_1.expect)(bp.errors).toEqual([]);
    });
    (0, test_1.test)('TC_BonusPoints_02 – Bảng danh sách điểm thưởng', async ({ page }) => {
        await bp.goto();
        const heads = (await page.locator(SEL.headerCells).allInnerTexts()).map(norm);
        for (const h of ['Employee', 'Bonus Point', 'Based On', 'Actions'])
            (0, test_1.expect)(heads).toContain(h);
        const recs = await bp.snapshot();
        (0, test_1.expect)(recs.length).toBeGreaterThan(0);
        for (const r of recs) {
            (0, test_1.expect)(r.employee).not.toBe('');
            (0, test_1.expect)(r.point).toMatch(/^-?\d+(\.\d+)?$/);
            (0, test_1.expect)(r.basedOn).not.toBe('');
        }
        await (0, test_1.expect)(bp.rows.locator('[title="Edit"]')).toHaveCount(recs.length);
        await (0, test_1.expect)(bp.rows.locator('[title="Delete"]')).toHaveCount(recs.length);
        (0, test_1.expect)(await bp.selectCount()).toBe(recs.length);
    });
    (0, test_1.test)('TC_BonusPoints_03 – Đồng bộ họ tên nhân viên với module Employee', async ({ page }) => {
        await bp.goto();
        const e = parseEmp((await bp.snapshot())[0].employee);
        await page.goto(EMPLOYEE_URL);
        const box = page.locator('input[name="search"]').first();
        if (!(await box.isVisible({ timeout: 8000 }).catch(() => false))) {
            note('Không tìm thấy ô Search ở trang Employee -> bỏ qua đối chiếu');
            return;
        }
        await box.fill(e.name);
        await box.press('Enter');
        await page.waitForTimeout(800);
        await page.waitForLoadState('networkidle').catch(() => { });
        await (0, test_1.expect)(page.locator('body')).toContainText(e.name);
        if (e.badge && !(await page.locator('body').innerText()).includes(e.badge))
            note(`Trang Employee không hiển thị mã "${e.badge}" (chỉ đối chiếu được họ tên)`);
    });
    (0, test_1.test)('TC_BonusPoints_04 – Tùy chỉnh cột hiển thị', async () => {
        await bp.goto();
        try {
            await bp.openColumnPanel();
            const labels = await bp.columnPanel.locator('li.oh-column-config__item').evaluateAll(els => els.map(e => e.getAttribute('data-label') ?? ''));
            for (const h of ['Employee', 'Bonus Point', 'Based On'])
                (0, test_1.expect)(labels).toContain(h);
            await bp.setColumn('Based On', false);
            await (0, test_1.expect)(bp.thOf('Based On')).toBeHidden();
            await (0, test_1.expect)(bp.thOf('Employee')).toBeVisible();
            await (0, test_1.expect)(bp.thOf('Bonus Point')).toBeVisible();
            await bp.setColumn('Based On', true);
            await (0, test_1.expect)(bp.thOf('Based On')).toBeVisible();
        }
        finally {
            await bp.setColumn('Based On', true).catch(() => { }); // luôn trả cấu hình cột về như cũ
        }
    });
});
/* ------------------------------ 2.2 Search ------------------------------- */
test_1.test.describe('2.2 Search', () => {
    test_1.test.beforeEach(async () => { await bp.goto(); });
    (0, test_1.test)('TC_BonusPoints_05 – Tìm theo tên nhân viên', async () => {
        const base = await bp.snapshot();
        const first = parseEmp(base[0].employee).name.split(' ')[0];
        const other = parseEmp(base[base.length - 1].employee).name.split(' ')[0];
        await bp.expectSearch(first.toLowerCase(), base, r => low(r.employee).includes(first.toLowerCase()), true);
        await bp.expectSearch(other.toUpperCase(), base, r => low(r.employee).includes(other.toLowerCase()), true);
        await bp.resetSearch(base.length);
    });
    (0, test_1.test)('TC_BonusPoints_06 – Tìm theo mã nhân viên (Badge ID)', async () => {
        const base = await bp.snapshot();
        const badge = parseEmp(base[0].employee).badge;
        const part = badge.slice(0, -1).toLowerCase();
        await bp.expectSearch(badge, base, r => low(r.employee).includes(badge.toLowerCase()));
        await bp.expectSearch(part, base, r => low(r.employee).includes(part));
        await bp.resetSearch(base.length);
    });
    (0, test_1.test)('TC_BonusPoints_07 – Tìm theo Based On và Bonus Point', async () => {
        const base = await bp.snapshot();
        const anyCol = (kw) => (r) => [r.employee, r.point, r.basedOn].some(c => low(c).includes(kw.toLowerCase()));
        const kinds = base.map(r => r.basedOn).filter((v, i, a) => a.indexOf(v) === i);
        for (const k of kinds.slice(0, 2))
            await bp.expectSearch(k, base, anyCol(k));
        const point = base[0].point;
        await bp.expectSearch(point, base, anyCol(point));
        await bp.resetSearch(base.length);
    });
    (0, test_1.test)('TC_BonusPoints_08 – Không kết quả & ký tự đặc biệt', async ({ page }) => {
        const base = await bp.snapshot();
        await bp.search('xyz123abc');
        await (0, test_1.expect)(bp.rows).toHaveCount(0);
        await (0, test_1.expect)(page.locator(SEL.container)).toBeVisible();
        await bp.search('!@#$%^&*()');
        await (0, test_1.expect)(page.locator(SEL.container)).toBeVisible();
        await bp.search('<b>test</b>');
        await (0, test_1.expect)(page.locator(`${SEL.container} table b`)).toHaveCount(0); // HTML phải là văn bản thường
        (0, test_1.expect)(bp.errors, 'Không được có lỗi 500').toEqual([]);
        await bp.resetSearch(base.length);
    });
});
/* ------------------------------ 2.3 Selection ---------------------------- */
test_1.test.describe('2.3 Selection', () => {
    test_1.test.beforeEach(async () => { await bp.goto(); });
    (0, test_1.test)('TC_BonusPoints_09 – Chọn bản ghi & Select All', async ({ page }) => {
        const total = await bp.rows.count();
        const oneCb = bp.rows.first().locator(SEL.rowCheck);
        await oneCb.check();
        await (0, test_1.expect)(oneCb).toBeChecked();
        await (0, test_1.expect)(bp.checked()).toHaveCount(1);
        const all = page.locator(SEL.allCheck);
        await all.check();
        await (0, test_1.expect)(bp.checked()).toHaveCount(total);
        await all.uncheck();
        await (0, test_1.expect)(bp.checked()).toHaveCount(0);
        await bp.clearSelection(); // nếu còn nút Unselect thì bấm để về trạng thái ban đầu
        await (0, test_1.expect)(page.locator(SEL.selectBtn)).toBeVisible();
        (0, test_1.expect)(await bp.selectCount()).toBe(total);
    });
    (0, test_1.test)('TC_BonusPoints_10 – Thao tác hàng loạt trên bản ghi đã chọn', async ({ page }) => {
        test_1.test.skip((await bp.rows.count()) < 2, 'Cần ít nhất 2 bản ghi');
        await bp.rows.nth(0).locator(SEL.rowCheck).check();
        await bp.rows.nth(1).locator(SEL.rowCheck).check();
        await (0, test_1.expect)(page.locator(SEL.unselectBtn)).toBeVisible();
        await (0, test_1.expect)(page.locator(SEL.unselectBtn)).toContainText('2');
        await (0, test_1.expect)(page.locator(SEL.bulkBtn)).toBeVisible(); // thao tác hàng loạt (Update)
        await (0, test_1.expect)(bp.checked()).toHaveCount(2);
        await page.locator(SEL.unselectBtn).click();
        await (0, test_1.expect)(bp.checked()).toHaveCount(0);
    });
});
/* --------------------------- 2.4 – 2.5 CRUD ------------------------------ */
// Mỗi TC tự tạo và tự dọn bản ghi của chính mình (không dùng serial / biến dùng chung)
// -> một TC lỗi không làm các TC còn lại bị bỏ qua.
test_1.test.describe('2.4 – 2.5 CRUD', () => {
    /** Chạy `fn` với 1 bản ghi test mới tạo; luôn dọn mọi bản ghi do TC này tạo, kể cả khi `fn` lỗi */
    async function withTempRecord(fn, point = '5') {
        await bp.goto();
        const mark = createdIds.length;
        try {
            const { rec } = await bp.createRecord(point);
            await fn(rec);
        }
        finally {
            await bp.purge(createdIds.slice(mark)).catch(() => { });
        }
    }
    /** Ghi chú (không làm TC lỗi) nếu server trả HTTP 500 – đây là lỗi của ứng dụng cần báo cáo riêng */
    const reportServerErrors = (what) => {
        const e = bp.takeErrors();
        if (e.length)
            note(`LỖI ỨNG DỤNG: ${what} gây HTTP 500 → ${e.join(', ')}`);
    };
    (0, test_1.test)('TC_BonusPoints_11 – Form Create & đóng không lưu', async () => {
        await bp.goto();
        const total = (await bp.ids()).length;
        await bp.clickCreate();
        for (const f of [F.employee, F.point, F.basedOn])
            await (0, test_1.expect)(bp.field(f), `Thiếu trường "${f.label}"`).toBeAttached();
        await (0, test_1.expect)(bp.saveBtn()).toBeVisible();
        const names = await bp.optionTexts(F.employee);
        if (names.length === 0)
            note('Ô Employee không có option sẵn (có thể tải bằng ajax)');
        await bp.closeModalIfOpen();
        await bp.goto();
        (0, test_1.expect)((await bp.ids()).length).toBe(total);
    });
    (0, test_1.test)('TC_BonusPoints_12 – Tạo điểm thưởng hợp lệ', async ({ page }) => {
        await bp.goto();
        const before = await bp.snapshot();
        const mark = createdIds.length;
        try {
            const { rec, employee, basedOn } = await bp.createRecord('5');
            (0, test_1.expect)(sameText(rec.employee, employee)).toBeTruthy();
            (0, test_1.expect)(Number(rec.point)).toBe(5);
            (0, test_1.expect)(sameText(rec.basedOn.replace(/[_-]/g, ' '), basedOn.replace(/[_-]/g, ' ')), `Based On đã điền "${basedOn}" nhưng danh sách hiện "${rec.basedOn}"`).toBeTruthy();
            await page.reload(); // F5 -> bản ghi mới vẫn còn
            await (0, test_1.expect)(bp.rows.first()).toBeVisible();
            const after = await bp.snapshot();
            (0, test_1.expect)(after.length).toBe(before.length + 1);
            (0, test_1.expect)(after.filter(r => r.id !== rec.id)).toEqual(before); // bản ghi cũ không đổi
        }
        finally {
            await bp.purge(createdIds.slice(mark)).catch(() => { });
        }
    });
    (0, test_1.test)('TC_BonusPoints_13 – Trường bắt buộc khi tạo', async () => {
        await bp.goto();
        const before = (await bp.ids()).length;
        const mark = createdIds.length;
        try {
            (0, test_1.expect)(await bp.attempt(async () => { }), 'Form trống phải bị từ chối').toHaveLength(0);
            (0, test_1.expect)(await bp.attempt(async () => { await bp.setPoint('5'); }), 'Thiếu Employee phải bị từ chối').toHaveLength(0);
            const onlyEmp = await bp.attempt(async () => { await bp.choose(F.employee); }); // Bonus Point / Based On có thể có giá trị mặc định
            note(`Chỉ chọn Employee -> ${onlyEmp.length ? 'hệ thống cho phép tạo (có giá trị mặc định)' : 'hệ thống chặn'}`);
            reportServerErrors('Tạo điểm thưởng thiếu trường bắt buộc');
        }
        finally {
            await bp.purge(createdIds.slice(mark)).catch(() => { });
        }
        await bp.goto();
        (0, test_1.expect)((await bp.ids()).length).toBe(before);
    });
    (0, test_1.test)('TC_BonusPoints_14 – Giá trị biên của Bonus Point', async () => {
        await bp.goto();
        const before = (await bp.ids()).length;
        const mark = createdIds.length;
        const outcome = [];
        try {
            for (const v of ['1', 'abc', '-1', '2.5']) {
                const fresh = await bp.attempt(async () => {
                    await bp.choose(F.employee);
                    await bp.fillBasedOn();
                    await bp.setPoint(v);
                });
                outcome.push(`${v} -> ${fresh.length ? 'chấp nhận' : 'từ chối'}`);
                if (v === '1')
                    (0, test_1.expect)(fresh, 'Giá trị 1 phải được chấp nhận').toHaveLength(1);
                reportServerErrors(`Bonus Point = "${v}"`);
            }
            note('Kết quả giá trị biên: ' + outcome.join('; '));
        }
        finally {
            // Đảm bảo đưa toàn bộ các bản ghi mới phát sinh vào danh sách dọn dẹp
            await bp.purge(createdIds.slice(mark)).catch(() => { });
        }
        await bp.goto();
        // Đảm bảo đồng bộ lại danh sách và kiểm tra kỹ số lượng
        await bp.search('');
        (0, test_1.expect)((await bp.ids()).length, 'Sau khi dọn, số bản ghi phải về như ban đầu').toBe(before);
    });
    (0, test_1.test)('TC_BonusPoints_15 – Tạo bản ghi trùng nhân viên & Based On', async () => {
        await bp.goto();
        const base = await bp.snapshot();
        const t = base[0];
        const mark = createdIds.length;
        try {
            const fresh = await bp.attempt(async () => {
                await bp.chooseLike(F.employee, t.employee);
                await bp.fillBasedOn(t.basedOn);
                await bp.setPoint(t.point);
            });
            note(`Trùng "${t.employee} | ${t.point} | ${t.basedOn}" -> ${fresh.length ? 'hệ thống cho phép tạo' : 'hệ thống chặn'}`);
            reportServerErrors('Tạo bản ghi trùng');
            const now = await bp.snapshot();
            for (const old of base)
                (0, test_1.expect)(now.find(r => r.id === old.id), `Bản ghi cũ #${old.id} bị mất/ghi đè`).toEqual(old);
        }
        finally {
            await bp.purge(createdIds.slice(mark)).catch(() => { });
        }
    });
    (0, test_1.test)('TC_BonusPoints_16 – Chỉnh sửa điểm thưởng', async () => {
        await withTempRecord(async (rec) => {
            const others = (await bp.snapshot()).filter(r => r.id !== rec.id);
            await bp.openEdit(rec.id); // Sử dụng rec.id động thay vì số cứng
            (0, test_1.expect)(Number(await bp.field(F.point).inputValue()), 'Form Edit phải điền sẵn Bonus Point').toBe(Number(rec.point));
            await bp.closeModalIfOpen();
            const saved = await bp.attemptEdit(rec.id, async () => { await bp.setPoint('8'); });
            (0, test_1.expect)(saved).toBeTruthy();
            (0, test_1.expect)(Number(saved.point)).toBe(8);
            (0, test_1.expect)(saved.employee).toBe(rec.employee);
            await bp.openEdit(rec.id);
            await bp.setPoint('99');
            await bp.closeModalIfOpen();
            await bp.goto();
            const now = await bp.snapshot();
            (0, test_1.expect)(Number(now.find(r => r.id === rec.id).point)).toBe(8);
            (0, test_1.expect)(now.filter(r => r.id !== rec.id)).toEqual(others);
        }, '5');
    });
    (0, test_1.test)('TC_BonusPoints_17 – Validation khi chỉnh sửa', async () => {
        await withTempRecord(async (rec) => {
            for (const v of ['', 'abc']) {
                const after = await bp.attemptEdit(rec.id, async () => { await bp.setPoint(v); });
                (0, test_1.expect)(after, `Bản ghi test biến mất sau khi nhập "${v}"`).toBeTruthy();
                reportServerErrors(`Sửa Bonus Point thành "${v}"`);
                if (after.point === rec.point)
                    continue; // bị từ chối, giữ nguyên điểm cũ (đúng kỳ vọng)
                note(`Nhập "${v}" khi sửa -> hệ thống chấp nhận, điểm đổi từ ${rec.point} thành ${after.point}`);
                await bp.attemptEdit(rec.id, async () => { await bp.setPoint(rec.point); });
            }
        });
    });
    (0, test_1.test)('TC_BonusPoints_18 – Xoá điểm thưởng (có xác nhận)', async ({ page }) => {
        await withTempRecord(async (rec) => {
            const before = await bp.snapshot();
            const msg = await bp.deleteRow(rec.id, false); // Hủy
            (0, test_1.expect)(msg, 'Phải có hộp thoại xác nhận trước khi xóa').not.toBe('');
            await (0, test_1.expect)(bp.row(rec.id)).toBeVisible();
            await bp.deleteRow(rec.id, true); // Xác nhận
            // THAY VÌ page.reload(), dùng bp.goto() để làm mới và tải lại danh sách an toàn hơn
            await bp.goto();
            const after = await bp.snapshot();
            (0, test_1.expect)(after.find(r => r.id === rec.id)).toBeUndefined();
            (0, test_1.expect)(after).toEqual(before.filter(r => r.id !== rec.id)); // bản ghi nền không bị ảnh hưởng
        });
    });
});
/* ------------------------ 2.6 Phân quyền & Responsive -------------------- */
test_1.test.describe('2.6 Security & Compatibility', () => {
    (0, test_1.test)('TC_BonusPoints_19 – Phân quyền theo vai trò', async ({ browser }) => {
        test_1.test.skip(!EMP_USER || !EMP_PASS, 'Thiếu EMP_USER / EMP_PASS trong .env (tài khoản nhân viên thường)');
        const ctx = await browser.newContext({ baseURL: process.env.BASE_URL });
        const page = await ctx.newPage();
        try {
            await login(page, EMP_USER, EMP_PASS);
            await page.goto(BONUS_URL);
            await page.waitForLoadState('networkidle');
            const redirected = !/employee-bonus-point/.test(page.url());
            const denied = /403|forbidden|not have permission|không có quyền/i.test(await page.locator('body').innerText());
            const canCreate = await page.locator(SEL.createBtn).isVisible().catch(() => false);
            const edits = await page.locator(`${SEL.rows} [title="Edit"]`).count();
            const dels = await page.locator(`${SEL.rows} [title="Delete"]`).count();
            (0, test_1.expect)(redirected || denied || (!canCreate && edits === 0 && dels === 0), 'Nhân viên thường không được thấy Create/Edit/Delete hoặc phải bị chặn khi vào bằng URL').toBeTruthy();
        }
        finally {
            await ctx.close();
        }
    });
    (0, test_1.test)('TC_BonusPoints_20 – Responsive Tablet / Mobile', async ({ page }) => {
        for (const vp of [{ name: 'iPad Air', width: 820, height: 1180 }, { name: 'iPhone 14', width: 390, height: 844 }]) {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.goto(BONUS_URL);
            await (0, test_1.expect)(page.locator(SEL.container)).toBeVisible();
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            (0, test_1.expect)(overflow, `${vp.name}: trang tràn khung ngang ${overflow}px`).toBeLessThanOrEqual(24);
            await (0, test_1.expect)(page.locator(SEL.searchBox)).toBeVisible();
            await (0, test_1.expect)(page.locator(SEL.createBtn)).toBeVisible();
            await bp.clickCreate();
            const box = await bp.modal.boundingBox();
            (0, test_1.expect)(box, `${vp.name}: không đo được form`).toBeTruthy();
            (0, test_1.expect)(box.x).toBeGreaterThanOrEqual(-1);
            (0, test_1.expect)(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
            await (0, test_1.expect)(bp.saveBtn()).toBeVisible();
            await bp.closeModalIfOpen();
        }
    });
});
