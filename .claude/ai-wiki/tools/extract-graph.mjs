// Rebuilds the Chatwoot Atlas graph data from this vault's [[wikilinks]].
// Usage:  node .claude/ai-wiki/tools/extract-graph.mjs
// Writes graph-data.json (pretty) and graph-data.compact.json (for splicing
// into the Atlas artifact's `var DATA = ...;` line) next to this script.
// Links inside code fences/spans are ignored — Obsidian doesn't render those.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, relative, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(TOOLS_DIR, '..');

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'tools') continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, acc);
    else if (entry.endsWith('.md')) acc.push(p);
  }
  return acc;
}

const files = walk(ROOT);

const CATEGORY_BY_FOLDER = {
  '00-meta': 'meta',
  '01-architecture': 'architecture',
  '02-backend': 'backend',
  '03-channels': 'channels',
  '04-frontend': 'frontend',
  '05-enterprise': 'enterprise',
};

const stripCode = (s) => s.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');

const nodes = {};
const edgeSet = new Map();

for (const f of files) {
  const rel = relative(ROOT, f);
  const id = basename(f, '.md');
  const folder = rel.includes('/') ? rel.split('/')[0] : 'root';
  const category = CATEGORY_BY_FOLDER[folder] || 'root';
  const content = readFileSync(f, 'utf8');
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  let title = id;
  if (fmMatch) {
    const titleLine = fmMatch[1].split('\n').find((l) => l.startsWith('title:'));
    if (titleLine) title = titleLine.replace(/^title:\s*/, '').replace(/^"|"$/g, '').trim();
  }
  let body = fmMatch ? content.slice(fmMatch[0].length) : content;
  body = body.replace(/^\s*#\s.*$/m, '');
  const paraMatch = body.match(/([^\n#][^\n]{20,}(?:\n(?!#|\n)[^\n]+)*)/);
  let desc = paraMatch ? paraMatch[1].replace(/\s+/g, ' ').trim() : '';
  if (desc.length > 260) desc = desc.slice(0, 257).trimEnd() + '...';
  nodes[id] = { id, title, category, folder, path: rel, desc };
}

for (const f of files) {
  const id = basename(f, '.md');
  const content = stripCode(readFileSync(f, 'utf8'));
  const linkRe = /\[\[([^\]|#]+)(#[^\]|]*)?(\|[^\]]+)?\]\]/g;
  let m;
  while ((m = linkRe.exec(content))) {
    let target = m[1].trim().split('/').pop().replace(/\\+$/, '');
    if (!nodes[target] || target === id) continue;
    const key = [id, target].sort().join('|');
    edgeSet.set(key, (edgeSet.get(key) || 0) + 1);
  }
}

const edges = Array.from(edgeSet.entries()).map(([key, weight]) => {
  const [source, target] = key.split('|');
  return { source, target, weight };
});

const degree = {};
for (const e of edges) {
  degree[e.source] = (degree[e.source] || 0) + 1;
  degree[e.target] = (degree[e.target] || 0) + 1;
}
for (const n of Object.values(nodes)) n.degree = degree[n.id] || 0;

const out = { nodes: Object.values(nodes), edges };
writeFileSync(join(TOOLS_DIR, 'graph-data.json'), JSON.stringify(out, null, 2));
writeFileSync(join(TOOLS_DIR, 'graph-data.compact.json'), JSON.stringify(out));
console.log(`nodes: ${out.nodes.length}  edges: ${out.edges.length}`);
console.log(`wrote ${join(TOOLS_DIR, 'graph-data{,.compact}.json')}`);
