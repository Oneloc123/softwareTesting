'use strict';

const path = require('node:path');
const dotenv = require('dotenv');

const projectRoot = path.resolve(__dirname, '../..');
const workspaceRoot = path.resolve(projectRoot, '..');
const local = dotenv.config({ path: path.join(workspaceRoot, '.env') }).parsed || {};

function positiveInt(value, fallback) {
  if (value === undefined || value === '') return fallback;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0) {
    throw new Error(`Invalid non-negative integer: ${value}`);
  }
  return result;
}

const env = {
  baseURL: process.env.BASE_URL || local.BASE_URL || 'https://hr.demo.horilla.com',
  username: process.env.HORILLA_USERNAME || local.HORILLA_USERNAME || local.USERNAME || 'admin',
  password: process.env.HORILLA_PASSWORD || local.HORILLA_PASSWORD || local.PASSWORD || 'admin',
  channel: process.env.PLAYWRIGHT_CHANNEL || local.PLAYWRIGHT_CHANNEL || 'chromium',
  headless: (process.env.HEADLESS || local.HEADLESS || 'true') !== 'false',
  workers: Math.max(1, positiveInt(process.env.WORKERS || local.WORKERS, 1)),
  retries: positiveInt(process.env.RETRIES || local.RETRIES, 0),
  allowMutations: (process.env.ALLOW_MUTATIONS || local.ALLOW_MUTATIONS || 'true') !== 'false',
  timezone: process.env.TEST_TIMEZONE || local.TEST_TIMEZONE || 'Asia/Ho_Chi_Minh',
  authFile: path.join(projectRoot, 'playwright/.auth/admin.json'),
};

if (env.workers !== 1) throw new Error('This shared-account demo suite requires WORKERS=1.');
if (!/^https?:\/\//.test(env.baseURL)) throw new Error('BASE_URL must be an HTTP(S) URL.');

module.exports = { projectRoot, env };
