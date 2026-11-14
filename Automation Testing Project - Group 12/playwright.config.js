'use strict';

const path = require('node:path');
const dotenv = require('dotenv');
const { defineConfig } = require('@playwright/test');

dotenv.config({ path: path.join(__dirname, '.env') });

const runId = process.env.RUN_ID || new Date().toISOString().replace(/[:.]/g, '-');
if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(runId)) {
  throw new Error('RUN_ID must contain only letters, numbers, underscores, and hyphens.');
}
process.env.RUN_ID = runId;

const baseURL = process.env.BASE_URL || process.env.HORILLA_BASE_URL || 'https://hr.demo.horilla.com';
const workers = Number(process.env.WORKERS || 1);
if (!Number.isInteger(workers) || workers !== 1) {
  throw new Error('WORKERS must be 1 because the group suites share a demo account and test data.');
}

const browserChannel = process.env.PLAYWRIGHT_CHANNEL || 'chromium';
const browserOptions = browserChannel === 'chromium' ? {} : { channel: browserChannel };

module.exports = defineConfig({
  testDir: '.',
  timeout: 150_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: Number(process.env.RETRIES || 0),
  forbidOnly: Boolean(process.env.CI),
  globalTimeout: 90 * 60_000,
  outputDir: `test-results/${runId}`,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'Test Report - Group 12/html-report', open: 'never' }],
    ['json', { outputFile: 'Test Report - Group 12/results.json' }],
    ['junit', { outputFile: 'Test Report - Group 12/junit.xml' }],
    ['./scripts/evidence-reporter.js'],
  ],
  use: {
    baseURL,
    ...browserOptions,
    headless: process.env.HEADLESS !== 'false',
    viewport: { width: 1440, height: 1000 },
    locale: 'en-US',
    timezoneId: process.env.TEST_TIMEZONE || 'Asia/Ho_Chi_Minh',
    actionTimeout: 20_000,
    navigationTimeout: 40_000,
    screenshot: 'on',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'hieu-setup', testDir: './hieu', testMatch: /auth\.setup\.js/ },
    {
      name: 'hieu', testDir: './hieu', testMatch: /.*\.spec\.js/,
      dependencies: ['hieu-setup'], use: { storageState: '.auth/admin.json' },
    },
    { name: 'hoa', testDir: './hoa', testMatch: /.*\.js/ },
    { name: 'loc', testDir: './loc', testMatch: /.*\.spec\.js/ },
    { name: 'nam-setup', testDir: './nam/tests', testMatch: /auth\.setup\.js/ },
    {
      name: 'nam', testDir: './nam/tests', testMatch: /.*\.spec\.js/,
      dependencies: ['nam-setup'], use: { storageState: 'nam/playwright/.auth/admin.json' },
    },
    {
      name: 'anh',
      testDir: './anh/tests',
      testMatch: /.*\.spec\.js/,
      use: {
        storageState: path.resolve(__dirname, 'anh', process.env.ANH_STORAGE_STATE || 'playwright/.auth/user.json'),
      },
    },
  ],
});
