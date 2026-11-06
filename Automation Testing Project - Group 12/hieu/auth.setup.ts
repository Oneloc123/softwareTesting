import { test as setup, expect } from '@playwright/test';

// Đăng nhập 1 lần, lưu session cho toàn bộ test case.
setup('login as Adam Admin', async ({ page }) => {
  await page.goto(process.env.LOGIN_URL ?? '/login/');

  await page.locator('input[name="username"], #id_username, input[type="text"]').first()
      .fill(process.env.ADMIN_USER ?? 'admin');
  await page.locator('input[type="password"]').first()
      .fill(process.env.ADMIN_PASS ?? 'admin');
  await page.getByText('Sign In', { exact: false }).last().click();

  await expect(page).not.toHaveURL(/login/);
  await page.context().storageState({ path: '.auth/admin.json' });
});