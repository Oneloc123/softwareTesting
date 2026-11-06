'use strict';
const { test, expect } = require('@playwright/test');
const crypto = require('node:crypto');
const BASE_URL = process.env.HORILLA_BASE_URL || 'https://hr.demo.horilla.com';
test.use({ baseURL: BASE_URL });
const ROUTES = { requests: '/employee/requests/' };
// data-tab-id thực tế của các nút .requests-tab-btn (không dựa vào text/regex nữa)
const TABS = {
    shiftRequest: 'shift-request',
    shiftAllocation: 'shift-inbox',
    workType: 'work-type',
    document: 'document',
};
const LIST = '#shift-container.hlv-container';
const SERVER_ERROR = /Internal Server Error|Traceback|502 Bad Gateway/i;
/* ============================================================
 *  Universal helpers
 * ============================================================ */
async function settle(page, timeout = 6000) {
    // Bỏ qua <body>: trang có thể để class htmx-request trên body → luôn chờ hết timeout.
    await page.waitForFunction(() => !document.querySelector('.htmx-request:not(body), .htmx-swapping'), null, { timeout }).catch(() => { });
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => { });
}
async function stableCount(locator, iterations = 15, delay = 150) {
    let prev = -1;
    for (let i = 0; i < iterations; i += 1) {
        const n = await locator.count();
        if (n === prev)
            return n;
        prev = n;
        await new Promise(r => setTimeout(r, delay));
    }
    return prev;
}
async function waitForModalClose(page, timeout = 15000) {
    await settle(page, 2000);
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const isOpen = await page.evaluate(() => {
            const modal = document.querySelector('#genericModal');
            return Boolean(modal && modal.classList.contains('oh-modal--show') && modal.getClientRects().length);
        });
        if (!isOpen)
            return true;
        await page.waitForTimeout(250);
    }
    return false;
}
async function ensureAuthenticated(page) {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await settle(page, 4000);
    if (!/login/i.test(new URL(page.url()).pathname))
        return;
    let username = process.env.HORILLA_USER;
    let password = process.env.HORILLA_PASS;
    if (!username || !password) {
        const body = await page.locator('body').innerText();
        const u = body.match(/(?:username|user name)\s*[:=]\s*([A-Za-z0-9_.@-]+)/i);
        const p = body.match(/password\s*[:=]\s*([^\s]+)/i);
        if (!u || !p)
            throw new Error('Không đọc được thông tin đăng nhập (đặt HORILLA_USER / HORILLA_PASS).');
        username = u[1];
        password = p[1];
    }
    await page.getByLabel(/username/i).or(page.locator('input[name="username"], input[type="email"]')).first().fill(username);
    await page.getByLabel(/password/i).or(page.locator('input[name="password"], input[type="password"]')).first().fill(password);
    await page.getByRole('button', { name: /sign in|log in|login/i }).click();
    await page.waitForURL(url => !/login/i.test(url.pathname), { timeout: 45000, waitUntil: 'commit' });
    await settle(page, 4000);
}
test.beforeEach(async ({ page }) => {
    test.setTimeout(120000); // cleanup trong afterEach cũng tính vào timeout
    await ensureAuthenticated(page);
});
const MARKER_PREFIX = '[TC-SR]';
function timestampSuffix() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${crypto.randomBytes(3).toString('hex')}`;
}
function fixtureMarker(id, label = 'fixture') {
    return `${MARKER_PREFIX} ${id} ${label} ${timestampSuffix()}`;
}
function registerFixture(page, fixture) {
    if (!Array.isArray(page.__tcFixtures))
        page.__tcFixtures = [];
    page.__tcFixtures.push(fixture);
    return fixture;
}
function relativeDateIso(daysFromToday = 0) {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + daysFromToday);
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
// Khoảng ngày ngẫu nhiên để tránh trùng với dữ liệu mẫu / fixture còn sót lại.
function randomRange(spanDays = 3) {
    const start = 2 + crypto.randomInt(0, 60);
    return { date: relativeDateIso(start), till: relativeDateIso(start + spanDays) };
}
function toRegex(value) {
    if (value instanceof RegExp)
        return value;
    return new RegExp(String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}
async function firstVisible(locator) {
    const count = await locator.count();
    for (let i = 0; i < count; i += 1) {
        if (await locator.nth(i).isVisible())
            return locator.nth(i);
    }
    return null;
}
/* ============================================================
 *  Form scope / dialog helpers
 * ============================================================ */
async function findFormScope(page) {
    const modals = page.locator('.oh-modal--show');
    const n = await modals.count();
    for (let i = n - 1; i >= 0; i -= 1) {
        if (await modals.nth(i).isVisible())
            return modals.nth(i);
    }
    const dialog = await firstVisible(page.locator('[role="dialog"]:visible'));
    return dialog || page;
}
async function closeVisibleDialog(page) {
    const modal = page.locator('#genericModal.oh-modal--show');
    if (await modal.count() && await modal.isVisible().catch(() => false)) {
        const close = await firstVisible(modal.locator('[aria-label="Close"], .oh-modal__close, button[title="Close"], button:has-text("Cancel"), button:has-text("Discard")')) || await firstVisible(modal.getByRole('button', { name: /close|cancel|discard|×/i }));
        if (close)
            await close.click().catch(() => { });
        else
            await page.keyboard.press('Escape').catch(() => { });
        await modal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { });
    }
    if (!(await page.locator('#genericModal.oh-modal--show').isVisible().catch(() => false))) {
        await page.evaluate(() => {
            if (!document.querySelector('.oh-modal--show')) {
                document.querySelectorAll('.modal-backdrop').forEach(el => el.remove());
                document.body.classList.remove('modal-open');
            }
        }).catch(() => { });
    }
}
async function clickByName(scope, names, options = {}) {
    const roles = options.roles || ['button', 'link', 'menuitem'];
    const allowText = options.allowText !== false;
    for (const name of names) {
        const pattern = toRegex(name);
        for (const role of roles) {
            const item = await firstVisible(scope.getByRole(role, { name: pattern }));
            if (item && await item.isEnabled()) {
                await item.click();
                return item;
            }
        }
        const titled = scope.locator('[title], [aria-label]');
        const count = await titled.count();
        for (let i = 0; i < count; i += 1) {
            const item = titled.nth(i);
            const label = `${await item.getAttribute('title') || ''} ${await item.getAttribute('aria-label') || ''}`;
            if (pattern.test(label) && await item.isVisible() && await item.isEnabled()) {
                await item.click();
                return item;
            }
        }
        if (allowText) {
            const item = await firstVisible(scope.getByText(pattern, { exact: false }));
            if (item && await item.isEnabled()) {
                await item.click();
                return item;
            }
        }
    }
    throw new Error(`Không tìm thấy control ${names.join('/')}.`);
}
async function findField(scope, aliases, selectors = []) {
    // Ưu tiên selector cụ thể (name=...) vì nhiều <label class="oh-label"> không có for= nên getByLabel không khớp,
    // còn placeholder*= dễ khớp nhầm (vd "Requested Date" khớp cả "Requested Date From").
    for (const selector of selectors) {
        const field = await firstVisible(scope.locator(selector));
        if (field)
            return field;
    }
    for (const alias of aliases) {
        const locator = scope.getByLabel(toRegex(alias));
        const field = await firstVisible(locator);
        if (field)
            return field;
        if (await locator.count())
            return locator.first();
    }
    for (const alias of aliases) {
        const esc = String(alias).replace(/"/g, '\\"');
        const field = await firstVisible(scope.locator(`input[placeholder*="${esc}" i], textarea[placeholder*="${esc}" i], input[aria-label*="${esc}" i]`));
        if (field)
            return field;
    }
    return null;
}
async function fillField(scope, aliases, value, selectors = []) {
    const field = await findField(scope, aliases, selectors);
    const text = String(value);
    if (field && await field.isVisible().catch(() => false)) {
        const tagName = await field.evaluate(el => el.tagName.toLowerCase());
        const type = await field.getAttribute('type');
        if (type === 'checkbox' || type === 'radio' || tagName === 'select') {
            throw new Error(`Trường ${aliases.join('/')} không phải trường nhập văn bản.`);
        }
        await field.fill(text);
        return field;
    }
    const editor = await firstVisible(scope.locator('.note-editor .note-editable[contenteditable="true"], .note-editable[contenteditable="true"], [contenteditable="true"]'));
    if (editor && aliases.some(alias => /description|comment|note/i.test(String(alias)))) {
        await editor.fill(text);
        return editor;
    }
    if (!field)
        throw new Error(`Không tìm thấy trường: ${aliases.join(', ')}.`);
    throw new Error(`Trường ${aliases.join('/')} không hiển thị hoặc không thể nhập.`);
}
async function widgetForHiddenSelect(scope, field) {
    const id = await field.getAttribute('id');
    if (id) {
        const safeId = id.replace(/([^a-zA-Z0-9_-])/g, '\\$1');
        const widget = await firstVisible(scope.locator(`#select2-${safeId}-container`));
        if (widget)
            return widget;
    }
    const sibling = await firstVisible(field.locator('xpath=following-sibling::*[1]'));
    if (sibling)
        return sibling;
    return firstVisible(field.locator('xpath=..').locator('[role="combobox"], .select2-selection, [aria-haspopup="listbox"]'));
}
async function optionTexts(selectLocator) {
    return await selectLocator.locator('option').evaluateAll(options => options.map(option => ({
        text: (option.textContent || '').trim(),
        value: option.value,
        disabled: option.disabled,
    })));
}
const NON_OPTION_TEXT = /^(choose|select|-{3,}|none|no results|loading|searching)/i;
function usableOption(options, desiredText = '', excluded = []) {
    const desired = String(desiredText || '').trim().toLowerCase();
    return options.find(option => {
        const text = String(option.text || '').trim();
        if (!option.value || !text || option.disabled)
            return false;
        if (NON_OPTION_TEXT.test(text))
            return false;
        if (excluded.some(value => value && text.toLowerCase() === String(value).toLowerCase()))
            return false;
        return !desired || text.toLowerCase().includes(desired);
    }) || null;
}
async function closeOpenSelect2(page) {
    const open = page.locator('.select2-container--open');
    if (await open.count()) {
        await page.keyboard.press('Escape').catch(() => { });
        await open.first().waitFor({ state: 'hidden', timeout: 2000 }).catch(() => { });
    }
}
async function selectWidgetOption(page, scope, aliases, options = {}) {
    const extraSelectors = options.extraSelectors || options.selectors || [];
    let field = await findField(scope, aliases, extraSelectors);
    if (!field && options.allowFirstWidget) {
        const controls = scope.locator('select, [role="combobox"], [aria-haspopup="listbox"]');
        const norm = value => String(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
        const aliasesNormalized = aliases.map(norm).filter(Boolean);
        const total = await controls.count();
        for (let index = 0; index < total; index += 1) {
            const candidate = controls.nth(index);
            const metadata = await candidate.evaluate(el => {
                const labels = el.labels ? Array.from(el.labels).map(label => label.innerText || '') : [];
                return [el.id, el.getAttribute('name'), el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.getAttribute('title'), ...labels]
                    .filter(Boolean).join(' ');
            });
            if (aliasesNormalized.some(alias => norm(metadata).includes(alias))) {
                field = candidate;
                break;
            }
        }
    }
    if (!field)
        throw new Error(`Không tìm thấy trường chọn ${aliases.join('/')}.`);
    const tagName = await field.evaluate(el => el.tagName.toLowerCase());
    const desired = String(options.text || '').trim();
    const excluded = options.exclude || [];
    if (tagName === 'select' && await field.isVisible()) {
        const all = await optionTexts(field);
        const candidate = usableOption(all, desired, excluded);
        if (!candidate) {
            throw new Error(`Select ${aliases.join('/')} không có option phù hợp. Giá trị hiện có: ${all.map(item => item.text).join(' | ')}`);
        }
        if (await field.getAttribute('multiple') !== null) {
            const current = await field.locator('option:checked').evaluateAll(items => items.map(item => item.value).filter(Boolean));
            if (!current.includes(candidate.value))
                await field.selectOption([...current, candidate.value]);
        }
        else {
            await field.selectOption(candidate.value);
        }
        return candidate.text;
    }
    let widget = await widgetForHiddenSelect(scope, field);
    if (!widget && await field.isVisible())
        widget = field;
    if (!widget)
        throw new Error(`Không tìm thấy widget hiển thị cho ${aliases.join('/')}.`);
    await closeOpenSelect2(page);
    await widget.scrollIntoViewIfNeeded();
    await widget.click();
    const openDropdown = page.locator('.select2-container--open');
    await openDropdown.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => { });
    // Chỉ lấy option thật: loại "Searching…", "No results found" (class select2-results__message / loading-results).
    const pickable = () => page.locator('.select2-container--open .select2-results__option:not(.select2-results__message):not(.loading-results):visible');
    const waitOptions = () => pickable().first().waitFor({ state: 'visible', timeout: 7000 }).catch(() => null);
    const search = await firstVisible(page.locator('.select2-container--open input.select2-search__field, .select2-container--open input[role="searchbox"], .select2-dropdown input.select2-search__field'));
    if (search && desired) {
        await search.fill(desired);
    }
    await waitOptions();
    if (!(await pickable().count()) && search && !desired) {
        await search.fill('a');
        await waitOptions();
    }
    const optionLocator = pickable();
    const count = await optionLocator.count();
    for (let index = 0; index < count; index += 1) {
        const option = optionLocator.nth(index);
        const text = (await option.innerText().catch(() => '')).trim();
        if (!text || NON_OPTION_TEXT.test(text))
            continue;
        if (excluded.some(value => value && text.toLowerCase() === String(value).toLowerCase()))
            continue;
        if (desired && !text.toLowerCase().includes(desired.toLowerCase()))
            continue;
        await option.click();
        await page.waitForTimeout(250);
        return text;
    }
    const visibleTexts = await optionLocator.allInnerTexts().catch(() => []);
    await closeOpenSelect2(page);
    throw new Error(`Dropdown ${aliases.join('/')} không có lựa chọn phù hợp cho "${desired}". Các option thấy được: ${visibleTexts.join(' | ')}`);
}
async function clickToggle(scope, aliases) {
    for (const alias of aliases) {
        const field = await firstVisible(scope.getByLabel(toRegex(alias)));
        if (field) {
            const type = await field.getAttribute('type');
            if (type === 'checkbox' || type === 'radio') {
                if (!(await field.isChecked()))
                    await field.check();
            }
            else
                await field.click();
            return field;
        }
        const label = await firstVisible(scope.getByText(toRegex(alias), { exact: false }));
        if (label) {
            await label.click();
            return label;
        }
    }
    throw new Error(`Không tìm thấy toggle ${aliases.join('/')}.`);
}
/* ============================================================
 *  Page-specific helpers (Requests – tab-based)
 * ============================================================ */
async function openRequestsTab(page, tabId) {
    await page.goto(ROUTES.requests, { waitUntil: 'domcontentloaded' });
    await settle(page, 4000);
    const tab = page.locator(`.requests-tab-btn[data-tab-id="${tabId}"]`);
    await expect(tab).toBeVisible({ timeout: 20000 });
    const isActive = await tab.evaluate(el => el.classList.contains('oh-tabs__tab--active'));
    if (!isActive) {
        await tab.click();
        await settle(page, 4000);
    }
    await expect(tab).toHaveClass(/oh-tabs__tab--active/);
    await expect(page.locator('body')).not.toContainText(SERVER_ERROR);
}
async function openShiftRequests(page) {
    await openRequestsTab(page, TABS.shiftRequest);
    // Nút Create / ô search / bảng chỉ có sau chuỗi HTMX: tab → shift-nav → list-shift-request
    await expect(page.locator('a[hx-get="/shift-request/"]').first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('#filterFormlistContainer input[name="search"]')).toBeVisible({ timeout: 20000 });
    await expect(page.locator(LIST).first()).toBeVisible({ timeout: 20000 });
    await settle(page, 2000);
}
async function openShiftAllocations(page) {
    await openRequestsTab(page, TABS.shiftAllocation);
    await expect(page.getByText(/Shift Allocations/i).first()).toBeVisible({ timeout: 20000 });
    await settle(page, 2000);
}
async function openCreateForm(page) {
    await closeVisibleDialog(page);
    const createLink = page.locator('a[hx-get="/shift-request/"]').first();
    if (await createLink.count())
        await createLink.click();
    else
        await clickByName(page, ['Create', 'Add'], { roles: ['button', 'link'] });
    await settle(page, 3000);
    await expect.poll(async () => {
        return await page.evaluate(() => {
            const m = document.querySelector('#genericModal');
            const body = document.querySelector('#genericModalBody');
            return !!(m && m.classList.contains('oh-modal--show') && body && body.querySelector('form'));
        });
    }, { timeout: 15000 }).toBe(true);
    const form = await findFormScope(page);
    await expect(form).toBeVisible();
    await expect(form.locator('form').first()).toBeVisible({ timeout: 10000 });
    return form;
}
async function submitForm(page, scope) {
    const form = await firstVisible(scope.locator('form'));
    if (!form)
        throw new Error('Không tìm thấy form đang hiển thị để gửi.');
    const formValid = await form.evaluate(el => el.checkValidity());
    let responsePromise = null;
    if (formValid) {
        // Form tạo/sửa gửi POST; không bắt nhầm các GET (select2 ajax, polling thông báo).
        responsePromise = page.waitForResponse(response => {
            const request = response.request();
            return request.method().toUpperCase() !== 'GET' || request.isNavigationRequest();
        }, { timeout: 15000 }).catch(() => null);
    }
    let submitControl = await firstVisible(form.locator('button[type="submit"]:not([disabled]), input[type="submit"]:not([disabled]), button:not([type]):not([disabled])'));
    if (submitControl) {
        const label = (await submitControl.innerText().catch(async () => await submitControl.getAttribute('value') || '')).trim();
        if (/^(cancel|close|discard|back|reset)$/i.test(label))
            submitControl = null;
    }
    if (!submitControl) {
        for (const name of [/^(save|submit|create|update|schedule|confirm|request|apply)(\b|\s)/i, /save|submit|create|update|schedule|confirm/i]) {
            submitControl = await firstVisible(form.getByRole('button', { name }));
            if (submitControl)
                break;
        }
    }
    if (!submitControl) {
        submitControl = await firstVisible(scope.getByRole('button', { name: /save|submit|create|update|schedule|confirm|request/i }));
    }
    if (submitControl && await submitControl.isEnabled().catch(() => false)) {
        await submitControl.click();
    }
    else {
        await form.evaluate(el => {
            if (typeof el.requestSubmit === 'function')
                el.requestSubmit();
            else
                el.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        });
    }
    if (responsePromise)
        await responsePromise;
    await settle(page, 5000);
    return {
        validBeforeSubmit: formValid,
        modalClosed: !(await page.locator('#genericModal.oh-modal--show').isVisible().catch(() => false)),
        validationMessages: await scope.locator('.invalid-feedback:visible, .errorlist:visible, [role="alert"]:visible, .oh-input__error:visible, .text-danger:visible').allInnerTexts().catch(() => []),
    };
}
/* ============================================================
 *  Confirm handler (native / SweetAlert2 / HTMX modal)
 * ============================================================ */
async function performConfirm(page, accept = true) {
    const swal = page.locator('.swal2-popup');
    const htmxModal = page.locator('#deleteConfirmation.oh-modal--show, .oh-modal--show:has(#deleteConfirmationBody)');
    let nativeDialogShown = false;
    const nativeHandler = async (d) => {
        nativeDialogShown = true;
        if (accept)
            await d.accept();
        else
            await d.dismiss();
    };
    page.once('dialog', nativeHandler);
    let mode = null;
    for (let i = 0; i < 20; i += 1) {
        if (nativeDialogShown) {
            mode = 'native';
            break;
        }
        if (await swal.isVisible().catch(() => false)) {
            mode = 'swal';
            break;
        }
        if (await htmxModal.isVisible().catch(() => false)) {
            mode = 'htmx';
            break;
        }
        await page.waitForTimeout(250);
    }
    page.off('dialog', nativeHandler);
    if (mode === 'swal') {
        if (accept)
            await page.locator('.swal2-confirm').click().catch(() => { });
        else
            await page.locator('.swal2-cancel').click().catch(() => { });
        await swal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { });
    }
    else if (mode === 'htmx') {
        const body = page.locator('#deleteConfirmationBody');
        if (accept) {
            const btn = await firstVisible(body.getByRole('button', { name: /confirm|delete|yes|ok|remove/i }));
            if (btn)
                await btn.click();
            else {
                const submit = body.locator('form button[type="submit"]').first();
                if (await submit.isVisible().catch(() => false))
                    await submit.click();
            }
        }
        else {
            const cancel = await firstVisible(body.getByRole('button', { name: /cancel|close|no/i }));
            if (cancel)
                await cancel.click();
            else
                await page.keyboard.press('Escape');
        }
        await page.locator('#deleteConfirmation').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => { });
    }
    await settle(page, 3000);
    return mode || 'none';
}
/* ============================================================
 *  Rows / search helpers
 *  (đồng bộ: trả về Locator, KHÔNG async → `.count()` gọi trực tiếp được)
 * ============================================================ */
function shiftRows(page) {
    return page.locator(`${LIST} table tbody tr[data-instance-id]`);
}
function rowsForShiftFixture(page, fixture) {
    let rows = shiftRows(page);
    if (fixture.employee)
        rows = rows.filter({ hasText: fixture.employee });
    if (fixture.requestedDate)
        rows = rows.filter({ hasText: fixture.requestedDate });
    if (fixture.requestedTill)
        rows = rows.filter({ hasText: fixture.requestedTill });
    if (fixture.shift)
        rows = rows.filter({ hasText: fixture.shift });
    return rows;
}
// Nút thao tác trong dòng, chỉ lấy nút đang bật (Approve đã duyệt → class oh-btn--disabled; Edit/Delete → <button disabled>)
function rowButton(row, title) {
    return row.locator(`[title="${title}"]:not([disabled]):not(.oh-btn--disabled)`).first();
}
async function searchInput(page) {
    const scoped = await firstVisible(page.locator('#filterFormlistContainer input[name="search"]'));
    if (scoped)
        return scoped;
    const byName = await firstVisible(page.locator('input[name="search"]'));
    if (byName)
        return byName;
    const byPlaceholder = await firstVisible(page.locator('input[placeholder*="search" i]'));
    if (byPlaceholder)
        return byPlaceholder;
    throw new Error('Không tìm thấy ô Search.');
}
async function doSearch(page, term) {
    const input = await searchInput(page);
    const form = input.locator('xpath=ancestor::form[1]');
    const endpoint = await form.getAttribute('hx-get');
    const expectedPath = endpoint ? new URL(endpoint, page.url()).pathname : null;
    await input.fill(String(term ?? ''));
    const responsePromise = page.waitForResponse(response => {
        const request = response.request();
        if (expectedPath && new URL(response.url()).pathname !== expectedPath)
            return false;
        return request.method().toUpperCase() === 'GET';
    }, { timeout: 15000 }).catch(() => null);
    await form.evaluate(formElement => {
        if (typeof formElement.requestSubmit === 'function')
            formElement.requestSubmit();
        else
            formElement.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await responsePromise;
    await settle(page, 5000);
    await expect(page.locator(LIST).first()).toBeVisible({ timeout: 10000 });
}
async function findRequestRow(page, fixture) {
    await doSearch(page, fixture.employee || '');
    const rows = rowsForShiftFixture(page, fixture);
    if (!(await rows.count())) {
        throw new Error(`Không tìm thấy đúng dòng Shift Request: Employee=${fixture.employee}, Shift=${fixture.shift}, Requested Date=${fixture.requestedDate}, Requested Till=${fixture.requestedTill || 'Permanent'}.`);
    }
    return rows.first();
}
/* ============================================================
 *  Filter helpers
 * ============================================================ */
async function openFilterPanel(page) {
    await page.locator('#modernFilterTrigger').click();
    const panel = page.locator('#modernFilterPanel');
    await expect(panel).toHaveClass(/oh-filter-panel--open/, { timeout: 5000 });
    await expect(panel).toBeVisible();
    return panel;
}
async function applyFilter(page) {
    await page.locator('#applyFilter').click();
    await expect(page.locator('#modernFilterPanel')).not.toHaveClass(/oh-filter-panel--open/, { timeout: 5000 });
    await settle(page, 5000);
}
// Dọn bộ lọc (status/date…) để không ảnh hưởng bước sau & cleanup.
async function resetFilters(page) {
    try {
        const panel = await openFilterPanel(page);
        await panel.locator('.oh-filter-panel__clear').click();
        await settle(page, 4000);
        if (await page.locator('#modernFilterPanel.oh-filter-panel--open').count()) {
            await page.locator('#modernFilterPanel .oh-filter-panel__close').click();
        }
    }
    catch (e) {
        console.warn('[resetFilters]', e.message);
    }
}
async function selectRequestQuickFilter(page, label) {
    const btn = page.locator('.oh-row-status-indication').filter({ hasText: toRegex(label) }).first();
    if (await btn.count()) {
        await btn.click();
        await settle(page, 3000);
        return;
    }
    const panel = await openFilterPanel(page);
    await selectWidgetOption(page, panel, ['Status'], { text: label, selectors: ['select[name="status"]'] });
    await applyFilter(page);
}
/* ============================================================
 *  Fixture creation / cleanup
 * ============================================================ */
async function createShiftRequestFixture(page, id, options = {}) {
    const marker = fixtureMarker(id, 'shift-request');
    await openShiftRequests(page);
    const fixture = registerFixture(page, {
        type: 'shiftRequest', route: ROUTES.requests, marker, searchKey: null, created: false,
    });
    const form = await openCreateForm(page);
    const employeeOption = options.employee || await selectWidgetOption(page, form, ['Employee', 'Employees'], {
        allowFirstWidget: true, selectors: ['select[name="employee_id"]'],
    });
    const employee = employeeOption ? employeeOption.replace(/\s+\(NTI\d+\)$/i, '').trim() : employeeOption;
    const shift = options.shift || await selectWidgetOption(page, form, ['Requesting Shift', 'Shift'], {
        allowFirstWidget: true, selectors: ['select[name="shift_id"]'],
    });
    const range = randomRange(3);
    const requestedDate = options.date || range.date;
    await fillField(form, ['Requested Date', 'Start Date'], requestedDate, ['input[name="requested_date"]']);
    let requestedTill = null;
    if (options.permanent) {
        await clickToggle(form, ['Permanent Request']);
    }
    else {
        requestedTill = options.till || (() => {
            const end = new Date(`${requestedDate}T12:00:00`);
            end.setDate(end.getDate() + 3);
            const pad = (n) => String(n).padStart(2, '0');
            return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
        })();
        await fillField(form, ['Requested Till', 'Requested Till Date', 'End Date'], requestedTill, ['input[name="requested_till"]', 'input[name="requested_till_date"]']);
    }
    if (options.description !== null) {
        await fillField(form, ['Description'], options.description || marker, ['textarea[name="description"]', 'input[name="description"]']);
    }
    Object.assign(fixture, {
        employee, shift, requestedDate, requestedTill,
        cleanupSearch: employee,
        matchTexts: [employee, shift, requestedDate, marker].filter(Boolean),
    });
    if (options.submit !== false) {
        const result = await submitForm(page, form);
        const modalClosed = await waitForModalClose(page);
        if (!modalClosed) {
            throw new Error(`Form Shift Request vẫn mở sau khi gửi. Validation: ${result.validationMessages.join(' | ') || '(không có)'}`);
        }
        await settle(page, 2000);
        await openShiftRequests(page);
        await doSearch(page, employee);
        await expect.poll(async () => await rowsForShiftFixture(page, fixture).count(), {
            timeout: 15000,
            message: `Không thấy đúng dòng Shift Request vừa tạo: Employee=${employee}, Shift=${shift}, Requested Date=${requestedDate}, Requested Till=${requestedTill || 'Permanent'}.`,
        }).toBeGreaterThan(0);
        fixture.created = true;
        await doSearch(page, '');
    }
    return { fixture, marker, employee, shift, requestedDate, requestedTill, form };
}
async function deleteFixture(page, fixture) {
    await openShiftRequests(page);
    let rejected = false;
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const term = fixture.cleanupSearch || fixture.employee || fixture.marker;
        if (term)
            await doSearch(page, term);
        const rows = rowsForShiftFixture(page, fixture);
        if (!(await rows.count()))
            return;
        const row = rows.first();
        const del = rowButton(row, 'Delete');
        if (await del.count()) {
            const confirmP = performConfirm(page, true);
            await del.click();
            await confirmP;
            await settle(page, 2000);
            continue;
        }
        // Request đã Approved thì nút Delete bị disable → Reject trước rồi mới xóa được.
        const reject = rowButton(row, 'Reject');
        if (rejected || !(await reject.count()))
            return;
        const confirmP = performConfirm(page, true);
        await reject.click();
        await confirmP;
        await settle(page, 2000);
        rejected = true;
    }
}
async function cleanupCreatedFixtures(page) {
    if (page.isClosed())
        return;
    const fixtures = Array.isArray(page.__tcFixtures) ? [...page.__tcFixtures].reverse() : [];
    const errors = [];
    for (const fixture of fixtures) {
        if (!fixture.created)
            continue;
        try {
            await deleteFixture(page, fixture);
        }
        catch (e) {
            if (/Test ended|Target closed|has been closed/i.test(e.message)) {
                console.warn(`[cleanup skipped] ${fixture.marker}: ${e.message}`);
                continue;
            }
            errors.push(new Error(`Cleanup ${fixture.marker}: ${e.message}`, { cause: e }));
        }
    }
    page.__tcFixtures = [];
    if (errors.length)
        throw new AggregateError(errors, 'Cleanup thất bại một số fixture.');
}
test.afterEach(async ({ page }) => {
    if (page.isClosed())
        return;
    try {
        await cleanupCreatedFixtures(page);
    }
    catch (e) {
        if (!/Test ended|Target closed|has been closed/i.test(e.message)) {
            console.warn('[afterEach]', e.message);
        }
    }
});
/* ============================================================
 *  Bulk action helper (Actions dropdown mở bằng hover)
 * ============================================================ */
async function runActionsMenuItem(page, itemName, { confirm = true } = {}) {
    const actionsBtn = page.locator('button').filter({ hasText: /^\s*Actions\s*$/ }).first();
    await expect(actionsBtn).toBeVisible();
    const item = page.locator('.dropdown-content a').filter({ hasText: itemName }).first();
    await actionsBtn.hover();
    if (!(await item.isVisible().catch(() => false)))
        await actionsBtn.click();
    await expect(item).toBeVisible({ timeout: 5000 });
    const confirmP = confirm ? performConfirm(page, true) : null;
    await item.click();
    if (confirmP)
        await confirmP;
    await settle(page, 3000);
}
/* ============================================================
 *  Run case dispatcher
 * ============================================================ */
async function runShiftRequestCase(page, id) {
    switch (id) {
        case 'SHIFT_REQUEST_ACCESS_01': {
            await openShiftRequests(page);
            expect(new URL(page.url()).pathname).toBe(ROUTES.requests);
            await expect(page.locator(`.requests-tab-btn[data-tab-id="${TABS.shiftRequest}"]`)).toHaveClass(/oh-tabs__tab--active/);
            await expect(page.locator(LIST).first()).toBeVisible();
            await expect(page.locator('body')).not.toContainText(SERVER_ERROR);
            break;
        }
        case 'SHIFT_REQUEST_TABS_01': {
            await openShiftRequests(page);
            const labels = (await page.locator('.requests-tab-btn').allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
            expect(labels).toEqual(['Shift Requests', 'Shift Allocations', 'Work Type Requests', 'Document Requests']);
            await openShiftAllocations(page);
            await expect(page.locator(`.requests-tab-btn[data-tab-id="${TABS.shiftAllocation}"]`)).toHaveClass(/oh-tabs__tab--active/);
            await expect(page.locator(`.requests-tab-btn[data-tab-id="${TABS.shiftRequest}"]`)).not.toHaveClass(/oh-tabs__tab--active/);
            await openShiftRequests(page);
            break;
        }
        case 'SHIFT_REQUEST_LIST_LAYOUT_01': {
            await openShiftRequests(page);
            const headers = page.locator(`${LIST} thead th`);
            const expected = ['Employee', 'Requested Shift', 'Previous/Current Shift', 'Requested Date', 'Requested Till', 'Status', 'Actions'];
            const headersText = (await headers.allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
            for (const col of expected) {
                expect(headersText.some(h => h.toLowerCase().includes(col.toLowerCase())), `Bảng phải có cột "${col}". Có: ${headersText.join(' | ')}`).toBe(true);
            }
            await expect(page.locator('#filterFormlistContainer input[name="search"]')).toBeVisible();
            await expect(page.locator('#modernFilterTrigger')).toBeVisible();
            await expect(page.locator('a[hx-get="/shift-request/"]').first()).toBeVisible();
            const quickFilters = (await page.locator('.oh-row-status-indication').allInnerTexts()).map(t => t.trim());
            for (const label of ['Canceled', 'Approved', 'Requested']) {
                expect(quickFilters, `Thiếu quick filter ${label}`).toContain(label);
            }
            break;
        }
        case 'SHIFT_REQUEST_LIST_DATA_01': {
            await openShiftRequests(page);
            const rows = shiftRows(page);
            const count = await stableCount(rows);
            expect(count, 'Bảng phải có ít nhất 1 dòng dữ liệu mẫu').toBeGreaterThan(0);
            for (let i = 0; i < Math.min(3, count); i += 1) {
                const text = await rows.nth(i).innerText();
                expect(/Approved|Requested|Canceled|Cancelled|Rejected/i.test(text), `Dòng ${i}: Status phải là Approved/Requested/Canceled.`).toBe(true);
                expect(/\d{4}-\d{2}-\d{2}/.test(text), `Dòng ${i}: phải có Requested Date`).toBe(true);
            }
            break;
        }
        case 'SHIFT_REQUEST_SEARCH_EMPLOYEE_01': {
            await openShiftRequests(page);
            const rows = shiftRows(page);
            expect(await stableCount(rows)).toBeGreaterThan(0);
            // Lấy tên từ attribute title của span trong .oh-profile (chính xác hơn regex trên innerText)
            const term = (await rows.first().locator('.oh-profile span[title]').first().getAttribute('title') || '').trim();
            if (!term) {
                test.skip(true, 'Không đọc được tên employee mẫu');
                break;
            }
            await doSearch(page, term);
            const filtered = shiftRows(page);
            const count = await filtered.count();
            expect(count, `Search "${term}" phải có kết quả`).toBeGreaterThan(0);
            for (let i = 0; i < count; i += 1) {
                await expect(filtered.nth(i)).toContainText(term);
            }
            await doSearch(page, '');
            break;
        }
        case 'SHIFT_REQUEST_SEARCH_NO_RESULT_01': {
            await openShiftRequests(page);
            const baseline = await stableCount(shiftRows(page));
            expect(baseline, 'Cần có ít nhất 1 row trước khi test no-result').toBeGreaterThan(0);
            await doSearch(page, 'xyz_not_exist_' + Date.now());
            expect(await shiftRows(page).count(), 'Search không tồn tại phải trả 0 kết quả').toBe(0);
            await doSearch(page, '');
            await expect.poll(async () => await shiftRows(page).count(), { timeout: 8000 })
                .toBeGreaterThanOrEqual(baseline);
            break;
        }
        case 'SHIFT_REQUEST_FILTER_APPROVED_01': {
            const { fixture } = await createShiftRequestFixture(page, id);
            const row = await findRequestRow(page, fixture);
            const approveBtn = rowButton(row, 'Approve');
            if (!(await approveBtn.count())) {
                test.skip(true, 'Dòng vừa tạo không có nút Approve enabled');
                break;
            }
            const confirmP = performConfirm(page, true);
            await approveBtn.click();
            await confirmP;
            await settle(page, 3000);
            await openShiftRequests(page);
            await selectRequestQuickFilter(page, 'Approved');
            await doSearch(page, fixture.employee);
            const approved = rowsForShiftFixture(page, fixture);
            await expect(approved.first()).toContainText(/Approved/i);
            // Mọi dòng sau khi lọc đều phải là Approved
            const n = await shiftRows(page).count();
            for (let i = 0; i < n; i += 1)
                await expect(shiftRows(page).nth(i)).toContainText(/Approved/i);
            await resetFilters(page);
            break;
        }
        case 'SHIFT_REQUEST_FILTER_REJECTED_01': {
            const { fixture } = await createShiftRequestFixture(page, id);
            const row = await findRequestRow(page, fixture);
            const rejectBtn = rowButton(row, 'Reject');
            if (!(await rejectBtn.count())) {
                test.skip(true, 'Dòng vừa tạo không có nút Reject enabled');
                break;
            }
            const confirmP = performConfirm(page, true);
            await rejectBtn.click();
            await confirmP;
            await settle(page, 3000);
            await openShiftRequests(page);
            await selectRequestQuickFilter(page, 'Canceled');
            await doSearch(page, fixture.employee);
            const rejected = rowsForShiftFixture(page, fixture);
            await expect(rejected.first()).toContainText(/Canceled|Cancelled|Rejected/i);
            await resetFilters(page);
            break;
        }
        case 'SHIFT_REQUEST_FILTER_DATE_01': {
            const range = randomRange(3);
            const { fixture } = await createShiftRequestFixture(page, id, { date: range.date, till: range.till });
            await openShiftRequests(page);
            const panel = await openFilterPanel(page);
            // Dùng đúng name của khoảng ngày (trước đây alias 'Requested Date' khớp nhầm ô lọc ngày chính xác)
            await panel.locator('input[name="requested_date__gte"]').fill(fixture.requestedDate);
            await panel.locator('input[name="requested_date__lte"]').fill(fixture.requestedDate);
            await applyFilter(page);
            await doSearch(page, fixture.employee);
            const rows = shiftRows(page);
            const count = await rows.count();
            expect(count, 'Lọc theo ngày phải còn dòng vừa tạo').toBeGreaterThan(0);
            for (let i = 0; i < count; i += 1) {
                await expect(rows.nth(i)).toContainText(fixture.requestedDate);
            }
            await resetFilters(page);
            break;
        }
        case 'SHIFT_REQUEST_FILTER_GROUP_BY_01': {
            await openShiftRequests(page);
            const panel = await openFilterPanel(page);
            await expect(panel.locator('.oh-accordion-header').filter({ hasText: /Group By/i })).toBeVisible();
            const options = (await panel.locator('select[name="field"] option').allTextContents()).map(t => t.trim());
            for (const opt of ['Employee', 'Requested Shift', 'Current Shift', 'Requested Date']) {
                expect(options, `Group By thiếu "${opt}"`).toContain(opt);
            }
            await panel.locator('.oh-filter-panel__close').click();
            break;
        }
        case 'SHIFT_REQUEST_ADD_VALID_01': {
            const { fixture } = await createShiftRequestFixture(page, id);
            const row = await findRequestRow(page, fixture);
            await expect(row).toBeVisible();
            await expect(row).toContainText(fixture.requestedDate);
            await expect(row).toContainText(fixture.requestedTill);
            await expect(row).toContainText(/Requested/i);
            await doSearch(page, '');
            break;
        }
        case 'SHIFT_REQUEST_DATE_RANGE_01': {
            const { date, till } = randomRange(5);
            const { fixture } = await createShiftRequestFixture(page, id, { date, till });
            const row = await findRequestRow(page, fixture);
            await expect(row).toContainText(date);
            await expect(row).toContainText(till);
            const form = await openCreateForm(page);
            await expect(await findField(form, ['Requested Date', 'Start Date'], ['input[name="requested_date"]'])).toBeVisible();
            await expect(await findField(form, ['Requested Till', 'End Date'], ['input[name="requested_till"]'])).toBeVisible();
            await closeVisibleDialog(page);
            await doSearch(page, '');
            break;
        }
        case 'SHIFT_REQUEST_PERMANENT_TOGGLE_01': {
            await openShiftRequests(page);
            const form = await openCreateForm(page);
            const tillField = await findField(form, ['Requested Till', 'Requested Till Date', 'End Date'], ['input[name="requested_till"]']);
            expect(tillField, 'Form phải có Requested Till trước khi bật Permanent').not.toBeNull();
            await expect(tillField).toBeVisible();
            await clickToggle(form, ['Permanent Request']);
            await expect(tillField).not.toBeVisible();
            await closeVisibleDialog(page);
            break;
        }
        case 'SHIFT_REQUEST_ADD_PERMANENT_01': {
            const { fixture } = await createShiftRequestFixture(page, id, { permanent: true });
            const row = await findRequestRow(page, fixture);
            await expect(row).toBeVisible();
            await expect(row).toContainText(fixture.requestedDate);
            await doSearch(page, '');
            break;
        }
        case 'SHIFT_REQUEST_CREATE_REQUIRED_EMPLOYEE_01': {
            await openShiftRequests(page);
            const baseline = await stableCount(shiftRows(page));
            const form = await openCreateForm(page);
            // Nếu Employee đã được điền sẵn thì test này không có ý nghĩa
            const empField = await findField(form, ['Employee'], ['select[name="employee_id"]']);
            if (empField && await empField.evaluate(el => Boolean(el.value))) {
                test.skip(true, 'Employee đã được điền sẵn trong form');
                break;
            }
            const { date, till } = randomRange(3);
            await selectWidgetOption(page, form, ['Requesting Shift', 'Shift'], {
                allowFirstWidget: true, selectors: ['select[name="shift_id"]'],
            });
            await fillField(form, ['Requested Date', 'Start Date'], date, ['input[name="requested_date"]']);
            await fillField(form, ['Requested Till', 'End Date'], till, ['input[name="requested_till"]']);
            const result = await submitForm(page, form);
            expect(result.modalClosed, 'Bỏ trống Employee phải bị chặn (modal vẫn mở)').toBe(false);
            const invalidNative = await form.locator('form').first().evaluate(el => !el.checkValidity());
            const hasError = result.validationMessages.length > 0
                || await form.getByText(/required|This field|please select/i).count() > 0;
            expect(invalidNative || hasError, 'Phải có lỗi validation cho Employee').toBe(true);
            await closeVisibleDialog(page);
            await openShiftRequests(page);
            expect(await stableCount(shiftRows(page)), 'Không được tạo thêm request').toBe(baseline);
            break;
        }
        case 'SHIFT_REQUEST_MODIFY_PENDING_01': {
            const { fixture } = await createShiftRequestFixture(page, id);
            const row = await findRequestRow(page, fixture);
            const editBtn = rowButton(row, 'Edit');
            if (!(await editBtn.count())) {
                test.skip(true, 'Dòng vừa tạo không có nút Edit');
                break;
            }
            await editBtn.click();
            await settle(page, 3000);
            const form = await findFormScope(page);
            await expect(form).toBeVisible();
            const newDesc = `${fixture.marker} modified`;
            await fillField(form, ['Description'], newDesc, ['textarea[name="description"]', 'input[name="description"]']);
            const result = await submitForm(page, form);
            const closed = await waitForModalClose(page);
            if (!closed)
                throw new Error(`Form Shift Request vẫn mở sau thao tác sửa. Validation: ${result.validationMessages.join(' | ') || '(không có)'}`);
            // Xác minh dữ liệu đã lưu qua màn chi tiết (cột Description mặc định đang ẩn)
            await doSearch(page, fixture.employee);
            const updated = rowsForShiftFixture(page, fixture).first();
            await expect(updated).toBeVisible();
            await updated.locator('td.stickyleft-second').click();
            await settle(page, 3000);
            await expect(page.locator('#genericModalBody')).toContainText(newDesc);
            await closeVisibleDialog(page);
            await doSearch(page, '');
            break;
        }
        case 'SHIFT_REQUEST_DUPLICATE_01': {
            const { fixture } = await createShiftRequestFixture(page, id);
            const row = await findRequestRow(page, fixture);
            const dupBtn = rowButton(row, 'Duplicate');
            if (!(await dupBtn.count())) {
                test.skip(true, 'Dòng vừa tạo không có nút Duplicate');
                break;
            }
            await dupBtn.click();
            await settle(page, 3000);
            const form = await findFormScope(page);
            await expect(form).toBeVisible();
            await expect(form.locator('form').first()).toBeVisible();
            await expect(form).toContainText(fixture.employee.split(' ')[0]);
            await closeVisibleDialog(page); // không lưu → không phát sinh bản ghi thừa
            await doSearch(page, fixture.employee);
            expect(await rowsForShiftFixture(page, fixture).count(), 'Đóng form duplicate không được tạo thêm dòng').toBe(1);
            await doSearch(page, '');
            break;
        }
        case 'SHIFT_REQUEST_DELETE_01': {
            const { fixture } = await createShiftRequestFixture(page, id);
            const row = await findRequestRow(page, fixture);
            const delBtn = rowButton(row, 'Delete');
            if (!(await delBtn.count())) {
                test.skip(true, 'Dòng vừa tạo không có nút Delete');
                break;
            }
            const confirmP = performConfirm(page, true);
            await delBtn.click();
            await confirmP;
            await settle(page, 3000);
            await doSearch(page, fixture.employee);
            await expect.poll(async () => await rowsForShiftFixture(page, fixture).count(), { timeout: 10000 }).toBe(0);
            fixture.created = false;
            await doSearch(page, '');
            break;
        }
        case 'SHIFT_REQUEST_DELETE_CANCEL_01': {
            const { fixture } = await createShiftRequestFixture(page, id);
            const row = await findRequestRow(page, fixture);
            const delBtn = rowButton(row, 'Delete');
            if (!(await delBtn.count())) {
                test.skip(true, 'Dòng vừa tạo không có nút Delete');
                break;
            }
            const confirmP = performConfirm(page, false);
            await delBtn.click();
            await confirmP;
            await settle(page, 3000);
            await doSearch(page, fixture.employee);
            expect(await rowsForShiftFixture(page, fixture).count(), 'Dòng vừa tạo phải còn sau khi hủy xóa').toBeGreaterThan(0);
            await doSearch(page, '');
            break;
        }
        case 'SHIFT_REQUEST_APPROVE_01': {
            const { fixture } = await createShiftRequestFixture(page, id);
            const row = await findRequestRow(page, fixture);
            const approveBtn = rowButton(row, 'Approve');
            if (!(await approveBtn.count())) {
                test.skip(true, 'Dòng vừa tạo không có nút Approve enabled');
                break;
            }
            const confirmP = performConfirm(page, true);
            await approveBtn.click();
            await confirmP;
            await settle(page, 3000);
            const approvedRow = await findRequestRow(page, fixture);
            await expect(approvedRow).toContainText(/Approved/i);
            // Sau khi duyệt nút Approve phải bị khóa
            await expect(approvedRow.locator('[title="Approve"].oh-btn--disabled')).toHaveCount(1);
            await doSearch(page, '');
            break;
        }
        case 'SHIFT_REQUEST_CANCEL_01': {
            const { fixture } = await createShiftRequestFixture(page, id);
            const row = await findRequestRow(page, fixture);
            const rejectBtn = rowButton(row, 'Reject');
            if (!(await rejectBtn.count())) {
                test.skip(true, 'Dòng vừa tạo không có nút Reject enabled');
                break;
            }
            const confirmP = performConfirm(page, true);
            await rejectBtn.click();
            await confirmP;
            await settle(page, 3000);
            const canceledRow = await findRequestRow(page, fixture);
            await expect(canceledRow).toContainText(/Canceled|Cancelled|Rejected/i);
            await doSearch(page, '');
            break;
        }
        case 'SHIFT_REQUEST_SORT_COLUMN_01': {
            await openShiftRequests(page);
            expect(await stableCount(shiftRows(page))).toBeGreaterThan(1);
            const header = page.locator(`${LIST} thead th`).filter({ hasText: /Requested Date/i }).first();
            await expect(header).toBeVisible();
            const readDates = async () => {
                const r = shiftRows(page);
                const n = await r.count();
                const dates = [];
                for (let i = 0; i < n; i += 1) {
                    const m = (await r.nth(i).innerText()).match(/\d{4}-\d{2}-\d{2}/);
                    if (m)
                        dates.push(m[0]);
                }
                return dates;
            };
            const clickSort = async () => {
                const sortable = header.locator('[hx-get]').first();
                if (await sortable.count())
                    await sortable.click();
                else
                    await header.click();
                await settle(page, 3000);
            };
            const asc = (a) => a.every((v, i) => i === 0 || a[i - 1] <= v);
            const desc = (a) => a.every((v, i) => i === 0 || a[i - 1] >= v);
            await clickSort();
            const order1 = await readDates();
            await clickSort();
            const order2 = await readDates();
            expect(order1.length).toBeGreaterThan(1);
            expect(order2.length).toBe(order1.length);
            expect(asc(order1) || desc(order1), `Lần sort 1 không có thứ tự: ${order1.join(', ')}`).toBe(true);
            expect(asc(order2) || desc(order2), `Lần sort 2 không có thứ tự: ${order2.join(', ')}`).toBe(true);
            if (new Set(order1).size > 1) {
                expect(asc(order1), 'Hai lần sort phải đảo chiều nhau').not.toBe(asc(order2));
            }
            break;
        }
        case 'SHIFT_REQUEST_COMMENT_ADD_01': {
            const { fixture } = await createShiftRequestFixture(page, id);
            const row = await findRequestRow(page, fixture);
            // Dòng không có nút Comment; comment (nếu có) nằm trong màn chi tiết mở khi click vào dòng.
            await row.locator('td.stickyleft-second').click();
            await settle(page, 3000);
            const panel = await findFormScope(page);
            const commentBtn = await firstVisible(panel.locator('[title="Comment"], [title="Comments"]'));
            if (commentBtn) {
                await commentBtn.click();
                await settle(page, 2000);
            }
            const commentText = `${fixture.marker} comment`;
            const commentField = await findField(panel, ['Comment', 'Write a comment', 'Add comment'], ['textarea', 'input[name*="comment" i]']);
            if (!commentField) {
                test.skip(true, 'Màn chi tiết không có trường Comment');
                break;
            }
            await commentField.fill(commentText);
            await clickByName(panel, ['Post', 'Send', 'Save', 'Add Comment', 'Submit'], { roles: ['button'], allowText: false });
            await settle(page, 3000);
            await expect(page.getByText(commentText, { exact: false }).first()).toBeVisible();
            await closeVisibleDialog(page);
            await doSearch(page, '');
            break;
        }
        case 'SHIFT_REQUEST_COLUMN_CHOOSER_01': {
            await openShiftRequests(page);
            const chooser = page.locator('button[title="Customize columns"]').first();
            await expect(chooser).toBeVisible();
            await chooser.click();
            const panel = page.locator('.oh-column-config').first();
            await expect(panel).toBeVisible();
            await expect(panel.locator('[data-column-count]')).toHaveText(/^\d+\/\d+$/);
            const checkbox = panel.locator('input.toggle-column-checkbox[aria-label="Description"]');
            await expect(checkbox).toHaveCount(1);
            const before = await checkbox.isChecked();
            await checkbox.setChecked(!before);
            await settle(page, 2000);
            expect(await panel.locator('input.toggle-column-checkbox[aria-label="Description"]').isChecked()).toBe(!before);
            // Trả về trạng thái ban đầu (cấu hình cột được lưu phía server)
            await panel.locator('input.toggle-column-checkbox[aria-label="Description"]').setChecked(before);
            await settle(page, 1000);
            break;
        }
        case 'SHIFT_REQUEST_ALLOCATED_LIST_01': {
            await openShiftAllocations(page);
            await expect(page.getByText(/Shift Allocations/i).first()).toBeVisible();
            await expect(page.locator('body')).not.toContainText(SERVER_ERROR);
            break;
        }
        case 'SHIFT_REQUEST_USER_AVAILABILITY_01': {
            await openShiftAllocations(page);
            const col = await firstVisible(page.locator('th').filter({ hasText: /User Availability|Availability/i }));
            if (!col) {
                test.skip(true, 'Allocated tab không có cột User Availability');
                break;
            }
            await expect(col).toBeVisible();
            break;
        }
        case 'SHIFT_REQUEST_EXPORT_01': {
            await openShiftRequests(page);
            const actionsBtn = page.locator('button').filter({ hasText: /^\s*Actions\s*$/ }).first();
            await expect(actionsBtn).toBeVisible();
            await actionsBtn.hover();
            const exportItem = page.locator('a[hx-get="/shift-export/"]').first();
            if (!(await exportItem.isVisible().catch(() => false)))
                await actionsBtn.click();
            if (!(await exportItem.count())) {
                test.skip(true, 'Actions không có Export');
                break;
            }
            await exportItem.click();
            await settle(page, 3000);
            const form = await findFormScope(page);
            await expect(form).toBeVisible();
            await expect(form.locator('button[type="submit"], input[type="submit"]').filter({ hasText: /Export/i }).first()).toBeVisible();
            await closeVisibleDialog(page);
            break;
        }
        case 'SHIFT_REQUEST_BULK_ACTIONS_01': {
            const approved = await createShiftRequestFixture(page, `${id}_APPROVE`);
            const rejected = await createShiftRequestFixture(page, `${id}_REJECT`);
            await openShiftRequests(page);
            let row = await findRequestRow(page, approved.fixture);
            let cb = await firstVisible(row.locator('input.list-table-row'));
            if (!cb) {
                test.skip(true, 'Không tìm thấy checkbox của request vừa tạo');
                break;
            }
            await cb.check();
            await runActionsMenuItem(page, /Approve Requests/i);
            await expect(await findRequestRow(page, approved.fixture)).toContainText(/Approved/i);
            await openShiftRequests(page);
            row = await findRequestRow(page, rejected.fixture);
            cb = await firstVisible(row.locator('input.list-table-row'));
            if (!cb) {
                test.skip(true, 'Không tìm thấy checkbox của request cần Reject');
                break;
            }
            await cb.check();
            await runActionsMenuItem(page, /Reject Requests/i);
            await expect(await findRequestRow(page, rejected.fixture)).toContainText(/Canceled|Cancelled|Rejected/i);
            await doSearch(page, '');
            break;
        }
        case 'SHIFT_REQUEST_XSS_SEARCH_01': {
            await openShiftRequests(page);
            let dialogShown = false;
            page.once('dialog', async (d) => { dialogShown = true; await d.dismiss(); });
            const payload = '<img src=x onerror="window.__xssTest=true">';
            await doSearch(page, payload);
            expect(await page.evaluate(() => window.__xssTest)).toBeUndefined();
            expect(await page.locator('img[src="x"]').count()).toBe(0);
            expect(dialogShown).toBe(false);
            await doSearch(page, '');
            break;
        }
        case 'SHIFT_REQUEST_PERSIST_RELOAD_01': {
            const { fixture } = await createShiftRequestFixture(page, id);
            await page.reload({ waitUntil: 'domcontentloaded' });
            await settle(page, 4000);
            await expect(page.locator('a[hx-get="/shift-request/"]').first()).toBeVisible({ timeout: 30000 });
            await doSearch(page, fixture.employee);
            expect(await rowsForShiftFixture(page, fixture).count(), 'Đúng request vừa tạo phải còn sau reload').toBeGreaterThan(0);
            await doSearch(page, '');
            break;
        }
        default:
            throw new Error(`Không có kịch bản Shift Request cho ${id}`);
    }
}
/* ============================================================
 *  TESTS
 * ============================================================ */
const TESTS = [
    ['SHIFT_REQUEST_ACCESS_01', 'Truy cập trang Requests và tab Shift Requests'],
    ['SHIFT_REQUEST_TABS_01', 'Chuyển đổi giữa các tab Requests'],
    ['SHIFT_REQUEST_LIST_LAYOUT_01', 'Kiểm tra bố cục bảng và toolbar'],
    ['SHIFT_REQUEST_LIST_DATA_01', 'Đọc và xác thực dữ liệu mẫu trong bảng'],
    ['SHIFT_REQUEST_SEARCH_EMPLOYEE_01', 'Tìm kiếm theo tên Employee'],
    ['SHIFT_REQUEST_SEARCH_NO_RESULT_01', 'Tìm kiếm không có kết quả'],
    ['SHIFT_REQUEST_FILTER_APPROVED_01', 'Quick filter Approved'],
    ['SHIFT_REQUEST_FILTER_REJECTED_01', 'Quick filter Canceled/Rejected'],
    ['SHIFT_REQUEST_FILTER_DATE_01', 'Lọc theo Requested Date range'],
    ['SHIFT_REQUEST_FILTER_GROUP_BY_01', 'Filter và Group By có sẵn'],
    ['SHIFT_REQUEST_ADD_VALID_01', 'Tạo Shift Request hợp lệ'],
    ['SHIFT_REQUEST_DATE_RANGE_01', 'Kiểm tra Requested Date + Requested Till'],
    ['SHIFT_REQUEST_PERMANENT_TOGGLE_01', 'Permanent Request ẩn Requested Till'],
    ['SHIFT_REQUEST_ADD_PERMANENT_01', 'Tạo permanent Shift Request'],
    ['SHIFT_REQUEST_CREATE_REQUIRED_EMPLOYEE_01', 'Bỏ trống Employee bị chặn'],
    ['SHIFT_REQUEST_MODIFY_PENDING_01', 'Chỉnh sửa Shift Request đang pending'],
    ['SHIFT_REQUEST_DUPLICATE_01', 'Duplicate Shift Request'],
    ['SHIFT_REQUEST_DELETE_01', 'Xóa Shift Request với confirm'],
    ['SHIFT_REQUEST_DELETE_CANCEL_01', 'Hủy thao tác xóa'],
    ['SHIFT_REQUEST_APPROVE_01', 'Phê duyệt Shift Request'],
    ['SHIFT_REQUEST_CANCEL_01', 'Reject/Cancel Shift Request'],
    ['SHIFT_REQUEST_SORT_COLUMN_01', 'Sắp xếp theo cột Requested Date'],
    ['SHIFT_REQUEST_COMMENT_ADD_01', 'Thêm comment cho Shift Request'],
    ['SHIFT_REQUEST_COLUMN_CHOOSER_01', 'Bật/tắt cột qua Customize columns'],
    ['SHIFT_REQUEST_ALLOCATED_LIST_01', 'Tab Shift Allocations'],
    ['SHIFT_REQUEST_USER_AVAILABILITY_01', 'Cột User Availability trong Shift Allocations'],
    ['SHIFT_REQUEST_EXPORT_01', 'Export danh sách qua modal'],
    ['SHIFT_REQUEST_BULK_ACTIONS_01', 'Bulk Approve/Reject qua Actions dropdown'],
    ['SHIFT_REQUEST_XSS_SEARCH_01', 'Search với payload XSS không thực thi'],
    ['SHIFT_REQUEST_PERSIST_RELOAD_01', 'Dữ liệu còn sau reload'],
];
for (const [id, title] of TESTS) {
    test(`${id} - ${title}`, async ({ page }) => {
        await runShiftRequestCase(page, id);
    });
}
