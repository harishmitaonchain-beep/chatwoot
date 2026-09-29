#!/usr/bin/env node
// inventory-refresh: crawl the user guide index and list article links.
// Usage: node inventory-refresh.mjs [indexUrl]
const url=process.argv[2]||'https://chatwoot.help/hc/user-guide/en';
let html; try{ html=await (await fetch(url)).text(); }catch(e){ console.error('fetch failed (network/allowlist?):',e.message); process.exit(2); }
const links=[...html.matchAll(/href="([^"]*\/articles\/[^"]+)"/g)].map(m=>m[1]);
const uniq=[...new Set(links)].map(l=>l.startsWith('http')?l:new URL(l,url).href);
console.log(`Found ${uniq.length} article links at ${url}`);
for(const l of uniq) console.log('  '+l);
console.log('\n(Adjust the selector if the help center markup changes.)');
