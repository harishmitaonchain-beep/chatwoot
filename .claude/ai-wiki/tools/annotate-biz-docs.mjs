// Inserts business-doc pointer comments above every mapped Ruby method,
// sourced from code-map.json. v2 "comprehensive" format, 1-2 lines per method:
//   # biz-doc: <vault page path> — <Page Title>
//   # biz-doc: feature: <names> · tier: <plan> · flag: <flags> · help: <url>
// (second line only when the file maps to a named product feature)
// The unique `# biz-doc:` marker makes the layer strippable in one sed AND
// lets this script strip-then-reinsert, so re-runs REPLACE old annotations
// (format upgrades propagate; never stacks duplicates).
//   annotate:  node annotate-biz-docs.mjs <repo-root>
//   strip-all: grep -rl '# biz-doc:' app lib enterprise | xargs sed -i '' '/# biz-doc:/d'
// NEVER COMMIT/PUSH these lines — enforced by .claude/hooks/guard-biz-doc.sh.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const TARGET = process.argv[2];
if (!TARGET) { console.error('usage: node annotate-biz-docs.mjs <repo-root>'); process.exit(1); }

const MAX = 150;
const map = JSON.parse(readFileSync(join(TOOLS, 'code-map.json'), 'utf8'));
// per-function feature attribution from the call graph (joined by in-file def order)
let fnFeat = new Map(); // 'path:orderIdx' -> [[featName, depth]]
try {
  const cg = JSON.parse(readFileSync(join(TOOLS, 'call-graph.json'), 'utf8'));
  const byFile = new Map();
  cg.methods.forEach((m) => { if (!byFile.has(m.file)) byFile.set(m.file, []); byFile.get(m.file).push(m); });
  for (const [fp, arr] of byFile) {
    arr.sort((a, b) => a.line - b.line);
    arr.forEach((m, i) => { if (m.f.length) fnFeat.set(fp + ':' + i, m.f.map(([fx, d]) => [cg.featureNames[fx], d])); });
  }
} catch { /* call graph optional */ }
const byPath = new Map(map.files.filter((f) => f.lang === 'ruby' && f.page).map((f) => [f.path, f]));

// page basename -> vault-relative path
const pagePath = new Map();
const walkVault = (dir, acc = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e); const s = statSync(p);
    if (s.isDirectory() && e !== 'tools') walkVault(p, acc);
    else if (e.endsWith('.md')) acc.push(p);
  }
  return acc;
};
for (const p of walkVault(join(TOOLS, '..'))) {
  pagePath.set(p.split('/').pop().replace(/\.md$/, ''), '.claude/ai-wiki/' + relative(join(TOOLS, '..'), p));
}

const fit = (indent, parts) => {
  // join parts with ' · ', dropping trailing parts until the line fits MAX
  const kept = [...parts];
  while (kept.length) {
    const line = indent + '# biz-doc: ' + kept.join(' · ');
    if (line.length <= MAX) return line;
    kept.pop();
  }
  return null;
};

const commentLinesFor = (entry, indent) => {
  const doc = pagePath.get(entry.page) || `.claude/ai-wiki (page: ${entry.page})`;
  const lines = [];
  const l1 = fit(indent, [`${doc} — ${entry.pageTitle || entry.page}`]) || fit(indent, [doc]);
  if (l1) lines.push(l1);
  const others = (entry.pages || []).filter((p) => p !== entry.page).map((p) => pagePath.get(p)).filter(Boolean);
  if (others.length) {
    const la = fit(indent, [`also: ${others.slice(0, 2).join(', ')}${others.length > 2 ? ` (+${others.length - 2} more)` : ''}`])
            || fit(indent, [`also: ${others[0]}`]);
    if (la) lines.push(la);
  }
  if (entry.features.length) {
    const parts = [`feature: ${entry.features.join(', ')}`];
    if (entry.tier) parts.push(`tier: ${entry.tier}`);
    if (entry.flags.length) parts.push(`flag: ${entry.flags.slice(0, 2).join(',')}${entry.flags.length > 2 ? ',…' : ''}`);
    if (entry.helpUrls.length) parts.push(`help: ${entry.helpUrls[0]}`);
    const l2 = fit(indent, parts);
    if (l2) lines.push(l2);
  }
  return lines;
};

const walkRb = (dir, acc = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e); const s = statSync(p);
    if (s.isDirectory()) { if (!['node_modules', 'spec', 'test', '.git'].includes(e)) walkRb(p, acc); }
    else if (e.endsWith('.rb')) acc.push(p);
  }
  return acc;
};

let filesTouched = 0, methodsAnnotated = 0, linesInserted = 0, oldLinesReplaced = 0, skippedUnmapped = 0;
for (const root of ['app', 'lib', 'enterprise/app', 'enterprise/lib']) {
  let files = [];
  try { files = walkRb(join(TARGET, root)); } catch { continue; }
  for (const abs of files) {
    const rel = relative(TARGET, abs);
    const entry = byPath.get(rel);
    const raw = readFileSync(abs, 'utf8').split('\n');
    const pre = raw.filter((l) => !l.includes('# biz-doc:'));
    oldLinesReplaced += raw.length - pre.length;
    if (!entry) {
      if (raw.length !== pre.length) writeFileSync(abs, pre.join('\n')); // clean stale markers on now-unmapped files
      skippedUnmapped++;
      continue;
    }
    const out = [];
    let touched = raw.length !== pre.length;
    let defOrder = -1;
    for (const line of pre) {
      if (/^\s*def\s+/.test(line)) {
        defOrder++;
        const indent = line.match(/^\s*/)[0];
        const cl = commentLinesFor(entry, indent);
        const mf = fnFeat.get(rel + ':' + defOrder);
        if (mf) {
          const fileFeats = new Set(entry.features);
          const extra = mf.some(([n]) => !fileFeats.has(n)) || !entry.features.length;
          if (extra) {
            const parts = mf.slice(0, 3).map(([n, d]) => `${n}(${d === 0 ? 'entry' : 'd' + d})`).join(', ');
            const lu = fit(indent, [`used-by: ${parts}${mf.length > 3 ? ` (+${mf.length - 3} more)` : ''}`]);
            if (lu) cl.push(lu);
          }
        }
        out.push(...cl);
        linesInserted += cl.length; methodsAnnotated++; touched = true;
      }
      out.push(line);
    }
    if (touched) { writeFileSync(abs, out.join('\n')); filesTouched++; }
  }
}
console.log(JSON.stringify({ filesTouched, methodsAnnotated, linesInserted, oldLinesReplaced, skippedUnmappedFiles: skippedUnmapped }, null, 2));
