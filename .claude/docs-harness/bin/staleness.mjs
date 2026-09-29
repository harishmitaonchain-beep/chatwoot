#!/usr/bin/env node
// staleness: flag pages whose source files changed since the commit they were verified against.
// Reads ../state/staleness.json: { "page-id": { "verified_commit": "<sha>", "sources": ["app/..."] } }
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
const HERE=dirname(fileURLToPath(import.meta.url));
const REPO=resolve(HERE,'..','..','..');
const STATE=join(HERE,'..','state','staleness.json');
if(!existsSync(STATE)){
  writeFileSync(STATE, JSON.stringify({ "example-page": { verified_commit:"<sha>", sources:["app/javascript/dashboard/i18n/locale/en/campaign.json"] } }, null, 2));
  console.log('Created template', STATE, '- fill it in and re-run.'); process.exit(0);
}
const map=JSON.parse(readFileSync(STATE,'utf8'));
let stale=0;
for(const [page,cfg] of Object.entries(map)){
  if(!cfg.verified_commit || String(cfg.verified_commit).startsWith('<')){ console.log(`?     ${page}: no verified_commit set`); continue; }
  try{
    const srcs=(cfg.sources||[]).map(s=>`"${s}"`).join(' ');
    const out=execSync(`git -C "${REPO}" log --oneline ${cfg.verified_commit}..HEAD -- ${srcs}`,{encoding:'utf8'}).trim();
    if(out){ console.log(`STALE ${page}: sources changed since ${cfg.verified_commit}`); out.split('\n').forEach(l=>console.log('   '+l)); stale++; }
    else console.log(`ok    ${page}`);
  }catch(e){ console.log(`err   ${page}: ${e.message.split('\n')[0]}`); }
}
console.log(`\n${stale} page(s) stale.`);
