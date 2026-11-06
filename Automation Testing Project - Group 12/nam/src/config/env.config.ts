import path from 'node:path';
import dotenv from 'dotenv';

export const projectRoot = path.resolve(__dirname, '../..');
const local = dotenv.config({ path: path.join(projectRoot, '.env') }).parsed || {};

function positiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const result = Number(value);
  if (!Number.isInteger(result) || result < 0) throw new Error(`Invalid non-negative integer: ${value}`);
  return result;
}

export const env = {
  baseURL: process.env.BASE_URL || 'https://hr.demo.horilla.com',
  username: process.env.HORILLA_USERNAME || local.USERNAME || 'admin',
  password: process.env.HORILLA_PASSWORD || local.PASSWORD || 'admin',
  channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome',
  headless: process.env.HEADLESS !== 'false',
  workers: Math.max(1, positiveInt(process.env.WORKERS, 1)),
  retries: positiveInt(process.env.RETRIES, 0),
  allowMutations: process.env.ALLOW_MUTATIONS !== 'false',
  timezone: process.env.TEST_TIMEZONE || 'Asia/Ho_Chi_Minh',
  authFile: path.join(projectRoot, 'playwright/.auth/admin.json'),
};
if (env.workers !== 1) throw new Error('This shared-account demo suite requires WORKERS=1.');
if (!/^https?:\/\//.test(env.baseURL)) throw new Error('BASE_URL must be an HTTP(S) URL.');

