const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const clean = value => String(value ?? '').replace(/\u001b\[[0-9;]*m/g, '');
const portable = file => file.split(path.sep).join('/');

function within(root, file) {
  const relative = path.relative(root, file);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative))
    throw new Error('Evidence path is outside project: ' + file);
  return file;
}

function attachmentPath(root, runId, file) {
  // JSON reports can retain an absolute path from the original machine.
  const normalized = file.replace(/\\/g, '/');
  const marker = `test-results/${runId}/`;
  const index = normalized.indexOf(marker);
  const relative = index >= 0 ? normalized.slice(index) : file;
  const absolute = within(root, path.resolve(root, relative));
  return within(root, fs.realpathSync(absolute));
}

function outputText(entries = []) {
  return entries.map(entry => {
    if (Buffer.isBuffer(entry)) return entry.toString('utf8');
    if (typeof entry === 'string') return entry;
    if (entry.text !== undefined) return entry.text;
    if (entry.buffer !== undefined) return Buffer.from(entry.buffer, 'base64').toString('utf8');
    return JSON.stringify(entry);
  }).map(clean).join('') || '(No output was recorded.)';
}

function writeAttemptEvidence({ root, directory, id, runId, title, expectedStatus, caseResult, result,
  source, annotations = [], logFileName }) {
  if (!/^(CAN|AST|MTG)-V2-\d{2}$/.test(id) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(runId))
    throw new Error('Invalid case ID or RUN_ID');
  within(root, directory);
  const screenshotsDir = path.join(directory, 'screenshots');
  const logsDir = path.join(directory, 'logs');
  fs.mkdirSync(screenshotsDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  const screenshots = [];
  const issues = [];
  const imageTypes = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
  for (const [index, attachment] of (result.attachments || []).entries()) {
    if (!imageTypes[attachment.contentType]) continue;
    try {
      const bytes = attachment.path ? fs.readFileSync(attachmentPath(root, runId, attachment.path))
        : Buffer.isBuffer(attachment.body) ? attachment.body : Buffer.from(attachment.body || '', 'base64');
      if (!bytes.length) throw new Error('Empty image attachment');
      const label = attachment.name.replace(/[^A-Za-z0-9_-]+/g, '-');
      const name = `${id}-${runId}-retry${result.retry ?? 0}-${index + 1}-${label}${imageTypes[attachment.contentType]}`;
      const destination = path.join(screenshotsDir, name);
      fs.writeFileSync(destination, bytes);
      screenshots.push({ file: portable(path.relative(root, destination)), name: attachment.name,
        source: attachment.path || 'Inline image attachment in the recorded Playwright result',
        bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    } catch (error) { issues.push(`${attachment.name}: ${error.message}`); }
  }
  const startedAt = result.startTime instanceof Date ? result.startTime.toISOString() : result.startTime;
  const errors = (result.errors || []).map(error => {
    if (typeof error === 'string') return clean(error);
    const message = clean(error.message || '');
    const stack = clean(error.stack || '');
    return message && stack && !stack.includes(message) ? `${message}\n${stack}` : stack || message || JSON.stringify(error);
  }).join('\n\n') || '(No execution error was recorded.)';
  const text = [
    `CASE_ID: ${id}`, `TITLE: ${title}`, `RUN_ID: ${runId}`, `RESULT: ${caseResult}`,
    `PLAYWRIGHT_STATUS: ${result.status}`, `EXPECTED_STATUS: ${expectedStatus}`,
    `STARTED_AT: ${startedAt || 'Not recorded'}`, `DURATION_MS: ${result.duration}`,
    `RETRY: ${result.retry ?? 0}`, `SOURCE: ${source}`, `LOG_EXPORTED_AT: ${new Date().toISOString()}`,
    '', 'This file exports recorded execution data; exporting it does not execute a test.',
    'No action-by-action trace is invented when the source contains no step log.',
    '', '=== STDOUT ===', outputText(result.stdout), '', '=== STDERR ===', outputText(result.stderr),
    '', '=== ERRORS ===', errors, '', '=== ANNOTATIONS ===', JSON.stringify(annotations, null, 2),
    '', '=== SCREENSHOTS ===', screenshots.length ? screenshots.map(image => image.file).join('\n')
      : '(No screenshot attachment in this attempt. Historical runs captured screenshots only on failure.)',
    '', '=== RECORDED ATTACHMENTS ===',
    ...(result.attachments || []).map(attachment => `${attachment.name} | ${attachment.contentType} | ${attachment.path || '(inline body)'}`),
    '', '=== EVIDENCE EXPORT ISSUES ===', issues.join('\n') || 'None', '',
  ].join('\n');
  const name = logFileName || `${id}-retry${result.retry ?? 0}.log`;
  if (path.basename(name) !== name || !name.endsWith('.log')) throw new Error('Invalid log filename');
  const logFile = path.join(logsDir, name);
  fs.writeFileSync(logFile, text);
  return { screenshots, log: portable(path.relative(root, logFile)), issues };
}

module.exports = { writeAttemptEvidence };
