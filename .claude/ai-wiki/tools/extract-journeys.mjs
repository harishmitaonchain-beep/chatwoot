// Builds the JOURNEY layer: route → controller action → gates (before_action
// chain incl. Pundit authorize + feature-flag checks) → the full downstream
// chain (services, jobs, dispatched events → listeners) via the call graph.
// Inputs: routes.txt (authoritative `rails routes` dump), call-graph.json,
//         code-map.json. Output: journeys.json.
// Regen order: extract-code-map → extract-call-graph → this → codex-data.
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const REPO = join(TOOLS, '..', '..', '..');
const cg = JSON.parse(readFileSync(join(TOOLS, 'call-graph.json'), 'utf8'));
const map = JSON.parse(readFileSync(join(TOOLS, 'code-map.json'), 'utf8'));

// ---- method lookup: 'Class#action' -> cg method ----
const byOwnerName = new Map();
for (const m of cg.methods) {
  if (m.static || !m.owner) continue;
  const k = m.owner + '#' + m.name;
  if (!byOwnerName.has(k)) byOwnerName.set(k, m);
}
const byId = new Map(cg.methods.map((m) => [m.id, m]));
const out = new Map();
for (const [a, b, k] of cg.edges) { if (!out.has(a)) out.set(a, []); out.get(a).push([b, k]); }

// file -> map entry (for flags/tier/pages per hop)
const fileEntry = new Map(map.files.map((f) => [f.path, f]));

const camelize = (s) => s.split(/[\/_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
const controllerClass = (spec) => spec.split('/').map((seg) => camelize(seg)).join('::') + 'Controller';

// ---- parse routes.txt ----
const SKIP = /^(rails|active_storage|action_mailbox|turbo|sidekiq|letter_opener|\/rails)/;
const routes = [];
for (const line of readFileSync(join(TOOLS, 'routes.txt'), 'utf8').split('\n')) {
  const m = line.match(/\s(GET|POST|PUT|PATCH|DELETE)\s+(\S+)\s+([a-z0-9_\/]+)#(\w+)/);
  if (!m) continue;
  const [, verb, path, ctrl, action] = m;
  if (SKIP.test(ctrl) || path.startsWith('/rails/')) continue;
  routes.push({ verb, path: path.replace('(.:format)', ''), ctrl, action });
}

// ---- per-route journey ----
const srcCache = new Map();
const bodyOf = (m) => {
  if (!m) return '';
  if (!srcCache.has(m.file)) { try { srcCache.set(m.file, readFileSync(join(REPO, m.file), 'utf8').split('\n')); } catch { srcCache.set(m.file, []); } }
  const lines = srcCache.get(m.file);
  // body may be short; take up to 40 lines after def as a safe window
  return lines.slice(m.line - 1, m.line + 40).join('\n');
};

const journeys = [];
let matched = 0, unmatched = 0;
for (const r of routes) {
  const cls = controllerClass(r.ctrl);
  const action = byOwnerName.get(cls + '#' + r.action);
  if (!action) { unmatched++; journeys.push({ v: r.verb, p: r.path, ctrl: cls, act: r.action, miss: 1 }); continue; }
  matched++;

  // gates: before_action targets (kind-1 edges) + scan their bodies + action body
  const guards = (out.get(action.id) || []).filter(([, k]) => k === 1).map(([b]) => b);
  const scanIds = [action.id, ...guards];
  const az = new Set(), ff = new Set();
  for (const id of scanIds) {
    const body = bodyOf(byId.get(id));
    for (const c of body.matchAll(/\bauthorize[!]?\s*[\( ]\s*[@:\w\[\]. ]*?,?\s*:(\w+\?)/g)) az.add(c[1]);
    for (const c of body.matchAll(/feature_enabled\?\(\s*['"]?(\w+)/g)) ff.add(c[1]);
    for (const c of body.matchAll(/\bpolicy\(([^)]*)\)\.(\w+\?)/g)) az.add(c[2]);
  }
  const entry = fileEntry.get(action.file);

  // chain: BFS over ALL edge kinds, depth<=4, cap 60
  const chain = [];
  const seen = new Set([action.id]);
  let frontier = [[action.id, 0]];
  let truncated = 0;
  while (frontier.length) {
    const next = [];
    for (const [cur, d] of frontier) {
      for (const [cal, k] of out.get(cur) || []) {
        if (seen.has(cal)) continue;
        seen.add(cal);
        if (d + 1 > 4 || chain.length >= 60) { truncated++; continue; }
        chain.push([cal, d + 1, k]);
        next.push([cal, d + 1]);
      }
    }
    frontier = next;
  }

  journeys.push({
    v: r.verb, p: r.path, ctrl: cls, act: r.action, gid: action.id,
    g: { ba: guards, az: [...az], ff: [...ff], tier: entry?.tier || null, feats: entry?.features || [] },
    ch: chain, tr: truncated || undefined,
  });
}

const stats = {
  routes: routes.length, matchedToActions: matched, unmatchedActions: unmatched,
  withPolicyGate: journeys.filter((j) => j.g?.az?.length).length,
  withFlagGate: journeys.filter((j) => j.g?.ff?.length).length,
  withGuards: journeys.filter((j) => j.g?.ba?.length).length,
  avgChain: Math.round(journeys.filter((j) => j.ch).reduce((s, j) => s + j.ch.length, 0) / Math.max(matched, 1)),
};
writeFileSync(join(TOOLS, 'journeys.json'), JSON.stringify({ generated: new Date().toISOString().slice(0, 10), stats, journeys }));
console.log(JSON.stringify(stats, null, 2));
