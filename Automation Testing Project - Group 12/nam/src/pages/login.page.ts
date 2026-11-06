import { expect, type Page } from '@playwright/test';
import { env } from '../config/env.config';
import { URLS } from '../constants/urls';

export class LoginPage {
  constructor(readonly page: Page) {}
  async login(): Promise<void> {
    await this.page.goto(URLS.login, { waitUntil: 'domcontentloaded' });
    await this.page.getByLabel('Username', { exact: true }).fill(env.username);
    await this.page.getByLabel('Password', { exact: true }).fill(env.password);
    await this.page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(this.page).toHaveURL(/\/dashboard\//);
    await expect(this.page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  }
}
