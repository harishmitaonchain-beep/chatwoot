// Builds codex-data.json for the Chatwoot Codex artifact, including the
// DERIVED BUSINESS DEPENDENCY GRAPH linking the two graphs:
//   capability A --depends-on--> capability B  when a function reached from
//   A's roots via calls (depth>0) is one of B's entry functions (depth 0);
//   the inducing functions are attached as evidence.
// Inputs: code-map.json, call-graph.json, journeys.json, vault page titles.
// Usage: node build-codex-data.mjs
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const map = JSON.parse(readFileSync(join(TOOLS, 'code-map.json'), 'utf8'));
const cg = JSON.parse(readFileSync(join(TOOLS, 'call-graph.json'), 'utf8'));
const J = JSON.parse(readFileSync(join(TOOLS, 'journeys.json'), 'utf8'));

const titles = new Map();
const walkMd = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e); const st = statSync(p);
    if (st.isDirectory() && e !== 'tools') walkMd(p);
    else if (e.endsWith('.md')) {
      const t = (readFileSync(p, 'utf8').match(/^title:\s*"?([^"\n]+)"?/m) || [])[1];
      titles.set(e.replace(/\.md$/, ''), t || e.replace(/\.md$/, ''));
    }
  }
};
walkMd(join(TOOLS, '..'));

const featIdx = new Map(map.features.map((f, i) => [f.name, i]));
const feats = map.features.map((f) => ({ n: f.name, s: f.section, t: f.tier, fl: f.flags, pg: f.pages, gd: [], files: [] }));
// attach user-guide article links per capability (tools/user-guide.json, if built)
try {
  const ug = JSON.parse(readFileSync(join(TOOLS, 'user-guide.json'), 'utf8'));
  for (const cat of ug.categories) for (const a of cat.articles) for (const cap of a.capabilities) {
    const fx = featIdx.get(cap);
    if (fx == null) continue;
    if (feats[fx].gd.length < 4 && !feats[fx].gd.some((g) => g.u === a.url)) feats[fx].gd.push({ t: a.title, u: a.url });
  }
} catch { /* guide index not built yet */ }
const pageFiles = new Map(); const files = []; const filePos = new Map();
map.files.forEach((f) => {
  const gs = f.pages && f.pages.length ? f.pages : (f.page ? [f.page] : []);
  if (!gs.length) return;
  const fi = files.length; filePos.set(f.path, fi);
  gs.forEach((g) => { if (!pageFiles.has(g)) pageFiles.set(g, []); pageFiles.get(g).push(fi); });
  const fids = f.features.map((n) => featIdx.get(n)).filter((x) => x != null);
  fids.forEach((id) => feats[id].files.push(fi));
  files.push({ p: f.path, gs, l: f.lang === 'ruby' ? 0 : 1, t: f.tier, h: f.helpUrls[0] || null, ft: fids,
    m: f.methods.map((m) => [m.owner ? m.owner + (m.static ? '.' : '#') + m.name : m.name, m.line]) });
});

const cgByFile = new Map();
cg.methods.forEach((m) => { if (!cgByFile.has(m.file)) cgByFile.set(m.file, []); cgByFile.get(m.file).push(m); });
for (const arr of cgByFile.values()) arr.sort((a, b) => a.line - b.line);
const gidOf = new Map(); const gids = []; const mfeat = {};
for (const [fpath, arr] of cgByFile) {
  const fi = filePos.get(fpath); if (fi == null) continue;
  arr.forEach((m, mi) => {
    if (mi >= files[fi].m.length) return;
    const gid = gids.length; gids.push([fi, mi]); gidOf.set(m.id, gid);
    if (m.f.length) mfeat[fi + ':' + mi] = m.f;
  });
}
const calls = cg.edges.map(([a, b, k]) => [gidOf.get(a), gidOf.get(b), k || 0]).filter(([a, b]) => a != null && b != null);

const featFns = map.features.map(() => []);
Object.entries(mfeat).forEach(([key, fs2]) => {
  const [fi, mi] = key.split(':').map(Number);
  fs2.forEach(([fx, d]) => featFns[fx].push([fi, mi, d]));
});
featFns.forEach((l) => l.sort((a, b) => a[2] - b[2]));

// ---- DERIVED BUSINESS DEPENDENCY GRAPH ----
// A depends on B when some function is (A, depth>0) AND (B, depth 0).
const depMap = new Map(); // 'a>b' -> [gid evidence]
Object.entries(mfeat).forEach(([key, fs2]) => {
  const [fi, mi] = key.split(':').map(Number);
  const gid = gids.findIndex ? null : null; // placeholder (computed below)
  const zero = fs2.filter(([, d]) => d === 0).map(([fx]) => fx);
  const deep = fs2.filter(([, d]) => d > 0).map(([fx]) => fx);
  if (!zero.length || !deep.length) return;
  const g = calls.length >= 0 ? key : key; // keep key for evidence
  for (const a of deep) for (const b of zero) {
    if (a === b) continue;
    const k = a + '>' + b;
    if (!depMap.has(k)) depMap.set(k, []);
    if (depMap.get(k).length < 8) depMap.get(k).push(key);
  }
});
const deps = [...depMap.entries()].map(([k, ev]) => {
  const [a, b] = k.split('>').map(Number);
  return { a, b, ev };
});

const journeys = J.journeys.filter((j) => !j.miss && gidOf.has(j.gid)).map((j) => ({
  v: j.v, p: j.p, ctrl: j.ctrl, act: j.act, gid: gidOf.get(j.gid),
  g: { ba: (j.g.ba || []).map((id) => gidOf.get(id)).filter((x) => x != null), az: j.g.az, ff: j.g.ff, tier: j.g.tier, feats: j.g.feats },
  ch: (j.ch || []).map(([id, d, k]) => [gidOf.get(id), d, k]).filter(([g]) => g != null), tr: j.tr }));

const pages = [...pageFiles.entries()].map(([id, fl]) => ({ id, title: titles.get(id) || id, files: fl }))
  .sort((a, b) => b.files.length - a.files.length);
const out = { pages, feats, files, mfeat, featFns, gids, calls, journeys, deps,
  stats: { pages: pages.length, feats: feats.length, files: files.length,
    methods: files.reduce((s, f) => s + f.m.length, 0), multiDoc: files.filter((f) => f.gs.length > 1).length,
    callEdges: calls.length, sharedFns: Object.values(mfeat).filter((v) => v.length > 1).length,
    journeys: journeys.length, depEdges: deps.length,
    guideLinks: feats.reduce((s2, f) => s2 + f.gd.length, 0) } };
writeFileSync(join(TOOLS, 'codex-data.json'), JSON.stringify(out));
console.log(JSON.stringify(out.stats));
