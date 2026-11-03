
import { test, expect } from '@playwright/test';

// Tự động lưu screenshot và trace khi test thất bại
test.use({
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
});

const LOGIN_URL = 'https://hr.demo.horilla.com/login/';
const LIST_URL = 'https://hr.demo.horilla.com/employee/employee-view/';

// Các cột cần kiểm tra
const COLUMNS = [
    'Employee',
    'Email',
    'Phone',
    'Badge Id',
    'Job Position',
    'Department',
    'Shift',
    'Job Role',
    'Reporting Manager',
    'Company',
    'Actions'
];

// Dữ liệu Test Case 02
const SEARCH_EMPLOYEE = {
    name: 'Emily Carter',
    badgeId: 'NTI0001'
};

// Dữ liệu Test Case 03
const BADGE_EMPLOYEE = {
    name: 'Priya Raman',
    badgeId: 'NTI0003'
};

// Dữ liệu Test Case 04
const SALES_EMPLOYEE = {
    department: 'Sales',
    name: 'Marcus Johnson',
    badgeId: 'NTI0004'
};

const fullLabel = emp => `${emp.name} (${emp.badgeId})`;

const visibleRows = page =>
    page.locator('#view-container tbody tr:visible');

async function evidenceStep(page, testInfo, title, work) {
    return test.step(title, async () => {
        let passed = false;

        try {
            const result = await work();
            passed = true;
            return result;

        } finally {
            if (!page.isClosed()) {
                try {
                    await testInfo.attach(
                        `${passed ? 'PASS' : 'FAIL'} - ${title}`,
                        {
                            body: await page.screenshot({
                                fullPage: true,
                                timeout: 5000
                            }),
                            contentType: 'image/png'
                        }
                    );

                } catch (error) {
                    console.log(
                        'Không chụp được ảnh bước này:',
                        error.message
                    );
                }
            }
        }
    });
}

test.afterEach(async ({ page }, testInfo) => {
    if (page.isClosed()) return;

    try {
        await testInfo.attach(
            `FINAL - ${testInfo.status.toUpperCase()} - ${testInfo.title}`,
            {
                body: await page.screenshot({
                    fullPage: true,
                    timeout: 5000
                }),
                contentType: 'image/png'
            }
        );

    } catch (error) {
        console.log(
            'Không thể chụp ảnh cuối:',
            error.message
        );
    }
});

async function loginAndOpenEmployees(page) {
    await page.goto(LOGIN_URL);

    await page.getByRole('button', {
        name: 'Sign In'
    }).click();

    await page.waitForURL(
        url => !url.pathname.includes('/login'),
        { timeout: 30000 }
    );

    await page.goto(LIST_URL);

    await expect(page).toHaveURL(/employee-view/);
}

async function ensureListView(page) {
    const header = page.locator(
        '#view-container thead'
    ).first();

    if (!(await header.isVisible())) {
        const listButton = page.locator(
            'li[title="List"]'
        );

        await expect(listButton).toBeVisible({
            timeout: 15000
        });

        await listButton.click();
    }

    await expect(header).toBeVisible({
        timeout: 15000
    });
}


async function columnHeaders(page) {
    await ensureListView(page);

    return (
        await page.locator(
            '#view-container thead th'
        ).allInnerTexts()
    ).map(value =>
        value.trim().replace(/\s+/g, ' ')
    );
}

async function verifyColumns(page) {
    const headers = await columnHeaders(page);

    for (const column of COLUMNS) {
        expect(
            headers.some(header => header.includes(column)),
            `Thiếu cột ${column}. Đang có: ${headers.join(', ')}`
        ).toBe(true);
    }

    return headers;
}

async function getColumnValues(page, column) {
    const headers = await columnHeaders(page);

    const index = headers.findIndex(
        header => header.includes(column)
    );

    expect(
        index,
        `Không có cột ${column}`
    ).toBeGreaterThanOrEqual(0);

    const values = await visibleRows(page)
        .locator(`td:nth-child(${index + 1})`)
        .allInnerTexts();

    return values.map(value =>
        value.trim().replace(/\s+/g, ' ')
    );
}

async function verifyEmployeeRows(page) {
    await expect.poll(
        () => visibleRows(page).count(),
        { timeout: 15000 }
    ).toBeGreaterThanOrEqual(3);

    const headers = await verifyColumns(page);

    const index = headers.findIndex(
        header => header.includes('Employee')
    );

    expect(index).toBeGreaterThanOrEqual(0);

    for (let i = 0; i < 3; i++) {
        const row = visibleRows(page).nth(i);

        await expect(row).toBeVisible();

        const cells = row.locator('td');

        expect(
            await cells.count(),
            `Dòng ${i + 1} thiếu ô`
        ).toBeGreaterThanOrEqual(headers.length);

        const name = (
            await cells.nth(index).innerText()
        ).trim();

        expect(
            name,
            `Dòng ${i + 1} thiếu tên`
        ).not.toBe('');

        console.log(
            `TC01 nhân viên ${i + 1}: ${name}`
        );
    }
}

function employeeRow(page, label) {
    return visibleRows(page).filter({
        has: page.getByText(label, {
            exact: true
        })
    });
}



function searchBox(page) {
    return page.getByRole('textbox', {
        name: 'Search Input'
    });
}


async function searchByName(page, name) {
    const search = searchBox(page);

    await expect(search).toBeVisible();

    await search.fill(name);
    await search.press('Enter');

    await expect(search).toHaveValue(name);
}


async function clearAllFiltersAndSearch(page) {
    const search = searchBox(page);

    await expect(search).toBeVisible();

    await search.fill('');

    const closeTags = page.locator(
        '.oh-titlebar__tag-close:visible'
    );

    // Giới hạn vòng lặp để tránh kẹt
    for (let i = 0; i < 15; i++) {
        if ((await closeTags.count()) === 0) {
            break;
        }

        await closeTags.first().click();
    }

    await search.press('Enter');

    await expect(search).toHaveValue('');
}


async function searchBySuggestion(page, keyword, field) {
    const search = searchBox(page);

    await expect(search).toBeVisible();

    await search.click();
    await search.fill(keyword);

    // Kích hoạt menu gợi ý
    await search.dispatchEvent('keyup');

    const suggestion = page.getByRole('link', {
        name: new RegExp(
            `Search ${field} for:\\s*${keyword}`,
            'i'
        )
    });

    await expect(suggestion).toBeVisible({
        timeout: 10000
    });

    await suggestion.click();
}


async function verifyMatchingNames(page, keyword) {
    await expect.poll(async () => {
        const names = await getColumnValues(
            page, 'Employee'
        );

        return names.length > 0 && names.every(
            name => name.toLowerCase().includes(
                keyword.toLowerCase()
            )
        );

    }, {
        timeout: 20000
    }).toBe(true);
}


async function verifyProfileHeading(page, employee) {
    const heading = page.locator(
        '.emp-profile-card h2:visible, .oh-profile__info-name:visible'
    ).first();

    await expect(heading).toBeVisible({
        timeout: 15000
    });

    await expect(heading).toContainText(
        employee.name
    );

    await expect(heading).toContainText(
        employee.badgeId
    );
}


test(
    'EMP_MGT_List_01 - Display employee list',
    async ({ page }, testInfo) => {

        test.setTimeout(120000);

        await evidenceStep(
            page, testInfo,
            '01. Login and open Employees',
            async () => {
                await loginAndOpenEmployees(page);
            }
        );

        await evidenceStep(
            page, testInfo,
            '02. Open List view',
            async () => {
                await ensureListView(page);
            }
        );

        await evidenceStep(
            page, testInfo,
            '03. Verify columns',
            async () => {
                await verifyColumns(page);
            }
        );

        await evidenceStep(
            page, testInfo,
            '04. Verify three employee rows',
            async () => {
                await verifyEmployeeRows(page);
            }
        );

        await evidenceStep(
            page, testInfo,
            '05. Refresh page',
            async () => {
                await page.reload();
                await ensureListView(page);
            }
        );

        await evidenceStep(
            page, testInfo,
            '06. Verify list after refresh',
            async () => {
                await verifyEmployeeRows(page);
            }
        );
    }
);


test(
    'EMP_MGT_List_02 - Find employee by full name',
    async ({ page }, testInfo) => {

        test.setTimeout(120000);

        let otherEmployee = '';

        await evidenceStep(
            page, testInfo,
            '01. Open original employee list',
            async () => {
                await loginAndOpenEmployees(page);
                await ensureListView(page);
                await clearAllFiltersAndSearch(page);

                await expect.poll(
                    () => visibleRows(page).count()
                ).toBeGreaterThanOrEqual(2);

                const labels = await getColumnValues(
                    page, 'Employee'
                );

                otherEmployee = labels.find(
                    label => !label.includes(
                        SEARCH_EMPLOYEE.name
                    )
                );

                expect(
                    otherEmployee,
                    'Không có nhân viên đối chứng'
                ).toBeTruthy();
            }
        );

        await evidenceStep(
            page, testInfo,
            '02. Search Emily Carter by name',
            async () => {
                await searchByName(
                    page,
                    SEARCH_EMPLOYEE.name
                );
            }
        );

        await evidenceStep(
            page, testInfo,
            '03. Verify name search results',
            async () => {
                await expect(
                    employeeRow(
                        page,
                        fullLabel(SEARCH_EMPLOYEE)
                    )
                ).toHaveCount(1, {
                    timeout: 20000
                });

                await verifyMatchingNames(
                    page,
                    SEARCH_EMPLOYEE.name
                );
            }
        );

        await evidenceStep(
            page, testInfo,
            '04. Clear search and restore list',
            async () => {
                await clearAllFiltersAndSearch(page);

                await expect.poll(async () => {
                    const labels = await getColumnValues(
                        page, 'Employee'
                    );

                    return labels.includes(
                        otherEmployee
                    );

                }, {
                    timeout: 20000
                }).toBe(true);
            }
        );

        await evidenceStep(
            page, testInfo,
            '05. Open and verify Emily profile',
            async () => {
                await searchByName(
                    page,
                    SEARCH_EMPLOYEE.name
                );

                const row = employeeRow(
                    page,
                    fullLabel(SEARCH_EMPLOYEE)
                );

                await expect(row).toHaveCount(1, {
                    timeout: 20000
                });

                await row.getByText(
                    fullLabel(SEARCH_EMPLOYEE),
                    { exact: true }
                ).click();

                await verifyProfileHeading(
                    page,
                    SEARCH_EMPLOYEE
                );
            }
        );
    }
);


test(
    'EMP_MGT_List_03 - Find employee by Badge ID',
    async ({ page }, testInfo) => {

        test.setTimeout(120000);

        let otherEmployee = '';

        await evidenceStep(
            page, testInfo,
            '01. Open and clear all filters',
            async () => {
                await loginAndOpenEmployees(page);
                await ensureListView(page);
                await clearAllFiltersAndSearch(page);

                await expect.poll(
                    () => visibleRows(page).count()
                ).toBeGreaterThanOrEqual(2);

                const labels = await getColumnValues(
                    page, 'Employee'
                );

                otherEmployee = labels.find(
                    label => !label.includes(
                        BADGE_EMPLOYEE.badgeId
                    )
                );

                expect(
                    otherEmployee,
                    'Không có nhân viên đối chứng'
                ).toBeTruthy();
            }
        );

        await evidenceStep(
            page, testInfo,
            '02. Search Badge ID NTI0003',
            async () => {
                await searchBySuggestion(
                    page,
                    BADGE_EMPLOYEE.badgeId,
                    'Badge ID'
                );
            }
        );

        await evidenceStep(
            page, testInfo,
            '03. Verify badge search results',
            async () => {

                // Không có kết quả => Failed
                // Ảnh lỗi vẫn được đính kèm vào Report
                await expect(
                    employeeRow(
                        page,
                        fullLabel(BADGE_EMPLOYEE)
                    )
                ).toHaveCount(1, {
                    timeout: 20000
                });

                await verifyMatchingNames(
                    page,
                    BADGE_EMPLOYEE.badgeId
                );
            }
        );

        await evidenceStep(
            page, testInfo,
            '04. Clear Badge ID filter',
            async () => {
                await clearAllFiltersAndSearch(page);

                await expect.poll(async () => {
                    const labels = await getColumnValues(
                        page, 'Employee'
                    );

                    return labels.includes(
                        otherEmployee
                    );

                }, {
                    timeout: 20000
                }).toBe(true);
            }
        );

        await evidenceStep(
            page, testInfo,
            '05. Open and verify Priya profile',
            async () => {
                await searchBySuggestion(
                    page,
                    BADGE_EMPLOYEE.badgeId,
                    'Badge ID'
                );

                const row = employeeRow(
                    page,
                    fullLabel(BADGE_EMPLOYEE)
                );

                await expect(row).toHaveCount(1, {
                    timeout: 20000
                });

                await row.getByText(
                    fullLabel(BADGE_EMPLOYEE),
                    { exact: true }
                ).click();

                await verifyProfileHeading(
                    page,
                    BADGE_EMPLOYEE
                );
            }
        );
    }
);


test(
    'EMP_MGT_List_04 - Find employees by Department (Sales)',
    async ({ page }, testInfo) => {

        test.setTimeout(120000);

        let otherEmployee = '';

        await evidenceStep(
            page, testInfo,
            '01. Open and clear all filters',
            async () => {
                await loginAndOpenEmployees(page);
                await ensureListView(page);
                await clearAllFiltersAndSearch(page);

                await expect.poll(
                    () => visibleRows(page).count()
                ).toBeGreaterThanOrEqual(2);

                const employees = await getColumnValues(
                    page, 'Employee'
                );

                const departments = await getColumnValues(
                    page, 'Department'
                );

                const index = departments.findIndex(
                    dept => dept.toLowerCase() !==
                        SALES_EMPLOYEE.department.toLowerCase()
                );

                expect(
                    index,
                    'Không có nhân viên khác phòng Sales'
                ).toBeGreaterThanOrEqual(0);

                otherEmployee = employees[index];
            }
        );

        await evidenceStep(
            page, testInfo,
            '02. Search Department Sales',
            async () => {
                await searchBySuggestion(
                    page,
                    SALES_EMPLOYEE.department,
                    'Department'
                );
            }
        );

        await evidenceStep(
            page, testInfo,
            '03. Verify Sales results',
            async () => {

                // Không tìm thấy nhân viên => Failed
                await expect(
                    employeeRow(
                        page,
                        fullLabel(SALES_EMPLOYEE)
                    )
                ).toHaveCount(1, {
                    timeout: 20000
                });

                // Kiểm tra tất cả kết quả thuộc Sales
                await expect.poll(async () => {
                    const departments = await getColumnValues(
                        page,
                        'Department'
                    );

                    return departments.length > 0 &&
                        departments.every(
                            dept => dept.toLowerCase() ===
                                SALES_EMPLOYEE.department.toLowerCase()
                        );

                }, {
                    timeout: 20000
                }).toBe(true);
            }
        );

        await evidenceStep(
            page, testInfo,
            '04. Clear Department filter',
            async () => {
                await clearAllFiltersAndSearch(page);

                await expect.poll(async () => {
                    const names = await getColumnValues(
                        page, 'Employee'
                    );

                    return names.includes(
                        otherEmployee
                    );

                }, {
                    timeout: 20000
                }).toBe(true);
            }
        );

        await evidenceStep(
            page, testInfo,
            '05. Open and verify Marcus profile',
            async () => {
                await searchBySuggestion(
                    page,
                    SALES_EMPLOYEE.department,
                    'Department'
                );

                const row = employeeRow(
                    page,
                    fullLabel(SALES_EMPLOYEE)
                );

                await expect(row).toHaveCount(1, {
                    timeout: 20000
                });

                await row.getByText(
                    fullLabel(SALES_EMPLOYEE),
                    { exact: true }
                ).click();

                await verifyProfileHeading(
                    page,
                    SALES_EMPLOYEE
                );

                // Kiểm tra Department trong Profile
                const tab = page.locator(
                    '[id$="profileTab"]:visible'
                ).first();

                await expect(tab).toBeVisible({
                    timeout: 15000
                });

                const label = tab.locator('dt')
                    .filter({
                        hasText: /^\s*Department\s*$/
                    })
                    .first();

                await expect(label).toBeVisible({
                    timeout: 15000
                });

                await expect(
                    label.locator(
                        'xpath=following-sibling::dd[1]'
                    )
                ).toContainText(
                    SALES_EMPLOYEE.department
                );
            }
        );
    }
);
test('EMP_MGT_Create_05: Create employee successfully', async ({ page }) => {
    await page.goto('https://hr.demo.horilla.com/login/');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.waitForURL('**/dashboard/**');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: 'Employee' }).click();

    const employeesMenu = page.getByRole('link', { name: 'Employees', exact: true });
    await employeesMenu.waitFor({ state: 'visible' });
    await employeesMenu.click();

    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: 'Create' }).first().click();

    await page.getByRole('textbox', { name: 'First Name *' }).fill('Hoa');
    await page.getByRole('textbox', { name: 'Last Name' }).fill('Lai');

    const timestamp = Date.now();
    const uniqueEmail = `laithihoa.tc05.${timestamp}@gmail.com`;
    const uniquePhone = `09${timestamp.toString().slice(-8)}`;

    await page.getByRole('textbox', { name: 'Email *' }).fill(uniqueEmail);
    await page.getByRole('textbox', { name: 'Phone *' }).fill(uniquePhone);

    await page.getByRole('button', { name: 'Save & Continue' }).first().click();

    await expect(page.getByText('New Employee Added.')).toBeVisible({ timeout: 10000 });
});

test('EMP_MGT_Create_06: Reject missing first name', async ({ page }) => {
    await page.goto('https://hr.demo.horilla.com/login/');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.waitForURL('**/dashboard/**');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: 'Employee' }).click();

    const employeesMenu = page.getByRole('link', { name: 'Employees', exact: true });
    await employeesMenu.waitFor({ state: 'visible' });
    await employeesMenu.click();

    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: 'Create' }).first().click();

    await page.getByRole('button', { name: 'Save & Continue' }).click();

    const firstNameInput = page.locator('#id_employee_first_name');

    const validationMessage = await firstNameInput.evaluate((el) => el.validationMessage);

    expect(validationMessage).toBe('Please fill out this field.');
});

test('EMP_MGT_Create_07: Reject invalid email format', async ({ page }) => {
    await page.goto('https://hr.demo.horilla.com/login/');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.waitForURL('**/dashboard/**');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: 'Employee' }).click();

    const employeesMenu = page.getByRole('link', { name: 'Employees', exact: true });
    await employeesMenu.waitFor({ state: 'visible' });
    await employeesMenu.click();

    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: 'Create' }).first().click();

    await page.getByRole('textbox', { name: 'First Name *' }).fill('Hoa');
    await page.getByRole('textbox', { name: 'Last Name' }).fill('Lai');

    const emailInput = page.getByRole('textbox', { name: 'Email *' });
    await emailInput.fill('laithihoagmail.com');

    await page.getByRole('textbox', { name: 'Phone *' }).fill('03847299259');
    await page.getByRole('combobox', { name: 'Male' }).click();

    await page.getByRole('button', { name: 'Save & Continue' }).click();

    const validationMessage = await emailInput.evaluate((el) => el.validationMessage);

    expect(validationMessage).toBe("Please include an '@' in the email address. 'laithihoagmail.com' is missing an '@'.");
});

test('EMP_MGT_Create_08: Prevent duplicate badge ID', async ({ page }) => {
    await page.goto('https://hr.demo.horilla.com/login/');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.waitForURL('**/dashboard/**');
    await page.waitForLoadState('domcontentloaded');

    await page.getByRole('button', { name: 'Employee' }).click();

    const employeesMenu = page.getByRole('link', { name: 'Employees', exact: true });
    await employeesMenu.waitFor({ state: 'visible' });
    await employeesMenu.click();

    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: 'Create' }).first().click();
    await page.getByRole('textbox', { name: 'Badge ID Show' }).click();
    await page.getByRole('textbox', { name: 'Badge ID Show' }).fill('NTI0001');
    await page.getByRole('textbox', { name: 'First Name *' }).click();
    await page.getByRole('textbox', { name: 'First Name *' }).fill('Hoa');
    await page.getByRole('textbox', { name: 'Last Name' }).click();
    await page.getByRole('textbox', { name: 'Last Name' }).fill('Lai');
    await page.getByRole('textbox', { name: 'Email *' }).click();
    await page.getByRole('textbox', { name: 'Email *' }).fill('laithihoa@gmail.com');
    await page.getByRole('textbox', { name: 'Phone *' }).click();
    await page.getByRole('textbox', { name: 'Phone *' }).fill('0827642884');
    await page.getByRole('combobox', { name: 'Male' }).click();
    await page.getByRole('button', { name: 'Save & Continue' }).click();
    await expect(page.getByText('Badge ID must be unique.')).toBeVisible();
});

test('EMP_MGT_Create_09: Reject duplicate work email', async ({ page }) => {
    await page.goto('https://hr.demo.horilla.com/login/');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('**/dashboard/**');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('button', { name: 'Employee' }).click();
    const employeesMenu = page.getByRole('link', { name: 'Employees', exact: true });
    await employeesMenu.waitFor({ state: 'visible' });
    await employeesMenu.click();
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: 'Create' }).first().click();
    await page.getByRole('textbox', { name: 'First Name *' }).click();
    await page.getByRole('textbox', { name: 'First Name *' }).fill('Hoa');
    await page.getByRole('textbox', { name: 'Last Name' }).click();
    await page.getByRole('textbox', { name: 'Last Name' }).fill('Lai');
    await page.getByRole('textbox', { name: 'Email *' }).click();
    await page.getByRole('textbox', { name: 'Email *' }).fill('emily.carter@northwind-tech.com');
    await page.getByRole('textbox', { name: 'Phone *' }).click();
    await page.getByRole('textbox', { name: 'Phone *' }).fill('02937362734');
    await page.getByRole('button', { name: 'Save & Continue' }).click();
    await expect(page.getByText('An Employee with this Email already exists in company Northwind Technologies Inc.')).toBeVisible();
});

test('EMP_MGT_Create_10: Create employee successfully', async ({ page }) => {
    await page.goto('https://hr.demo.horilla.com/login/');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('**/dashboard/**');
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('button', { name: 'Employee' }).click();
    const employeesMenu = page.getByRole('link', { name: 'Employees', exact: true });
    await employeesMenu.waitFor({ state: 'visible' });
    await employeesMenu.click();
    await page.waitForLoadState('domcontentloaded');
    await page.getByRole('link', { name: 'Create' }).first().click();
    await page.getByRole('textbox', { name: 'First Name *' }).fill('Hoa');
    await page.getByRole('textbox', { name: 'Last Name' }).fill('Lai');
    await page.getByRole('textbox', { name: 'Email *' }).fill(`hoa.${Date.now()}@gmail.com`);
    await page.getByRole('textbox', { name: 'Phone *' }).fill('0982737883');
    await page.locator('input[name="dob"]').fill('2027-12-31');

    await page.getByRole('button', { name: 'Save & Continue' }).click();

    await expect(page.getByText('Date of Birth cannot be in the future')).toBeVisible({ timeout: 5000 });

    await expect(page.getByText('New Employee Added', { exact: false })).toBeHidden();
});

test('EMP_MGT_Create_11: Update job-position options by department', async ({ page }) => {
    test.setTimeout(60000);

    await page.goto('https://hr.demo.horilla.com/login/');
    await page.getByRole('button', { name: 'Sign In' }).click();

    await page.waitForURL('**/dashboard/**');
    await page.waitForLoadState('networkidle');

    const employeeBtn = page.getByRole('button', { name: 'Employee' });
    const employeesLink = page.getByRole('link', { name: 'Employees', exact: true });

    await employeeBtn.click();
    if (!(await employeesLink.isVisible())) {
        await page.waitForTimeout(1000);
        await employeeBtn.click();
    }
    await employeesLink.click();

    const createBtn = page.getByRole('link', { name: 'Create' }).first();
    await createBtn.waitFor({ state: 'visible' });
    await createBtn.click();

    const uniqueSuffix = Date.now().toString().slice(-6);
    await page.getByRole('textbox', { name: 'First Name *' }).fill('Hoa');
    await page.getByRole('textbox', { name: 'Last Name' }).fill('Lai');
    await page.getByRole('textbox', { name: 'Email *' }).fill(`hoa.${uniqueSuffix}@mail.com`);
    await page.getByRole('textbox', { name: 'Phone *' }).fill(`0936${uniqueSuffix}`);

    await page.getByRole('button', { name: 'Save & Continue' }).click();

    await expect(page.locator('.select2-selection__rendered', { hasText: '---Choose Department---' })).toBeVisible({ timeout: 20000 });

    await page.locator('.select2-selection__rendered', { hasText: '---Choose Department---' }).click();
    await page.locator('.select2-results__option', { hasText: 'Engineering' }).click();
    await expect(page.locator('.select2-selection__rendered', { hasText: 'Engineering' })).toBeVisible();

    await page.waitForTimeout(2000);

    await page.locator('.select2-selection__rendered', { hasText: '---Choose Job Position---' }).click();

    const jobOptionsList = page.locator('#select2-id_job_position_id-results .select2-results__option');
    await expect(jobOptionsList.filter({ hasText: 'Software Engineer' })).toBeVisible();
    await expect(jobOptionsList.filter({ hasText: 'Backend Engineer' })).toBeVisible();
    await expect(jobOptionsList.filter({ hasText: 'Frontend Engineer' })).toBeVisible();

    await jobOptionsList.filter({ hasText: 'Software Engineer' }).click();
    await expect(page.locator('.select2-selection__rendered', { hasText: 'Software Engineer' })).toBeVisible();

    await page.locator('.select2-selection__rendered', { hasText: 'Engineering' }).click();
    await page.locator('.select2-results__option', { hasText: 'Human Resources' }).click();
    await expect(page.locator('.select2-selection__rendered', { hasText: 'Human Resources' })).toBeVisible();

    await page.waitForTimeout(2000);

    const resetJobDropdown = page.locator('.select2-selection__rendered', { hasText: '---Choose Job Position---' });
    await expect(resetJobDropdown).toBeVisible();
    await resetJobDropdown.click();

    await expect(jobOptionsList.filter({ hasText: 'Software Engineer' })).toBeHidden();
    await expect(jobOptionsList.filter({ hasText: 'HR Manager' })).toBeVisible();
    await expect(jobOptionsList.filter({ hasText: 'HR Business Partner' })).toBeVisible();
    await expect(jobOptionsList.filter({ hasText: 'Recruiter' })).toBeVisible();

    await jobOptionsList.filter({ hasText: 'Recruiter' }).click();
    await expect(page.locator('.select2-selection__rendered', { hasText: 'Recruiter' })).toBeVisible();
});

