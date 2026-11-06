import { randomBytes } from 'node:crypto';
import type { TestInfo } from '@playwright/test';
import { env } from '../config/env.config';
import candidateDefaults from '../../test-data/candidate-data.json';
import assetDefaults from '../../test-data/asset-data.json';
import meetingDefaults from '../../test-data/meeting-data.json';

export function testToken(info: TestInfo): string {
  return `${(process.env.RUN_ID || 'local').replace(/[^a-z0-9]/gi, '').slice(-10)}${info.retry}${randomBytes(3).toString('hex')}`;
}

export function uniqueText(prefix: string, token: string, length?: number): string {
  const text = `${prefix} ${token}`;
  if (length !== undefined && text.length > length) throw new Error('Unique marker exceeds requested length');
  return length === undefined ? text : text.padEnd(length, 'A');
}

export function localDate(offsetDays = 0): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: env.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (type: string) => parts.find(p => p.type === type)!.value;
  const date = new Date(`${get('year')}-${get('month')}-${get('day')}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function meetingDate(offsetDays = 1, hour = 10): string {
  return `${localDate(offsetDays)}T${String(hour).padStart(2, '0')}:00`;
}

export type CandidateData = {
  name: string; email: string; recruitment: string; mobile?: string; portfolio?: string;
  address?: string; country?: string; zip?: string; dob?: string; gender?: string; source?: string; canceled?: boolean; resume?: string;
};
export type AssetData = {
  name: string; serial: string; purchaseDate: string; cost: string; category: string;
  status: string; description?: string; batch?: string; expiry?: string; notify?: string;
};
export type MeetingData = {
  title: string; date: string; employees: string[]; managers: string[];
  answerable?: string[]; template?: string;
};

export const candidateData = (token: string, overrides: Partial<CandidateData> = {}): CandidateData => ({
  name: uniqueText('CK Candidate', token), email: `ck.${token}@example.com`,
  recruitment: candidateDefaults.recruitment, ...overrides,
});
export const assetData = (token: string, overrides: Partial<AssetData> = {}): AssetData => ({
  name: uniqueText('CK Asset', token), serial: `CK-${token}`.slice(0, 30), purchaseDate: localDate(),
  cost: assetDefaults.cost, category: assetDefaults.category, status: assetDefaults.status, ...overrides,
});
export const meetingData = (token: string, overrides: Partial<MeetingData> = {}): MeetingData => ({
  title: uniqueText('CK Meeting', token), date: meetingDate(),
  employees: [meetingDefaults.employee], managers: [meetingDefaults.manager], ...overrides,
});
