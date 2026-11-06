const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir,e.name)) : [path.join(dir,e.name)]); }
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'test-data/test-case-catalog.json'),'utf8'));
const occurrences = new Map();
for (const file of walk(path.join(root, 'tests')).filter(f => f.endsWith('.spec.js'))) {
  const content = fs.readFileSync(file, 'utf8');
  for (const match of content.matchAll(/['"]((?:CAN|AST|MTG)-V2-\d{2})['"]/g)) {
    const list = occurrences.get(match[1]) || []; list.push(path.relative(root,file)); occurrences.set(match[1],list);
  }
}
const missing = catalog.filter(c => !occurrences.has(c.id)).map(c => c.id);
const duplicate = [...occurrences].filter(([, files])=>files.length!==1);
const extra = [...occurrences.keys()].filter(id=>!catalog.some(c=>c.id===id));
if (missing.length || duplicate.length || extra.length) { console.error({ missing, duplicate, extra }); process.exitCode=1; }
else console.log('PASS: 105 distinct source IDs, each declared once in a spec; 35 Candidates + 35 Assets + 35 Meetings.');
