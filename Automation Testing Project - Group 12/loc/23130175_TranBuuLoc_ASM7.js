// @ts-check
import { test, expect } from '@playwright/test';

const BASE_URL = 'https://hr.demo.horilla.com';


async function gotoWithRetry(page, url, attempts = 3) {
    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const response = await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: 60000,
            });

            if (response && response.status() >= 500) {
                throw new Error(
                    `Server trả về HTTP ${response.status()} khi mở ${url}`
                );
            }

            return response;
        } catch (error) {
            lastError = error;

            if (attempt < attempts) {
                await page.waitForTimeout(1500 * attempt);
            }
        }
    }

    throw lastError;
}

// Đăng nhập và mở danh sách Scheduled Interviews.
async function openInterviewPage(page) {
    page.setDefaultTimeout(20000);
    page.setDefaultNavigationTimeout(60000);

    await gotoWithRetry(page, `${BASE_URL}/login/`);

    await page.getByRole('button', {
        name: 'Sign In'
    }).click();

    // Chờ xác nhận đăng nhập thành công.
    await expect(
        page.getByRole('button', {
            name: 'Recruitment'
        })
    ).toBeVisible({ timeout: 30000 });

    let lastError;

    // Thử mở trang tối đa 3 lần.
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const response = await page.goto(
                `${BASE_URL}/recruitment/interview-view/`,
                {
                    waitUntil: 'domcontentloaded',
                    timeout: 60000,
                }
            );

            if (response && response.status() >= 500) {
                throw new Error(
                    `Server trả về HTTP ${response.status()} khi mở danh sách phỏng vấn`
                );
            }

            await expect(
                page.getByRole('heading', {
                    name: 'Scheduled Interviews',
                    exact: true,
                })
            ).toBeVisible({ timeout: 20000 });

            return;

        } catch (error) {
            lastError = error;

            if (attempt < 3) {
                await page.waitForTimeout(1500 * attempt);
            }
        }
    }

    throw lastError;
}

test.setTimeout(120000);


// TEST CASE 001 | INTERVIEW_SCHEDULE_TEST_CASE_001
test('INTERVIEW_SCHEDULE_TEST_CASE_001', async ({ page }) => {
    await openInterviewPage(page);

    await expect(
        page.locator('#interviewdelete-1-candidate_id-header')
            .getByText('Candidate', { exact: true })
    ).toBeVisible();
});


// TEST CASE 002 | INTERVIEW_SCHEDULE_TEST_CASE_002
test('INTERVIEW_SCHEDULE_TEST_CASE_002', async ({ page }) => {
    await openInterviewPage(page);

    await expect(
        page.locator('#interviewdelete-1-candidate_id-header')
            .getByText('Candidate', { exact: true })
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete-2-interviewer_custom_col-header')
            .getByText('Interviewer')
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete-3-interview_date-header')
            .getByText('Interview Date')
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete-4-interview_time-header')
            .getByText('Interview Time')
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete-5-get_description-header')
            .getByText('Description')
    ).toBeVisible();

    await expect(page.getByText('Actions')).toBeVisible();

    await expect(
        page.getByRole('textbox', { name: 'Search Input' })
    ).toBeVisible();

    await expect(
        page.getByRole('button', { name: 'Filter Filter' })
    ).toBeVisible();

    await expect(page.getByText('Create')).toBeVisible();

    await expect(
        page.getByRole('button', { name: 'Customize columns' })
    ).toBeVisible();
});


// TEST CASE 003 | INTERVIEW_SCHEDULE_TEST_CASE_003
test('INTERVIEW_SCHEDULE_TEST_CASE_003', async ({ page }) => {
    await openInterviewPage(page);

    await expect(
        page.getByRole('textbox', { name: 'Search Input' })
    ).toBeVisible();

    await expect(
        page.getByRole('button', { name: 'Filter Filter' })
    ).toBeVisible();

    await expect(page.getByText('Create')).toBeVisible();

    await expect(
        page.getByRole('button', { name: 'Customize columns' })
    ).toBeVisible();

    await page.locator('#interviewdelete')
        .getByText('Kenji Keller').click();

    await page.locator('p')
        .filter({ hasText: 'Kenji Keller' }).click();

    await expect(
        page.locator('p').filter({ hasText: 'Kenji Keller' })
    ).toBeVisible();

    await expect(
        page.getByText('Sales Representative Hiring')
    ).toBeVisible();

    await expect(
        page.locator('#detailViewContainer')
            .getByText('Panel round for the Sales')
    ).toBeVisible();

    await expect(
        page.getByText('Emily Carter (NTI0001),')
    ).toBeVisible();

    await expect(
        page.locator('#detailViewContainer')
            .getByText('Upcoming Interview')
    ).toBeVisible();
});


// TEST CASE 004 | INTERVIEW_SCHEDULE_TEST_CASE_004
test('INTERVIEW_SCHEDULE_TEST_CASE_004', async ({ page }) => {
    await openInterviewPage(page);

    await page.getByRole('textbox', {
        name: 'Search Input'
    }).click();

    await expect(
        page.getByRole('textbox', { name: 'Search Input' })
    ).toBeVisible();

    await page.getByRole('textbox', {
        name: 'Search Input'
    }).click();

    await page.getByRole('textbox', {
        name: 'Search Input'
    }).fill('Lena Tanaka');

    await expect(
        page.getByRole('textbox', { name: 'Search Input' })
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete')
            .getByText('Lena Tanaka', { exact: true })
    ).toBeVisible();

    await page.locator('#interviewdelete')
        .getByText('Lena Tanaka', { exact: true }).click();

    await expect(
        page.getByText('Marketing Specialist Hiring')
    ).toBeVisible();
});


// TEST CASE 005 | INTERVIEW_SCHEDULE_TEST_CASE_005
test('INTERVIEW_SCHEDULE_TEST_CASE_005', async ({ page }) => {
    await openInterviewPage(page);

    await page.getByRole('textbox', {
        name: 'Search Input'
    }).click();

    await expect(
        page.getByRole('textbox', { name: 'Search Input' })
    ).toBeVisible();

    await page.getByRole('textbox', {
        name: 'Search Input'
    }).click();

    await page.getByRole('textbox', {
        name: 'Search Input'
    }).fill('Lena Tanaka');

    await expect(
        page.getByRole('textbox', { name: 'Search Input' })
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete')
            .getByText('Lena Tanaka', { exact: true })
    ).toBeVisible();

    await page.locator('#interviewdelete')
        .getByText('Lena Tanaka', { exact: true }).click();

    await expect(
        page.getByText('Marketing Specialist Hiring')
    ).toBeVisible();
});


// TEST CASE 006 | INTERVIEW_SCHEDULE_TEST_CASE_006
test('INTERVIEW_SCHEDULE_TEST_CASE_006', async ({ page }) => {
    await openInterviewPage(page);

    await page.getByRole('textbox', {
        name: 'Search Input'
    }).click();

    await expect(
        page.getByRole('textbox', { name: 'Search Input' })
    ).toBeVisible();

    await page.getByRole('textbox', {
        name: 'Search Input'
    }).click();

    await page.getByRole('textbox', {
        name: 'Search Input'
    }).fill('abc');

    await expect(
        page.getByRole('textbox', { name: 'Search Input' })
    ).toBeVisible();

    await page.locator('.flex > .mb-4').click();

    await expect(
        page.locator('.flex > .mb-4')
    ).toBeVisible();

    await expect(
        page.getByText('No filtered records found at')
    ).toBeVisible();
});

// TEST CASE 007 | INTERVIEW_SCHEDULE_TEST_CASE_007
test('INTERVIEW_SCHEDULE_TEST_CASE_007', async ({ page }) => {
    await openInterviewPage(page);

    await page.getByRole('button', {
        name: 'Filter Filter'
    }).click();

    await expect(
        page.getByRole('heading', {
            name: 'Filter Scheduled Interviews'
        })
    ).toBeVisible();

    await page.locator('select[name="custom_field"]')
        .selectOption('interview_date');

    await page.getByPlaceholder('Value')
        .fill('2026-11-05');

    await expect(
        page.locator('#customFilterRowsContainer-interview')
    ).toMatchAriaSnapshot(`
        - combobox:
          - option "Field"
          - option "Interview Date" [selected]
          - option "Created At"
        - combobox:
          - option "From" [selected]
          - option "Till"
          - option "After"
          - option "Before"
          - option "Is"
        - textbox:
          - /placeholder: Value
          - text: /\\d+-\\d+-\\d+/
        - button "Remove filter": ×
    `);

    await page.locator('select[name="custom_lookup"]')
        .selectOption('exact');

    await expect(
        page.getByText('-11-05').nth(2)
    ).toBeVisible();

    await expect(
        page.getByText('-11-05').nth(3)
    ).toBeVisible();

    await expect(
        page.getByRole('button', { name: 'Select (2)' })
    ).toBeVisible();
});


// TEST CASE 008 | INTERVIEW_SCHEDULE_TEST_CASE_008
test('INTERVIEW_SCHEDULE_TEST_CASE_008', async ({ page }) => {
    await openInterviewPage(page);

    await page.getByRole('button', {
        name: 'Filter Filter'
    }).click();

    await expect(
        page.locator('#modernFilterPanel')
            .getByText('Interviewer')
    ).toBeVisible();

    await page.getByRole('searchbox', {
        name: 'Search employee...'
    }).click();

    await expect(
        page.getByRole('option', { name: 'Adam Admin' })
    ).toBeVisible();

    await expect(
        page.getByRole('option', { name: 'Emily Carter' })
    ).toBeVisible();

    await expect(
        page.getByRole('option', { name: 'Daniel Nguyen' })
    ).toBeVisible();

    await page.getByRole('button', {
        name: 'Close'
    }).click();

    await expect(
        page.getByRole('img', { name: 'Emily Carter' }).first()
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete').getByText('Lena Tanaka')
    ).toBeVisible();

    await expect(
        page.getByRole('img', { name: 'Emily Carter' }).nth(1)
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete').getByText('Kenji Morgan')
    ).toBeVisible();

    await expect(
        page.getByRole('img', { name: 'Emily Carter' }).nth(2)
    ).toBeVisible();
});


// TEST CASE 009 | INTERVIEW_SCHEDULE_TEST_CASE_009
test('INTERVIEW_SCHEDULE_TEST_CASE_009', async ({ page }) => {
    await openInterviewPage(page);

    await page.getByRole('button', {
        name: 'Filter Filter'
    }).click();

    await expect(
        page.getByRole('heading', {
            name: 'Filter Scheduled Interviews'
        })
    ).toBeVisible();

    await page.locator('select[name="nested_fields"]')
        .selectOption('completed');

    await expect(
        page.locator('#interviewdelete-node-1')
            .getByText('Interview Completed')
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete-leaf-1')
            .getByText('Kenji Keller')
    ).toBeVisible();

    await expect(
        page.locator('#ui-id-105')
            .getByText('Upcoming Interview')
    ).toBeVisible();
});


// TEST CASE 010 | INTERVIEW_SCHEDULE_TEST_CASE_010
test('INTERVIEW_SCHEDULE_TEST_CASE_010', async ({ page }) => {
    await openInterviewPage(page);

    await page.getByRole('button', {
        name: 'Filter Filter'
    }).click();

    await expect(
        page.getByRole('heading', {
            name: 'Filter Scheduled Interviews'
        })
    ).toBeVisible();

    await page.locator('select[name="nested_fields"]')
        .selectOption('completed');

    await expect(
        page.locator('#interviewdelete-node-1')
            .getByText('Interview Completed')
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete-leaf-1')
            .getByText('Kenji Keller')
    ).toBeVisible();

    await expect(
        page.locator('#ui-id-105')
            .getByText('Upcoming Interview')
    ).toBeVisible();

    await page.getByRole('button', {
        name: 'Filter Filter'
    }).click();

    await expect(
        page.getByRole('heading', {
            name: 'Filter Scheduled Interviews'
        })
    ).toBeVisible();

    await page.getByRole('searchbox', {
        name: 'Search employee...'
    }).click();

    await page.locator('select[name="nested_fields"]')
        .selectOption('completed');

    await expect(
        page.getByRole('img', { name: 'Daniel Nguyen' }).first()
    ).toBeVisible();

    await expect(
        page.locator('#ui-id-127')
            .getByText('Upcoming Interview')
    ).toBeVisible();

    await page.locator(
        '.oh-titlebar__tag > .close-icon > .icon-inner > .ionicon'
    ).click();

    await expect(
        page.getByRole('button', { name: 'Select (20)' })
    ).toBeVisible();
});


// TEST CASE 011 | INTERVIEW_SCHEDULE_TEST_CASE_011
test('INTERVIEW_SCHEDULE_TEST_CASE_011', async ({ page }) => {
    await openInterviewPage(page);

    await page.getByText('Create').click();

    await expect(
        page.getByText('Schedule Interview')
    ).toBeVisible();

    await expect(
        page.locator('div')
            .filter({ hasText: 'Candidate ---Choose Candidate' })
            .nth(3)
    ).toBeVisible();

    await page.getByLabel('---Choose Candidate---', {
        exact: true
    }).click();

    await page.locator(
        '#dynamic_field_employee_id input[type="search"]'
    ).click();

    await page.locator('#id_interview_date')
        .fill('2026-10-31');

    await page.getByLabel('Interview time', {
        exact: true
    }).fill('22:57');

    await page.getByPlaceholder('Description').click();

    await page.getByPlaceholder('Description').fill('abc');

    await expect(
        page.locator('#select2-id_candidate_id-container')
    ).toBeVisible();

    await expect(
        page.getByText('×Daniel Nguyen (NTI0002)')
    ).toBeVisible();

    await page.getByText('Save', {
        exact: true
    }).click();

    await expect(
        page.getByText('Sofia Okonkwo').first()
    ).toBeVisible();

    await expect(
        page.getByText('-10-31').nth(1)
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete').getByText(':57:00')
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete').getByText('abc')
    ).toBeVisible();
});

// TEST CASE 012 | INTERVIEW_SCHEDULE_TEST_CASE_012
test('INTERVIEW_SCHEDULE_TEST_CASE_012', async ({ page }) => {
    await openInterviewPage(page);

    await page.getByText('Create').click();

    await expect(
        page.getByText('Schedule Interview')
    ).toBeVisible();

    await expect(
        page.locator('div')
            .filter({ hasText: 'Candidate ---Choose Candidate' })
            .nth(3)
    ).toBeVisible();

    await page.getByLabel('---Choose Candidate---', {
        exact: true
    }).click();

    await page.locator(
        '#dynamic_field_employee_id input[type="search"]'
    ).click();

    await page.locator('span')
        .filter({ hasText: '×Emily Carter (NTI0001)' })
        .nth(2).click();

    await page.locator('span')
        .filter({ hasText: '×Emily Carter (NTI0001)×' })
        .nth(2).click();

    await page.locator('#id_interview_date')
        .fill('2026-11-30');

    await page.getByLabel('Interview time', {
        exact: true
    }).fill('23:56');

    await page.getByPlaceholder('Description').click();

    await page.getByPlaceholder('Description').fill('abc');

    await expect(
        page.locator('#select2-id_candidate_id-container')
    ).toBeVisible();

    await expect(
        page.getByText('×Emily Carter (NTI0001)')
    ).toBeVisible();

    await expect(
        page.getByText('×Daniel Nguyen (NTI0002)')
    ).toBeVisible();

    await expect(
        page.getByText('×Priya Raman (NTI0003)')
    ).toBeVisible();

    await expect(
        page.locator('#id_interview_date')
    ).toBeVisible();

    await page.getByText('Save', {
        exact: true
    }).click();

    await expect(
        page.locator('#interviewdelete').getByText('Aarav Iyer')
    ).toBeVisible();

    await expect(
        page.getByRole('img', { name: 'Emily Carter' }).first()
    ).toBeVisible();

    await expect(
        page.getByRole('img', { name: 'Daniel Nguyen' }).first()
    ).toBeVisible();

    await expect(
        page.getByRole('img', { name: 'Priya Raman' })
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete').getByText('-11-30')
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete').getByText(':56:00')
    ).toBeVisible();

    await expect(
        page.getByText('abc').first()
    ).toBeVisible();
});


// TEST CASE 013 | INTERVIEW_SCHEDULE_TEST_CASE_013
test('INTERVIEW_SCHEDULE_TEST_CASE_013', async ({ page }) => {
    await openInterviewPage(page);

    await page.getByText('Create').click();

    await expect(
        page.getByText('Schedule Interview')
    ).toBeVisible();

    await expect(
        page.locator('div')
            .filter({ hasText: 'Candidate ---Choose Candidate' })
            .nth(3)
    ).toBeVisible();

    await page.getByLabel('---Choose Candidate---', {
        exact: true
    }).click();

    await page.locator(
        '#dynamic_field_employee_id input[type="search"]'
    ).click();

    await page.locator('#id_interview_date')
        .fill('2026-11-29');

    await page.getByLabel('Interview time', {
        exact: true
    }).fill('23:00');

    await page.getByPlaceholder('Description').click();

    await expect(
        page.locator('#select2-id_candidate_id-container')
    ).toBeVisible();

    await expect(
        page.getByText('×Emily Carter (NTI0001)')
    ).toBeVisible();

    await expect(
        page.getByPlaceholder('Description')
    ).toBeVisible();

    await page.getByText('Save', {
        exact: true
    }).click();

    await expect(
        page.locator('#interviewdelete').getByText('Mateo Iyer')
    ).toBeVisible();

    await expect(
        page.getByRole('img', { name: 'Emily Carter' }).nth(1)
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete').getByText('-11-29')
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete').getByText('23:00:')
    ).toBeVisible();

    await expect(
        page.getByText('None')
    ).toBeVisible();
});


// TEST CASE 014 | INTERVIEW_SCHEDULE_TEST_CASE_014
test('INTERVIEW_SCHEDULE_TEST_CASE_014', async ({ page }) => {
    await openInterviewPage(page);

    await page.getByText('Create').click();

    await expect(
        page.getByText('Schedule Interview')
    ).toBeVisible();

    await expect(
        page.locator('div')
            .filter({ hasText: 'Candidate ---Choose Candidate' })
            .nth(3)
    ).toBeVisible();

    await page.locator('#id_interview_date')
        .fill('2026-11-30');

    await page.getByLabel('Interview time', {
        exact: true
    }).fill('11:04');

    await page.getByPlaceholder('Description').click();

    await page.getByPlaceholder('Description').fill('abc');

    await expect(
        page.getByLabel('---Choose Candidate---', { exact: true })
    ).toBeVisible();

    await expect(
        page.locator(
            '.select2-selection.select2-selection--multiple > .select2-selection__rendered'
        ).first()
    ).toBeVisible();

    await expect(
        page.locator('#id_interview_date')
    ).toBeVisible();

    await page.getByText('Save', {
        exact: true
    }).click();

    await expect(
        page.getByText('This field is required.')
    ).toBeVisible();
});


// TEST CASE 015 | INTERVIEW_SCHEDULE_TEST_CASE_015
test('INTERVIEW_SCHEDULE_TEST_CASE_015', async ({ page }) => {
    await openInterviewPage(page);

    await page.getByText('Create').click();

    await expect(
        page.getByText('Schedule Interview')
    ).toBeVisible();

    await expect(
        page.locator('div')
            .filter({ hasText: 'Candidate ---Choose Candidate' })
            .nth(3)
    ).toBeVisible();

    await page.locator('#id_interview_date')
        .fill('2026-11-30');

    await page.getByLabel('Interview time', {
        exact: true
    }).fill('11:04');

    await page.getByPlaceholder('Description').click();

    await page.getByPlaceholder('Description').fill('abc');

    await expect(
        page.getByLabel('---Choose Candidate---', { exact: true })
    ).toBeVisible();

    await expect(
        page.locator(
            '.select2-selection.select2-selection--multiple > .select2-selection__rendered'
        ).first()
    ).toBeVisible();

    await expect(
        page.locator('#id_interview_date')
    ).toBeVisible();

    await page.getByText('Save', {
        exact: true
    }).click();

    await expect(
        page.getByText('This field is required.')
    ).toBeVisible();

    await page.getByText('Create').click();

    await expect(
        page.getByText('Schedule Interview')
    ).toBeVisible();

    await expect(
        page.locator('div')
            .filter({ hasText: 'Candidate ---Choose Candidate' })
            .nth(3)
    ).toBeVisible();

    await page.getByLabel('---Choose Candidate---', {
        exact: true
    }).click();

    await page.locator('#id_interview_date')
        .fill('2026-11-30');

    await page.getByLabel('Interview time', {
        exact: true
    }).fill('23:08');

    await page.getByPlaceholder('Description').click();

    await page.getByPlaceholder('Description').fill('abc');

    await expect(
        page.locator('#select2-id_candidate_id-container')
    ).toBeVisible();

    await expect(
        page.locator(
            '.select2-selection.select2-selection--multiple > .select2-selection__rendered'
        ).first()
    ).toBeVisible();

    await expect(
        page.getByPlaceholder('Description')
    ).toBeVisible();

    await page.getByText('Save', {
        exact: true
    }).click();

    await page.getByText('Save', {
        exact: true
    }).click();

    await page.locator('#InterviewCreateForm')
        .getByLabel('Close', { exact: true }).click();
});

// TEST CASE 016 | INTERVIEW_SCHEDULE_TEST_CASE_016
test('INTERVIEW_SCHEDULE_TEST_CASE_016', async ({ page }) => {
    await openInterviewPage(page);

    await page.getByText('Create').click();

    await expect(
        page.getByText('Schedule Interview')
    ).toBeVisible();

    await expect(
        page.locator('div')
            .filter({ hasText: 'Candidate ---Choose Candidate' })
            .nth(3)
    ).toBeVisible();

    await page.getByLabel('---Choose Candidate---', {
        exact: true
    }).click();

    await page.locator(
        '#dynamic_field_employee_id input[type="search"]'
    ).click();

    await page.getByLabel('Interview time', {
        exact: true
    }).fill('23:10');

    await page.getByPlaceholder('Description').click();

    await page.getByPlaceholder('Description').fill('abc');

    await expect(
        page.locator('#select2-id_candidate_id-container')
    ).toBeVisible();

    await expect(
        page.getByText('×Daniel Nguyen (NTI0002)')
    ).toBeVisible();

    await page.getByText('Save', {
        exact: true
    }).click();

    await expect(
        page.getByText('Mateo Iyer').nth(1)
    ).toBeVisible();

    await page.getByText('-10-30').nth(2).click();

    await page.locator('.text-gray-500').click();

    await expect(
        page.getByText('-10-30').nth(2)
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete').getByText(':10:00')
    ).toBeVisible();
});


// TEST CASE 017 | INTERVIEW_SCHEDULE_TEST_CASE_017
test('INTERVIEW_SCHEDULE_TEST_CASE_017', async ({ page }) => {
    await openInterviewPage(page);

    await page.getByText('Create').click();

    await expect(
        page.getByText('Schedule Interview')
    ).toBeVisible();

    await expect(
        page.locator('div')
            .filter({ hasText: 'Candidate ---Choose Candidate' })
            .nth(3)
    ).toBeVisible();

    await page.getByLabel('---Choose Candidate---', {
        exact: true
    }).click();

    await page.locator(
        '#dynamic_field_employee_id input[type="search"]'
    ).click();

    await page.locator('#id_interview_date')
        .fill('2026-10-31');

    await page.getByPlaceholder('Description').click();

    await page.getByPlaceholder('Description').fill('abc');

    await expect(
        page.locator('#select2-id_candidate_id-container')
    ).toBeVisible();

    await expect(
        page.getByText('×Daniel Nguyen (NTI0002)')
    ).toBeVisible();

    await page.getByText('Save', {
        exact: true
    }).click();

    await expect(
        page.getByText('This field is required.')
    ).toBeVisible();
});


// TEST CASE 018 | INTERVIEW_SCHEDULE_TEST_CASE_018
test('INTERVIEW_SCHEDULE_TEST_CASE_018', async ({ page }) => {
    await openInterviewPage(page);

    await page.getByText('Create').click();

    await expect(
        page.getByText('Schedule Interview')
    ).toBeVisible();

    await expect(
        page.locator('div')
            .filter({ hasText: 'Candidate ---Choose Candidate' })
            .nth(3)
    ).toBeVisible();

    await page.getByLabel('---Choose Candidate---', {
        exact: true
    }).click();

    await page.locator(
        '#dynamic_field_employee_id input[type="search"]'
    ).click();

    await page.locator('#id_interview_date')
        .fill('2026-10-21');

    await page.getByLabel('Interview time', {
        exact: true
    }).fill('12:15');

    await page.getByPlaceholder('Description').click();

    await page.getByPlaceholder('Description').fill('abc');

    await expect(
        page.locator('#select2-id_candidate_id-container')
    ).toBeVisible();

    await expect(
        page.getByText('×Priya Raman (NTI0003)')
    ).toBeVisible();

    await expect(
        page.getByLabel('Interview time', { exact: true })
    ).toBeVisible();

    await expect(
        page.locator('#dynamic_field_interview_time')
    ).toMatchAriaSnapshot(``);

    await page.getByText('Save', {
        exact: true
    }).click();

    await expect(
        page.getByText('Interview date cannot be in')
    ).toBeVisible();
});


// TEST CASE 019 | INTERVIEW_SCHEDULE_TEST_CASE_019
test('INTERVIEW_SCHEDULE_TEST_CASE_019', async ({ page }) => {
    await openInterviewPage(page);

    await page.getByText('Create').click();

    await expect(
        page.getByText('Schedule Interview')
    ).toBeVisible();

    await expect(
        page.locator('div')
            .filter({ hasText: 'Candidate ---Choose Candidate' })
            .nth(3)
    ).toBeVisible();

    await page.getByLabel('---Choose Candidate---', {
        exact: true
    }).click();

    await page.locator(
        '#dynamic_field_employee_id input[type="search"]'
    ).click();

    await page.locator('#id_interview_date')
        .fill('2026-12-01');

    await page.getByPlaceholder('Description').click();

    await page.getByPlaceholder('Description')
        .fill('<img src=x onerror="window.__xssTest=1">.');

    await page.getByLabel('Interview time', {
        exact: true
    }).fill('23:22');

    await expect(
        page.locator('#select2-id_candidate_id-container')
    ).toBeVisible();

    await expect(
        page.getByText('×Emily Carter (NTI0001)')
    ).toBeVisible();

    await expect(
        page.locator('#dynamic_field_interview_date')
    ).toMatchAriaSnapshot(``);

    await expect(
        page.getByPlaceholder('Description')
    ).toHaveValue('<img src=x onerror="window.__xssTest=1">.');

    await page.getByText('Save', {
        exact: true
    }).click();

    await expect(
        page.getByText('Potential XSS content')
    ).toBeVisible();
});


// TEST CASE 020 | INTERVIEW_SCHEDULE_TEST_CASE_020
test('INTERVIEW_SCHEDULE_TEST_CASE_020', async ({ page }) => {
    await openInterviewPage(page);

    await expect(
        page.locator('#interviewdelete').getByText('Kenji Keller')
    ).toBeVisible();

    await expect(
        page.getByText('Panel round for the Sales').first()
    ).toBeVisible();

    await page.locator(
        'tr:nth-child(4) > .stickyright > .flex > .oh-btn.oh-btn--light-bkg'
    ).click();

    await expect(
        page.locator('div')
            .filter({ hasText: 'Candidate ---Choose Candidate' })
            .nth(5)
    ).toBeVisible();

    await expect(
        page.getByPlaceholder('Description')
    ).toBeVisible();

    await page.getByPlaceholder('Description').click();

    await page.getByPlaceholder('Description')
        .fill('Panel round for the Sales Representative opening.abccccccc');

    await page.getByText('Save').click();

    await expect(
        page.locator('#interviewdelete')
            .getByText('Panel round for the Sales Representative opening.abccccccc')
    ).toBeVisible();
});

// TEST CASE 021 | INTERVIEW_SCHEDULE_TEST_CASE_021
test('INTERVIEW_SCHEDULE_TEST_CASE_021', async ({ page }) => {
    await openInterviewPage(page);

    await expect(
        page.locator('#interviewdelete').getByText('Kenji Morgan')
    ).toBeVisible();

    await page.locator(
        'tr:nth-child(7) > .stickyright > .flex > .oh-btn.oh-btn--light-bkg'
    ).click();

    await expect(
        page.locator('div')
            .filter({ hasText: 'Candidate ---Choose Candidate' })
            .nth(3)
    ).toBeVisible();

    await page.locator('#id_interview_date').fill('');

    await expect(
        page.locator('#id_interview_date')
    ).toBeVisible();

    await page.getByText('Save').click();

    await expect(
        page.getByText('This field is required.')
    ).toBeVisible();
});


// TEST CASE 022 | INTERVIEW_SCHEDULE_TEST_CASE_022
test('INTERVIEW_SCHEDULE_TEST_CASE_022', async ({ page }) => {
    await openInterviewPage(page);

    await expect(
        page.locator('#interviewdelete').getByText('Kenji Morgan')
    ).toBeVisible();

    await expect(
        page.getByText('Panel round for the Marketing').nth(1)
    ).toBeVisible();

    await page.locator(
        'tr:nth-child(7) > .stickyright > .flex > .oh-btn.oh-btn--light-bkg'
    ).click();

    await expect(
        page.locator('div')
            .filter({ hasText: 'Candidate ---Choose Candidate' })
            .nth(3)
    ).toBeVisible();

    await page.getByPlaceholder('Description').click();

    await page.getByPlaceholder('Description')
        .fill('Panel round for the Marketing Specialist opening.abcccc');

    await expect(
        page.getByPlaceholder('Description')
    ).toBeVisible();

    await page.locator('#InterviewCreateForm')
        .getByLabel('Close', { exact: true }).click();

    await expect(
        page.getByText('Panel round for the Marketing').nth(1)
    ).toBeVisible();
});


// TEST CASE 023 | INTERVIEW_SCHEDULE_TEST_CASE_023
test('INTERVIEW_SCHEDULE_TEST_CASE_023', async ({ page }) => {
    await openInterviewPage(page);

    await expect(
        page.locator('#interviewdelete').getByText('Kenji Morgan')
    ).toBeVisible();

    await expect(
        page.getByText('Panel round for the Marketing').nth(1)
    ).toBeVisible();

    await page.locator(
        'tr:nth-child(7) > .stickyright > .flex > .oh-btn.oh-btn--light-bkg'
    ).click();

    await expect(
        page.locator('div')
            .filter({ hasText: 'Candidate ---Choose Candidate' })
            .nth(3)
    ).toBeVisible();

    await page.getByPlaceholder('Description').click();

    await page.getByPlaceholder('Description')
        .fill('Panel round for the Marketing Specialist opening.abcccc');

    await expect(
        page.getByPlaceholder('Description')
    ).toBeVisible();

    await page.locator('#InterviewCreateForm')
        .getByLabel('Close', { exact: true }).click();

    await expect(
        page.getByText('Panel round for the Marketing').nth(1)
    ).toBeVisible();

    await expect(
        page.locator('#interviewdelete').getByText('Kenji Morgan')
    ).toBeVisible();

    await expect(
        page.locator(
            'tr:nth-child(7) > .stickyright > .flex > .oh-btn.oh-btn--danger'
        )
    ).toBeVisible();

    await page.locator(
        'tr:nth-child(7) > .stickyright > .flex > .oh-btn.oh-btn--danger'
    ).click();

    await expect(
        page.getByText('Are you sure you want to')
    ).toBeVisible();

    await expect(
        page.getByRole('button', { name: 'Confirm' })
    ).toBeVisible();

    await page.getByRole('button', {
        name: 'Confirm'
    }).click();

    await page.getByRole('textbox', {
        name: 'Search Input'
    }).click();

    await page.getByRole('textbox', {
        name: 'Search Input'
    }).fill('kenji morgan');

    await expect(
        page.getByRole('textbox', { name: 'Search Input' })
    ).toBeVisible();

    await expect(
        page.getByText('No filtered records found at')
    ).toBeVisible();
});


// TEST CASE 024 | INTERVIEW_SCHEDULE_TEST_CASE_024
test('INTERVIEW_SCHEDULE_TEST_CASE_024', async ({ page }) => {
    await openInterviewPage(page);

    await expect(
        page.locator('#interviewdelete').getByText('Amara Müller')
    ).toBeVisible();

    await expect(
        page.locator(
            'tr:nth-child(13) > .stickyright > .flex > .oh-btn.oh-btn--danger'
        )
    ).toBeVisible();

    await page.locator(
        'tr:nth-child(13) > .stickyright > .flex > .oh-btn.oh-btn--danger'
    ).click();

    await expect(
        page.getByText('Are you sure you want to')
    ).toBeVisible();

    await expect(
        page.getByRole('button', { name: 'Cancel' })
    ).toBeVisible();

    await page.getByRole('button', {
        name: 'Cancel'
    }).click();

    await expect(
        page.locator('#interviewdelete').getByText('Amara Müller')
    ).toBeVisible();
});


// TEST CASE 025 | INTERVIEW_SCHEDULE_TEST_CASE_025
test('INTERVIEW_SCHEDULE_TEST_CASE_025', async ({ page }) => {
    await openInterviewPage(page);

    await expect(
        page.locator('#interviewdelete').getByText('Amara Müller')
    ).toBeVisible();

    await page.locator(
        'tr:nth-child(13) > .stickyright > .flex > .oh-btn.oh-btn--light-bkg'
    ).click();

    await expect(
        page.locator('#id_completed_parent_div')
            .getByText('Interview Completed')
    ).toBeVisible();

    await page.getByLabel('Interview Completed', {
        exact: true
    }).check();

    await expect(
        page.getByLabel('Interview Completed', {
            exact: true
        })
    ).toBeVisible();

    await page.getByText('Save').click();

    await expect(
        page.getByText('Interview Completed').nth(1)
    ).toBeVisible();
});


// TEST CASE 026 | INTERVIEW_SCHEDULE_TEST_CASE_026
test('INTERVIEW_SCHEDULE_TEST_CASE_026', async ({ page }) => {
    await openInterviewPage(page);

    await expect(
        page.locator('#interviewdelete-3-interview_date-header')
            .getByText('Interview Date')
    ).toBeVisible();

    await page.locator('.fa-solid.fa-arrow-down')
        .first().click();

    await expect(
        page.getByText('-10-26').first()
    ).toBeVisible();

    await expect(
        page.getByText('-10-26').nth(1)
    ).toBeVisible();

    await expect(
        page.locator('#listContainer').getByText('-10-27')
    ).toBeVisible();

    await expect(
        page.getByText('-10-28').first()
    ).toBeVisible();
});