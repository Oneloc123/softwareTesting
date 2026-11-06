'use strict';
const { test, expect: baseExpect } = require('@playwright/test');
const crypto = require('node:crypto');
const expect = baseExpect.configure({ timeout: 15_000 });
test.describe.configure({ timeout: 240_000 });
const BASE_URL = process.env.HORILLA_BASE_URL || 'https://hr.demo.horilla.com';
test.use({ baseURL: BASE_URL });
const MARKER_PREFIX = '[TC-RSA]';
const ROUTES = { workSchedules: '/employee/work-schedules/' };
const LIST_PATH = 'rotating-shift-request-list';
const ROW_SEL = '#rotating-shift-container.hlv-container table tbody tr[data-instance-id]';
const ACT = {
    edit: '[title="Edit" i], [hx-get*="rotating-shift-assign-update"]',
    del: '[title="Delete" i], [hx-post*="rotating-shift-assign-delete"]',
    archive: '[title="Archive" i], [hx-get*="rotating-shift-assign-archive"]',
    unarchive: '[title*="Un-archive" i], [title*="Unarchive" i], [hx-get*="un-archive"], [hx-get*="unarchive"]',
};
const CREATE_LINK = 'a[hx-get*="rotating-shift-assign-add"]';
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
 *  Rotating Shift Assign – helpers
 * ========================================================================== */
const rsaRows = (page) => page.locator(ROW_SEL);
async function openRotatingShiftPage(page) {
    await page.goto(ROUTES.workSchedules, { waitUntil: 'domcontentloaded' });
    await settle(page, 4000);
    const tab = await firstVisible(page.locator('.work-schedules-tab-btn[data-tab-id="rotating-shift"]'));
    if (tab) {
        const active = await tab.evaluate((el) => el.classList.contains('oh-tabs__tab--active'));
        if (!active) {
            await tab.click();
            await settle(page, 4000);
        }
    }
    await expect(page.locator(CREATE_LINK).first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/Rotating Shift Assigns/i).first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#rotating-shift-container.hlv-container').first()).toBeVisible({ timeout: 20000 });
    await settle(page, 2000);
    await expect(page.locator('body')).not.toContainText(/Internal Server Error|Traceback|502 Bad Gateway/i);
}
async function openCreateForm(page) {
    return openModalForm(page, page.locator(CREATE_LINK).first());
}
async function employeesInList(page) {
    const cells = await page.locator(`${ROW_SEL} td.stickyleft-second`).evaluateAll((els) => els.map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()));
    return cells.filter(Boolean);
}
/* ---------- field pickers (name thật của form RotatingShiftAssign) ---------- */
const pickEmployee = (page, scope, o = {}) => selectWidgetOption(page, scope, ['Employee'], {
    selectors: ['select[name="employee_id"]'], text: o.text || '', exclude: o.exclude || [],
});
const pickRotatingShift = (page, scope, text = '') => selectWidgetOption(page, scope, ['Rotating Shift'], {
    selectors: ['select[name="rotating_shift_id"]'], text,
});
async function fillBasedOn(page, scope, value = 'after') {
    const picked = await selectWidgetOption(page, scope, ['Based On'], { selectors: ['select[name="based_on"]'], text: value });
    await page.waitForTimeout(500); // basedOn.js ẩn/hiện các trường rotate_*
    return picked;
}
/* "Rotate" hiển thị trong bảng là cột tính toán; trong form là rotate_after_day / rotate_every_weekend / rotate_every. */
async function fillRotation(page, scope, basedOn = 'after', days = 7) {
    const kind = /week/i.test(basedOn) ? 'weekly' : /month/i.test(basedOn) ? 'monthly' : 'after';
    try {
        if (kind === 'after') {
            const f = await findField(scope, [], ['input[name="rotate_after_day"]']);
            if (f && await f.isVisible()) {
                await f.fill(String(days));
                return String(days);
            }
        }
        else {
            const name = kind === 'weekly' ? 'rotate_every_weekend' : 'rotate_every';
            const f = await findField(scope, [], [`select[name="${name}"]`]);
            if (f)
                return await selectWidgetOption(page, scope, [name], { selectors: [`select[name="${name}"]`] });
        }
    }
    catch (e) {
        note(`fillRotation(${kind}): ${e.message}`);
    }
    return null;
}
async function fillStartDate(scope, value) {
    return fillField(scope, ['Start Date'], value, ['input[name="start_date"]', 'input[type="date"]']);
}
/* ---------- fixtures ---------- */
async function createRsaFixture(page, testId, options = {}) {
    await openRotatingShiftPage(page);
    const beforeIds = await collectIds(rsaRows(page));
    const exclude = [...(await employeesInList(page)), ...(options.excludeEmployees || [])];
    const marker = fixtureMarker(testId, 'rsa');
    const fixture = registerFixture(page, {
        type: 'rsa', marker, created: false, id: null, employee: null, matchTexts: [], cleanupSearch: null,
    });
    const basedOn = options.basedOn || 'after';
    const startDate = options.startDate || relativeDateIso(1);
    let employee = null;
    let rotatingShift = null;
    let form = null;
    let lastErrors = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
        form = await openCreateForm(page);
        try {
            employee = options.employee || await pickEmployee(page, form, { text: options.employeeText, exclude });
        }
        catch (e) {
            if (!exclude.length)
                throw e;
            note(`Hết employee chưa có lịch xoay ca — chọn lại không loại trừ (${e.message}).`);
            employee = await pickEmployee(page, form, { text: options.employeeText });
        }
        await settle(page, 1500);
        rotatingShift = await pickRotatingShift(page, form, options.shiftText);
        await fillBasedOn(page, form, basedOn);
        await fillRotation(page, form, basedOn, options.rotate || 7);
        await fillStartDate(form, startDate);
        if (options.submit === false) {
            return { fixture, marker, employee, rotatingShift, basedOn, startDate, form, beforeIds };
        }
        const outcome = await submitForm(page, form);
        if (outcome.status === 'closed') {
            lastErrors = [];
            break;
        }
        lastErrors = outcome.errors;
        exclude.push(employee);
        await closeVisibleDialog(page);
        employee = null;
        if (options.employee)
            break;
    }
    if (!employee)
        throw new Error(`Tạo Rotating Shift Assign thất bại: ${lastErrors.join(' | ') || 'modal không đóng, không có thông báo lỗi'}`);
    fixture.employee = employee;
    fixture.cleanupSearch = stripBadge(employee);
    fixture.matchTexts = [badgeKey(employee)];
    await openRotatingShiftPage(page);
    await doSearch(page, fixture.cleanupSearch);
    const rows = rsaRows(page).filter({ hasText: badgeKey(employee) });
    const newIds = (await collectIds(rows)).filter((i) => !beforeIds.includes(i));
    if (!(await rows.count()))
        throw new Error(`Không thấy row cho ${employee} sau khi tạo.`);
    fixture.id = newIds[0] || null;
    fixture.created = true;
    await doSearch(page, '');
    return { fixture, marker, employee, rotatingShift, basedOn, startDate, beforeIds };
}
async function adoptNewRow(page, fixture, beforeIds, employee) {
    await openRotatingShiftPage(page);
    if (employee)
        await doSearch(page, stripBadge(employee));
    const rows = employee ? rsaRows(page).filter({ hasText: badgeKey(employee) }) : rsaRows(page);
    const ids = (await collectIds(rows)).filter((i) => !beforeIds.includes(i));
    if (ids.length) {
        fixture.id = ids[0];
        fixture.created = true;
        fixture.employee = employee || fixture.employee;
        fixture.cleanupSearch = employee ? stripBadge(employee) : null;
        return true;
    }
    return false;
}
async function deleteFixture(page, fixture) {
    await openRotatingShiftPage(page);
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const row = await locateFixtureRow(page, fixture);
        if (!row)
            return;
        const btn = await firstVisible(row.locator(ACT.del));
        if (!btn)
            return;
        await clickWithConfirm(page, btn, true);
        await settle(page, 3000);
        await openRotatingShiftPage(page);
    }
}
async function openEditForRow(page, row) {
    const btn = await firstVisible(row.locator(ACT.edit));
    if (!btn)
        throw new Error('Row không có nút Edit.');
    return openModalForm(page, btn);
}
/* ============================================================================
 *  TEST CASES
 * ========================================================================== */
async function runRotatingShiftCase(page, id) {
    switch (id) {
        case 'ROTATING_SHIFT_ACCESS_01': {
            await openRotatingShiftPage(page);
            await expect(page.locator('.work-schedules-tab-btn[data-tab-id="rotating-shift"]')).toHaveClass(/oh-tabs__tab--active/);
            await expect(page.getByText(/Rotating Shift Assigns/i).first()).toBeVisible();
            await expect(page.locator('#rotating-shift-container.hlv-container').first()).toBeVisible();
            break;
        }
        case 'ROTATING_SHIFT_TAB_NAV_01': {
            await openRotatingShiftPage(page);
            const wtTab = page.locator('.work-schedules-tab-btn[data-tab-id="rotating-work-type"]');
            await wtTab.click();
            await settle(page, 5000);
            await expect(wtTab).toHaveClass(/oh-tabs__tab--active/);
            const rsTab = page.locator('.work-schedules-tab-btn[data-tab-id="rotating-shift"]');
            await rsTab.click();
            await settle(page, 5000);
            await expect(rsTab).toHaveClass(/oh-tabs__tab--active/);
            await expect(page.locator(CREATE_LINK).first()).toBeVisible({ timeout: 30000 });
            break;
        }
        case 'ROTATING_SHIFT_LIST_LAYOUT_01': {
            await openRotatingShiftPage(page);
            const headersText = (await page.locator('#rotating-shift-container.hlv-container thead th').allInnerTexts()).map(norm);
            for (const col of ['Employee', 'Rotating Shift', 'Based on', 'Rotate', 'Start Date', 'Current Shift', 'Next Switch', 'Next Shift', 'Actions']) {
                expect(headersText.some((h) => new RegExp(col, 'i').test(h)), `Bảng phải có cột "${col}". Có: ${headersText.join(' | ')}`).toBe(true);
            }
            await expect(page.locator('form.navFilterForm input[name="search"]')).toBeVisible();
            await expect(page.locator('#modernFilterTrigger')).toBeVisible();
            await expect(page.locator(CREATE_LINK).first()).toBeVisible();
            break;
        }
        case 'ROTATING_SHIFT_LIST_DATA_01': {
            await openRotatingShiftPage(page);
            const rows = rsaRows(page);
            const count = await stableCount(rows);
            expect(count, 'Bảng phải có ít nhất 1 dòng dữ liệu mẫu').toBeGreaterThan(0);
            for (let i = 0; i < Math.min(3, count); i += 1) {
                const text = await rows.nth(i).innerText();
                expect(/\([^)]+\)/.test(text), `Dòng ${i}: Employee phải có dạng "Tên (Mã)".`).toBe(true);
                expect(/After|Weekly|Weekend|Monthly/i.test(text), `Dòng ${i}: Based on phải là After/Weekend/Monthly`).toBe(true);
                expect(/Rotate\s+(after|every)/i.test(text), `Dòng ${i}: cột Rotate phải có dạng "Rotate after N days" / "Rotate every ..."`).toBe(true);
                const dates = text.match(/\d{4}-\d{2}-\d{2}/g);
                expect(dates && dates.length >= 2, `Dòng ${i}: phải có ít nhất 2 ngày (Start Date, Next Switch)`).toBe(true);
            }
            break;
        }
        case 'ROTATING_SHIFT_SEARCH_EMPLOYEE_01': {
            await openRotatingShiftPage(page);
            const rows = rsaRows(page);
            expect(await rows.count()).toBeGreaterThan(0);
            const m = (await rows.first().innerText()).match(/([A-Z][a-z]+)/);
            if (!m) {
                test.skip(true, 'Không đọc được tên employee mẫu');
                break;
            }
            const term = m[1];
            await doSearch(page, term);
            const filtered = rsaRows(page);
            const count = await filtered.count();
            expect(count, `Search "${term}" phải có kết quả`).toBeGreaterThan(0);
            for (let i = 0; i < count; i += 1)
                await expect(filtered.nth(i)).toContainText(new RegExp(term, 'i'));
            await doSearch(page, '');
            break;
        }
        case 'ROTATING_SHIFT_SEARCH_BADGE_01': {
            await openRotatingShiftPage(page);
            const rows = rsaRows(page);
            expect(await rows.count()).toBeGreaterThan(0);
            const badge = (await rows.first().innerText()).match(/NTI\d+/);
            if (!badge) {
                test.skip(true, 'Không có badge ID trong dữ liệu mẫu');
                break;
            }
            await doSearch(page, badge[0]);
            const n = await rsaRows(page).count();
            if (n === 0)
                note('Ô Search (name) không hỗ trợ Badge ID — thử qua filter "Name or Badge ID".');
            if (n === 0) {
                const panel = await openFilterPanel(page);
                await doSearch(page, '');
                await panel.locator('input[name="name_or_badge"]').fill(badge[0]);
                await applyFilter(page);
            }
            expect(await rsaRows(page).count(), `Tìm theo badge "${badge[0]}" phải có kết quả`).toBeGreaterThan(0);
            break;
        }
        case 'ROTATING_SHIFT_SEARCH_NO_RESULT_01': {
            await openRotatingShiftPage(page);
            const baseline = await rsaRows(page).count();
            expect(baseline, 'Cần có ít nhất 1 row trước khi test no-result').toBeGreaterThan(0);
            await doSearch(page, `xyz_does_not_exist_${Date.now()}`);
            expect(await rsaRows(page).count(), 'Search không tồn tại phải trả 0 kết quả').toBe(0);
            await doSearch(page, '');
            await expect.poll(async () => rsaRows(page).count(), { timeout: 8000 }).toBeGreaterThanOrEqual(baseline);
            break;
        }
        case 'ROTATING_SHIFT_FILTER_BASED_ON_01': {
            await openRotatingShiftPage(page);
            if ((await rsaRows(page).filter({ hasText: 'After' }).count()) === 0) {
                test.skip(true, 'Không có dữ liệu mẫu Based on=After');
                break;
            }
            const panel = await openFilterPanel(page);
            await selectWidgetOption(page, panel, ['Based On'], { selectors: ['select[name="based_on"]'], text: 'after' });
            await settle(page, 3000);
            await applyFilter(page);
            const filtered = rsaRows(page);
            const count = await filtered.count();
            expect(count).toBeGreaterThan(0);
            for (let i = 0; i < count; i += 1)
                await expect(filtered.nth(i)).toContainText(/After/i);
            break;
        }
        case 'ROTATING_SHIFT_FILTER_EMPLOYEE_01': {
            await openRotatingShiftPage(page);
            const rows = rsaRows(page);
            expect(await rows.count()).toBeGreaterThan(0);
            const emp = (await rows.first().innerText()).match(/([A-Z][a-zA-Z'’-]+\s+[A-Z][a-zA-Z'’-]+)\s*\(/);
            if (!emp) {
                test.skip(true, 'Không đọc được tên employee');
                break;
            }
            const panel = await openFilterPanel(page);
            await selectWidgetOption(page, panel, ['Employee'], { selectors: ['select[name="employee_id"]'], text: emp[1] });
            await settle(page, 3000);
            await applyFilter(page);
            const filtered = rsaRows(page);
            const count = await filtered.count();
            expect(count).toBeGreaterThan(0);
            for (let i = 0; i < count; i += 1)
                await expect(filtered.nth(i)).toContainText(emp[1]);
            break;
        }
        case 'ROTATING_SHIFT_FILTER_ROTATING_SHIFT_01': {
            await openRotatingShiftPage(page);
            expect(await rsaRows(page).count()).toBeGreaterThan(0);
            const first = norm(await rsaRows(page).first().locator('td').nth(2).innerText());
            const panel = await openFilterPanel(page);
            const picked = await selectWidgetOption(page, panel, ['Rotating Shift'], { selectors: ['select[name="rotating_shift_id"]'], text: first });
            await settle(page, 3000);
            await applyFilter(page);
            const filtered = rsaRows(page);
            const count = await filtered.count();
            expect(count, `Lọc theo "${picked}" phải có kết quả`).toBeGreaterThan(0);
            for (let i = 0; i < count; i += 1)
                await expect(filtered.nth(i)).toContainText(first);
            break;
        }
        case 'ROTATING_SHIFT_FILTER_COMBINED_RESET_01': {
            await openRotatingShiftPage(page);
            const baseline = await rsaRows(page).count();
            expect(baseline).toBeGreaterThan(0);
            const panel = await openFilterPanel(page);
            await selectWidgetOption(page, panel, ['Based On'], { selectors: ['select[name="based_on"]'], text: 'after' });
            await settle(page, 3000);
            await applyFilter(page);
            await openFilterPanel(page);
            await clearAllFilter(page);
            await expect.poll(async () => rsaRows(page).count(), { timeout: 10000 }).toBeGreaterThanOrEqual(baseline);
            break;
        }
        case 'ROTATING_SHIFT_CREATE_FORM_01': {
            await openRotatingShiftPage(page);
            const form = await openCreateForm(page);
            for (const [label, sel] of [['Employee', 'select[name="employee_id"]'], ['Rotating Shift', 'select[name="rotating_shift_id"]'],
                ['Based On', 'select[name="based_on"]'], ['Start Date', 'input[name="start_date"]']]) {
                expect(await form.locator(sel).count(), `Form Create phải có trường ${label} (${sel})`).toBeGreaterThan(0);
            }
            await closeVisibleDialog(page);
            break;
        }
        case 'ROTATING_SHIFT_CREATE_BASED_ON_OPTIONS_01': {
            await openRotatingShiftPage(page);
            const form = await openCreateForm(page);
            const field = await findField(form, ['Based On'], ['select[name="based_on"]']);
            expect(field, 'Phải có Based On').not.toBeNull();
            const opts = await field.evaluate((el) => Array.from(el.options).map((o) => ({ text: (o.textContent || '').trim(), value: o.value })));
            const has = (re) => opts.some((o) => re.test(o.text) || re.test(o.value));
            expect(has(/^after$/i), `Thiếu "After" (có: ${opts.map((o) => o.text).join(', ')})`).toBe(true);
            expect(has(/^weekend$|^weekly$/i), 'Thiếu "Weekend/Weekly"').toBe(true);
            expect(has(/^monthly$/i), 'Thiếu "Monthly"').toBe(true);
            await closeVisibleDialog(page);
            break;
        }
        case 'ROTATING_SHIFT_CREATE_VALID_01': {
            const { fixture, employee } = await createRsaFixture(page, id, { basedOn: 'after', rotate: 7, startDate: relativeDateIso(1) });
            const row = await locateFixtureRow(page, fixture);
            await expect(row).toBeVisible();
            await expect(row).toContainText(badgeKey(employee));
            await expect(row).toContainText(/After/i);
            await doSearch(page, '');
            break;
        }
        case 'ROTATING_SHIFT_CREATE_MULTIPLE_01': {
            const first = await createRsaFixture(page, `${id}_A`, { basedOn: 'after' });
            const second = await createRsaFixture(page, `${id}_B`, { basedOn: 'weekly', excludeEmployees: [first.employee] });
            expect(second.employee).not.toBe(first.employee);
            await expect(await locateFixtureRow(page, first.fixture)).toBeVisible();
            await expect(await locateFixtureRow(page, second.fixture)).toBeVisible();
            break;
        }
        case 'ROTATING_SHIFT_CREATE_REQUIRED_EMPLOYEE_01':
        case 'ROTATING_SHIFT_CREATE_REQUIRED_SHIFT_01':
        case 'ROTATING_SHIFT_CREATE_REQUIRED_BASED_ON_01': {
            const target = { ROTATING_SHIFT_CREATE_REQUIRED_EMPLOYEE_01: 'employee_id', ROTATING_SHIFT_CREATE_REQUIRED_SHIFT_01: 'rotating_shift_id', ROTATING_SHIFT_CREATE_REQUIRED_BASED_ON_01: 'based_on' }[id];
            await openRotatingShiftPage(page);
            const beforeIds = await collectIds(rsaRows(page));
            const existing = await employeesInList(page);
            const fixture = registerFixture(page, { type: 'rsa', marker: fixtureMarker(id, 'neg'), created: false, id: null, matchTexts: [] });
            const form = await openCreateForm(page);
            let employee = null;
            if (target !== 'employee_id')
                employee = await pickEmployee(page, form, { exclude: existing });
            if (target !== 'rotating_shift_id')
                await pickRotatingShift(page, form);
            if (target !== 'based_on') {
                await fillBasedOn(page, form, 'after');
                await fillRotation(page, form, 'after', 7);
            }
            await fillStartDate(form, relativeDateIso(1));
            const field = await findField(form, [], [`select[name="${target}"]`]);
            if (field)
                await clearSelect(field);
            let outcome = await submitForm(page, form); // validation của trình duyệt
            if (outcome.status === 'closed') {
                if (employee)
                    await adoptNewRow(page, fixture, beforeIds, employee);
                throw new Error(`Bỏ trống ${target} nhưng server vẫn lưu.`);
            }
            if ((await modalState(page)).shown) {
                outcome = await submitForm(page, form, { noValidate: true }); // ép server validate
                if (outcome.status === 'closed') {
                    if (employee)
                        await adoptNewRow(page, fixture, beforeIds, employee);
                    throw new Error(`Bỏ trống ${target} nhưng server vẫn lưu.`);
                }
            }
            expect(await modalState(page).then((s) => s.shown), `Bỏ trống ${target} phải giữ modal mở`).toBe(true);
            await closeVisibleDialog(page);
            break;
        }
        case 'ROTATING_SHIFT_CREATE_PAST_DATE_01': {
            await openRotatingShiftPage(page);
            const beforeIds = await collectIds(rsaRows(page));
            const existing = await employeesInList(page);
            const fixture = registerFixture(page, { type: 'rsa', marker: fixtureMarker(id, 'past'), created: false, id: null, matchTexts: [] });
            const form = await openCreateForm(page);
            const employee = await pickEmployee(page, form, { exclude: existing });
            await pickRotatingShift(page, form);
            await fillBasedOn(page, form, 'after');
            await fillRotation(page, form, 'after', 7);
            await fillStartDate(form, relativeDateIso(-5));
            const outcome = await submitForm(page, form, { noValidate: true });
            note(`Start Date quá khứ: ${outcome.status === 'closed' ? 'server chấp nhận' : `bị chặn (${outcome.errors.join(' | ')})`}`);
            if (outcome.status === 'closed')
                await adoptNewRow(page, fixture, beforeIds, employee);
            else
                await closeVisibleDialog(page);
            break;
        }
        case 'ROTATING_SHIFT_DUPLICATE_EMPLOYEE_01': {
            const first = await createRsaFixture(page, `${id}_FIRST`, { basedOn: 'after' });
            await openRotatingShiftPage(page);
            const beforeIds = await collectIds(rsaRows(page));
            const dup = registerFixture(page, { type: 'rsa', marker: fixtureMarker(id, 'dup'), created: false, id: null, matchTexts: [] });
            const form = await openCreateForm(page);
            let employee = null;
            try {
                employee = await pickEmployee(page, form, { text: first.employee });
            }
            catch (e) {
                note(`Employee đã có lịch xoay ca không còn trong danh sách chọn — bị chặn từ UI (${e.message}).`);
                await closeVisibleDialog(page);
                break;
            }
            await pickRotatingShift(page, form);
            await fillBasedOn(page, form, 'after');
            await fillRotation(page, form, 'after', 7);
            await fillStartDate(form, relativeDateIso(1));
            const outcome = await submitForm(page, form);
            note(`Trùng employee: ${outcome.status === 'closed' ? 'được phép tạo thêm' : `bị chặn (${outcome.errors.join(' | ')})`}`);
            if (outcome.status === 'closed')
                await adoptNewRow(page, dup, beforeIds.filter((i) => i !== first.fixture.id), employee);
            else
                await closeVisibleDialog(page);
            break;
        }
        case 'ROTATING_SHIFT_EDIT_VALID_01': {
            const { fixture } = await createRsaFixture(page, id);
            await openRotatingShiftPage(page);
            const row = await locateFixtureRow(page, fixture);
            expect(row).not.toBeNull();
            const form = await openEditForRow(page, row);
            const changed = await fillBasedOn(page, form, 'monthly').catch(() => null);
            if (!changed) {
                await closeVisibleDialog(page);
                test.skip(true, 'Form Edit không có Based On');
                break;
            }
            await fillRotation(page, form, 'monthly');
            const outcome = await submitForm(page, form);
            expect(outcome.status, `Lưu chỉnh sửa thất bại: ${outcome.errors.join(' | ')}`).toBe('closed');
            await openRotatingShiftPage(page);
            await expect(await locateFixtureRow(page, fixture)).toContainText(/Monthly/i);
            await doSearch(page, '');
            break;
        }
        case 'ROTATING_SHIFT_EDIT_CANCEL_01': {
            const { fixture } = await createRsaFixture(page, id);
            await openRotatingShiftPage(page);
            const row = await locateFixtureRow(page, fixture);
            expect(row).not.toBeNull();
            const beforeText = norm(await row.innerText());
            const form = await openEditForRow(page, row);
            await fillBasedOn(page, form, 'monthly').catch(() => { });
            await closeVisibleDialog(page);
            await openRotatingShiftPage(page);
            const after = await locateFixtureRow(page, fixture);
            expect(norm(await after.innerText())).toBe(beforeText);
            await doSearch(page, '');
            break;
        }
        case 'ROTATING_SHIFT_DELETE_CONFIRM_01': {
            const { fixture } = await createRsaFixture(page, id);
            await openRotatingShiftPage(page);
            const row = await locateFixtureRow(page, fixture);
            expect(row).not.toBeNull();
            const btn = await firstVisible(row.locator(ACT.del));
            expect(btn, 'Row phải có nút Delete').not.toBeNull();
            const res = await clickWithConfirm(page, btn, true);
            expect(res.mode, 'Phải có hộp thoại xác nhận').not.toBe('none');
            await expect.poll(async () => (await locateFixtureRow(page, fixture)) === null, { timeout: 20000 }).toBe(true);
            fixture.created = false;
            await doSearch(page, '');
            break;
        }
        case 'ROTATING_SHIFT_DELETE_CANCEL_01': {
            const { fixture } = await createRsaFixture(page, id);
            await openRotatingShiftPage(page);
            const row = await locateFixtureRow(page, fixture);
            const btn = row && await firstVisible(row.locator(ACT.del));
            if (!btn) {
                test.skip(true, 'Không có nút Delete');
                break;
            }
            const res = await clickWithConfirm(page, btn, false);
            expect(res.mode).not.toBe('none');
            await openRotatingShiftPage(page);
            await expect(await locateFixtureRow(page, fixture)).toBeVisible();
            await doSearch(page, '');
            break;
        }
        case 'ROTATING_SHIFT_ARCHIVE_01': {
            const { fixture } = await createRsaFixture(page, id);
            await openRotatingShiftPage(page);
            const row = await locateFixtureRow(page, fixture);
            const btn = row && await firstVisible(row.locator(ACT.archive));
            if (!btn) {
                test.skip(true, 'Row không có nút Archive');
                break;
            }
            const res = await clickWithConfirm(page, btn, true);
            expect(res.mode, 'Phải có hộp thoại xác nhận Archive').not.toBe('none');
            await settle(page, 4000);
            await openRotatingShiftPage(page);
            const after = await locateFixtureRow(page, fixture);
            if (after) {
                const un = await firstVisible(after.locator(ACT.unarchive));
                note(un ? 'Sau Archive, row vẫn hiển thị với nút Un-archive.' : 'Sau Archive, row vẫn hiển thị (không thấy nút Un-archive).');
                expect(await firstVisible(after.locator(ACT.archive)), 'Nút Archive phải biến mất sau khi archive').toBeNull();
                if (un) {
                    await clickWithConfirm(page, un, true);
                    await settle(page, 3000);
                }
            }
            else {
                note('Sau Archive, row bị ẩn khỏi danh sách mặc định — mở filter Active?=No để un-archive.');
                const panel = await openFilterPanel(page);
                await selectWidgetOption(page, panel, ['Active?'], { selectors: ['select[name="is_active"]'], text: 'false' });
                await settle(page, 3000);
                await applyFilter(page);
                const arch = await locateFixtureRow(page, fixture);
                expect(arch, 'Row đã archive phải xuất hiện khi lọc Active?=No').not.toBeNull();
                const un = await firstVisible(arch.locator(ACT.unarchive));
                if (un) {
                    await clickWithConfirm(page, un, true);
                    await settle(page, 3000);
                }
            }
            break;
        }
        case 'ROTATING_SHIFT_SORT_EMPLOYEE_01': {
            await openRotatingShiftPage(page);
            expect(await rsaRows(page).count()).toBeGreaterThan(1);
            const header = page.locator('#rotating-shift-container.hlv-container thead th').filter({ hasText: /Employee/i }).first();
            await expect(header).toBeVisible();
            const readNames = async () => (await page.locator(`${ROW_SEL} td.stickyleft-second`).allInnerTexts()).map(norm);
            const clickSort = async () => {
                const s = header.locator('[hx-get]').first();
                if (await s.count())
                    await s.click();
                else
                    await header.click();
                await settle(page, 4000);
                await page.waitForTimeout(300);
            };
            await clickSort();
            const o1 = await readNames();
            await clickSort();
            const o2 = await readNames();
            expect(o1.length).toBeGreaterThan(0);
            expect(o2.length).toBe(o1.length);
            const sorted = [...o1].sort((a, b) => a.localeCompare(b));
            const reversed = [...o2];
            const asc = JSON.stringify(o1) === JSON.stringify(sorted) || JSON.stringify(o1) === JSON.stringify([...sorted].reverse());
            note(`Sort Employee: lần 1 ${asc ? 'đúng thứ tự' : 'KHÔNG theo tên (có thể sort theo get_full_name)'}; đảo chiều: ${JSON.stringify(o1) !== JSON.stringify(reversed)}.`);
            expect(JSON.stringify(o1) !== JSON.stringify(o2), 'Bấm sort lần 2 phải đảo thứ tự').toBe(true);
            break;
        }
        case 'ROTATING_SHIFT_PERSIST_RELOAD_01': {
            const { fixture } = await createRsaFixture(page, id);
            await page.reload({ waitUntil: 'domcontentloaded' });
            await settle(page, 4000);
            await expect(page.locator(CREATE_LINK).first()).toBeVisible({ timeout: 30000 });
            await expect(await locateFixtureRow(page, fixture), 'Bản ghi phải còn sau reload').toBeTruthy();
            await doSearch(page, '');
            break;
        }
        case 'ROTATING_SHIFT_EXPORT_01': {
            await openRotatingShiftPage(page);
            const actionsBtn = page.locator('button').filter({ hasText: /^\s*Actions\s*$/ }).first();
            await expect(actionsBtn).toBeVisible();
            await actionsBtn.hover();
            await actionsBtn.click();
            await page.waitForTimeout(500);
            const exportItem = await firstVisible(page.locator('.dropdown-content a').filter({ hasText: /^\s*Export\s*$/ }));
            if (!exportItem) {
                test.skip(true, 'Actions không có Export');
                break;
            }
            const form = await openModalFromAny(page, exportItem);
            const submit = form.locator('button, input[type="submit"]').filter({ hasText: /Export/i })
                .or(form.locator('input[type="submit"][value*="Export" i]'));
            await expect(submit.first()).toBeVisible();
            await closeVisibleDialog(page);
            break;
        }
        case 'ROTATING_SHIFT_XSS_SEARCH_01': {
            await openRotatingShiftPage(page);
            await doSearch(page, '<img src=x onerror="window.__xssTest=true">');
            expect(await page.evaluate(() => window.__xssTest)).toBeUndefined();
            expect(await page.locator('img[src="x"]').count()).toBe(0);
            await doSearch(page, '');
            break;
        }
        case 'ROTATING_SHIFT_LIST_INTEGRITY_01': {
            await openRotatingShiftPage(page);
            const initialCount = await stableCount(rsaRows(page));
            expect(initialCount).toBeGreaterThan(0);
            await clearAllFilter(page);
            await expect.poll(async () => rsaRows(page).count(), { timeout: 10000 }).toBe(initialCount);
            break;
        }
        default:
            throw new Error(`Không có kịch bản Rotating Shift Assign cho ${id}`);
    }
}
/* Modal mở từ link dropdown (Export): không có form ngay lập tức nên chỉ chờ nội dung. */
async function openModalFromAny(page, trigger) {
    await trigger.click();
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
        const s = await modalState(page);
        if (s.hasForm) {
            if (!s.shown)
                await safeEval(page, () => { const m = document.querySelector('#genericModal'); if (m)
                    m.classList.add('oh-modal--show'); });
            break;
        }
        await page.waitForTimeout(250);
    }
    await settle(page, 3000);
    const scope = await findFormScope(page);
    await expect(scope).toBeVisible();
    return scope;
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
            console.warn('[afterEach]', e.message);
    }
});
/* ============================== TESTS =================================== */
const TESTS = [
    ['ROTATING_SHIFT_ACCESS_01', 'Truy cập trang Work Schedules và tab Rotating Shift Assign'],
    ['ROTATING_SHIFT_TAB_NAV_01', 'Chuyển đổi giữa các tab Work Schedules'],
    ['ROTATING_SHIFT_LIST_LAYOUT_01', 'Kiểm tra bố cục bảng danh sách và toolbar'],
    ['ROTATING_SHIFT_LIST_DATA_01', 'Đọc và xác thực dữ liệu mẫu trong bảng'],
    ['ROTATING_SHIFT_SEARCH_EMPLOYEE_01', 'Tìm kiếm theo tên Employee'],
    ['ROTATING_SHIFT_SEARCH_BADGE_01', 'Tìm kiếm theo Badge ID'],
    ['ROTATING_SHIFT_SEARCH_NO_RESULT_01', 'Tìm kiếm không có kết quả'],
    ['ROTATING_SHIFT_FILTER_BASED_ON_01', 'Lọc theo Based On = After'],
    ['ROTATING_SHIFT_FILTER_EMPLOYEE_01', 'Lọc theo Employee cụ thể'],
    ['ROTATING_SHIFT_FILTER_ROTATING_SHIFT_01', 'Lọc theo Rotating Shift'],
    ['ROTATING_SHIFT_FILTER_COMBINED_RESET_01', 'Kết hợp filter và Clear all'],
    ['ROTATING_SHIFT_CREATE_FORM_01', 'Kiểm tra form Create có đủ trường'],
    ['ROTATING_SHIFT_CREATE_BASED_ON_OPTIONS_01', 'Kiểm tra options của Based On'],
    ['ROTATING_SHIFT_CREATE_VALID_01', 'Tạo Rotating Shift Assign hợp lệ'],
    ['ROTATING_SHIFT_CREATE_MULTIPLE_01', 'Tạo nhiều Rotating Shift Assign'],
    ['ROTATING_SHIFT_CREATE_REQUIRED_EMPLOYEE_01', 'Bỏ trống Employee bị chặn'],
    ['ROTATING_SHIFT_CREATE_REQUIRED_SHIFT_01', 'Bỏ trống Rotating Shift bị chặn'],
    ['ROTATING_SHIFT_CREATE_REQUIRED_BASED_ON_01', 'Bỏ trống Based On bị chặn'],
    ['ROTATING_SHIFT_CREATE_PAST_DATE_01', 'Kiểm tra xử lý Start Date quá khứ'],
    ['ROTATING_SHIFT_DUPLICATE_EMPLOYEE_01', 'Tạo trùng Employee bị chặn hoặc cho phép'],
    ['ROTATING_SHIFT_EDIT_VALID_01', 'Chỉnh sửa Rotating Shift Assign'],
    ['ROTATING_SHIFT_EDIT_CANCEL_01', 'Đóng form Edit không lưu thay đổi'],
    ['ROTATING_SHIFT_DELETE_CONFIRM_01', 'Xóa Rotating Shift Assign với confirm'],
    ['ROTATING_SHIFT_DELETE_CANCEL_01', 'Hủy thao tác xóa'],
    ['ROTATING_SHIFT_ARCHIVE_01', 'Archive Rotating Shift Assign'],
    ['ROTATING_SHIFT_SORT_EMPLOYEE_01', 'Sắp xếp theo cột Employee'],
    ['ROTATING_SHIFT_PERSIST_RELOAD_01', 'Dữ liệu còn sau reload'],
    ['ROTATING_SHIFT_EXPORT_01', 'Export danh sách qua modal'],
    ['ROTATING_SHIFT_XSS_SEARCH_01', 'Search với payload XSS không thực thi'],
    ['ROTATING_SHIFT_LIST_INTEGRITY_01', 'Dữ liệu bảng nhất quán sau thao tác filter'],
];
for (const [id, title] of TESTS) {
    test(`${id} - ${title}`, async ({ page }) => {
        await runRotatingShiftCase(page, id);
    });
}
