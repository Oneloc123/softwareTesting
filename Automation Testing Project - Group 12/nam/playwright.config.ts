import { defineConfig, devices } from '@playwright/test';
import { env } from './src/config/env.config';

process.env.RUN_ID ||= `CK${Date.now().toString(36)}`;
if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(process.env.RUN_ID)) throw new Error('RUN_ID must be a simple identifier, never a path.');
export default defineConfig({
  testDir: './tests', timeout: 150_000, expect: { timeout: 20_000 },
  fullyParallel: false, workers: env.workers, retries: env.retries,
  forbidOnly: !!process.env.CI, globalTimeout: 90 * 60_000,
  outputDir: `./test-results/${process.env.RUN_ID}`,
  reporter: [ ['list'], ['html', { outputFolder: `playwright-report/${process.env.RUN_ID}`, open: 'never' }],
    ['json', { outputFile: `test-results/${process.env.RUN_ID}/playwright-results.json` }], ['./src/utils/case-reporter.ts'] ],
  use: {
    baseURL: env.baseURL, channel: env.channel, headless: env.headless,
    viewport: { width: 1440, height: 1000 }, actionTimeout: 20_000, navigationTimeout: 40_000,
    timezoneId: env.timezone, locale: 'en-US', screenshot: 'on',
    video: { mode: 'on', size: { width: 1440, height: 1000 } }, trace: 'retain-on-failure', ignoreHTTPSErrors: false,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: env.channel, viewport: { width: 1440, height: 1000 }, storageState: env.authFile }, dependencies: ['setup'], testIgnore: /auth\.setup\.ts/ },
  ],
});
