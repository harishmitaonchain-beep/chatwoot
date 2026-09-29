#!/usr/bin/env node
// article-diff: quick divergence signal between a local draft and the live article.
// Usage: node article-diff.mjs <draft.md> <live-url>
import { readFileSync } from 'node:fs';
const [,,draftPath,url]=process.argv;
if(!draftPath||!url){ console.error('usage: node article-diff.mjs <draft.md> <live-url>'); process.exit(1); }
const draft=readFileSync(draftPath,'utf8');
let html; try{ html=await (await fetch(url)).text(); }catch(e){ console.error('fetch failed (network/allowlist?):',e.message); process.exit(2); }
const text=html.replace(/<script[\s\S]*?<\/script>/g,' ').replace(/<style[\s\S]*?<\/style>/g,' ').replace(/<[^>]+>/g,' ').replace(/&[a-z]+;/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
const headings=[...draft.matchAll(/^#{1,4}\s+(.+)$/gm)].map(m=>m[1].replace(/[*_`]/g,'').trim());
console.log('Live text length:',text.length,'chars');
console.log('\nDraft headings present in live article?');
for(const h of headings) console.log(`  ${text.includes(h.toLowerCase())?'yes':'NO '}  ${h}`);
console.log('\n(Heuristic quick check, not a full diff.)');
