#!/usr/bin/env node
// gap-report: list unresolved Confirm markers, [Link: ...] placeholders, and screenshot markers per page.
// Usage: node gap-report.mjs <draft.md|dir> [more...]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
function files(args){ const out=[]; for(const a of args){ const p=resolve(a); if(statSync(p).isDirectory()){ for(const f of readdirSync(p)) if(f.endsWith('.md')) out.push(join(p,f)); } else out.push(p);} return out; }
const args=process.argv.slice(2);
if(!args.length){ console.error('usage: node gap-report.mjs <draft.md|dir> [more...]'); process.exit(1); }
const totals={confirm:0,link:0,shot:0};
for(const f of files(args)){
  const lines=readFileSync(f,'utf8').split('\n');
  const hits={confirm:[],link:[],shot:[]};
  lines.forEach((ln,i)=>{ const n=i+1;
    if(/⚠️\s*Confirm/.test(ln)) hits.confirm.push(`${n}: ${ln.trim()}`);
    (ln.match(/\[Link:[^\]]*\]/g)||[]).forEach(x=>hits.link.push(`${n}: ${x}`));
    if(ln.includes('📸')) hits.shot.push(`${n}: ${ln.trim()}`);
  });
  console.log(`\n== ${f} ==`);
  console.log(`  Confirm: ${hits.confirm.length}  Links-todo: ${hits.link.length}  Screenshots: ${hits.shot.length}`);
  for(const k of ['confirm','link','shot']) for(const h of hits[k]) console.log('   - '+h);
  totals.confirm+=hits.confirm.length; totals.link+=hits.link.length; totals.shot+=hits.shot.length;
}
console.log(`\nTOTAL  Confirm: ${totals.confirm}  Links-todo: ${totals.link}  Screenshots: ${totals.shot}`);
