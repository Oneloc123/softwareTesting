import fs from 'node:fs';
import path from 'node:path';
import type { Reporter, FullConfig, FullResult, TestCase, TestResult } from '@playwright/test/reporter';
import { projectRoot } from '../config/env.config';
const { writeAttemptEvidence } = require('../../scripts/execution-evidence.cjs') as {
  writeAttemptEvidence: (options: { root: string; directory: string; id: string; runId: string; title: string;
    expectedStatus: string; caseResult: string; result: TestResult; source: string;
    annotations: { type: string; description?: string }[] }) => {
      screenshots: { file: string }[]; log: string; issues: string[];
    };
};

type Attempt = {
  playwrightStatus: string; retry: number; durationMs: number; videos: string[];
  annotations: { type: string; description?: string }[]; errors: (string | undefined)[];
  screenshots?: string[]; log?: string;
};
type CaseRecord = { id: string; title: string; result: string; flaky: boolean; attempts: Attempt[] };
export default class CaseReporter implements Reporter {
  private results = new Map<string, CaseRecord>();
  private outputDir = '';
  private videoProblems: string[] = [];
  private evidenceProblems: string[] = [];
  onBegin(config: FullConfig): void { this.outputDir = config.projects.find(p => p.name === 'chromium')!.outputDir; }
  onTestEnd(test: TestCase, result: TestResult): void {
    const id = test.title.match(/\b(?:CAN|AST|MTG)-V2-\d{2}\b/)?.[0];
    if (!id) return;
    const annotations = test.annotations.filter(a => /skip|cleanup|case-id/.test(a.type));
    const blocked = annotations.some(a => a.description?.startsWith('Blocked:'));
    const status = result.status === 'skipped' ? (blocked ? 'Blocked' : 'Untested') : result.status === 'passed' ? 'Passed' : 'Failed';
    const videos: string[] = [];
    const videoDir = path.join(this.outputDir, 'videos');
    fs.mkdirSync(videoDir, { recursive: true });
    for (const [index, attachment] of result.attachments.filter(a => a.contentType.startsWith('video/')).entries()) {
      if (!attachment.path || !fs.existsSync(attachment.path)) continue;
      const target = path.join(videoDir, `${id}-retry${result.retry}-${index + 1}.webm`);
      fs.copyFileSync(attachment.path, target);
      videos.push(path.relative(projectRoot, target));
    }
    if (result.status !== 'skipped' && videos.length === 0) this.videoProblems.push(`${id} retry ${result.retry}: no video attachment`);
    let screenshots: string[] = [];
    let log: string | undefined;
    const runId = path.basename(this.outputDir);
    try {
      const evidence = writeAttemptEvidence({ root: projectRoot,
        directory: path.join(projectRoot, 'evidence/runs', runId), id, runId, title: test.title,
        expectedStatus: test.expectedStatus, caseResult: status, result, annotations,
        source: `test-results/${runId}/playwright-results.json (Playwright Reporter.onTestEnd)` });
      screenshots = evidence.screenshots.map(image => image.file);
      log = evidence.log;
      this.evidenceProblems.push(...evidence.issues.map(issue => `${id} retry ${result.retry}: ${issue}`));
      if (result.status !== 'skipped' && screenshots.length === 0)
        this.evidenceProblems.push(`${id} retry ${result.retry}: no screenshot attachment`);
    } catch (error) { this.evidenceProblems.push(`${id} retry ${result.retry}: ${String(error)}`); }
    const previous = this.results.get(id);
    const attempts: Attempt[] = [...(previous?.attempts || []), { playwrightStatus: result.status, retry: result.retry,
      durationMs: result.duration, videos, screenshots, log, annotations, errors: result.errors.map(e => e.message) }];
    this.results.set(id, { id, title: test.title, result: status,
      flaky: status === 'Passed' && attempts.some(a => a.playwrightStatus !== 'passed'), attempts });
  }
  async onEnd(result: FullResult): Promise<{ status: 'failed' } | undefined> {
    if (this.results.size === 0) return;
    fs.mkdirSync(this.outputDir, { recursive: true });
    const catalogFile = path.join(projectRoot, 'test-data/test-case-catalog.json');
    const catalog: { id: string; title: string }[] = fs.existsSync(catalogFile) ? JSON.parse(fs.readFileSync(catalogFile, 'utf8')) : [];
    const cases = catalog.map(source => ({ source, ...(this.results.get(source.id) || { id: source.id, title: source.title, result: 'Untested', flaky: false, attempts: [] }) }));
    const counts = cases.reduce<Record<string, number>>((totals, item) => { totals[item.result] = (totals[item.result] || 0) + 1; return totals; }, {});
    const summaryFile = path.join(this.outputDir, 'case-summary.json');
    const summary = { generatedAt: new Date().toISOString(), runId: process.env.RUN_ID,
      overall: this.videoProblems.length || this.evidenceProblems.length ? 'failed' : result.status,
      counts, videoProblems: this.videoProblems, evidenceProblems: this.evidenceProblems, cases };
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(projectRoot, 'test-results/latest-run.json'), JSON.stringify({
      runId: process.env.RUN_ID, summary: path.relative(projectRoot, summaryFile),
      htmlReport: `playwright-report/${process.env.RUN_ID}`, videos: path.relative(projectRoot, path.join(this.outputDir, 'videos')),
      evidence: `evidence/runs/${path.basename(this.outputDir)}`,
    }, null, 2));
    if (this.videoProblems.length) { console.error('Video requirement failed:', this.videoProblems.join('; ')); return { status: 'failed' }; }
    if (this.evidenceProblems.length) { console.error('Execution evidence requirement failed:', this.evidenceProblems.join('; ')); return { status: 'failed' }; }
  }
}
