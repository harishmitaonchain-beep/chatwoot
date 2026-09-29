// Function-level feature segregation via a conservative static call graph.
// Reads code-map.json (file→feature roots), re-parses Ruby method BODIES,
// resolves calls only where static resolution is trustworthy:
//   * Klass.new(...).meth …chain          → Klass#meth
//   * Klass.static_meth                    → Klass.static_meth
//   * SomeJob.perform_later / perform_async→ SomeJob#perform
//   * bare meth(...) to a sibling def      → same-class #meth
// (lowercase-receiver calls stay unresolved BY DESIGN — prevents the closure
//  from flooding every feature through ubiquitous model calls)
// Then BFS from each feature's root methods (methods of its entry-point
// files) across call edges, recording MIN DEPTH per (feature, method).
// Output: call-graph.json { methods, edges, featureFunctions, stats }
// Usage: node extract-call-graph.mjs
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const TOOLS = dirname(fileURLToPath(import.meta.url));
const REPO = join(TOOLS, '..', '..', '..');
const map = JSON.parse(readFileSync(join(TOOLS, 'code-map.json'), 'utf8'));
const rubyFiles = map.files.filter((f) => f.lang === 'ruby');

// ---------- pass 1: parse defs WITH body ranges ----------
// methods: { id, file, fileIdx, owner, name, static, line, endLine }
const methods = [];
const superOf = new Map(); // 'Ns::Class' -> raw superclass ref
const privateLine = new Map(); // 'Ns::Class' -> first `private` line no
const beforeActions = new Map(); // 'Ns::Class' -> [{syms:[], only:[], except:[]}]
const fileMethods = new Map(); // path -> [methodIdx]
for (let fi = 0; fi < rubyFiles.length; fi++) {
  const f = rubyFiles[fi];
  let src;
  try { src = readFileSync(join(REPO, f.path), 'utf8'); } catch { continue; }
  const lines = src.split('\n');
  const stack = []; // {kind:'ns'|'def', name?, indent, methodIdx?}
  const mine = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*#/.test(line)) continue;
    const indent = line.match(/^\s*/)[0].length;
    let m;
    const popTo = (ind) => {
      while (stack.length && stack[stack.length - 1].indent >= ind) {
        const top = stack.pop();
        if (top.kind === 'def') methods[top.methodIdx].endLine = i; // closed implicitly
      }
    };
    if ((m = line.match(/^\s*(?:class|module)\s+([A-Z][A-Za-z0-9_:]*)(?:\s*<\s*([A-Z][A-Za-z0-9_:]*))?/))) {
      popTo(indent);
      stack.push({ kind: 'ns', name: m[1], indent });
      if (m[2]) {
        const full = stack.filter((sx) => sx.kind === 'ns').map((sx) => sx.name).join('::');
        superOf.set(full, m[2]);
      }
    } else if ((m = line.match(/^\s*def\s+(self\.)?([a-zA-Z0-9_?!=\[\]<>+\-*/%^]+)(.*)$/))) {
      popTo(indent);
      const owner = stack.filter((s) => s.kind === 'ns').map((s) => s.name).join('::') || null;
      const idx = methods.length;
      const endless = /^\s*=/.test(m[3] || '');
      methods.push({ id: idx, file: f.path, fileIdx: fi, owner, name: m[2], static: !!m[1], line: i + 1, endLine: endless ? i + 1 : null });
      mine.push(idx);
      if (!endless) stack.push({ kind: 'def', indent, methodIdx: idx });
    } else if (/^\s*private\s*$/.test(line)) {
      const cls = stack.filter((sx) => sx.kind === 'ns').map((sx) => sx.name).join('::');
      if (cls && !privateLine.has(cls)) privateLine.set(cls, i + 1);
    } else if ((m = line.match(/^\s*(?:prepend_|append_)?before_action\s+(.+)$/))) {
      const cls = stack.filter((sx) => sx.kind === 'ns').map((sx) => sx.name).join('::');
      if (cls) {
        const syms = [...m[1].matchAll(/:(\w+[!?]?)/g)].map((x) => x[1]);
        const listIn = (kw) => {
          const mm2 = m[1].match(new RegExp(kw + ':\\s*(?:%i\\[([^\\]]*)\\]|\\[([^\\]]*)\\])'));
          if (!mm2) return [];
          return (mm2[1] || mm2[2] || '').replace(/[:,]/g, ' ').split(/\s+/).filter(Boolean);
        };
        const only = listIn('only'); const except = listIn('except');
        const guardSyms = syms.filter((x) => !only.includes(x) && !except.includes(x));
        if (guardSyms.length) {
          if (!beforeActions.has(cls)) beforeActions.set(cls, []);
          beforeActions.get(cls).push({ syms: guardSyms, only, except });
        }
      }
    } else if (/^\s*end\b/.test(line)) {
      // close any frame at this exact indent
      while (stack.length && stack[stack.length - 1].indent === indent) {
        const top = stack.pop();
        if (top.kind === 'def') methods[top.methodIdx].endLine = i + 1;
      }
    }
  }
  while (stack.length) { const top = stack.pop(); if (top.kind === 'def') methods[top.methodIdx].endLine = lines.length; }
  fileMethods.set(f.path, mine);
}

// ---------- symbol tables ----------
// (superOf filled during pass 1)
const instByClass = new Map(); // 'Ns::Class' -> Map(name -> methodId)
const statByClass = new Map();
const classSuffix = new Map(); // 'Class' -> Set(full names)
for (const mm of methods) {
  if (!mm.owner) continue;
  const tbl = mm.static ? statByClass : instByClass;
  if (!tbl.has(mm.owner)) tbl.set(mm.owner, new Map());
  if (!tbl.get(mm.owner).has(mm.name)) tbl.get(mm.owner).set(mm.name, mm.id);
  const short = mm.owner.split('::').pop();
  if (!classSuffix.has(short)) classSuffix.set(short, new Set());
  classSuffix.get(short).add(mm.owner);
}
const resolveClass = (name, ns) => {
  if (instByClass.has(name) || statByClass.has(name)) return name;
  if (ns) { // try enclosing namespaces, innermost out
    const parts = ns.split('::');
    for (let k = parts.length; k > 0; k--) {
      const cand = parts.slice(0, k).join('::') + '::' + name;
      if (instByClass.has(cand) || statByClass.has(cand)) return cand;
    }
  }
  const short = name.split('::').pop();
  const set = classSuffix.get(short);
  if (set && set.size === 1) { const only = [...set][0]; if (only.endsWith('::' + name) || only === name) return only; }
  return null;
};

const ancestorsOf = (cls) => {
  const chain = [cls];
  let cur = cls;
  for (let i = 0; i < 8; i++) {
    const raw = superOf.get(cur);
    if (!raw) break;
    const res = resolveClass(raw, cur.includes('::') ? cur.split('::').slice(0, -1).join('::') : null) || raw;
    if (chain.includes(res)) break;
    chain.push(res);
    cur = res;
  }
  return chain;
};
const lookupInst = (cls, name) => { for (const c of ancestorsOf(cls)) { const t = instByClass.get(c); if (t?.has(name)) return t.get(name); } return null; };
const lookupStat = (cls, name) => { for (const c of ancestorsOf(cls)) { const t = statByClass.get(c); if (t?.has(name)) return t.get(name); } return null; };

const srcCache = new Map();
// ---------- pass 1.5: ivar type inference (bounded: single Klass.new assignment per class) ----------
const ivarType = new Map(); // 'Cls@name' -> className (only when unambiguous)
{
  const perKey = new Map(); // 'Cls@name' -> Set(classNames)
  for (const mm of methods) {
    if (!mm.owner || !mm.endLine) continue;
    if (!srcCache.has(mm.file)) srcCache.set(mm.file, readFileSync(join(REPO, mm.file), 'utf8').split('\n'));
    const body = srcCache.get(mm.file).slice(mm.line, mm.endLine - 1).join('\n');
    for (const c of body.matchAll(/@(\w+)\s*(?:\|\|)?=\s*(?:@\w+\s*\|\|\s*)?([A-Z][A-Za-z0-9_:]*)\s*\.\s*new\b/g)) {
      const cls = resolveClass(c[2], mm.owner);
      if (!cls) continue;
      const k = mm.owner + '@' + c[1];
      if (!perKey.has(k)) perKey.set(k, new Set());
      perKey.get(k).add(cls);
    }
  }
  for (const [k, set] of perKey) if (set.size === 1) ivarType.set(k, [...set][0]);
}

// ---------- pass 2: extract call edges from bodies ----------
const edges = []; // [callerId, calleeId, kind] kind: 0=call 1=before_action 2=event
const edgeSet = new Set();
const addEdge = (a, b, kind = 0) => { if (a === b) return; const k = a + '>' + b + '>' + kind; if (!edgeSet.has(k)) { edgeSet.add(k); edges.push([a, b, kind]); } };
let unresolvedClassRefs = 0;

for (const mm of methods) {
  if (!mm.endLine) continue;
  if (!srcCache.has(mm.file)) srcCache.set(mm.file, readFileSync(join(REPO, mm.file), 'utf8').split('\n'));
  const body = srcCache.get(mm.file).slice(mm.line, mm.endLine - 1).join('\n')
    .replace(/#.*$/gm, '').replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/'(?:[^'\\]|\\.)*'/g, "''");
  // 1) Klass.new(...).meth  (chain — first instance call after .new)
  for (const c of body.matchAll(/([A-Z][A-Za-z0-9_:]*)\s*\.\s*new\b[^\n]*?\.\s*([a-z_][a-zA-Z0-9_]*[!?]?)/g)) {
    const cls = resolveClass(c[1], mm.owner);
    const hit = cls && lookupInst(cls, c[2]);
    if (hit != null) addEdge(mm.id, hit);
    else if (!cls) unresolvedClassRefs++;
  }
  // 2) Klass.static  /  Klass.perform_later|perform_async -> #perform
  for (const c of body.matchAll(/([A-Z][A-Za-z0-9_:]*)\s*\.\s*([a-z_][a-zA-Z0-9_]*[!?]?)/g)) {
    if (c[2] === 'new') continue;
    const cls = resolveClass(c[1], mm.owner);
    if (!cls) { unresolvedClassRefs++; continue; }
    if (c[2] === 'perform_later' || c[2] === 'perform_async' || c[2] === 'perform_now') {
      const hit = lookupInst(cls, 'perform');
      if (hit != null) addEdge(mm.id, hit);
    } else {
      const hit = lookupStat(cls, c[2]);
      if (hit != null) addEdge(mm.id, hit);
    }
  }
  // 2b) @ivar.meth where the ivar's type was inferred (single-assignment)
  if (mm.owner) {
    for (const c of body.matchAll(/@(\w+)\s*\.\s*([a-z_][a-zA-Z0-9_]*[!?]?)/g)) {
      const t = ivarType.get(mm.owner + '@' + c[1]);
      if (!t) continue;
      const hit = lookupInst(t, c[2]);
      if (hit != null) addEdge(mm.id, hit);
    }
  }
  // 3a) super → same-named method up the ancestor chain (excluding self's class)
  if (mm.owner && /\bsuper\b/.test(body)) {
    for (const anc of ancestorsOf(mm.owner).slice(1)) {
      const t = instByClass.get(anc);
      if (t?.has(mm.name)) { addEdge(mm.id, t.get(mm.name)); break; }
    }
  }
  // 3b) send/public_send with a LITERAL symbol → precise sibling edge
  if (mm.owner) {
    for (const c of body.matchAll(/(?:public_)?send\(\s*:([a-z_][a-zA-Z0-9_]*[!?]?)/g)) {
      const hit = lookupInst(mm.owner, c[1]);
      if (hit != null) addEdge(mm.id, hit);
    }
    // 3c) send/public_send with a VARIABLE → bounded fan: may dispatch to any of
    // the class's own (+ancestors') instance methods — true for the ActionService
    // action-dispatch pattern; bounded by the class, so no cross-class flooding.
    if (/(?:public_)?send\(\s*[^:)\s]/.test(body)) {
      for (const anc of ancestorsOf(mm.owner)) {
        const t = instByClass.get(anc);
        if (t) for (const [, id] of t) addEdge(mm.id, id);
      }
    }
  }
  // 3) bare sibling calls: name( or self.name — same-class instance defs
  if (mm.owner) {
    for (const c of body.matchAll(/(?<![\w.:@'"])([a-z_][a-zA-Z0-9_]*[!?]?)\s*\(/g)) {
      const hit = lookupInst(mm.owner, c[1]);
      if (hit != null) addEdge(mm.id, hit);
    }
    for (const c of body.matchAll(/\bself\.([a-z_][a-zA-Z0-9_]*[!?]?)/g)) {
      const hit = lookupInst(mm.owner, c[1]) ?? lookupStat(mm.owner, c[1]);
      if (hit != null) addEdge(mm.id, hit);
    }
  }
}

// ---------- pass 2b: before_action edges (with inheritance) ----------
const isPublicAction = (mm) => {
  if (mm.static || !mm.owner) return false;
  const pl = privateLine.get(mm.owner);
  return !(pl && mm.line > pl);
};
for (const mm of methods) {
  if (!isPublicAction(mm) || !mm.owner || !mm.owner.endsWith('Controller')) continue;
  for (const anc of ancestorsOf(mm.owner)) {
    for (const ba of beforeActions.get(anc) || []) {
      if (ba.only.length && !ba.only.includes(mm.name)) continue;
      if (ba.except.length && ba.except.includes(mm.name)) continue;
      for (const sym of ba.syms) {
        const hit = lookupInst(mm.owner, sym);
        if (hit != null) addEdge(mm.id, hit, 1);
      }
    }
  }
}

// ---------- pass 2c: dispatcher event → listener edges ----------
const listenerBySym = new Map(); // 'conversation_created' -> [methodIds]
for (const mm of methods) {
  if (mm.static) continue;
  if (mm.file.includes('/listeners/')) {
    if (!listenerBySym.has(mm.name)) listenerBySym.set(mm.name, []);
    listenerBySym.get(mm.name).push(mm.id);
  }
}
let eventEdges = 0;
for (const mm of methods) {
  if (!mm.endLine) continue;
  const body = srcCache.get(mm.file) ? srcCache.get(mm.file).slice(mm.line, mm.endLine - 1).join('\n') : '';
  for (const c of body.matchAll(/dispatch(?:er)?\s*[.(]\s*(?:dispatch\s*\(\s*)?(?:[A-Za-z_:]+::)?([A-Z][A-Z0-9_]+)/g)) {
    const sym = c[1].toLowerCase();
    for (const lid of listenerBySym.get(sym) || []) { addEdge(mm.id, lid, 2); eventEdges++; }
  }
}

// ---------- pass 3: BFS feature propagation ----------
const out = new Map(); // callerId -> [calleeIds]
for (const [a, b] of edges) { if (!out.has(a)) out.set(a, []); out.get(a).push(b); }
// (kind ignored for propagation — before_action, call, and event edges all carry feature reach)

const featureFns = map.features.map(() => new Map()); // featIdx -> Map(methodId -> depth)
map.features.forEach((feat, fx) => {
  const roots = [];
  for (const f of rubyFiles) {
    const hit = feat.paths.some((p) => f.path === p || f.path.startsWith(p.replace(/\/$/, '') + '/'));
    if (hit) roots.push(...(fileMethods.get(f.path) || []));
  }
  const depth = featureFns[fx];
  let frontier = roots;
  roots.forEach((r) => depth.set(r, 0));
  let d = 0;
  while (frontier.length && d < 6) {
    d++;
    const next = [];
    for (const cur of frontier) for (const cal of out.get(cur) || []) {
      if (!depth.has(cal)) { depth.set(cal, d); next.push(cal); }
    }
    frontier = next;
  }
});

// per-method feature list
const methodFeatures = new Map(); // id -> [[featIdx, depth]]
featureFns.forEach((depths, fx) => {
  for (const [id, d] of depths) {
    if (!methodFeatures.has(id)) methodFeatures.set(id, []);
    methodFeatures.get(id).push([fx, d]);
  }
});

const shared = [...methodFeatures.values()].filter((v) => v.length > 1).length;
const stats = {
  methods: methods.length, callEdges: edges.length,
  methodsWithFeature: methodFeatures.size, sharedByMultipleFeatures: shared,
  reachedBeyondEntryFiles: [...methodFeatures.values()].filter((v) => v.some((x) => x[1] > 0)).length,
  beforeActionEdges: edges.filter((e) => e[2] === 1).length,
  eventEdges: edges.filter((e) => e[2] === 2).length,
  unresolvedClassRefs,
};

writeFileSync(join(TOOLS, 'call-graph.json'), JSON.stringify({
  generated: new Date().toISOString().slice(0, 10), stats,
  methods: methods.map((mm) => ({ id: mm.id, file: mm.file, owner: mm.owner, name: mm.name, static: mm.static, line: mm.line,
    pub: isPublicAction(mm) ? 1 : 0,
    f: methodFeatures.get(mm.id) || [] })),
  edges,
  featureNames: map.features.map((f) => f.name),
}));
console.log(JSON.stringify(stats, null, 2));
