import fs from 'node:fs';
import path from 'node:path';
import { test as setup } from '@playwright/test';
import { LoginPage } from '../src/pages/login.page';
import { env } from '../src/config/env.config';

setup('authenticate public Horilla demo account', async ({ page }) => {
  fs.mkdirSync(path.dirname(env.authFile), { recursive: true });
  await new LoginPage(page).login();
  await page.context().storageState({ path: env.authFile });
});
