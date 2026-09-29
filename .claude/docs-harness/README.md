# Chatwoot docs harness

**Output goes to Notion only.** The flow is Claude Code (in Cursor) to Notion. Nothing new is saved in this folder; `state/` is read-only reference. Destination and rules: `notion.md`.

Applies the documentation revamp method to the customer-facing user guide
(chatwoot.help/hc/user-guide). Separate from the support harness: own folder,
own skills, own state. The only link between them is one-way: support may write
doc gaps somewhere this side reads. No shared scripts or state.

Scope: the user guide only. The developer docs (developers.chatwoot.com) are a
different platform and owner and are never touched.

## Pieces

| Skill (verb) | Step it runs |
|---|---|
| `/docs-inventory` | Read every live article, record what each covers |
| `/docs-restructure` | Decide the new shape, maintain the old-to-new map |
| `/docs-journey-plan` | Per feature: gather scattered articles, decide the page set and scope |
| `/docs-page-write` | Write one page to the pattern |
| `/docs-questions` | Collect open questions, apply team answers everywhere |
| `/docs-publish` | Strip review notes, final checks, hand over |

`docs-verifier` agent (`.claude/agents/docs-verifier.md`) checks every claim
against code, live articles, and the pricing page.

## Scripts (bin/)

Run with node (v22 present). Paths assume repo root two levels up.

- `label-check.mjs` (build/use first): pull bold UI labels from a draft, verify
  against `app/javascript/dashboard/i18n/locale/en/*.json`, report labels that no
  longer exist. Catches most of the drift found by hand.
- `gap-report.mjs`: unresolved `⚠️ Confirm:`, `[Link: ...]` placeholders, and
  `📸` screenshot markers per page.
- `staleness.mjs`: compare the commit each page was verified against with git
  history of its source files; flag pages whose sources changed.
- `article-diff.mjs`: a draft versus the live article text.
- `inventory-refresh.mjs`: crawl the guide index, refresh the inventory.
- `screenshots.md`: plan and stub for the Playwright capture script.

## State (state/)

- `decisions.md` : the method, naming, and rules.
- `team-answers.md` : answers from the team, dated.
- `open-questions.md` : unresolved questions, blocking vs not.
- `doc-map.md` : old article to new page mapping.
- `INDEX.md` : every draft across areas, with state and last-verified commit.
- `inventory.md` : all 140 live articles and what each covers (2026-09-16).
- `restructure.md` : the target structure (15 sections) and where each old article goes.

## Notes

- Public sources only for facts (repo, help center, pricing page). Re-verify
  against the connected checkout; it may be on a different branch or version.
- Follows the same skill and agent format as the rest of `.claude/`.
