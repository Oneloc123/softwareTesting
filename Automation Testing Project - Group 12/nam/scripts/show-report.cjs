const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const latest = JSON.parse(fs.readFileSync(path.join(root,'test-results/latest-run.json'),'utf8'));
const cli = require.resolve('@playwright/test/cli');
const result = spawnSync(process.execPath,[cli,'show-report',path.resolve(root,latest.htmlReport)],{stdio:'inherit'});
process.exitCode = result.status || 0;
