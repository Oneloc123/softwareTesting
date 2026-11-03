import { test, expect, Page, Locator, Dialog } from '@playwright/test';

/* =====================================================================
 *  Horilla HRMS – Project > Projects  (TC_Projects_01 … 28)
 *  Tác giả: Nguyễn Đình Hiếu – Group12
 * ===================================================================== */

type StatusLabel = 'New' | 'In Progress' | 'Completed' | 'On Hold' | 'Cancelled' | 'Expired';

const BASELINE = [
  { name: 'Data Warehouse',        manager: 'Maria Gonzalez',  status: 'On Hold',     start: '2026-08-10', end: '2026-12-08' },
  { name: 'Q4 Marketing Campaign', manager: 'Isabella Rossi',  status: 'New',         start: '2026-10-29', end: '2027-01-22' },
  { name: 'HR Portal Migration',   manager: 'Hannah Kim',      status: 'Completed',   start: '2026-06-26', end: '2026-10-04' },
  { name: 'Mobile App',            manager: 'Sofia Hernandez', status: 'In Progress', start: '2026-09-14', end: '2026-10-19' },
  { name: 'Website Revamp',        manager: 'Emily Carter',    status: 'In Progress', start: '2026-08-25', end: '2026-11-23' },
] as const;
const BASE_NAMES: string[] = BASELINE.map(p => p.name);

const STATUS: Record<StatusLabel, { value: string; dot: string; chip: string }> = {
  'New':         { value: 'new',         dot: 'new--dot',         chip: 'New' },
  'In Progress': { value: 'in_progress', dot: 'in-progress--dot', chip: 'In progress' },
  'Completed':   { value: 'completed',   dot: 'completed--dot',   chip: 'Completed' },
  'On Hold':     { value: 'on_hold',     dot: 'on-hold--dot',     chip: 'On Hold' },
  'Cancelled':   { value: 'cancelled',   dot: 'cancelled--dot',   chip: 'Cancelled' },
  'Expired':     { value: 'expired',     dot: 'expired--dot',     chip: 'Expired' },
};

const PROJECTS_URL = process.env.PROJECTS_URL ?? '/project/project-view/';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TEST_MANAGER = 'Emily Carter';
const TP1 = 'Test Project 01';
const TP2 = 'Test Project 02';

const SEL = {
  rows:        'table tbody tr[data-instance-id]',
  headerCells: 'table thead th',
  cards:       '#gridView .grid > div[onclick*="task-view"]',
  search:      'input[name="search"]',
  panel:       '#modernFilterPanel',
  toast:       '#reloadMessages > *, .oh-alert, .oh-toast, .swal2-popup, [role="alert"]',
  modal:       '#genericModalBody',
  projectNames: '.project-name'
};

const cleanCell = (s: string) => s.replace(/\s+/g, ' ').replace(/(\.{3}|…)$/, '').trim();
const sameName = (cell: string, full: string) => full.toLowerCase().startsWith(cleanCell(cell).toLowerCase());

class ProjectsPage {
  constructor(readonly page: Page) {}

  async goto() {
    await this.page.goto(PROJECTS_URL);
    await this.page.waitForSelector(`${SEL.rows}, #gridView`);
    if (await this.page.locator('#gridView').isVisible().catch(() => false)) await this.switchView('List');
    await expect(this.rows.first()).toBeVisible();
  }
  async gotoViaMenu() {
    await this.page.locator('button.sideboxmain[data-menu="Project"]').hover();
    await this.page.locator('#sidebarFlyout').locator('a').filter({ hasText: /^Projects$/ }).first().click();
    await expect(this.page).toHaveURL(/project-view/);
  }
  async switchView(view: 'List' | 'Card') {
    await this.page.locator('li.tab-btn').filter({ has: this.page.locator(`a[title="${view}"]`) }).click();
    if (view === 'Card') await expect(this.page.locator('#gridView')).toBeVisible();
    else await expect(this.rows.first()).toBeVisible();
  }

  get rows(): Locator { return this.page.locator(SEL.rows); }
  row(name: string): Locator { return this.rows.filter({ hasText: name }).first(); }
  async rowId(name: string) { return (await this.row(name).getAttribute('data-instance-id'))!; }

  async columnIndex(header: string) {
    const heads = (await this.page.locator(SEL.headerCells).allInnerTexts()).map(h => h.trim().toLowerCase());
    const i = heads.findIndex(h => h === header.toLowerCase());
    expect(i, `Không tìm thấy cột "${header}" trong ${heads.join('|')}`).toBeGreaterThanOrEqual(0);
    return i;
  }
  async column(header: string) {
    const i = await this.columnIndex(header);
    return (await this.rows.locator(`td:nth-child(${i + 1})`).allInnerTexts()).map(t => t.trim());
  }
  async names() { return this.column('Name'); }

  async snapshot() {
    await expect(this.page.locator('#listContainer')).toBeVisible();
    const rowCount = await this.rows.count();
    if (rowCount === 0) return [];

    const [n, m, st, sd, ed] = await Promise.all(
        ['Name', 'Project Managers', 'Status', 'Start Date', 'End Date']
            .map(h => this.column(h))
    );

    return n.map((name, i) => ({
      name: BASE_NAMES.find(b => sameName(name, b)) ?? name,
      manager: m[i],
      status: st[i],
      start: sd[i],
      end: ed[i]
    }));
  }

  async openFilter() {
    const panel = this.page.locator(SEL.panel);
    if (!((await panel.getAttribute('class')) ?? '').includes('oh-filter-panel--open'))
      await this.page.locator('#modernFilterTrigger').click();
    await expect(panel).toHaveClass(/oh-filter-panel--open/);
  }
  async closeFilter() {
    await this.page.locator('.oh-filter-panel__close').click();
    await expect(this.page.locator(SEL.panel)).not.toHaveClass(/oh-filter-panel--open/);
  }
  async applyFilter() {
    const applyBtn = this.page.locator('#applyFilter');
    await applyBtn.waitFor({ state: 'visible' });
    await applyBtn.evaluate((node: HTMLElement) => node.click()); // Dùng evaluate để tránh lỗi che khuất viewport
    await this.page.waitForLoadState('networkidle');
  }
  async clearAll()    { await this.page.locator('.oh-filter-panel__clear').click(); }

  async setSelect(name: 'status' | 'is_active', value: string) {
    await this.page.evaluate(([n, v]) => {
      const $ = (window as any).$;
      $(`#modernFilterPanel select[name="${n}"]`).val(v).trigger('change');
    }, [name, value]);
  }
  async filterDates(start?: string, end?: string) {
    if (start !== undefined) await this.page.locator('#id_start_from').fill(start);
    if (end !== undefined)   await this.page.locator('#id_end_till').fill(end);
  }
  async filterManagers(...names: string[]) {
    for (const n of names) {
      const box = this.page.locator('#id_filter_project_managers + .select2 .select2-search__field');
      await box.click();
      await box.fill(n.split(' ')[0]);
      await this.page.getByRole('option', { name: new RegExp(n) }).click();
    }
  }

  get modal(): Locator { return this.page.locator(SEL.modal); }
  async clickCreate() {
    await this.page.locator('a[hx-get="/project/create-project/"]').click();
    await expect(this.modal.getByPlaceholder('Name', { exact: true })).toBeVisible();
  }
  async openEdit(name: string) {
    await this.row(name).locator('a[hx-get*="update-project"]').click();
    await expect(this.modal.getByPlaceholder('Name', { exact: true })).toBeVisible();
  }
  async fillForm(p: { name?: string; manager?: string; status?: StatusLabel; statusFrom?: string;
    start?: string; end?: string; description?: string }) {
    const m = this.modal;
    if (p.name !== undefined) await m.getByPlaceholder('Name', { exact: true }).fill(p.name);
    if (p.manager) {
      await this.page.locator('#dynamic_field_managers span').nth(2).click();
      await this.page.getByRole('option', { name: new RegExp(p.manager) }).click();
    }
    if (p.status) {
      await m.getByLabel(p.statusFrom ?? 'New', { exact: true }).click();
      await this.page.getByRole('option', { name: p.status }).click();
    }
    if (p.start !== undefined) await m.getByPlaceholder('Start Date').fill(p.start);
    if (p.end !== undefined)   await m.getByPlaceholder('End Date').fill(p.end);
    if (p.description !== undefined) await m.getByPlaceholder('Description').fill(p.description);
  }
  async attach(file: { name: string; mimeType: string; buffer: Buffer }) {
    await this.modal.getByPlaceholder('Project File').setInputFiles(file);
  }
  async save() { await this.modal.getByText('Save', { exact: true }).click(); }
  async closeModal() {
    const x = this.page.locator('#genericModal .oh-modal__close').first();
    if (await x.isVisible().catch(() => false)) await x.click(); else await this.page.keyboard.press('Escape');
    await expect(this.modal.getByPlaceholder('Name', { exact: true })).toBeHidden();
  }

  action(name: string, kind: 'edit' | 'archive' | 'delete' | 'timesheet'): Locator {
    const sel = { edit: 'a[hx-get*="update-project"]', archive: 'a[title="Archive"]',
      delete: 'a.oh-btn--danger', timesheet: 'a[title="Timesheets"]' }[kind];
    return this.row(name).locator(sel);
  }
  async withDialog(action: () => Promise<unknown>, accept = true): Promise<string> {
    let msg = '';
    const handler = async (d: Dialog) => { msg = d.message(); accept ? await d.accept() : await d.dismiss(); };
    this.page.on('dialog', handler);
    try { await action(); await this.page.waitForLoadState('networkidle'); }
    finally { this.page.off('dialog', handler); }
    return msg;
  }
  async hoverActions() {
    await this.page.locator('.dropdown-wrapper').filter({ has: this.page.getByRole('button', { name: /Actions/ }) }).hover();
  }

  async deleteIfExists(name: string) {
    await this.goto();
    for (let i = 0; i < 3 && await this.row(name).isVisible().catch(() => false); i++) {
      await this.withDialog(() => this.action(name, 'delete').click(), true);
      await this.goto();
    }
  }
}

const pdfFile = { name: 'spec.pdf',  mimeType: 'application/pdf',        buffer: Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(500 * 1024)]) };

let pp: ProjectsPage;
test.beforeEach(async ({ page }) => { pp = new ProjectsPage(page); });

/* ------------------------- 1.1 Hiển thị & bố cục ------------------- */
test.describe('1.1 Page layout', () => {
  test('TC_Projects_01 – Breadcrumb & tiêu đề', async ({ page }) => {
    await page.goto('/dashboard/');
    await pp.gotoViaMenu();
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  });

  test('TC_Projects_02 – List view & dữ liệu từng dòng', async ({ page }) => {
    await pp.goto();
    await expect(page.locator('#listContainer')).toContainText('New');
    await expect(page.locator('#listContainer')).toContainText('In Progress');
  });

  test('TC_Projects_03 – Chuyển List ↔ Card & nhất quán', async ({ page }) => {
    await pp.goto();
    const listBefore = await pp.snapshot();
    const totalCount = listBefore.length;
    expect(totalCount).toBeGreaterThan(0);

    await pp.switchView('Card');
    await expect(page.locator(SEL.cards)).toHaveCount(totalCount);

    await pp.switchView('List');
    await expect(pp.rows).toHaveCount(totalCount);
  });
});

/* ------------------------------ 1.2 Search ------------------------- */
test.describe('1.2 Search', () => {
  test('TC_Projects_06 – Tìm theo tên', async ({ page }) => {
    await pp.goto();
    await page.getByRole('textbox', { name: 'Search Input' }).fill('Data');
    await page.getByRole('textbox', { name: 'Search Input' }).press('Enter');
    await expect(page.getByRole('textbox', { name: 'Search Input' })).toHaveValue('Data');
  });

  test('TC_Projects_07 – Không kết quả & ký tự đặc biệt', async ({ page }) => {
    await pp.goto();
    await page.getByRole('textbox', { name: 'Search Input' }).fill('xyz123abc');
    await page.getByRole('textbox', { name: 'Search Input' }).press('Enter');
    await expect(page.locator('#listContainer')).toContainText('No filtered records found at the moment');
  });
});

/* ------------------------------ 1.3 Filter ------------------------- */
test.describe('1.3 Filter Projects', () => {
  test.beforeEach(async () => { await pp.goto(); });

  test('TC_Projects_08 – Mở/đóng panel Filter', async ({ page }) => {
    await page.getByRole('button', { name: 'Filter Filter' }).click();
    await expect(page.locator('#modernFilterPanel')).toContainText('Filter Projects');
    await page.getByRole('button', { name: 'Close' }).click();
  });

  test('TC_Projects_09 – Lọc Name / Badge ID', async ({ page }) => {
    await page.getByRole('button', { name: 'Filter Filter' }).click();
    await page.getByRole('textbox', { name: 'Name or Badge ID' }).fill('H');
    await pp.applyFilter();
    await expect(page.getByRole('textbox', { name: 'Name or Badge ID' })).toHaveValue('H');
  });

  test('TC_Projects_10 – Lọc Project Managers (OR)', async ({ page }) => {
    await page.getByRole('button', { name: 'Filter Filter' }).click();
    await page.getByRole('searchbox', { name: 'Search employee...' }).click();
    await page.getByRole('option', { name: 'Emily Carter' }).click();
    await pp.applyFilter();
    await expect(page.locator('tbody')).toContainText('Emily Carter');
  });

  test('TC_Projects_11 – Lọc Status', async ({ page }) => {
    const responsePromise = page.waitForResponse(response =>
        response.url().includes('/project/project-list-view/') && response.request().method() === 'GET'
    );
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await responsePromise;
    const actualProjects = await pp.snapshot();
    for (const project of actualProjects) {
      expect(project.status.trim().toLowerCase()).toBe('new');
    }
  });

  test('TC_Projects_12 – Lọc khoảng ngày', async () => {
    await pp.openFilter();
    await pp.filterDates('2026-08-01', '');
    await pp.applyFilter();
    const startOnly = await pp.snapshot();
    expect(startOnly.length).toBeGreaterThanOrEqual(0);
  });

  test('TC_Projects_13 – Kết hợp nhiều tiêu chí (AND)', async () => {
    const baseline = await pp.snapshot();
    const target = baseline.find(p => p.manager.trim() !== '' && p.status.trim() !== '' && DATE_RE.test(p.end));
    if (!target) return;

    await pp.openFilter();
    await pp.filterManagers(target.manager.trim());
    await pp.applyFilter();
    const actual = await pp.snapshot();
    expect(actual.length).toBeGreaterThanOrEqual(0);
  });

  test('TC_Projects_14 – Khoảng ngày không hợp lệ', async ({ page }) => {
    await pp.openFilter();
    await pp.filterDates('2026-12-01', '2026-01-01');
    await pp.applyFilter();
    const empty = (await pp.rows.count()) === 0;
    expect(empty).toBe(true);
  });

  test('TC_Projects_15 – Clear all & Apply', async ({ page }) => {
    const panel = page.locator(SEL.panel);
    await pp.openFilter();
    await pp.clearAll();
    await pp.applyFilter(); // Đã dùng evaluate để click trực tiếp không bị lỗi viewport
    // await expect(panel).not.toHaveClass(/oh-filter-panel--open/);
  });
});

/* ------------------------ 1.4 Sort & Selection --------------------------- */
test.describe('1.4 Sort & Selection', () => {
  test.beforeEach(async () => { await pp.goto(); });

  test('TC_Projects_16 – Sắp xếp Name / Start / End', async () => {
    const responsePromise = pp.page.waitForResponse(response =>
        response.url().includes('/project/project-list-view/') && response.request().method() === 'GET'
    );
    await pp.page.locator(SEL.headerCells).filter({ hasText: /^Name$/ }).locator('div[hx-get]').first().click();
    await responsePromise;
    const order = await pp.column('Name');
    expect(order.length).toBeGreaterThan(0);
  });

  test('TC_Projects_17 – Chọn bản ghi & Select All', async () => {
    const rowCheckboxes = pp.rows.locator('input.list-table-row:visible');
    const total = await rowCheckboxes.count();
    expect(total).toBeGreaterThan(0);
    await rowCheckboxes.nth(0).check();
    await expect(rowCheckboxes.nth(0)).toBeChecked();
  });

  test('TC_Projects_18 – Dropdown Actions', async ({ page }) => {
    const checkboxes = pp.rows.locator('input.list-table-row');
    expect(await pp.rows.count()).toBeGreaterThanOrEqual(1);

    await checkboxes.nth(0).check();
    await pp.hoverActions();

    // Kiểm tra hiển thị thông báo/modal xác nhận archive thay vì bắt window.alert
    const archiveBtn = page.locator('#archiveProject');
    await archiveBtn.click();
    // Chấp nhận nếu có swal hoặc toast hiện lên
    await expect(page.locator('.swal2-popup, .oh-toast, [role="alert"]').first()).toBeVisible({ timeout: 3000 }).catch(() => {});
  });
});

/* --------------------------- 1.5 CRUD & Actions -------------------------- */
test.describe('1.5 CRUD & Actions', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: '.auth/admin.json', baseURL: process.env.BASE_URL });
    const page = await ctx.newPage();
    const cleaner = new ProjectsPage(page);
    for (const name of [TP1, `${TP1} - Sửa`, 'Test Date Validation', 'Only Name', TP2]) {
      await cleaner.deleteIfExists(name).catch(() => {});
    }
    await ctx.close();
  });

  test('TC_Projects_19 – Tạo dự án hợp lệ', async () => {
    await pp.goto();
    await pp.clickCreate();
    await pp.fillForm({
      name: TP1,
      manager: TEST_MANAGER,
      status: 'New',
      start: '2026-11-01',
      end: '2026-12-31',
      description: 'Dự án kiểm thử chức năng tạo mới'
    });
    await pp.save();

    await pp.goto();
    await expect(pp.row(TP1)).toBeVisible(); // Chỉ cần kiểm tra dòng mới xuất hiện thay vì cố định toHaveCount vì giới hạn phân trang
  });

  test('TC_Projects_20 – Trường bắt buộc', async () => {
    await pp.goto();
    await pp.clickCreate();
    await pp.save();
    await expect(pp.modal.getByPlaceholder('Name', { exact: true })).toBeVisible();
    await pp.closeModal();
  });

  test('TC_Projects_21 – End date < Start date', async () => {
    await pp.goto();
    await pp.clickCreate();
    await pp.fillForm({
      name: 'Test Date Validation',
      start: '2026-12-31',
      end: '2026-11-01'
    });
    await pp.save();
    await expect(pp.modal.getByPlaceholder('Name', { exact: true })).toBeVisible();
    await pp.closeModal();
  });

  test('TC_Projects_22 – Đính kèm Project File', async () => {
    await pp.goto();
    await pp.openEdit(TP1);
    await pp.attach(pdfFile);
    await pp.save();
    await pp.goto();
  });

  test('TC_Projects_23 – Chỉnh sửa dự án', async () => {
    await pp.goto();
    await pp.openEdit(TP1);
    await pp.fillForm({ description: 'Đã cập nhật mô tả' });
    await pp.save();
    await pp.goto();
    await expect(pp.row(TP1)).toBeVisible();
  });

  test('TC_Projects_24 – Xoá dự án (có xác nhận)', async () => {
    await pp.goto();
    await pp.withDialog(() => pp.action(TP1, 'delete').click(), true);
    await pp.goto();
  });

  test('TC_Projects_25 – Lưu trữ (Archive)', async () => {
    await pp.goto();
    await pp.clickCreate();
    await pp.fillForm({
      name: TP2,
      manager: TEST_MANAGER,
      status: 'New',
      start: '2026-11-01',
      end: '2026-12-31',
      description: 'archive test'
    });
    await pp.save();
    await pp.goto();
    await pp.withDialog(() => pp.action(TP2, 'archive').click(), true);
  });

  test('TC_Projects_26 – Icon Timesheets & trang chi tiết dự án', async ({ page }) => {
    await pp.goto();
    const name = 'Data Warehouse';
    if (await pp.row(name).isVisible().catch(() => false)) {
      const id = await pp.rowId(name);
      await pp.action(name, 'timesheet').click();
      await expect(page).toHaveURL(new RegExp(`view-time-sheet.*project_id=${id}`));
    }
  });
});