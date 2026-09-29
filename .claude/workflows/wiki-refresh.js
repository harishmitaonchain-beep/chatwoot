export const meta = {
  name: 'wiki-refresh',
  description: 'Regenerate or update a given list of AI-wiki vault pages in parallel via wiki-updater agents',
  whenToUse: 'Only with the user\'s explicit go-ahead in the current turn (harness rule 5). Pass args={pages:[...]} — never run for a single page (use a direct wiki-updater Agent call instead).',
  phases: [{ title: 'Document' }],
}

// args: { pages: [{ vault: '02-backend/foo.md', title: 'Foo', paths: ['app/foo'], focus?: 'optional extra instruction' }, ...] }
// Each page is written/updated by the wiki-updater custom agent (conventions live in .claude/agents/wiki-updater.md).
// The orchestrating session still owns the wiring pass afterwards: README, path-index, crosscheck, external-docs, Atlas, mark-synced.

const VAULT = '/Users/sharma/Downloads/workspace/chatwoot/.claude/ai-wiki'

if (!args || !Array.isArray(args.pages) || args.pages.length === 0) {
  throw new Error('wiki-refresh requires args.pages: [{vault, title, paths, focus?}, ...]')
}
if (args.pages.length === 1) {
  throw new Error('One page does not need a workflow — spawn the wiki-updater agent directly.')
}

phase('Document')
const results = await parallel(args.pages.map((p) => () =>
  agent(
    `Target page: ${VAULT}/${p.vault} (title: "${p.title}").\n` +
    `Repo paths to investigate: ${JSON.stringify(p.paths)}.\n` +
    (p.focus ? `Focus: ${p.focus}\n` : '') +
    `If the page exists, this is an UPDATE (read it first, change only what the code invalidates); otherwise write it fresh per the template. Follow your agent instructions exactly.`,
    { label: p.vault.split('/').pop(), phase: 'Document', agentType: 'wiki-updater' }
  )
))

const done = results.filter(Boolean)
log(`${done.length}/${args.pages.length} pages written/updated`)
return {
  completed: done.length,
  requested: args.pages.length,
  summaries: done,
  reminder: 'Wiring pass still required: README bullets, path-index rows, deepwiki-crosscheck, external-docs, Atlas regen (tools/extract-graph.mjs), link audit, then mark-synced.sh.',
}
