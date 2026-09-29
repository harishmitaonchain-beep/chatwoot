---
name: wiki
description: Maintain and navigate the AI documentation vault at .claude/ai-wiki/ — check sync state vs develop, update stale pages, add new pages, or run the full coverage audit. Use for "update the wiki", "is the wiki stale", "document <area>", or after the SessionStart hook reports staleness.
---

# Maintain the AI wiki

You are operating the documentation vault at `.claude/ai-wiki/` (repo: /Users/sharma/Downloads/workspace/chatwoot). The operating rules live in `.claude/ai-wiki/00-meta/harness.md` — read it first if you haven't this session. Non-negotiables that apply to every mode below: verify against actual code before asserting; never force a link or gap-closure; track `develop` only; multi-agent `Workflow` needs the user's fresh explicit opt-in in this turn; keep page basenames unique vault-wide.

Pick the mode from the user's ask (default: **status**).

## status (no args / "is it stale?")
Run `./.claude/ai-wiki/check-sync.sh` and report: in-sync line, or the affected-pages + uncovered-files lists with a recommendation (update now vs defer). Nothing else.

## update (stale pages flagged)
1. Run `check-sync.sh`; collect the unique affected pages and the uncovered-files list.
2. For each affected page, spawn the `wiki-updater` agent (one page per agent, parallel when independent) with: the page's vault path, the changed repo files relevant to it, and the develop commit range from the report.
3. Uncovered files under `app/`, `lib/`, or `enterprise/`: decide — extend an existing page (only if it genuinely covers that subject), add a new page (see **add**), or record in `00-meta/deepwiki-crosscheck.md`'s follow-ups. Specs/locales/migrations usually need nothing.
4. Spot-check one updated page against the code before trusting the batch.
5. Run `./.claude/ai-wiki/mark-synced.sh`, then regenerate the Atlas if pages were added/removed (procedure in harness.md §"Regenerating the Atlas graph").

## add ("document <topic/path>")
Follow harness.md §"Adding a brand-new page" exactly: the page template, then the full wiring checklist (README bullet, path-index rows, deepwiki-crosscheck row, external-docs row if a help_url exists, Atlas regen). Use the `wiki-updater` agent to write the page; do the wiring yourself. Run the link audit (`node .claude/ai-wiki/tools/extract-graph.mjs` reports counts; dead links = a target basename that matches no page) before finishing.

## audit ("full audit" / "coverage check")
The disk-level completeness audit: enumerate every `app/*`, top-level `lib/*`, and `enterprise/app/*` directory; diff against path-index.md's path column; anything unmapped is a candidate gap. Present findings first. If closing them needs multi-page generation, ASK the user before reaching for `Workflow` — a saved script exists at `.claude/workflows/wiki-refresh.js` for exactly this, but running it requires their explicit go-ahead in this turn.
