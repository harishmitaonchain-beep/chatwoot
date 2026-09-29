#!/usr/bin/env node
// label-check: verify bold UI labels in doc drafts against the app's English i18n strings.
// Usage: node label-check.mjs <draft.md|dir> [more...]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..'); // .claude/docs-harness/bin -> repo root
const LOCALE = join(REPO, 'app/javascript/dashboard/i18n/locale/en');

// bold spans that are pattern/meta words, not UI labels
const SKIP = new Set(['on screen','voiceover','plan & access','discover','set up & try',
  'get value','troubleshoot','must include','test it','review notes','confirm',
  'before you record','prerequisites','good practice','symptom','likely cause']);

function collect(obj, out){ for(const v of Object.values(obj)){ if(typeof v==='string') out.add(v.trim()); else if(v&&typeof v==='object') collect(v,out); } }
function loadStrings(){ const out=new Set(); for(const f of readdirSync(LOCALE)){ if(!f.endsWith('.json')) continue; try{ collect(JSON.parse(readFileSync(join(LOCALE,f),'utf8')), out); }catch(e){ console.error('skip',f,e.message); } } return out; }
function norm(s){ return s.replace(/[:.\s]+$/,'').trim(); }
function isLabel(raw){ const t=norm(raw); if(!t) return false; if(SKIP.has(t.toLowerCase())) return false; if(t.split(/\s+/).length>6) return false; if(/[.!?]$/.test(raw.trim())) return false; return true; }
function labelsIn(md){ const set=new Set(); const re=/\*\*(.+?)\*\*/g; let m; while((m=re.exec(md))){ if(isLabel(m[1])) set.add(norm(m[1])); } return [...set]; }
function matches(label, lower){ const l=label.toLowerCase(); if(lower.has(l)) return true; for(const v of lower){ if(v.includes(l)) return true; } return false; }
function files(args){ const out=[]; for(const a of args){ const p=resolve(a); if(statSync(p).isDirectory()){ for(const f of readdirSync(p)) if(f.endsWith('.md')) out.push(join(p,f)); } else out.push(p);} return out; }

const args=process.argv.slice(2);
if(!args.length){ console.error('usage: node label-check.mjs <draft.md|dir> [more...]'); process.exit(1); }
const values=loadStrings();
const lower=new Set([...values].map(s=>s.toLowerCase()));
console.log(`Loaded ${values.size} UI strings from en/`);
let flagged=0;
for(const f of files(args)){
  let md; try{ md=readFileSync(f,'utf8'); }catch{ console.error('cannot read',f); continue; }
  const missing=labelsIn(md).filter(l=>!matches(l,lower));
  console.log(`\n== ${f} ==`);
  if(!missing.length) console.log('  all bold labels found in current UI strings');
  else for(const l of missing){ console.log(`  NOT FOUND: "${l}"`); flagged++; }
}
console.log(`\n${flagged} label(s) to review. Some bold spans are prose emphasis, not UI labels; judge each.`);
