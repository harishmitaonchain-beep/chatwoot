---
title: "Harness Operating Guide"
tags: [chatwoot, meta, harness]
generated: 2026-08-17
---

# Harness Operating Guide

The entry point for every piece of AI-facing scaffolding in this repo — and the statement of what this harness *is for*. It is the **single context layer for the codebase and the business**: one brain, used three ways:

1. **Build** — navigate and modify the code for new features ([[feature-development-playbook]] operationalizes this).
2. **Discuss** — reason about the product with receipts: what exists ([[feature-index]]), how it's monetized ([[plan-tiers-billing]]), what's promised publicly ([[external-docs]]), and where it hurts ([[product-signals]]).
3. **Decide** — support product decisions from evidence; the customer-signal layer ([[product-signals]] + the support-harness case store) exists for this and is designed to absorb exported customer-support data when it arrives (see Part 4).

If you're an AI agent (or a human) starting work here and don't know what's available, read this first — it tells you what exists, when to reach for which piece, and how each piece stays trustworthy over time.

Everything described here except `CLAUDE.md` itself lives under `.claude/`, which is entirely gitignored — none of it is visible to teammates, PRs, or CI. That's deliberate: it's local operating infrastructure, not a deliverable.

## The map

| Path | What | Tracked in git? |
|---|---|---|
| `CLAUDE.md` (repo root) | Coding conventions, build/test/lint commands, commit style, PR format | **Committed** — shared with the team |
| `CLAUDE.local.md` (repo root) | Local pointer into everything below | Gitignored |
| `.claude/ai-wiki/` | This documentation vault — what the code *is* and how it's organized | Gitignored |
| `.claude/support-harness/`, `.claude/skills/solve-customer-issue/`, `.claude/agents/cw-*.md`, `.claude/workflows/customer-issue-sweep.js` | Customer-issue investigation harness — live account data + code, correlated (no production-log track) | Gitignored |
| `.claude/settings.local.json` | Hooks — currently: the ai-wiki staleness check on session start | Gitignored |
| `.claude/worktrees/` | Per-task worktree scratch space (see CLAUDE.md's Codex Worktree Workflow) | Gitignored |
| `~/.claude/projects/<this-project>/memory/` | Cross-session auto-memory — investigative findings, user preferences, project state | Outside the repo entirely |

## The active layer (verbs)

The vault is the knowledge; these are the levers that act on it — all registered with Claude Code's native machinery, so they're self-advertising in every session:

| Lever | What it does |
|---|---|
| `/wiki` skill (`.claude/skills/wiki/`) | Maintain the vault: status, update stale pages, add pages, full coverage audit |
| `/new-feature` skill (`.claude/skills/new-feature/`) | Build a feature end-to-end via [[feature-development-playbook]] |
| `/product-brain` skill (`.claude/skills/product-brain/`) | Product discussion/decision with receipts via [[product-signals]] |
| `/solve-customer-issue` skill | Customer debugging (Part 2's harness) |
| `wiki-updater` agent (`.claude/agents/wiki-updater.md`) | Writes/updates exactly one vault page under the vault's verification bar — the unit of all doc updates |
| `wiki-refresh` workflow (`.claude/workflows/wiki-refresh.js`) | Parallel multi-page regeneration via wiki-updater agents — exists so full refreshes are executable, but **running it still requires the user's fresh opt-in** (rule 5) |
| SessionStart hook (`.claude/settings.local.json`) | Injects harness pointer + sync state at every session start — including the `resume` and `compact` variants, so the brain pointer survives compaction |
| Statusline (`.claude/statusline.sh`) | Persistent `🧠 wiki ✓ / wiki ⚠ stale(N)` heartbeat in the terminal footer |
| biz-doc guard hook (`.claude/hooks/guard-biz-doc.sh`) | PreToolUse: blocks any `git commit`/`git push` that would carry `# biz-doc:` annotation lines — the in-tree comments ([[code-map]]) can never leak into history |
| Chatwoot Codex (artifact) | Iterable visual explorer of the code↔business graph — pages/features → files → functions: <https://claude.ai/code/artifact/86f827f7-db9e-4108-8b21-a441490547c4> |
| `@import` in `CLAUDE.local.md` | This whole guide is imported into context each session (`@.claude/ai-wiki/00-meta/harness.md`) |

Four systems, four different jobs. Don't reach for the wrong one:

- **"What does this code do and how does it fit together?"** → this vault (Part 1)
- **"A customer reported X, what's actually happening on their account?"** → the support harness (Part 2)
- **"Have I hit this exact problem/decision before in a past session?"** → auto-memory (Part 3)
- **"How do I build/test/lint/commit, and what's the code style?"** → `CLAUDE.md` (unmodified, not duplicated here)

---

## Part 1 — The documentation vault (`.claude/ai-wiki/`)

### What it is

A ~50-page, cross-linked Markdown vault (Obsidian-compatible; open `.claude/ai-wiki/` as the vault root) documenting the whole codebase — Rails OSS backend, Vue 3 dashboard/widget frontend, the `enterprise/` overlay, `lib/`, and Chatwoot Cloud's plan-tier billing. Every page is grounded in code actually read at generation time, cross-checked against the official user guide and a third-party AI wiki (DeepWiki) as coverage checklists — not templated from directory names. Full provenance: [[how-this-was-built]].

It is a **snapshot**, not a live view, and it tracks `develop` specifically — never whatever feature branch is checked out.

### Structure

```
.claude/ai-wiki/
├── README.md                    map of content, browse by product area
├── 00-meta/
│   ├── harness.md               ← you are here
│   ├── ai-agent-guide.md        task → page quick routing table
│   ├── path-index.md            repo path → page, deterministic lookup
│   ├── glossary.md              Chatwoot-specific jargon (BSUID, episode, ...)
│   ├── external-docs.md         map to user guide / developer docs / pricing,
│   │                            incl. the doc URLs the codebase itself embeds
│   ├── feature-index.md         54 product features → verified code entry points
│   ├── feature-development-playbook.md   the anatomy of ADDING a feature, in build order
│   ├── product-signals.md       product-brain layer: friction themes, promised-vs-built
│   ├── deepwiki-crosscheck.md   honest list of what ISN'T covered yet
│   ├── how-this-was-built.md    provenance, trust level, generation history
│   └── .sync-state.json         machine state — don't hand-edit
├── 01-architecture/             schema, routing, app-wide config
├── 02-backend/                  Rails models/services/jobs/controllers
├── 03-channels/                 WhatsApp, email, Facebook/IG, webhooks, ...
├── 04-frontend/                 Vue dashboard, widget, build system
├── 05-enterprise/               enterprise/ overlay, billing/plan tiers
├── tools/
│   └── extract-graph.mjs        rebuilds the Atlas graph data from wikilinks
├── check-sync.sh                staleness detector (see Updating, below)
└── mark-synced.sh               bump sync state after a manual update
```

A companion visual — an interactive force-directed graph of every page and its cross-links — is published as the **Chatwoot Atlas** artifact: <https://claude.ai/code/artifact/aa0feb85-dc5b-4102-a4f9-5de993193e22>. Regeneration procedure is below.

### How to use it — by need

| You need... | Go to |
|---|---|
| Orientation before touching an unfamiliar area, task-shaped | [[ai-agent-guide]] |
| You already know the file/directory path | [[path-index]] |
| An unfamiliar term (BSUID, episode, display_id, ...) | [[glossary]] |
| Browsing by product area / general map | [[README]] |
| Visual exploration of how subsystems connect | Chatwoot Atlas (URL above) |
| "Is this feature gated behind a plan tier?" | [[plan-tiers-billing]] |
| "What's NOT documented yet?" | [[deepwiki-crosscheck]] |
| "Which code implements product feature X?" (business → code) | [[feature-index]] — 54 features → verified entry points, flags, plan tiers |
| Function-level graph queries (method ↔ feature ↔ doc, either direction) | [[code-map]] — `jq` over `tools/code-map.json` (8.6k methods) |
| Building a new feature end-to-end | [[feature-development-playbook]] — the anatomy in build order, incl. the taught review standards |
| A product discussion — "should we build/change X?" | [[product-signals]] — friction themes with case-store receipts, plus the 5-step discussion recipe |
| A narrative overview before diving into any specific page | [[overview]] |
| The official public doc for a feature (user guide, developer docs, pricing) | [[external-docs]] — includes the `help_url`s the codebase itself declares |
| The exact user-guide article for a capability | [[user-guide-index]] — 140 articles → capability nodes; also 📖 chips on Codex capability cards |
| Self-hosted deployment/config/env-vars (canonical source, linked not duplicated) | [[external-docs]] → `/Users/tanmay-chatwoot/workspace/docs` / developers.chatwoot.com |
| Product/business framing of a technical area | Each page's own "Product Behavior" section |

General approach for any task: read the relevant page(s) *before* opening source files — they name the key classes/services and how they connect, so you spend less time re-deriving structure by grepping cold. Cross-check the matching OSS and Enterprise pages together whenever a feature might be Enterprise-extended (billing, SLAs, custom roles, capacity assignment, Captain, calling) — Enterprise rarely forks OSS files, it `prepend_mod_with`/`include_mod_with`s into them.

### How it gets updated

**1. Automatic staleness detection (passive, always on).** A `SessionStart` hook in `.claude/settings.local.json` runs `check-sync.sh` at the start of every session in this repo. It compares `.sync-state.json`'s recorded `develop` commit against `develop`'s current tip:

- If unchanged: prints "in sync," no action needed.
- If `develop` moved: diffs the two commits, prefix-matches every changed file against [[path-index]], and reports **(a)** which pages are now potentially stale and **(b)** which changed files match *no* page at all — candidate new gaps, not just stale pages. Both lists matter; (b) is how the `enterprise/app/builders` gap was found.
- If `develop` was rebased/force-pushed past the stored commit: says so explicitly rather than producing a misleading diff.

This **only** tracks `develop`. Working on a feature branch, however large the diff, never marks the vault stale — that's intentional, so the vault stays anchored to the stable mainline rather than perturbed by every in-flight experiment.

**2. Manual incremental update (the normal path, once staleness is flagged — `/wiki update` runs this).**

1. Read the staleness report — it names the affected pages by title and lists uncovered files separately.
2. For each affected page, spawn the **`wiki-updater` agent** (one page per agent; parallel when independent) — its definition at `.claude/agents/wiki-updater.md` carries the template, verification bar, and linking rules, so the prompt only needs the target page, the changed paths, and the commit range.
3. Spot-check at least one updated page for accuracy before trusting it.
4. Run `mark-synced.sh` to bump `.sync-state.json` to `develop`'s new tip.
5. Files in the "uncovered" list mean the change touched something with no existing page. Don't force it into an unrelated page — see "Adding a new page" below, or record it in [[deepwiki-crosscheck]]'s follow-up list if it's not worth a page yet.

**3. Full re-audit (rare, deliberate — not the default response to a staleness flag).** Warranted when: a major refactor moved code across many directories, a new top-level directory appeared that isn't in [[path-index]] at all, or enough time has passed that incremental patching risks missing structural drift. Procedure: re-run the disk-level completeness audit pattern — enumerate every `app/*` and top-level `lib/*` directory, diff against [[path-index]]'s path column, treat anything unmapped as a candidate gap. Multi-agent `Workflow` orchestration is appropriate here given the fan-out, **but requires the user's fresh, explicit opt-in in that turn** — a stale-vault notification from the hook is not consent, and past consent from an earlier session doesn't carry forward.

**4. Adding a brand-new page.** Follow the template every existing page uses:

```markdown
---
title: "..."
tags: [chatwoot, <backend|frontend|enterprise|infra|meta>, ...]
generated: YYYY-MM-DD
deepwiki_section: "<match or null>"
---
## Purpose
## Key Files & Classes
## How It Fits Together
## Product Behavior        (omit if genuinely not applicable — don't force it)
## Notes for AI Agents
## Related
```

Then, every one of these needs touching — a page that exists but isn't indexed is as good as invisible:

- [ ] `README.md` — add a bullet under the right section
- [ ] [[path-index]] — add a row for every repo path the page covers (basenames must stay unique vault-wide; Obsidian resolves wikilinks by filename)
- [ ] [[deepwiki-crosscheck]] — update the relevant row if this closes a listed gap
- [ ] [[external-docs]] — add a row if the page's subject has an official public doc (check `features.yml` `help_url` and the developer docs repo first)
- [ ] Chatwoot Atlas — regenerate and republish (next section)
- [ ] Auto-memory — only if something here is worth remembering across sessions, not as a matter of course

**5. Regenerating the Atlas graph.** Self-contained; no session context needed:

```bash
node .claude/ai-wiki/tools/extract-graph.mjs   # writes graph-data.json + graph-data.compact.json next to itself
```

Then splice `graph-data.compact.json` into the Atlas HTML's single `var DATA = ...;` line and republish to the same artifact URL (pass the URL above as `url` when publishing from a different conversation, or reuse the same file path from the original one). Validate the spliced file's `<script>` parses (`new Function(...)`) and load it in a browser before republishing — a malformed splice is the historical failure mode here.

### Non-negotiable rules

1. **Never assert something you haven't verified against actual code.** Same bar as the original generation — sampling intelligently is fine, guessing is not.
2. **Never force a cross-link or a gap-closure that isn't real.** The vault's credibility comes from admitting what it doesn't cover ([[deepwiki-crosscheck]] exists specifically to keep this honest) — a false "Covered" is worse than an honest "Not yet covered."
3. **Trust the code over the vault when they conflict.** Fix the vault if the discrepancy is structural; if it's small (a renamed method, a moved file), just proceed and don't let doc upkeep block the actual task.
4. **Keep it local.** Never point the shared, committed `CLAUDE.md` at this vault — it doesn't exist on teammates' machines or in CI. The pointer belongs in `CLAUDE.local.md` only.
5. **`Workflow` multi-agent orchestration always needs a fresh, explicit user opt-in in that turn.** A staleness notification, an old conversation's consent, or "this seems big" are not substitutes for asking.
6. **Track `develop` only.** Never treat feature-branch churn as vault staleness, and never bump `.sync-state.json` to anything other than `develop`'s tip.
7. **Keep basenames unique.** Obsidian resolves `[[name]]` by filename across the whole vault; two pages with the same basename make every link to that name ambiguous. Check before naming a new page.

---

## Part 2 — The customer-issue support harness

Separate system, separate job: debugging a live Chatwoot Cloud customer issue by correlating live account data (Chatwoot API + Meta Graph) with the codebase, with case memory so solved issues accelerate future ones. It is operated from the **support desk** — an agent-role API token, no production logs, no console, no writes — so it ends in a customer reply draft plus an escalation packet rather than a patch. Fully documented in its own `.claude/support-harness/README.md`; this section is just enough to know when to reach for it instead of the vault.

- **Invoke via**: `/solve-customer-issue <paste the thread / describe the issue>`
- **Components**: `.claude/skills/solve-customer-issue/` (orchestration + cookbooks, incl. `references/no-logs-playbook.md`), `.claude/agents/cw-{data-inspector,code-detective}.md` (specialists), `.claude/workflows/customer-issue-sweep.js` (one evidence-gathering iteration), `.claude/support-harness/bin/{cwapi,metaapi}` (read-only Chatwoot + Meta Graph CLIs), `.claude/support-harness/cases/` (case memory)
- **How it relates to this vault**: the vault gives you the *mechanism* (how a subsystem is built, what a code path does); the support harness gives you the *incident* (what actually happened on a specific account). `cw-code-detective` reads the same codebase this vault documents — pointing it at a relevant vault page first can save it re-deriving structure. Neither replaces the other.
- **Caveat on old cases**: the case store predates the removal of the log track, so many cases cite New Relic and NRQL. Their conclusions stand; their methods half don't — translate through `no-logs-playbook.md`.
- **Caveat**: `.claude/` is untracked, so per-task worktrees (`.claude/worktrees/`) don't see the harness — run customer investigations from the main checkout.

---

## Part 3 — Memory system (auto-memory)

Lives outside the repo, at `~/.claude/projects/<sanitized-repo-path>/memory/`, indexed by `MEMORY.md`. Four types: **user** (who you're working with), **feedback** (corrections/confirmations on how to approach work), **project** (in-flight decisions, deadlines, ownership), **reference** (pointers to external systems). This is where point-in-time investigative findings and durable preferences live — things that aren't derivable by reading the current code or vault, like "the Mexico WhatsApp normalizer gap was fixed 2026-08-12" or "always use `with_modified_env` in specs, never stub `ENV` directly."

**How it relates to this vault**: the vault is a structural map (what the code *is*, refreshed on a `develop`-tracked schedule); memory is a set of point-in-time notes (what was *learned*, timestamped and never silently re-verified). Before trusting a memory that names a specific file, function, or behavior as still true, check it against current code the same way [[how-this-was-built]] asks you to trust code over the vault — memory can go stale exactly the same way a vault page can, just with less structure around catching it (there's no equivalent of `check-sync.sh` for memory).

---

## Part 4 — The product brain (growing)

The layer that turns the harness from a code map into a decision-support system. **Today**: the support-harness case store (30+ solved cases with verified root causes) plus [[product-signals]], which aggregates those cases and the vault's documented footguns into product-level friction themes with a discussion recipe. **Planned**: exported customer-support data, landing under the support-harness umbrella (design intent and required shape are specified in [[product-signals]]) so support volume can be weighed directly against the feature → code → plan-tier map.

Two rules keep this layer trustworthy:
- **Privacy boundary**: customer names/account ids stay in the case store; only product-level themes enter the vault. Anything imported later gets PII-stripped and aggregated *before* it crosses that line.
- **Prevalence honesty**: until real support-volume data lands, the case store is a biased sample (escalations, WhatsApp-heavy) — good for existence proofs ("this failure mode is real"), not for prevalence claims ("this is our biggest problem"). [[product-signals]] marks its takes accordingly.

---

## Quick-reference

| Situation | Do this |
|---|---|
| Starting any non-trivial task in an unfamiliar area | Check the SessionStart hook's staleness report, then [[ai-agent-guide]] or [[path-index]] |
| A vault page contradicts the code | Trust the code; fix the page if the gap is structural |
| Session start reports the vault is stale | Read the affected-pages + uncovered-files lists, update via direct `Agent` calls, run `mark-synced.sh` — don't reach for `Workflow` without asking first |
| A customer thread needs debugging | `/solve-customer-issue` |
| You're not sure if something's worth remembering long-term | Prefer writing it to memory over letting it evaporate at session end, but skip anything derivable from the code/vault/git history |
| You need build/test/lint commands or code style | `CLAUDE.md` — this harness doesn't duplicate it |

## Related

- [[README]] — the vault's map of content
- [[ai-agent-guide]] — task-shaped routing into the vault
- [[path-index]] — the codebase↔documentation link table
- [[how-this-was-built]] — provenance and generation history
- [[deepwiki-crosscheck]] — known gaps and follow-ups
