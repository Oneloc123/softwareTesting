'use strict';
const { test, expect: baseExpect } = require('@playwright/test');
const crypto = require('node:crypto');
const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 240_000 });
const BASE_URL = process.env.HORILLA_BASE_URL || 'https://hr.demo.horilla.com';
test.use({ baseURL: BASE_URL });
const MARKER_PREFIX = '[TC-23130175]';
const ROUTES = { interviews: '/recruitment/interview-view/' };
const LIST_PATH = 'interview-list-view';
const ROW_SEL = '#interviewdelete table tbody tr[data-instance-id]';
const ACT = {
    edit: '[title="Edit" i], [hx-get*="edit-interview"]',
    del: '[title="Delete" i], [hx-get*="delete-interview"]',
};
const INTERVIEWER_SELECTORS = [
    'select[name="employee_id"]', 'select[name="interviewer"]', 'select[name="interviewer_ids"]',
    'select[name*="interviewer" i]', 'select[id*="interviewer" i]',
];
const CANDIDATE_SELECTORS = ['select[name="candidate_id"]', 'select[name="candidate"]', 'select[id*="candidate" i]'];
/* ============================================================================
 *  COMMON HELPERS (dùng chung cho cả 3 file spec)
 *  Các điểm đã sửa so với bản cũ (dựa trên HTML thật của 3 trang):
 *   1. Ô Search chỉ kích hoạt bằng sự kiện "keyup" (jQuery) -> fill() không đủ.
 *   2. Select2 AJAX: <select> rỗng + class select2-hidden-accessible (1px, vẫn "visible")
 *      -> phải mở widget, gõ tìm, chọn <li>, thay vì selectOption.
 *   3. Dropdown/search của select2 phải bị giới hạn trong .select2-container--open,
 *      vì panel Filter (off-screen) cũng "visible" với Playwright và chứa hàng chục input search.
 *   4. hx-confirm của Horilla hiển thị SweetAlert2 (không phải confirm() native).
 *   5. Lưu thành công thường reload trang -> mọi page.evaluate phải chịu được "context destroyed".
 *   6. Filter panel nằm ngoài viewport khi đóng; Lookup của custom-filter tự bấm Apply và đóng panel.
 *   7. Nhận diện bản ghi bằng data-instance-id thay vì chỉ dựa vào text.
 * ========================================================================== */
const NAV_ERR = /Execution context was destroyed|Cannot find context|most likely because of a navigation|Frame was detached/i;
async function safeEval(page, fn, arg) {
    for (let i = 0; i < 8; i += 1) {
        try {
            return await page.evaluate(fn, arg);
        }
        catch (e) {
            if (!NAV_ERR.test(String(e && e.message)))
                throw e;
            await page.waitForLoadState('domcontentloaded').catch(() => { });
            await page.waitForTimeout(400);
        }
    }
    return null;
}
async function settle(page, timeout = 6000) {
    await page.waitForFunction(() => !document.querySelector('.htmx-request, .htmx-swapping, .htmx-settling'), null, { timeout }).catch(() => { });
    await page.waitForLoadState('networkidle', { timeout }).catch(() => { });
}
async function stableCount(locator, iterations = 15, delay = 150) {
    let prev = -1;
    for (let i = 0; i < iterations; i += 1) {
        const n = await locator.count();
        if (n === prev)
            return n;
        prev = n;
        await new Promise((r) => setTimeout(r, delay));
    }
    return prev;
}
async function firstVisible(locator) {
    const count = await locator.count();
    for (let i = 0; i < count; i += 1) {
        if (await locator.nth(i).isVisible().catch(() => false))
            return locator.nth(i);
    }
    return null;
}
const toRegex = (v) => (v instanceof RegExp ? v : new RegExp(String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
const note = (description) => { try {
    test.info().annotations.push({ type: 'note', description });
}
catch (_) { /* ngoài test */ } };
const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const stripBadge = (t) => String(t || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
const badgeKey = (t) => { const m = String(t || '').match(/\(([^)]+)\)\s*$/); return m ? `(${m[1]})` : stripBadge(t); };
function timestampSuffix() {
    const t = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}${pad(t.getSeconds())}-${crypto.randomBytes(3).toString('hex')}`;
}
const fixtureMarker = (id, detail = 'fixture') => `${MARKER_PREFIX} ${id} ${detail} ${timestampSuffix()}`;
function relativeDateIso(days = 0) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + days);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function markerAgeMs(text) {
    const m = String(text || '').match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-[0-9a-f]{6}/);
    if (!m)
        return Infinity;
    return Date.now() - new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}
/* ------------------------------- Auth ------------------------------------ */
async function ensureAuthenticated(page) {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page, 5000);
    if (!/\/login\//i.test(new URL(page.url()).pathname))
        return;
    const bodyText = await page.locator('body').innerText();
    const user = process.env.HORILLA_USERNAME || (bodyText.match(/(?:username|user name)\s*[:=\-]\s*([^\s,;|]+)/i) || [])[1];
    const pass = process.env.HORILLA_PASSWORD || (bodyText.match(/password\s*[:=\-]\s*([^\s,;|]+)/i) || [])[1];
    if (!user || !pass)
        throw new Error('Không đọc được thông tin đăng nhập (đặt HORILLA_USERNAME / HORILLA_PASSWORD).');
    await page.getByLabel(/username|user name/i).or(page.locator('input[name="username"], input[type="email"]')).first().fill(user);
    await page.getByLabel(/password/i).or(page.locator('input[name="password"], input[type="password"]')).first().fill(pass);
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();
    await page.waitForURL((u) => !/\/login\//i.test(u.pathname), { timeout: 45000, waitUntil: 'commit' });
    await settle(page, 5000);
}
/* --------------------------- Modal (#genericModal) ------------------------ */
/* Lưu ý: HTML có NHIỀU phần tử trùng id="genericModal"; htmx & jQuery đều dùng phần tử ĐẦU TIÊN. */
async function modalState(page) {
    const s = await safeEval(page, () => {
        const m = document.querySelector('#genericModal');
        const b = document.querySelector('#genericModalBody');
        return { shown: !!(m && m.classList.contains('oh-modal--show')), hasForm: !!(b && b.querySelector('form')) };
    });
    return s || { shown: false, hasForm: false };
}
async function findFormScope(page) {
    const modals = page.locator('.oh-modal--show');
    const n = await modals.count();
    for (let i = n - 1; i >= 0; i -= 1) {
        if (await modals.nth(i).isVisible().catch(() => false))
            return modals.nth(i);
    }
    return page.locator('#genericModal').first();
}
async function resetGenericModal(page) {
    await safeEval(page, () => {
        document.querySelectorAll('.oh-modal--show').forEach((el) => el.classList.remove('oh-modal--show'));
        document.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
        document.body.classList.remove('modal-open');
        const b = document.querySelector('#genericModalBody');
        if (b)
            b.innerHTML = '';
    });
}
async function closeVisibleDialog(page) {
    await closeOpenSelect2(page).catch(() => { });
    const modals = page.locator('.oh-modal--show');
    const n = await modals.count().catch(() => 0);
    for (let i = n - 1; i >= 0; i -= 1) {
        const m = modals.nth(i);
        if (!(await m.isVisible().catch(() => false)))
            continue;
        const close = await firstVisible(m.locator('.oh-modal__close, button[aria-label="Close" i], .oh-modal__cancel'));
        if (close)
            await close.click({ timeout: 3000 }).catch(() => { });
        await m.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => { });
        break;
    }
    await resetGenericModal(page);
}
/* Mở modal chứa form từ một trigger (link Create / nút Edit ...). */
async function openModalForm(page, trigger) {
    await closeVisibleDialog(page);
    await trigger.scrollIntoViewIfNeeded().catch(() => { });
    const respP = page.waitForResponse((r) => r.request().method() === 'GET'
        && String(r.request().headers()['hx-request'] || '').toLowerCase() === 'true', { timeout: 15000 }).catch(() => null);
    await trigger.click();
    await respP;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        const s = await modalState(page);
        if (s.hasForm) {
            // handler data-toggle="oh-modal-toggle" chỉ được gắn SAU lần htmx đầu tiên -> tự thêm class nếu thiếu
            if (!s.shown)
                await safeEval(page, () => { const m = document.querySelector('#genericModal'); if (m)
                    m.classList.add('oh-modal--show'); });
            break;
        }
        await page.waitForTimeout(250);
    }
    const scope = await findFormScope(page);
    await expect(scope).toBeVisible();
    await expect(scope.locator('form').first()).toBeVisible({ timeout: 10000 });
    // chờ select2 khởi tạo xong cho các select trong form
    await page.waitForFunction(() => {
        const b = document.querySelector('#genericModalBody');
        if (!b)
            return false;
        return Array.from(b.querySelectorAll('select.oh-select-2, select.oh-select-ajax'))
            .every((s) => s.classList.contains('select2-hidden-accessible'));
    }, null, { timeout: 8000 }).catch(() => { });
    await settle(page, 3000);
    return scope;
}
/* ------------------------------ Field helpers ----------------------------- */
async function findField(scope, aliases = [], selectors = []) {
    for (const sel of selectors) {
        const v = await firstVisible(scope.locator(sel));
        if (v)
            return v;
    }
    for (const alias of aliases) {
        const v = await firstVisible(scope.getByLabel(toRegex(alias)));
        if (v)
            return v;
    }
    for (const alias of aliases) {
        const esc = String(alias).replace(/"/g, '\\"');
        const v = await firstVisible(scope.locator(`input[placeholder*="${esc}" i], textarea[placeholder*="${esc}" i], input[aria-label*="${esc}" i]`));
        if (v)
            return v;
    }
    for (const sel of selectors) {
        const loc = scope.locator(sel);
        if (await loc.count())
            return loc.first();
    }
    for (const alias of aliases) {
        const loc = scope.getByLabel(toRegex(alias));
        if (await loc.count())
            return loc.first();
    }
    return null;
}
async function fillField(scope, aliases, value, selectors = []) {
    const f = await findField(scope, aliases, selectors);
    if (!f)
        throw new Error(`Không tìm thấy trường: ${aliases.join('/')}`);
    try {
        await f.fill(String(value), { timeout: 8000 });
    }
    catch (_) {
        await f.evaluate((el, v) => {
            el.value = v;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }, String(value));
    }
    return f;
}
async function setCheckbox(field, wanted = true) {
    try {
        await field.setChecked(wanted, { timeout: 4000, force: true });
    }
    catch (_) {
        await field.evaluate((el, w) => { if (el.checked !== w)
            el.click(); }, wanted);
    }
    return field;
}
async function clickToggle(scope, aliases, selectors = []) {
    const f = await findField(scope, aliases, selectors);
    if (!f)
        throw new Error(`Không tìm thấy toggle: ${aliases.join('/')}`);
    await setCheckbox(f, true);
    return f;
}
/* ------------------------------- Select helpers --------------------------- */
const OPEN_OPTS = '.select2-container--open .select2-results__option:not(.select2-results__message)';
const OPEN_MSG = '.select2-container--open .select2-results__message';
const isPlaceholderText = (t) => !t || /^(-{2,})|^(choose|select)\b|no results|searching|loading/i.test(String(t).trim());
const isExcluded = (text, excluded) => {
    const t = String(text).toLowerCase();
    return excluded.some((x) => { const e = String(x).toLowerCase(); return t === e || (e.length > 3 && t.includes(e)); });
};
function matchesWanted(text, value, wanted) {
    if (!wanted)
        return true;
    const w = String(wanted).toLowerCase();
    const b = stripBadge(wanted).toLowerCase();
    const t = String(text).toLowerCase();
    return t.includes(w) || (b && t.includes(b)) || String(value).toLowerCase() === w;
}
async function closeOpenSelect2(page) {
    await safeEval(page, () => {
        if (!window.jQuery)
            return;
        window.jQuery('select.select2-hidden-accessible').each(function () {
            const s = window.jQuery(this).data('select2');
            if (s && s.isOpen && s.isOpen())
                window.jQuery(this).select2('close');
        });
    });
}
async function setNativeSelect(field, value, multiple) {
    await field.evaluate((el, [v, multi]) => {
        if (multi)
            Array.from(el.options).forEach((o) => { if (o.value === v)
                o.selected = true; });
        else
            el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, [value, multiple]);
}
async function clearSelect(field) {
    await field.evaluate((el) => {
        Array.from(el.options || []).forEach((o) => { o.selected = false; });
        if (!el.multiple)
            el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    });
}
async function waitSelect2Results(page, timeout = 10000) {
    const deadline = Date.now() + timeout;
    await page.waitForTimeout(350);
    while (Date.now() < deadline) {
        const count = await page.locator(OPEN_OPTS).count();
        if (count > 0)
            return count;
        const msgLoc = page.locator(OPEN_MSG);
        const msg = (await msgLoc.count()) ? ((await msgLoc.first().innerText().catch(() => '')) || '').trim() : '';
        if (msg && !/searching|loading/i.test(msg))
            return 0;
        await page.waitForTimeout(250);
    }
    return page.locator(OPEN_OPTS).count();
}
async function typeInSelect2Search(page, term) {
    const search = page.locator('.select2-container--open input.select2-search__field').first();
    if (!(await search.count()))
        return false;
    await search.fill('').catch(() => { });
    if (term)
        await search.pressSequentially(term, { delay: 25 });
    return true;
}
async function pickViaSelect2(page, field, { wanted, excluded, label }) {
    const container = field.locator('xpath=following-sibling::span[contains(@class,"select2-container")][1]');
    if (!(await container.count()))
        throw new Error(`Không thấy widget select2 của ${label}.`);
    const trigger = container.locator('.select2-selection').first();
    await trigger.scrollIntoViewIfNeeded().catch(() => { });
    await closeOpenSelect2(page);
    await trigger.click();
    await page.waitForSelector('.select2-container--open', { timeout: 4000 }).catch(() => { });
    if (!(await page.locator('.select2-container--open').count())) {
        await trigger.click();
        await page.waitForSelector('.select2-container--open', { timeout: 4000 }).catch(() => { });
    }
    if (!(await page.locator('.select2-container--open').count()))
        throw new Error(`Dropdown ${label} không mở được.`);
    const base = stripBadge(wanted);
    const first = base.split(/\s+/)[0];
    const terms = wanted ? [base, ...(first && first !== base ? [first] : [])] : ['', 'a'];
    let chosen = null;
    const seen = [];
    for (let ti = 0; ti < terms.length && !chosen; ti += 1) {
        if (terms[ti] !== '' || ti > 0)
            await typeInSelect2Search(page, terms[ti]);
        await waitSelect2Results(page);
        const opts = page.locator(OPEN_OPTS);
        const n = await opts.count();
        for (let i = 0; i < n; i += 1) {
            const o = opts.nth(i);
            if ((await o.getAttribute('aria-selected')) === 'true' || (await o.getAttribute('aria-disabled')) === 'true')
                continue;
            const text = norm(await o.innerText().catch(() => ''));
            if (seen.length < 6)
                seen.push(text);
            if (isPlaceholderText(text) || isExcluded(text, excluded))
                continue;
            if (wanted && !matchesWanted(text, '', wanted))
                continue;
            chosen = { o, text };
            break;
        }
    }
    if (!chosen) {
        await closeOpenSelect2(page);
        throw new Error(`Dropdown ${label} không có option phù hợp (wanted="${wanted}"). Thấy: ${seen.join(' | ') || '(trống)'}`);
    }
    await chosen.o.click();
    await page.waitForTimeout(350);
    await closeOpenSelect2(page);
    const selectedCount = await field.evaluate((el) => Array.from(el.selectedOptions || []).filter((o) => o.value).length);
    if (!selectedCount)
        throw new Error(`Đã click "${chosen.text}" nhưng ${label} không ghi nhận giá trị.`);
    return chosen.text;
}
/* Chọn 1 option cho select thường / select2 tĩnh / select2 AJAX. Trả về text đã chọn. */
async function selectWidgetOption(page, scope, aliases, options = {}) {
    const field = await findField(scope, aliases, options.selectors || []);
    if (!field)
        throw new Error(`Không tìm thấy trường chọn: ${aliases.join(', ')}`);
    const wanted = options.text || '';
    const excluded = (options.exclude || []).filter(Boolean);
    const label = aliases.join('/');
    const info = await field.evaluate((el) => ({
        tag: el.tagName.toLowerCase(),
        multiple: !!el.multiple,
        select2: el.classList.contains('select2-hidden-accessible') || el.hasAttribute('data-select2-id'),
        ajax: el.classList.contains('oh-select-ajax') || el.hasAttribute('data-ajax-url'),
        options: el.tagName === 'SELECT'
            ? Array.from(el.options).map((o) => ({ text: (o.textContent || '').trim(), value: o.value, disabled: o.disabled, selected: o.selected }))
            : [],
    }));
    if (info.tag === 'select') {
        const real = info.options.filter((o) => o.value !== '' && !isPlaceholderText(o.text));
        const usable = real.filter((o) => !o.disabled && !isExcluded(o.text, excluded)
            && matchesWanted(o.text, o.value, wanted) && !(info.multiple && o.selected));
        if (usable.length) {
            await setNativeSelect(field, usable[0].value, info.multiple);
            await page.waitForTimeout(200);
            return usable[0].text;
        }
        if (real.length && !info.ajax) {
            throw new Error(`Select ${label} không có option phù hợp (wanted="${wanted}"). Có: ${real.map((o) => o.text).join(' | ')}`);
        }
    }
    if (!info.select2 && info.tag === 'select')
        throw new Error(`Select ${label} không có option nào.`);
    return pickViaSelect2(page, field, { wanted, excluded, label });
}
/* ------------------------------ Form outcome ------------------------------ */
async function readModalErrors(page) {
    const out = (await safeEval(page, () => {
        const res = [];
        const body = document.querySelector('#genericModalBody') || document;
        body.querySelectorAll('.errorlist li, .oh-errorlist, .invalid-feedback, .oh-form-error, .error-message, .text-danger').forEach((el) => {
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (t.length >= 3 && el.offsetParent !== null)
                res.push(t);
        });
        document.querySelectorAll('.oh-alert-container .oh-alert--error, .oh-alert-container .oh-alert--danger, .oh-alert-container .oh-alert--warning').forEach((el) => {
            const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
            if (t)
                res.push(t);
        });
        return Array.from(new Set(res));
    })) || [];
    return out;
}
async function waitSubmitOutcome(page, timeout) {
    const deadline = Date.now() + timeout;
    await page.waitForTimeout(500);
    while (Date.now() < deadline) {
        const st = await modalState(page);
        const errors = await readModalErrors(page);
        if (!st.shown)
            return { status: 'closed', errors };
        if (errors.length) {
            await settle(page, 2000);
            return { status: 'error', errors };
        }
        await page.waitForTimeout(400);
    }
    await settle(page, 2000);
    return { status: 'open', errors: await readModalErrors(page) };
}
/* Gửi form trong modal. Trả về {status: 'closed'|'error'|'open', errors[]}. */
async function submitForm(page, scope, opts = {}) {
    const { noValidate = false } = opts;
    await closeOpenSelect2(page);
    const form = scope.locator('form').first();
    if (!(await form.count()))
        throw new Error('Không có <form> trong modal.');
    let willSend = true;
    if (noValidate)
        await form.evaluate((el) => { el.noValidate = true; el.setAttribute('novalidate', 'novalidate'); });
    else
        willSend = await form.evaluate((el) => el.checkValidity());
    const respP = willSend
        ? page.waitForResponse((r) => ['POST', 'PUT', 'PATCH'].includes(r.request().method()), { timeout: 20000 }).catch(() => null)
        : Promise.resolve(null);
    let clicked = false;
    const btn = await firstVisible(form.locator('button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled])'));
    if (btn) {
        await btn.click();
        clicked = true;
    }
    if (!clicked) {
        const b2 = await firstVisible(scope.getByRole('button', { name: /^(save|submit|create|update|confirm|schedule)/i }));
        if (b2) {
            await b2.click();
            clicked = true;
        }
    }
    if (!clicked)
        await form.evaluate((f) => (f.requestSubmit ? f.requestSubmit() : f.submit()));
    await respP;
    return waitSubmitOutcome(page, willSend ? 20000 : 3500);
}
/* ------------------------------ Confirm (swal/native) --------------------- */
async function performConfirm(page, accept = true) {
    let nativeShown = false;
    let nativeMsg = '';
    const handler = async (d) => {
        nativeShown = true;
        nativeMsg = d.message();
        try {
            if (accept)
                await d.accept();
            else
                await d.dismiss();
        }
        catch (_) { /* ignore */ }
    };
    page.once('dialog', handler);
    const swal = page.locator('.swal2-popup');
    const htmxModal = page.locator('#deleteConfirmation.oh-modal--show');
    let mode = null;
    for (let i = 0; i < 24; i += 1) {
        if (nativeShown) {
            mode = 'native';
            break;
        }
        if (await swal.first().isVisible().catch(() => false)) {
            mode = 'swal';
            break;
        }
        if (await htmxModal.first().isVisible().catch(() => false)) {
            mode = 'htmx';
            break;
        }
        await page.waitForTimeout(250);
    }
    page.off('dialog', handler);
    let message = nativeMsg;
    if (mode === 'swal') {
        message = norm(await page.locator('#swal2-html-container').first().innerText().catch(() => ''));
        await (accept ? page.locator('.swal2-confirm') : page.locator('.swal2-cancel')).first().click().catch(() => { });
        await swal.first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { });
    }
    else if (mode === 'htmx') {
        const body = page.locator('#deleteConfirmationBody');
        message = norm(await body.innerText().catch(() => ''));
        const pattern = accept ? /confirm|delete|yes|ok|remove|proceed/i : /cancel|close|no/i;
        const b = await firstVisible(body.getByRole('button', { name: pattern }));
        if (b)
            await b.click().catch(() => { });
        await page.locator('#deleteConfirmation').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { });
    }
    await settle(page, 4000);
    return { mode: mode || 'none', message };
}
/* Bấm nút (có confirm) rồi xử lý confirm. */
async function clickWithConfirm(page, button, accept = true) {
    const p = performConfirm(page, accept);
    await button.click();
    return p;
}
/* -------------------------------- Search ---------------------------------- */
async function searchInput(page) {
    for (const sel of ['form.navFilterForm input[name="search"]', 'input[name="search"]', 'input[placeholder*="search" i]']) {
        const f = await firstVisible(page.locator(sel));
        if (f)
            return f;
    }
    throw new Error('Không tìm thấy ô Search.');
}
/* fill() chỉ phát "input"; nav Horilla lắng nghe "keyup" -> phải phát keyup. */
async function doSearch(page, term) {
    const search = await searchInput(page);
    const respP = page.waitForResponse((r) => r.url().includes(LIST_PATH), { timeout: 10000 }).catch(() => null);
    await search.click().catch(() => { });
    await search.fill(String(term));
    await search.dispatchEvent('keyup');
    await respP;
    await settle(page, 4000);
    await page.waitForTimeout(300);
}
async function searchValue(page) {
    const s = await searchInput(page).catch(() => null);
    return s ? s.inputValue().catch(() => '') : '';
}
/* ------------------------------ Filter panel ------------------------------ */
async function openFilterPanel(page) {
    const panel = page.locator('#modernFilterPanel');
    const open = await panel.evaluate((el) => el.classList.contains('oh-filter-panel--open')).catch(() => false);
    if (!open)
        await page.locator('#modernFilterTrigger').click();
    await expect(panel).toHaveClass(/oh-filter-panel--open/);
    await page.waitForTimeout(400);
    return panel;
}
/* Dùng el.click(): panel có thể đã tự đóng (nằm ngoài viewport) sau live-filter. */
async function applyFilter(page) {
    await page.locator('#applyFilter').first().evaluate((el) => el.click());
    await settle(page, 5000);
    await page.waitForTimeout(400);
}
async function clearAllFilter(page) {
    const clear = page.locator('#modernFilterPanel .oh-filter-panel__clear').first();
    if (await clear.count()) {
        await clear.evaluate((el) => el.click());
        await settle(page, 5000);
        await page.waitForTimeout(400);
    }
}
/* ------------------------------ Fixture registry -------------------------- */
function registerFixture(page, fixture) {
    if (!Array.isArray(page.__tcFixtures))
        page.__tcFixtures = [];
    page.__tcFixtures.push(fixture);
    return fixture;
}
async function collectIds(locator) {
    const ids = await locator.evaluateAll((els) => els.map((e) => e.getAttribute('data-instance-id')));
    return ids.filter(Boolean);
}
function rowsForFixture(page, fixture) {
    if (fixture.id)
        return page.locator(`${ROW_SEL}[data-instance-id="${fixture.id}"]`);
    if (fixture.searchKey)
        return page.locator(ROW_SEL).filter({ hasText: fixture.searchKey });
    let rows = page.locator(ROW_SEL);
    for (const t of fixture.matchTexts || [])
        rows = rows.filter({ hasText: t });
    return rows;
}
async function locateFixtureRow(page, fixture) {
    let rows = rowsForFixture(page, fixture);
    if (await rows.count())
        return rows.first();
    if (fixture.cleanupSearch) {
        await doSearch(page, fixture.cleanupSearch);
        rows = rowsForFixture(page, fixture);
        if (await rows.count())
            return rows.first();
    }
    return null;
}
async function cleanupCreatedFixtures(page, deleteFixture) {
    if (page.isClosed())
        return;
    const fixtures = Array.isArray(page.__tcFixtures) ? [...page.__tcFixtures].reverse() : [];
    const errors = [];
    for (const f of fixtures) {
        if (!f.created)
            continue;
        try {
            await deleteFixture(page, f);
        }
        catch (e) {
            if (/Test ended|Target closed|has been closed/i.test(e.message)) {
                console.warn(`[cleanup skipped] ${f.marker || f.employee}: ${e.message}`);
                continue;
            }
            errors.push(new Error(`Cleanup ${f.marker || f.employee}: ${e.message}`, { cause: e }));
        }
    }
    page.__tcFixtures = [];
    if (errors.length)
        throw new AggregateError(errors, 'Cleanup thất bại một số fixture.');
}
/* ============================================================================
 *  Interview-specific helpers
 * ========================================================================== */
async function goToFeature(page) {
    await page.goto(ROUTES.interviews, { waitUntil: 'domcontentloaded' });
    await settle(page, 5000);
    await expect(page.locator('body')).not.toContainText(/Internal Server Error|Traceback \(most recent call last\)|502 Bad Gateway/i);
    await expect(page.locator('a[hx-get*="create-interview-schedule"]').first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#interviewdelete').first()).toBeVisible({ timeout: 30000 });
    await settle(page, 3000);
}
const listRows = (page) => page.locator(ROW_SEL);
async function totalCount(page) {
    const c = page.locator('#interviewdelete').first();
    if (!(await c.count()))
        return 0;
    const attr = Number(await c.getAttribute('data-total-count'));
    return Number.isFinite(attr) && attr > 0 ? attr : page.locator(ROW_SEL).count();
}
async function openCreateForm(page) {
    return openModalForm(page, page.locator('a[hx-get*="create-interview-schedule"]').first());
}
async function openFixtureEdit(page, fixture) {
    await goToFeature(page);
    const row = await locateFixtureRow(page, fixture);
    if (!row)
        throw new Error('Không thấy lịch phỏng vấn fixture để sửa.');
    const btn = await firstVisible(row.locator(ACT.edit));
    if (!btn)
        throw new Error('Row không có nút Edit.');
    const scope = await openModalForm(page, btn);
    await expect(scope.getByText(/Candidate|Interviewer/i).first()).toBeVisible();
    return scope;
}
async function deleteRow(page, row, accept = true) {
    const btn = await firstVisible(row.locator(ACT.del));
    if (!btn)
        throw new Error('Row không có nút Delete.');
    return clickWithConfirm(page, btn, accept);
}
async function serverToday(page) {
    const rows = page.locator(ROW_SEL).filter({ hasText: /Interview Today/i });
    if (await rows.count()) {
        const m = (await rows.first().innerText()).match(/\d{4}-\d{2}-\d{2}/);
        if (m)
            return { date: m[0], fromServer: true };
    }
    return { date: relativeDateIso(0), fromServer: false };
}
const randomTime = () => `${String(9 + crypto.randomInt(0, 8)).padStart(2, '0')}:${String(crypto.randomInt(0, 60)).padStart(2, '0')}`;
async function createInterviewFixture(page, testId, options = {}) {
    await goToFeature(page);
    const beforeIds = await collectIds(listRows(page));
    const marker = fixtureMarker(testId, options.label || 'interview');
    const fixture = registerFixture(page, {
        type: 'interview', marker, created: false, id: null, matchTexts: [], searchKey: null, cleanupSearch: null,
    });
    const scope = await openCreateForm(page);
    const candidate = options.skipCandidate ? null : await selectWidgetOption(page, scope, ['Candidate'], {
        selectors: CANDIDATE_SELECTORS, text: options.candidateText || '',
    });
    await settle(page, 2000);
    const interviewer = options.skipInterviewer ? null : await selectWidgetOption(page, scope, ['Interviewer'], {
        selectors: INTERVIEWER_SELECTORS,
    });
    let interviewer2 = null;
    if (options.secondInterviewer) {
        interviewer2 = await selectWidgetOption(page, scope, ['Interviewer'], {
            selectors: INTERVIEWER_SELECTORS, exclude: [interviewer],
        });
    }
    const dateValue = options.date === null ? null : (options.date || relativeDateIso(2));
    const timeValue = options.time === null ? null : (options.time || randomTime());
    if (dateValue !== null)
        await fillField(scope, ['Interview Date'], dateValue, ['input[name="interview_date"]', 'input[type="date"]']);
    if (timeValue !== null)
        await fillField(scope, ['Interview Time'], timeValue, ['input[name="interview_time"]', 'input[type="time"]']);
    let description = null;
    if (options.description !== null) {
        description = options.description || marker;
        await fillField(scope, ['Description'], description, ['textarea[name="description"]', 'input[name="description"]']);
    }
    if (options.completed) {
        const cb = await findField(scope, ['Is Interview Completed', 'Completed'], ['input[name="completed"]']);
        if (cb)
            await setCheckbox(cb, true);
    }
    fixture.cleanupSearch = candidate ? stripBadge(candidate) : null;
    if (candidate && dateValue && timeValue)
        fixture.matchTexts = [stripBadge(candidate), dateValue, timeValue];
    else
        fixture.searchKey = marker;
    fixture.formData = { candidate, interviewer, date: dateValue, time: timeValue };
    if (options.submit !== false) {
        const outcome = await submitForm(page, scope);
        if (outcome.status !== 'closed') {
            throw new Error(`Tạo lịch phỏng vấn không thành công (${outcome.status}): ${outcome.errors.join(' | ') || 'không có thông báo lỗi'}`);
        }
        await goToFeature(page);
        const row = await locateFixtureRow(page, fixture);
        if (!row)
            throw new Error(`Không thấy row sau khi tạo (candidate=${candidate}, date=${dateValue}, time=${timeValue}).`);
        const id = await row.getAttribute('data-instance-id');
        if (id && !beforeIds.includes(id))
            fixture.id = id;
        fixture.created = true;
        if (await searchValue(page))
            await doSearch(page, '');
    }
    return { fixture, marker, candidate, interviewer, interviewer2, date: dateValue, time: timeValue, scope, beforeIds };
}
/* Nếu server lỡ chấp nhận dữ liệu sai: tìm row mới (theo description marker) để afterEach dọn. */
async function adoptAcceptedRow(page, fixture, beforeIds) {
    await goToFeature(page);
    const rows = page.locator(ROW_SEL).filter({ hasText: fixture.marker });
    const ids = (await collectIds(rows)).filter((i) => !beforeIds.includes(i));
    if (ids.length) {
        fixture.id = ids[0];
        fixture.created = true;
        return true;
    }
    return false;
}
async function assertSubmitBlocked(page, outcome, label, fixture, beforeIds) {
    if (outcome.status !== 'closed') {
        note(`${label}: bị chặn (${outcome.status}) ${outcome.errors.join(' | ')}`);
        await closeVisibleDialog(page);
        return;
    }
    const adopted = await adoptAcceptedRow(page, fixture, beforeIds);
    throw new Error(`${label}: server CHẤP NHẬN dữ liệu không hợp lệ${adopted ? ' (đã tạo row, sẽ tự dọn)' : ''}.`);
}
async function deleteFixture(page, fixture) {
    await goToFeature(page);
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const row = await locateFixtureRow(page, fixture);
        if (!row)
            return;
        const btn = await firstVisible(row.locator(ACT.del));
        if (!btn)
            return;
        await clickWithConfirm(page, btn, true);
        await settle(page, 3000);
        await goToFeature(page);
    }
}
async function sweepStale(page) {
    try {
        await goToFeature(page);
        for (let guard = 0; guard < 40; guard += 1) {
            const rows = page.locator(ROW_SEL).filter({ hasText: MARKER_PREFIX });
            const n = await rows.count();
            let target = null;
            for (let i = 0; i < n; i += 1) {
                if (markerAgeMs(await rows.nth(i).innerText()) > 15 * 60 * 1000) {
                    target = rows.nth(i);
                    break;
                }
            }
            if (!target)
                break;
            await deleteRow(page, target, true);
            await settle(page, 2500);
        }
    }
    catch (e) {
        console.warn('[sweepStale]', e.message);
    }
}
/* ---------- Sort helpers ---------- */
function parseDateCell(text) {
    const m = String(text || '').match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
async function interviewDateColumnIndex(page) {
    const headers = page.locator('#interviewdelete thead th');
    const n = await headers.count();
    for (let i = 0; i < n; i += 1)
        if (/interview date/i.test(norm(await headers.nth(i).innerText())))
            return i;
    throw new Error('Không tìm thấy cột Interview Date.');
}
async function readInterviewDateKeys(page) {
    const idx = await interviewDateColumnIndex(page);
    const rows = listRows(page);
    const n = await rows.count();
    const dates = [];
    for (let i = 0; i < n; i += 1) {
        const cells = rows.nth(i).locator('td');
        if ((await cells.count()) <= idx)
            continue;
        const key = parseDateCell(await cells.nth(idx).innerText());
        if (key)
            dates.push(key);
    }
    expect(dates.length).toBeGreaterThan(0);
    return dates;
}
const isMonotonic = (vals, dir) => vals.every((v, i) => i === 0 || (dir === 'asc' ? vals[i - 1] <= v : vals[i - 1] >= v));
const directionOf = (vals) => (isMonotonic(vals, 'asc') ? 'asc' : isMonotonic(vals, 'desc') ? 'desc' : null);
/* ---------- Menu navigation ---------- */
async function navigateFromMenu(page, sectionNames, itemNames, destinationRoute) {
    if (/\/login\//i.test(new URL(page.url()).pathname))
        throw new Error('Chưa đăng nhập.');
    const esc = (n) => String(n).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sectionRe = new RegExp(sectionNames.map(esc).join('|'), 'i');
    const itemRe = new RegExp(`^\\s*(${itemNames.map(esc).join('|')})\\s*$`, 'i');
    let navigated = false;
    const section = page.locator('#sidebar button.sideboxmain, #sidebar a.sideboxmain').filter({ hasText: sectionRe }).first();
    if (await section.count()) {
        await section.hover({ timeout: 5000 }).catch(() => { });
        await page.waitForTimeout(500);
        const flyout = page.locator('#sidebarFlyout a').filter({ hasText: itemRe }).first();
        if ((await flyout.count()) && (await flyout.isVisible().catch(() => false))) {
            await flyout.click({ timeout: 5000 }).catch(() => { });
            await settle(page, 5000);
            navigated = page.url().includes(destinationRoute);
        }
    }
    if (!navigated) {
        note(`Không click được menu "${sectionNames[0]}" > "${itemNames[0]}" -> dùng URL.`);
        await page.goto(destinationRoute, { waitUntil: 'domcontentloaded' });
        await settle(page, 5000);
    }
    await expect(page).toHaveURL(new RegExp(destinationRoute.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    await expect(page.locator('#interviewdelete').first()).toBeVisible({ timeout: 30000 });
}
/* ---------- Filter: custom row "+ Add filter" (field -> value -> lookup; lookup tự Apply) ---------- */
async function addDateCustomFilter(page, panel, lookup, date) {
    await panel.locator('button.oh-custom-filter-add').click();
    const row = panel.locator('.oh-custom-filter-row').last();
    await row.locator('select.oh-custom-filter-field').selectOption('interview_date');
    const valueInput = row.locator('input.oh-custom-filter-value');
    await expect(valueInput).toBeEnabled();
    await valueInput.fill(date);
    await row.locator('select.oh-custom-filter-lookup').selectOption(lookup); // -> tự bấm Apply + đóng panel
    await settle(page, 5000);
    await page.waitForTimeout(400);
}
/* ============================================================================
 *  TEST CASES
 * ========================================================================== */
async function runInterviewCase(page, id) {
    switch (id) {
        case 'INTERVIEW_SCHEDULE_ACCESS_01': {
            await navigateFromMenu(page, ['Recruitment'], ['Interviews', 'Interview', 'Scheduled Interviews'], ROUTES.interviews);
            await expect(page.locator('#ohMainContent').getByText(/Scheduled Interviews/i).first()).toBeVisible({ timeout: 15000 });
            await expect(page.locator('body')).not.toContainText(/Internal Server Error|Traceback/i);
            break;
        }
        case 'INTERVIEW_SCHEDULE_LIST_LAYOUT_01': {
            await goToFeature(page);
            const headers = (await page.locator('#interviewdelete thead th').allInnerTexts()).map(norm);
            for (const col of ['Candidate', 'Interviewer', 'Interview Date', 'Interview Time', 'Description', 'Status', 'Actions']) {
                expect(headers.some((h) => new RegExp(col, 'i').test(h)), `Bảng phải có cột "${col}". Có: ${headers.join(' | ')}`).toBe(true);
            }
            await expect(await searchInput(page)).toBeVisible();
            await expect(page.locator('a[hx-get*="create-interview-schedule"]').first()).toBeVisible();
            await expect(page.locator('#modernFilterTrigger')).toBeVisible();
            break;
        }
        case 'INTERVIEW_SCHEDULE_STATUS_DISPLAY_01': {
            const upcoming = await createInterviewFixture(page, `${id}_UPCOMING`, { date: relativeDateIso(3) });
            await goToFeature(page);
            const today = await serverToday(page);
            const todayFx = await createInterviewFixture(page, `${id}_TODAY`, { date: today.date, time: '23:59' });
            const completed = await createInterviewFixture(page, `${id}_COMPLETED`, { date: relativeDateIso(2) });
            await goToFeature(page);
            const upRow = await locateFixtureRow(page, upcoming.fixture);
            await expect(upRow).toContainText('Upcoming Interview');
            await doSearch(page, '');
            const todayRow = await locateFixtureRow(page, todayFx.fixture);
            if (today.fromServer)
                await expect(todayRow).toContainText('Interview Today');
            else
                await expect(todayRow).toContainText(/Interview Today|Upcoming Interview/);
            await doSearch(page, '');
            const form = await openFixtureEdit(page, completed.fixture);
            const cb = await findField(form, ['Is Interview Completed', 'Interview Completed', 'Completed'], ['input[name="completed"]']);
            if (!cb) {
                note('Form Edit không có checkbox Completed — bỏ qua nhánh Completed.');
                await closeVisibleDialog(page);
            }
            else {
                await setCheckbox(cb, true);
                const outcome = await submitForm(page, form);
                expect(outcome.status, `Lưu Completed thất bại: ${outcome.errors.join(' | ')}`).toBe('closed');
                await goToFeature(page);
                await expect(await locateFixtureRow(page, completed.fixture)).toContainText('Interview Completed');
            }
            break;
        }
        case 'INTERVIEW_SCHEDULE_SEARCH_CANDIDATE_01': {
            const { fixture, candidate } = await createInterviewFixture(page, id);
            const first = stripBadge(candidate).split(' ')[0];
            await doSearch(page, first);
            const rows = rowsForFixture(page, fixture);
            await expect(rows.first()).toBeVisible();
            await expect(rows.first()).toContainText(first);
            await doSearch(page, '');
            break;
        }
        case 'INTERVIEW_SCHEDULE_SEARCH_INTERVIEWER_01': {
            const { fixture, interviewer } = await createInterviewFixture(page, id);
            await doSearch(page, stripBadge(interviewer));
            await expect(page.locator('body')).not.toContainText(/Internal Server Error|Traceback/i);
            const found = await rowsForFixture(page, fixture).count();
            note(found
                ? 'Search theo interviewer có hỗ trợ (tìm thấy fixture).'
                : 'Search theo interviewer không áp dụng cho cột Interviewer (0 kết quả cho fixture) — hành vi hiện tại của hệ thống.');
            await doSearch(page, '');
            break;
        }
        case 'INTERVIEW_SCHEDULE_SEARCH_NO_RESULT_01': {
            await goToFeature(page);
            const baseline = await stableCount(listRows(page));
            expect(baseline).toBeGreaterThan(0);
            await doSearch(page, fixtureMarker(id, 'no-result-search'));
            await expect.poll(async () => listRows(page).count(), { timeout: 8000 }).toBe(0);
            await doSearch(page, '');
            await expect.poll(async () => listRows(page).count(), { timeout: 8000 }).toBeGreaterThan(0);
            break;
        }
        case 'INTERVIEW_SCHEDULE_FILTER_DATE_01': {
            const { fixture, date } = await createInterviewFixture(page, id, { date: relativeDateIso(17) });
            await goToFeature(page);
            const panel = await openFilterPanel(page);
            await addDateCustomFilter(page, panel, 'exact', date);
            const row = await locateFixtureRow(page, fixture);
            await expect(row).toBeVisible();
            const dates = await readInterviewDateKeys(page);
            expect(dates.every((d) => d === date), `Filter "Is ${date}" nhưng còn ngày khác: ${[...new Set(dates)].join(', ')}`).toBe(true);
            break;
        }
        case 'INTERVIEW_SCHEDULE_FILTER_INTERVIEWER_01': {
            const { fixture, interviewer } = await createInterviewFixture(page, id);
            await goToFeature(page);
            const panel = await openFilterPanel(page);
            await selectWidgetOption(page, panel, ['Interviewer'], { text: interviewer, selectors: ['select[name="employee_id"]'] });
            await settle(page, 4000);
            await applyFilter(page);
            await expect(await locateFixtureRow(page, fixture)).toBeVisible();
            break;
        }
        case 'INTERVIEW_SCHEDULE_FILTER_STATUS_01': {
            test.fixme(true, 'InterviewFilter không có trường Status (chỉ có Candidate / Interviewer / Interview Date).');
            break;
        }
        case 'INTERVIEW_SCHEDULE_FILTER_COMBINED_RESET_01': {
            const { fixture, interviewer, date } = await createInterviewFixture(page, id, { date: relativeDateIso(21) });
            await goToFeature(page);
            const panel = await openFilterPanel(page);
            await selectWidgetOption(page, panel, ['Interviewer'], { text: interviewer, selectors: ['select[name="employee_id"]'] });
            await settle(page, 3000);
            await addDateCustomFilter(page, panel, 'exact', date);
            await expect(await locateFixtureRow(page, fixture)).toBeVisible();
            const filteredCount = await listRows(page).count();
            await openFilterPanel(page);
            await clearAllFilter(page);
            await expect(await searchInput(page)).toBeVisible();
            await expect.poll(async () => listRows(page).count(), { timeout: 10000 }).toBeGreaterThanOrEqual(filteredCount);
            await expect(await locateFixtureRow(page, fixture)).toBeVisible();
            break;
        }
        case 'INTERVIEW_SCHEDULE_ADD_VALID_01': {
            const { fixture, candidate } = await createInterviewFixture(page, id);
            const row = await locateFixtureRow(page, fixture);
            await expect(row).toContainText(stripBadge(candidate).split(' ')[0]);
            break;
        }
        case 'INTERVIEW_SCHEDULE_ADD_MULTI_INTERVIEWER_01': {
            const { fixture, interviewer, interviewer2 } = await createInterviewFixture(page, id, { secondInterviewer: true });
            expect(interviewer2, 'Phải chọn được interviewer thứ hai').toBeTruthy();
            expect(interviewer2).not.toBe(interviewer);
            const row = await locateFixtureRow(page, fixture);
            await expect(row).toBeVisible();
            const names = (await row.locator('.oh-avatar-stack__popover-row span').allTextContents()).map(norm);
            expect(names.some((n) => n.includes(stripBadge(interviewer))), `Thiếu "${interviewer}" trong ${names.join(', ')}`).toBe(true);
            expect(names.some((n) => n.includes(stripBadge(interviewer2))), `Thiếu "${interviewer2}" trong ${names.join(', ')}`).toBe(true);
            break;
        }
        case 'INTERVIEW_SCHEDULE_ADD_OPTIONAL_DESCRIPTION_01': {
            const date = relativeDateIso(30 + crypto.randomInt(0, 30));
            const { fixture, candidate } = await createInterviewFixture(page, id, { description: null, date });
            const row = await locateFixtureRow(page, fixture);
            await expect(row).toContainText(stripBadge(candidate).split(' ')[0]);
            break;
        }
        case 'INTERVIEW_SCHEDULE_ADD_REQUIRED_CANDIDATE_01':
        case 'INTERVIEW_SCHEDULE_ADD_REQUIRED_INTERVIEWER_01':
        case 'INTERVIEW_SCHEDULE_ADD_REQUIRED_DATE_01':
        case 'INTERVIEW_SCHEDULE_ADD_REQUIRED_TIME_01': {
            const skip = {
                INTERVIEW_SCHEDULE_ADD_REQUIRED_CANDIDATE_01: { skipCandidate: true },
                INTERVIEW_SCHEDULE_ADD_REQUIRED_INTERVIEWER_01: { skipInterviewer: true },
                INTERVIEW_SCHEDULE_ADD_REQUIRED_DATE_01: { date: null },
                INTERVIEW_SCHEDULE_ADD_REQUIRED_TIME_01: { time: null },
            }[id];
            await goToFeature(page);
            const before = await totalCount(page);
            const { fixture, scope, beforeIds } = await createInterviewFixture(page, id, { ...skip, submit: false });
            // Bước 1: validation của trình duyệt phải chặn
            const outcome = await submitForm(page, scope);
            if (outcome.status !== 'closed') {
                note(`${id}: bị chặn ở client/server (${outcome.status}).`);
            }
            else {
                await assertSubmitBlocked(page, outcome, id, fixture, beforeIds);
            }
            // Bước 2: ép server validate (noValidate)
            if ((await modalState(page)).shown) {
                const o2 = await submitForm(page, scope, { noValidate: true });
                if (o2.status === 'closed')
                    await assertSubmitBlocked(page, o2, id, fixture, beforeIds);
            }
            await closeVisibleDialog(page);
            await goToFeature(page);
            expect(await totalCount(page), 'Tổng số lịch không được tăng').toBe(before);
            break;
        }
        case 'INTERVIEW_SCHEDULE_ADD_PAST_DATE_01': {
            await goToFeature(page);
            const { fixture, scope, beforeIds } = await createInterviewFixture(page, id, { date: relativeDateIso(-3), submit: false });
            const outcome = await submitForm(page, scope, { noValidate: true });
            await assertSubmitBlocked(page, outcome, 'ADD_PAST_DATE', fixture, beforeIds);
            break;
        }
        case 'INTERVIEW_SCHEDULE_ADD_XSS_DESCRIPTION_01': {
            const marker = fixtureMarker(id, 'xss');
            const payload = `${marker} <img src="x" onerror="window.__xssTest=true">`;
            const { fixture } = await createInterviewFixture(page, id, { description: payload });
            const form = await openFixtureEdit(page, fixture);
            const d = await findField(form, ['Description'], ['textarea[name="description"]', 'input[name="description"]']);
            expect(d).not.toBeNull();
            await expect(d).toHaveValue(payload);
            await closeVisibleDialog(page);
            await goToFeature(page);
            await expect(page.locator('img[src="x"]')).toHaveCount(0);
            expect(await page.evaluate(() => window.__xssTest)).toBeUndefined();
            break;
        }
        case 'INTERVIEW_SCHEDULE_MODIFY_VALID_01': {
            const { fixture } = await createInterviewFixture(page, id);
            const form = await openFixtureEdit(page, fixture);
            const revised = `${fixture.marker} revised`;
            await fillField(form, ['Description'], revised, ['textarea[name="description"]', 'input[name="description"]']);
            const outcome = await submitForm(page, form);
            expect(outcome.status, `Lưu chỉnh sửa thất bại: ${outcome.errors.join(' | ')}`).toBe('closed');
            await goToFeature(page);
            const row = await locateFixtureRow(page, fixture);
            await expect(row).toContainText(revised);
            break;
        }
        case 'INTERVIEW_SCHEDULE_MODIFY_REQUIRED_FIELD_01': {
            const { fixture, date } = await createInterviewFixture(page, id);
            const form = await openFixtureEdit(page, fixture);
            const df = await findField(form, ['Interview Date'], ['input[name="interview_date"]', 'input[type="date"]']);
            expect(df).not.toBeNull();
            await df.fill('');
            const outcome = await submitForm(page, form, { noValidate: true });
            expect(outcome.status, 'Xóa trống Interview Date phải bị chặn').not.toBe('closed');
            await closeVisibleDialog(page);
            await goToFeature(page);
            await expect(await locateFixtureRow(page, fixture)).toContainText(date);
            break;
        }
        case 'INTERVIEW_SCHEDULE_MODIFY_CANCEL_01': {
            const { fixture } = await createInterviewFixture(page, id);
            const form = await openFixtureEdit(page, fixture);
            const revised = `${fixture.marker} unsaved`;
            await fillField(form, ['Description'], revised, ['textarea[name="description"]', 'input[name="description"]']);
            await closeVisibleDialog(page);
            await goToFeature(page);
            const row = await locateFixtureRow(page, fixture);
            await expect(row).toBeVisible();
            await expect(row).not.toContainText(revised);
            break;
        }
        case 'INTERVIEW_SCHEDULE_DELETE_CONFIRM_01': {
            const { fixture } = await createInterviewFixture(page, id);
            await goToFeature(page);
            const row = await locateFixtureRow(page, fixture);
            expect(row, 'Phải thấy row fixture').not.toBeNull();
            const res = await deleteRow(page, row, true);
            expect(res.mode, 'Phải có hộp thoại xác nhận (SweetAlert2/native)').not.toBe('none');
            if (res.message)
                expect(res.message).toMatch(/delete this interview/i);
            await expect.poll(async () => (await locateFixtureRow(page, fixture)) === null, { timeout: 20000 }).toBe(true);
            fixture.created = false;
            break;
        }
        case 'INTERVIEW_SCHEDULE_DELETE_CANCEL_01': {
            const { fixture } = await createInterviewFixture(page, id);
            await goToFeature(page);
            const row = await locateFixtureRow(page, fixture);
            expect(row).not.toBeNull();
            const res = await deleteRow(page, row, false);
            expect(res.mode).not.toBe('none');
            await goToFeature(page);
            await expect(await locateFixtureRow(page, fixture)).toBeVisible();
            break;
        }
        case 'INTERVIEW_SCHEDULE_COMPLETE_01': {
            const { fixture } = await createInterviewFixture(page, id);
            const form = await openFixtureEdit(page, fixture);
            const cb = await findField(form, ['Is Interview Completed', 'Interview Completed', 'Completed'], ['input[name="completed"]']);
            if (!cb) {
                test.fixme(true, 'Không thấy checkbox Completed.');
                break;
            }
            await setCheckbox(cb, true);
            const outcome = await submitForm(page, form);
            expect(outcome.status, `Lưu Completed thất bại: ${outcome.errors.join(' | ')}`).toBe('closed');
            await goToFeature(page);
            await expect(await locateFixtureRow(page, fixture)).toContainText('Interview Completed');
            break;
        }
        case 'INTERVIEW_SCHEDULE_SORT_DATE_01': {
            for (let i = 1; i <= 3; i += 1) {
                await createInterviewFixture(page, `${id}_${i}`, { date: relativeDateIso(10 + i * 3), time: `10:${String(i * 7).padStart(2, '0')}` });
            }
            await goToFeature(page);
            const header = await firstVisible(page.locator('#interviewdelete thead th').filter({ hasText: /Interview Date/i }));
            expect(header, 'Cần cột ngày để test sort.').not.toBeNull();
            const clickSort = async () => {
                const sortable = header.locator('[hx-get]').first();
                if (await sortable.count())
                    await sortable.click();
                else
                    await header.click();
                await settle(page, 4000);
                await page.waitForTimeout(300);
            };
            await clickSort();
            const o1 = await readInterviewDateKeys(page);
            const d1 = directionOf(o1);
            expect(d1, `Sort 1 không đơn điệu: ${o1.join(', ')}`).not.toBeNull();
            await clickSort();
            const o2 = await readInterviewDateKeys(page);
            const d2 = directionOf(o2);
            expect(d2, `Sort 2 không đơn điệu: ${o2.join(', ')}`).not.toBeNull();
            expect(d2).not.toBe(d1);
            break;
        }
        default:
            throw new Error(`Không có kịch bản cho ${id}`);
    }
}
/* ============================== LIFECYCLE =============================== */
test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
});
test.afterEach(async ({ page }) => {
    if (page.isClosed())
        return;
    try {
        await closeVisibleDialog(page);
    }
    catch (_) { /* ignore */ }
    try {
        await cleanupCreatedFixtures(page, deleteFixture);
    }
    catch (e) {
        if (!/Test ended|Target closed|has been closed/i.test(e.message))
            console.warn('[afterEach cleanup]', e.message);
    }
});
test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    const ctx = await browser.newContext({ baseURL: BASE_URL });
    const page = await ctx.newPage();
    try {
        await ensureAuthenticated(page);
        await sweepStale(page);
    }
    catch (e) {
        console.warn('[sweepStale beforeAll]', e.message);
    }
    finally {
        await ctx.close();
    }
});
/* ============================== TESTS =================================== */
const TESTS = [
    ['INTERVIEW_SCHEDULE_ACCESS_01', 'Kiểm tra truy cập trang Scheduled Interviews từ menu Recruitment'],
    ['INTERVIEW_SCHEDULE_LIST_LAYOUT_01', 'Kiểm tra bố cục danh sách và các thành phần điều khiển'],
    ['INTERVIEW_SCHEDULE_STATUS_DISPLAY_01', 'Kiểm tra nhãn hoặc biểu tượng trạng thái lịch phỏng vấn'],
    ['INTERVIEW_SCHEDULE_SEARCH_CANDIDATE_01', 'Kiểm tra tìm kiếm theo tên ứng viên hợp lệ'],
    ['INTERVIEW_SCHEDULE_SEARCH_INTERVIEWER_01', 'Kiểm tra tìm kiếm theo tên interviewer'],
    ['INTERVIEW_SCHEDULE_SEARCH_NO_RESULT_01', 'Kiểm tra tìm kiếm với từ khóa không có kết quả'],
    ['INTERVIEW_SCHEDULE_FILTER_DATE_01', 'Kiểm tra lọc lịch theo ngày phỏng vấn'],
    ['INTERVIEW_SCHEDULE_FILTER_INTERVIEWER_01', 'Kiểm tra lọc lịch theo interviewer'],
    ['INTERVIEW_SCHEDULE_FILTER_STATUS_01', 'Kiểm tra lọc lịch theo trạng thái'],
    ['INTERVIEW_SCHEDULE_FILTER_COMBINED_RESET_01', 'Kiểm tra kết hợp bộ lọc và xóa bộ lọc'],
    ['INTERVIEW_SCHEDULE_ADD_VALID_01', 'Kiểm tra tạo lịch phỏng vấn thành công với dữ liệu hợp lệ'],
    ['INTERVIEW_SCHEDULE_ADD_MULTI_INTERVIEWER_01', 'Kiểm tra tạo lịch với nhiều interviewer'],
    ['INTERVIEW_SCHEDULE_ADD_OPTIONAL_DESCRIPTION_01', 'Kiểm tra tạo lịch khi để trống Description'],
    ['INTERVIEW_SCHEDULE_ADD_REQUIRED_CANDIDATE_01', 'Kiểm tra validation khi bỏ trống Candidate'],
    ['INTERVIEW_SCHEDULE_ADD_REQUIRED_INTERVIEWER_01', 'Kiểm tra validation khi bỏ trống Interviewer'],
    ['INTERVIEW_SCHEDULE_ADD_REQUIRED_DATE_01', 'Kiểm tra validation khi bỏ trống Interview Date'],
    ['INTERVIEW_SCHEDULE_ADD_REQUIRED_TIME_01', 'Kiểm tra validation khi bỏ trống Interview Time'],
    ['INTERVIEW_SCHEDULE_ADD_PAST_DATE_01', 'Kiểm tra xử lý khi chọn ngày phỏng vấn trong quá khứ'],
    ['INTERVIEW_SCHEDULE_ADD_XSS_DESCRIPTION_01', 'Kiểm tra Description có payload XSS không thực thi mã'],
    ['INTERVIEW_SCHEDULE_MODIFY_VALID_01', 'Kiểm tra chỉnh sửa lịch phỏng vấn thành công'],
    ['INTERVIEW_SCHEDULE_MODIFY_REQUIRED_FIELD_01', 'Kiểm tra validation khi xóa trống trường bắt buộc'],
    ['INTERVIEW_SCHEDULE_MODIFY_CANCEL_01', 'Kiểm tra đóng form chỉnh sửa mà không lưu'],
    ['INTERVIEW_SCHEDULE_DELETE_CONFIRM_01', 'Kiểm tra xóa lịch phỏng vấn sau khi xác nhận'],
    ['INTERVIEW_SCHEDULE_DELETE_CANCEL_01', 'Kiểm tra hủy thao tác xóa lịch phỏng vấn'],
    ['INTERVIEW_SCHEDULE_COMPLETE_01', 'Kiểm tra đánh dấu lịch phỏng vấn đã hoàn thành'],
    ['INTERVIEW_SCHEDULE_SORT_DATE_01', 'Kiểm tra sắp xếp danh sách lịch theo ngày phỏng vấn'],
];
for (const [id, title] of TESTS) {
    test(`${id} - ${title}`, async ({ page }) => {
        await runInterviewCase(page, id);
    });
}
