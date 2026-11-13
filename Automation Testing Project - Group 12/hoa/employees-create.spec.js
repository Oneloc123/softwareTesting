import { test, expect } from '@playwright/test';

const LOGIN_URL = 'https://hr.demo.horilla.com/login/';
const LIST_URL = 'https://hr.demo.horilla.com/employee/employee-view/';

// Record every testcase and retain failure screenshots and traces.
test.use({
    viewport: { width: 1280, height: 720 },
    locale: 'en-US',
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
});

async function openEmployees(page) {
    await page.goto(LOGIN_URL);
    await page.getByRole('textbox', { name: 'Username' }).click();
    await page.getByRole('textbox', { name: 'Username' }).fill('admin');
    await page.getByRole('textbox', { name: 'Password' }).click();
    await page.getByRole('textbox', { name: 'Password' }).fill('admin');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.waitForURL('**/dashboard/**', { timeout: 30000 });
    await page.getByRole('button', { name: 'Employee' }).click();
    const menu = page.getByRole('link', { name: 'Employees', exact: true });

    try {
        await menu.click({ timeout: 7000 });
    } catch {
        await page.goto(LIST_URL);
    }
    await expect(page).toHaveURL(/\/employee\/employee-view\//);
}

test.beforeEach(async ({ page }) => {
    await openEmployees(page);
    await page.getByRole('link', { name: 'Create' }).first().click();
});

// Save a named copy of each page recording in the testcase output directory.
async function saveVideoByTestName(page, testInfo) {
    const context = page.context();
    const videos = [...new Set([page, ...context.pages()])]
        .map(currentPage => currentPage.video())
        .filter(Boolean);

    // Finalize the recordings before awaiting saveAs().
    await context.close();
    const name = testInfo.title
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        .trim()
        .slice(0, 150) || 'testcase';
    const repeat = testInfo.repeatEachIndex
        ? `-repeat-${testInfo.repeatEachIndex}`
        : '';
    const retry = testInfo.retry ? `-retry-${testInfo.retry}` : '';

    for (const [index, video] of videos.entries()) {
        const extraPage = videos.length > 1 ? `-page-${index + 1}` : '';
        const filename = `${name}${repeat}${retry}${extraPage}.webm`;
        const savedPath = testInfo.outputPath(filename);

        await video.saveAs(savedPath);
        await testInfo.attach(filename, {
            path: savedPath,
            contentType: 'video/webm',
        });
    }
}

// Capture the final screen and then save the testcase-named video.
test.afterEach(async ({ page }, testInfo) => {
    if (!page.isClosed()) {
        try {
            await testInfo.attach(`Result - ${testInfo.title}`, {
                body: await page.screenshot({ fullPage: true, timeout: 5000 }),
                contentType: 'image/png',
            });
        } catch {
            // Continue saving the video if the screenshot is unavailable.
        }
    }
    await saveVideoByTestName(page, testInfo);
});

test('EMP_MGT_Create_05: Create employee successfully', async ({ page }) => {
    await page.getByRole('textbox', { name: 'First Name *' }).fill('Hoa');
    await page.getByRole('textbox', { name: 'Last Name' }).fill('Lai');
    const timestamp = Date.now();
    const uniqueBadgeId = `PEP${timestamp}`;
    const uniqueEmail = `laithihoa.tc05.${timestamp}@gmail.com`;
    const uniquePhone = `09${timestamp.toString().slice(-8)}`;
    await page.getByRole('textbox', { name: 'Badge ID Show' }).fill(uniqueBadgeId);
    await page.getByRole('textbox', { name: 'Email *' }).fill(uniqueEmail);
    await page.getByRole('textbox', { name: 'Phone *' }).fill(uniquePhone);
    await page.getByRole('button', { name: 'Save & Continue' }).first().click();
    const successMessage = page.locator('.oh-alert--success:visible')
        .filter({ hasText: /^New Employee Added\.$/ }).first();
    await expect(successMessage).toBeVisible({ timeout: 10000 });
});

test('EMP_MGT_Create_06: Reject missing first name', async ({ page }) => {
    await page.getByRole('button', { name: 'Save & Continue' }).click();
    const firstNameInput = page.locator('#id_employee_first_name');
    const validationMessage = await firstNameInput.evaluate((el) => el.validationMessage);
    expect(validationMessage).toBe('Please fill out this field.');
});

test('EMP_MGT_Create_07: Reject invalid email format', async ({ page }) => {
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
    await page.getByRole('textbox', { name: 'First Name *' }).click();
    await page.getByRole('textbox', { name: 'First Name *' }).fill('Hoa');
    await page.getByRole('textbox', { name: 'Last Name' }).click();
    await page.getByRole('textbox', { name: 'Last Name' }).fill('Lai');
    await page.getByRole('textbox', { name: 'Email *' }).click();
    await page.getByRole('textbox', { name: 'Email *' }).fill('emily.carter@northwind-tech.com');
    await page.getByRole('textbox', { name: 'Phone *' }).click();
    await page.getByRole('textbox', { name: 'Phone *' }).fill('02937362734');
    await page.getByRole('button', { name: 'Save & Continue' }).click();
    await expect(
        page.getByText('An Employee with this Email already exists', {
            exact: true,
        })
    ).toBeVisible();
});

test('EMP_MGT_Create_10: Reject future date of birth', async ({ page }) => {
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
