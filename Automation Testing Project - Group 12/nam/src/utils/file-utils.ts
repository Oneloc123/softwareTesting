import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { expect, type Download, type TestInfo } from '@playwright/test';
import { unzipSync, strFromU8 } from 'fflate';
import { projectRoot } from '../config/env.config';

export function testFile(name: 'sample_cv.pdf' | 'assignment.png'): string {
  const file = path.join(projectRoot, 'test-data/files/generated', name);
  if (!fs.existsSync(file)) execFileSync(process.execPath, [path.join(projectRoot, 'scripts/prepare-test-files.cjs')]);
  return file;
}

export async function saveDownload(download: Download, info: TestInfo): Promise<Buffer> {
  expect(await download.failure()).toBeNull();
  const name = path.basename(download.suggestedFilename());
  const target = info.outputPath(name || 'download.bin');
  await download.saveAs(target);
  const bytes = fs.readFileSync(target);
  expect(bytes.length).toBeGreaterThan(0);
  await info.attach('download', { path: target, contentType: 'application/octet-stream' });
  return bytes;
}

export function assertSameFile(actual: Buffer, expectedFile: string): void {
  const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  expect(hash(actual)).toBe(hash(fs.readFileSync(expectedFile)));
}

export function excelText(bytes: Buffer): string {
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  const zip = unzipSync(bytes);
  expect(zip['[Content_Types].xml']).toBeDefined();
  return Object.entries(zip).filter(([name]) => /^xl\/(worksheets\/sheet\d+|sharedStrings)\.xml$/.test(name))
    .map(([, data]) => strFromU8(data).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'))
    .join(' ').replace(/\s+/g, ' ');
}
