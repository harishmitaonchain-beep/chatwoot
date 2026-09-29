// Builds the function-level code ↔ business-logic map (code-map.json).
// Every Ruby class/module/method in app/, lib/, enterprise/app|lib is linked —
// via its file — to: the vault page documenting it (path-index), the business
// feature(s) it implements (feature-index entry points), the gating feature
// flag + its official help-center URL (features.yml), and the Cloud plan tier.
// Frontend (.vue/.js) is mapped at FILE level (component granularity).
// Usage: node .claude/ai-wiki/tools/extract-code-map.mjs
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const VAULT = join(TOOLS, '..');
const REPO = join(VAULT, '..', '..');

const walk = (dir, exts, acc = []) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (['node_modules', 'spec', 'test', '.git'].includes(e)) continue;
      walk(p, exts, acc);
    } else if (exts.some((x) => e.endsWith(x))) acc.push(p);
  }
  return acc;
};

// ---- source parsers ------------------------------------------------------
function parseRuby(content) {
  const classes = [];
  const methods = [];
  const lines = content.split('\n');
  const nsStack = []; // {name, indent}
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const indent = line.match(/^\s*/)[0].length;
    let m;
    if ((m = line.match(/^\s*(?:class|module)\s+([A-Z][A-Za-z0-9_:]*)/))) {
      while (nsStack.length && nsStack[nsStack.length - 1].indent >= indent) nsStack.pop();
      nsStack.push({ name: m[1], indent });
      classes.push({ name: nsStack.map((n) => n.name).join('::'), line: i + 1 });
    } else if ((m = line.match(/^\s*def\s+(self\.)?([a-zA-Z0-9_?!=\[\]<>+\-*\/%^]+)/))) {
      while (nsStack.length && nsStack[nsStack.length - 1].indent >= indent) nsStack.pop();
      const owner = nsStack.map((n) => n.name).join('::') || null;
      methods.push({ name: m[2], owner, static: !!m[1], line: i + 1 });
    } else if (/^\s*end\s*$/.test(line)) {
      while (nsStack.length && nsStack[nsStack.length - 1].indent >= indent) nsStack.pop();
    }
  }
  return { classes, methods };
}

// ---- harness-index parsers ----------------------------------------------
function parsePathIndex() {
  const s = readFileSync(join(VAULT, '00-meta/path-index.md'), 'utf8');
  const rows = [];
  for (const m of s.matchAll(/^\| `([^`]+)` \| \[\[([^\]|]+)(?:\|([^\]]+))?\]\] .*\|$/gm)) {
    rows.push({ path: m[1], page: m[2], title: m[3] || m[2] });
  }
  rows.sort((a, b) => b.path.length - a.path.length); // longest prefix wins
  return rows;
}

function parseFeatureIndex() {
  const s = readFileSync(join(VAULT, '00-meta/feature-index.md'), 'utf8');
  const features = [];
  let section = null;
  for (const line of s.split('\n')) {
    const h = line.match(/^## (.+)$/);
    if (h) { section = h[1].trim(); continue; }
    const r = line.match(/^\| ([^|]+) \| ([^|]+) \| ([^|]*) \| ([^|]+) \|$/);
    if (!r || r[1].trim() === 'Feature' || r[1].startsWith('--')) continue;
    const paths = [...r[2].matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    const flags = [...r[3].matchAll(/`([a-z0-9_]+)`/g)].map((m) => m[1]);
    const tier = (r[3].match(/\((Startups\+|Business\+|Enterprise)\)/) || [])[1] || null;
    const pages = [...r[4].matchAll(/\[\[([^\]|]+)/g)].map((m) => m[1]);
    features.push({ name: r[1].trim(), section, paths, flags, tier, pages });
  }
  return features;
}

function parseFeaturesYml() {
  const s = readFileSync(join(REPO, 'config/features.yml'), 'utf8');
  const map = {};
  let cur = null;
  for (const line of s.split('\n')) {
    const n = line.match(/^- name:\s*(\S+)/);
    if (n) { cur = n[1]; continue; }
    const h = line.match(/^\s+help_url:\s*(\S+)/);
    if (h && cur) map[cur] = h[1];
  }
  return map;
}

// ---- build ---------------------------------------------------------------
// pages that MENTION a file path in their body also document it (many-to-many)
function parsePageMentions() {
  const mentions = new Map(); // repo path -> Set(page basenames)
  const walkMd = (dir, acc = []) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e); const st = statSync(p);
      if (st.isDirectory() && e !== 'tools') walkMd(p, acc);
      else if (e.endsWith('.md')) acc.push(p);
    }
    return acc;
  };
  for (const md of walkMd(VAULT)) {
    const base = md.split('/').pop().replace(/\.md$/, '');
    const body = readFileSync(md, 'utf8');
    for (const m of body.matchAll(/`((?:app|lib|enterprise|config|db)\/[\w\-.\/]+\.(?:rb|vue|js|ts|yml|json|erb|liquid))`/g)) {
      if (!mentions.has(m[1])) mentions.set(m[1], new Set());
      mentions.get(m[1]).add(base);
    }
  }
  return mentions;
}

const pathIndex = parsePathIndex();
const pageMentions = parsePageMentions();
const features = parseFeatureIndex();
const helpUrls = parseFeaturesYml();

const pagesFor = (rel) => pathIndex.filter((r) => rel === r.path || rel.startsWith(r.path + '/'));
const featuresFor = (rel) =>
  features.filter((f) => f.paths.some((p) => rel === p || rel.startsWith(p.replace(/\/$/, '') + '/')));

const rubyFiles = ['app', 'lib', 'enterprise/app', 'enterprise/lib']
  .flatMap((d) => walk(join(REPO, d), ['.rb']))
  .map((p) => relative(REPO, p));
const jsFiles = ['app/javascript']
  .flatMap((d) => walk(join(REPO, d), ['.vue', '.js', '.ts']))
  .map((p) => relative(REPO, p))
  .filter((p) => !/\.(spec|stories|test)\./.test(p));

const files = [];
let methodCount = 0, classCount = 0;
for (const rel of rubyFiles) {
  const { classes, methods } = parseRuby(readFileSync(join(REPO, rel), 'utf8'));
  const prefixPages = pagesFor(rel);
  const mentionPages = [...(pageMentions.get(rel) || [])];
  const pageIds = [...new Set([...prefixPages.map((r) => r.page), ...mentionPages])];
  const page = prefixPages[0] || null;
  const feats = featuresFor(rel);
  methodCount += methods.length; classCount += classes.length;
  files.push({
    path: rel, lang: 'ruby',
    page: page?.page || pageIds[0] || null, pageTitle: page?.title || null, pages: pageIds,
    features: feats.map((f) => f.name),
    flags: [...new Set(feats.flatMap((f) => f.flags))],
    tier: feats.map((f) => f.tier).find(Boolean) || null,
    helpUrls: [...new Set(feats.flatMap((f) => f.flags).map((fl) => helpUrls[fl]).filter(Boolean))],
    classes, methods,
  });
}
for (const rel of jsFiles) {
  const prefixPages = pagesFor(rel);
  const mentionPages = [...(pageMentions.get(rel) || [])];
  const pageIds = [...new Set([...prefixPages.map((r) => r.page), ...mentionPages])];
  const page = prefixPages[0] || null;
  const feats = featuresFor(rel);
  files.push({
    path: rel, lang: 'frontend',
    page: page?.page || pageIds[0] || null, pageTitle: page?.title || null, pages: pageIds,
    features: feats.map((f) => f.name),
    flags: [...new Set(feats.flatMap((f) => f.flags))],
    tier: null, helpUrls: [], classes: [], methods: [],
  });
}

const stats = {
  rubyFiles: rubyFiles.length, frontendFiles: jsFiles.length,
  classes: classCount, methods: methodCount,
  rubyFilesWithPage: files.filter((f) => f.lang === 'ruby' && f.page).length,
  rubyFilesWithFeature: files.filter((f) => f.lang === 'ruby' && f.features.length).length,
  frontendFilesWithPage: files.filter((f) => f.lang === 'frontend' && f.page).length,
  featuresTotal: features.length,
  filesMultiPage: files.filter((f) => (f.pages || []).length > 1).length,
};

writeFileSync(join(TOOLS, 'code-map.json'), JSON.stringify({
  generated: new Date().toISOString().slice(0, 10),
  note: 'code ↔ business map. Every method links via its file to: vault page (page), business features, feature flags, plan tier, official help URLs. Regenerate with tools/extract-code-map.mjs.',
  stats, features, files,
}));
console.log(JSON.stringify(stats, null, 2));
console.log('wrote', join(TOOLS, 'code-map.json'));
