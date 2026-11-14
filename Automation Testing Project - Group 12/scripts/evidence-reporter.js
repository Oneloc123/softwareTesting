'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const rootDir = process.cwd();
const evidenceRoot = path.join(rootDir, 'Envidence - Group12');

function safeName(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'test';
}

function copyAttachment(attachment, target) {
  if (attachment.path && fs.existsSync(attachment.path)) {
    fs.copyFileSync(attachment.path, target);
    return true;
  }
  if (attachment.body) {
    fs.writeFileSync(target, attachment.body);
    return true;
  }
  return false;
}

class EvidenceReporter {
  constructor() {
    this.tests = [];
    this.startedAt = new Date().toISOString();
    this.runId = process.env.RUN_ID || new Date().toISOString().replace(/[:.]/g, '-');
    this.runDir = path.join(evidenceRoot, this.runId);
    this.screenshotDir = path.join(this.runDir, 'screenshots');
    this.logDir = path.join(this.runDir, 'logs');
    this.videoDir = path.join(this.runDir, 'videos');
  }

  onBegin(config) {
    fs.mkdirSync(this.screenshotDir, { recursive: true });
    fs.mkdirSync(this.logDir, { recursive: true });
    fs.mkdirSync(this.videoDir, { recursive: true });
    fs.writeFileSync(path.join(this.runDir, 'RUN_INFO.txt'), [
      `Run ID: ${this.runId}`,
      `Started at: ${this.startedAt}`,
      `Base URL: ${process.env.BASE_URL || process.env.HORILLA_BASE_URL || 'configured in Playwright'}`,
      'Evidence is copied from attachments produced by this Playwright execution.',
    ].join('\n') + '\n');
  }

  onTestEnd(test, result) {
    const relativeFile = path.relative(rootDir, test.location.file);
    const firstFolder = relativeFile.split(path.sep)[0];
    const project = ['hieu', 'hoa', 'loc', 'nam', 'anh'].includes(firstFolder) ? firstFolder : 'suite';
    const title = test.titlePath().join(' › ');
    const identity = `${project}-${relativeFile}-${test.location.line}-${title}`;
    const digest = crypto.createHash('sha1').update(identity).digest('hex').slice(0, 8);
    const base = `${safeName(project)}-${safeName(path.basename(test.location.file, path.extname(test.location.file)))}-${safeName(test.title)}-${digest}`;
    const screenshots = [];
    const videos = [];
    const attachments = [];

    for (const [index, attachment] of result.attachments.entries()) {
      const contentType = attachment.contentType || 'application/octet-stream';
      const ext = contentType.includes('png') ? '.png'
        : contentType.includes('jpeg') ? '.jpg'
        : contentType.includes('video') ? '.webm'
        : contentType.includes('zip') ? '.zip'
        : contentType.includes('json') ? '.json'
        : '.bin';
      const isScreenshot = contentType.startsWith('image/')
        && ((attachment.name || '').toLowerCase().includes('screenshot') || contentType === 'image/png');
      const isVideo = contentType.startsWith('video/');
      const folder = isScreenshot ? this.screenshotDir : isVideo ? this.videoDir : this.logDir;
      const fileName = `${base}-${String(index + 1).padStart(2, '0')}-${safeName(attachment.name || 'attachment')}${ext}`;
      const target = path.join(folder, fileName);
      if (!copyAttachment(attachment, target)) continue;
      const item = { name: attachment.name || 'attachment', contentType, file: path.relative(evidenceRoot, target) };
      attachments.push(item);
      if (isScreenshot) screenshots.push(item.file);
      if (isVideo) videos.push(item.file);
    }

    const entry = {
      project,
      title,
      file: relativeFile,
      line: test.location.line,
      column: test.location.column,
      status: result.status,
      expectedStatus: test.expectedStatus,
      durationMs: result.duration,
      retry: result.retry,
      errors: (result.errors || []).map(error => ({
        message: error.message || String(error),
        stack: error.stack || null,
      })),
      annotations: test.annotations || [],
      screenshots,
      videos,
      attachments,
    };

    const logFile = path.join(this.logDir, `${base}.json`);
    fs.writeFileSync(logFile, JSON.stringify(entry, null, 2));
    entry.log = path.relative(evidenceRoot, logFile);
    this.tests.push(entry);
  }

  onEnd(result) {
    const counts = {};
    for (const item of this.tests) counts[item.status] = (counts[item.status] || 0) + 1;
    const summary = {
      runId: this.runId,
      startedAt: this.startedAt,
      completedAt: new Date().toISOString(),
      playwrightStatus: result.status,
      total: this.tests.length,
      counts,
      tests: this.tests,
    };
    fs.writeFileSync(path.join(this.runDir, 'summary.json'), JSON.stringify(summary, null, 2));
    fs.writeFileSync(path.join(evidenceRoot, 'LATEST_RUN.txt'), `${this.runId}\n`);
  }
}

module.exports = EvidenceReporter;
