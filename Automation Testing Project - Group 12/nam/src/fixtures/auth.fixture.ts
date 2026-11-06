import fs from 'node:fs';
import { test as base, expect, type TestInfo } from '@playwright/test';
import { CandidatesPage } from '../pages/candidates.page';
import { AssetsPage } from '../pages/assets.page';
import { PerformancePage } from '../pages/performance.page';
import { candidateData, assetData, meetingData, testToken, type CandidateData, type AssetData, type MeetingData } from '../utils/data-generator';
import { env } from '../config/env.config';
import { cleanupOwned } from '../utils/owned-cleanup';

export type CandidateRecord = CandidateData & { id?: string };
export type AssetRecord = AssetData & { id?: string; allocated?: boolean; returned?: boolean; retained?: boolean };
export type MeetingRecord = MeetingData & { id?: string };
type Resource = { kind: 'candidate'; value: CandidateRecord } | { kind: 'asset'; value: AssetRecord } | { kind: 'meeting'; value: MeetingRecord };

export class TestData {
  private resources: Resource[] = [];
  private sequence = 0;
  constructor(readonly token: string, readonly candidates: CandidatesPage, readonly assets: AssetsPage, readonly meetings: PerformancePage, readonly info: TestInfo) {}
  next(): string { return `${this.token}${++this.sequence}`; }
  private record(resource: Resource): void {
    this.resources.push(resource);
    this.persist();
  }
  private persist(): void {
    fs.writeFileSync(this.info.outputPath('owned-resources.json'), JSON.stringify(this.resources, null, 2));
  }
  async candidate(overrides: Partial<CandidateData> = {}): Promise<CandidateRecord> {
    const data = candidateData(this.next(), overrides);
    if (!data.email.includes(this.token)) throw new Error('Refusing to own a candidate without this test marker');
    this.record({ kind: 'candidate', value: data });
    (data as CandidateRecord).id = await this.candidates.create(data);
    this.persist(); return data;
  }
  async asset(overrides: Partial<AssetData> = {}): Promise<AssetRecord> {
    const data = assetData(this.next(), overrides);
    if (!data.serial.includes(this.token)) throw new Error('Refusing to own an asset without this test marker');
    this.record({ kind: 'asset', value: data });
    (data as AssetRecord).id = await this.assets.create(data);
    this.persist();
    await expect(this.assets.row(data.serial).locator('td').nth(3), 'Fixture status must persist before filter assertions').toHaveText(data.status);
    return data;
  }
  async meeting(overrides: Partial<MeetingData> = {}): Promise<MeetingRecord> {
    const data = meetingData(this.next(), overrides);
    if (!data.title.includes(this.token)) throw new Error('Refusing to own a meeting without this test marker');
    this.record({ kind: 'meeting', value: data });
    (data as MeetingRecord).id = await this.meetings.create(data);
    this.persist(); return data;
  }
  async allocation(): Promise<AssetRecord> {
    const data = await this.asset();
    data.allocated = true; this.persist();
    await this.assets.allocate(data);
    return data;
  }
  async returned(status = 'Healthy'): Promise<AssetRecord> {
    const data = await this.allocation();
    await this.assets.returnAsset(data, status); data.returned = true; this.persist();
    return data;
  }
  async cleanup(): Promise<void> {
    this.persist();
    const errors: string[] = [];
    const retained: AssetRecord[] = [];
    for (const entry of [...this.resources].reverse()) {
      try {
        if (entry.kind === 'candidate') {
          if (!entry.value.email.includes(this.token)) throw new Error('Ownership check failed');
          await cleanupOwned(this.candidates.page, 'candidate', entry.value, this.token);
        } else if (entry.kind === 'meeting') {
          if (!entry.value.title.includes(this.token)) throw new Error('Ownership check failed');
          await cleanupOwned(this.meetings.page, 'meeting', entry.value, this.token);
        } else {
          if (!entry.value.serial.includes(this.token)) throw new Error('Ownership check failed');
          if (entry.value.allocated) {
            await this.assets.allocations(); await this.assets.searchAllocation(entry.value);
            if (await this.assets.row(entry.value.serial).count()) {
              if (await this.assets.row(entry.value.serial).getByRole('button', { name: 'Return', exact: true }).count()) await this.assets.returnAsset(entry.value);
              await expect(this.assets.row(entry.value.serial), 'Teardown must leave no active allocation').toContainText('Returned');
              entry.value.returned = true;
              entry.value.retained = true;
              retained.push(entry.value);
              // Horilla refuses deleting assets with allocation history, even after Return.
              // Preserve its audit record and report the exact owned IDs instead of forcing a delete.
              continue;
            }
          }
          await cleanupOwned(this.assets.page, 'asset', entry.value, this.token);
        }
      } catch (error) {
        errors.push(`${entry.kind} ${JSON.stringify(entry.value)}: ${String(error)}`);
      }
    }
    this.persist();
    if (retained.length) {
      const file = this.info.outputPath('retained-resources.json');
      fs.writeFileSync(file, JSON.stringify({ reason: 'Horilla retains assets used in allocation; all listed allocations were verified Returned.', resources: retained }, null, 2));
      await this.info.attach('retained-resources', { path: file, contentType: 'application/json' });
      this.info.annotations.push({ type: 'cleanup-retained', description: `${retained.length} owned asset(s) returned; allocation history retained by website policy. See attachment.` });
    }
    if (errors.length) {
      await this.info.attach('cleanup-failures', { body: JSON.stringify(errors, null, 2), contentType: 'application/json' });
      this.info.annotations.push({ type: 'cleanup-failure', description: `${errors.length} owned resources need review; see attachment.` });
      if (this.info.status === this.info.expectedStatus) throw new Error(`Cleanup failed for ${errors.length} owned resource(s). See cleanup-failures attachment.`);
    }
  }
}

export type AppFixtures = {
  candidatesPage: CandidatesPage; assetsPage: AssetsPage; meetingsPage: PerformancePage;
  token: string; data: TestData; executionPolicy: void;
};

export const test = base.extend<AppFixtures>({
  executionPolicy: [async ({}, use, info) => {
    base.skip(info.title.includes('@write') && !env.allowMutations, 'Blocked: ALLOW_MUTATIONS=false; this case needs owned disposable data.');
    info.annotations.push({ type: 'case-id', description: info.title.match(/(?:CAN|AST|MTG)-V2-\d{2}/)?.[0] });
    await use();
  }, { auto: true }],
  candidatesPage: async ({ page }, use) => { await use(new CandidatesPage(page)); },
  assetsPage: async ({ page }, use) => { await use(new AssetsPage(page)); },
  meetingsPage: async ({ page }, use) => { await use(new PerformancePage(page)); },
  token: async ({}, use, info) => { await use(testToken(info)); },
  data: [async ({ token, candidatesPage, assetsPage, meetingsPage, page }, use, info) => {
    const data = new TestData(token, candidatesPage, assetsPage, meetingsPage, info);
    try { await use(data); }
    finally {
      if (info.status !== info.expectedStatus && !page.isClosed()) {
        await info.attach('failure-before-cleanup', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' }).catch(() => undefined);
      }
      await data.cleanup();
    }
  }, { timeout: 120_000 }],
});
export { expect };
