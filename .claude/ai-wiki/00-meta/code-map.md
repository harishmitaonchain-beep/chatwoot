---
title: "Code Map"
tags: [chatwoot, meta, code-map, graph]
generated: 2026-08-17
---

# Code Map

The **function-level code ↔ business graph**: every Ruby class and method in `app/`, `lib/`, `enterprise/` (and every frontend file at component level) linked — via its file — to the vault page documenting it, the business feature(s) it implements, the gating feature flag, the Cloud plan tier, and the official help-center URL. This is the machine-readable realization of "all codebase mapped to business logic."

- **Data**: `tools/code-map.json` (~1.6 MB — query it with `jq`, don't open it whole)
- **Generator**: `tools/extract-code-map.mjs` — deterministic; re-run any time (it recomposes [[path-index]] × [[feature-index]] × `config/features.yml`, so improving those improves this automatically)

## Coverage (as of 2026-08-17)

| Metric | Value |
|---|---|
| Ruby files / classes / methods | 1,292 / 1,351 / **8,619** |
| Frontend files (component-level) | 1,814 |
| Ruby files → vault page | 1,205 (**93%**) |
| Frontend files → vault page | 1,756 (**97%**) |
| Files pinned to a named product feature (entry points) | 133, across all 54 features |
| Files belonging to 2+ documents (many-to-many) | **687** |

The 7% unmapped Ruby remainder is mostly one-off controllers (devise/omniauth glue) and top-level services outside any mapped directory — extend [[path-index]] rows to shrink it; the map inherits the fix on regeneration.

## The graph model

Nodes: `method` → `class` → `file` → `vault page` / `feature` → `flag` → `tier` / `help URL`.
Edges: `defined_in` (method→file, from source parsing), `documented_by` (file→page, longest-prefix over [[path-index]]), `implements` (file→feature, from [[feature-index]] entry points), `gated_by` / `documented_publicly_at` (feature→flag→help URL, from `features.yml`).

Function-level linkage is **inherited through the file** by design, and file→document is **many-to-many** (2026-08-17 revision): a file's `pages` set is the union of (a) every [[path-index]] prefix match — not just the longest — and (b) every vault page whose body mentions the file's exact path in inline code (the page that *discusses* a file documents it). 687 files currently belong to 2+ documents — e.g. `app/controllers/webhooks/whatsapp_controller.rb` → webhook-routing + identity-validation + whatsapp. The first prefix match stays the *primary* page (used for the annotation's first line); the rest appear as `also:` lines and as extra docs in the Codex card.

## Query recipes (jq, from `tools/`)

```bash
# What business context does this function live in?
jq '.files[] | select(.path=="app/services/whatsapp/send_on_whatsapp_service.rb")
    | {page, features, flags, helpUrls}' code-map.json

# Reverse: every function implementing a feature (graph edge list, with lines)
jq -r '.files[] | select(.features | index("Macros")) | .path as $p
       | .methods[] | "\($p):\(.line) \(.owner // "")#\(.name)"' code-map.json

# All entry-point files for a plan tier
jq -r '.files[] | select(.tier=="Business+") | .path' code-map.json | sort -u

# Which file/page owns a class you only know by name?
jq -r '.files[] | select(.classes[]?.name | endswith("FilterService")) | "\(.path) -> \(.page)"' code-map.json

# Coverage gaps to fix in path-index
jq -r '.files[] | select(.lang=="ruby" and .page==null) | .path' code-map.json
```

## Function-level feature segregation (the call-graph layer, 2026-08-17)

File-level attribution can't answer "which *functions* does feature X use, and which are shared?" — so a second generator, `tools/extract-call-graph.mjs` → `tools/call-graph.json`, adds it:

- **Conservative static call graph** (4,333 edges): edges only where resolution is trustworthy — `Klass.new(...).meth` chains, `Klass.static`, `SomeJob.perform_later → #perform`, bare/`self.` calls to sibling defs **including inherited ones** (superclass chains parsed), `super`, `send(:literal_sym)`, and variable-`send` as a *bounded fan to the class's own (+ancestors') instance methods* — semantically correct for the ActionService action-dispatch pattern, bounded by the class so it can't flood. Lowercase-receiver calls (`conversation.update`) stay unresolved **by design**; that's what keeps ubiquitous model calls from smearing every feature everywhere.
- **BFS feature propagation** from each feature's root functions (methods of its entry-point files), recording **min depth**: 1,442 functions carry a feature; **158 are shared by 2+ features**; 243 reached beyond entry files purely via calls.
- **The acceptance case** (the "GET/POST with a common function" shape): `ActionService#resolve_conversation → Automation rules(d1), Macros(d1)` — reached from both `AutomationRules::ActionService#perform` and `Macros::ExecutionService#perform`, linked to both.
- Surfaced in all three products: the Codex (feature click → functions grouped by depth; function card shows features + callers + callees, all clickable), the annotations (a `used-by:` line whenever a method's feature set goes beyond its file's — e.g. `# biz-doc: used-by: Automation rules(d1), Macros(d1)`), and jq over `call-graph.json`.
- Regeneration order matters: `extract-code-map.mjs` → `extract-call-graph.mjs` → codex-data → annotator.

## The derived business-dependency graph (2026-08-17)

The second graph, linking business to code mechanically: **capability A depends on capability B when a function reached from A's roots via calls (depth>0) is one of B's entry functions (depth 0)** — with the inducing functions attached as evidence. Computed in `tools/build-codex-data.mjs` (now the durable codex builder), currently **105 edges over 137 capability nodes**. The two graphs support and update each other by construction: capability rows (business, doc-derived) define the code graph's roots; the code graph's closures derive the business dependency edges back. Real facts it surfaces: conversation state-changes depend on account-webhook delivery and CRM sync; Contacts and Conversations bulk actions are mutually coupled; WhatsApp embedded signup depends on registration & webhook setup. Rendered in the Codex as "Depends on → / Used by ←" chips on every capability, evidence counts included — **and as a full visual graph**: the Codex's "◉ Graph view" toggle shows all 137 capability nodes force-laid-out and clustered by area (7 color groups), sized by function count, with directed dependency arrows; hover highlights a node's edges, and clicking any node drops back into the explorer with that capability selected. Hubs are immediately visible (Webhooks, CRM sync, Automation rules — the shared infrastructure).

## Capability-level nodes (2026-08-17)

Feature nodes can be **decomposed into sub-capabilities** when one product feature hides real internal structure — the granularity of [[feature-index]] rows IS the graph's node granularity, so decomposition is a data change, not a code change. Applied product-wide (2026-08-17, 12-agent workflow): **137 capability nodes** — 89 new rows across Email (8), Facebook & Instagram (9), SMS/Telegram/Line/TikTok/API/Twitter (10), Voice (9), Website live chat & widget (7), Help Center (7), CSAT (7), Reports (7), Captain (8), Conversations/Contacts core (8), Automation (6), Integrations (3, incl. previously-missing Shopify and LeadSquared CRM rows) — every one of the 317 entry-point paths independently re-verified on disk (0 bad). The prototype was WhatsApp: the single node became **10 capability nodes** (registration & webhook setup, embedded signup, reauthorization & credential transfer, templates & business token, inbound pipeline, outbound sending, coexistence identity, health monitoring, phone normalization, campaigns — groupings mirror [[whatsapp]]'s own Key Files sections, every entry point verified). Each traverses to its own function set via the call graph, and functions shared between capabilities link to all of them — canonical example: `Whatsapp::FacebookApiClient#exchange_code_for_token → registration & webhook setup(d0) | embedded signup(d1)`. Enabler: **bounded ivar type inference** in the call graph (`@api_client = Klass.new` in one method resolves `@api_client.meth` elsewhere — only when the ivar has exactly one class assignment, so still no guessing). To decompose another area the same way: split its feature-index row into capability rows with verified entry points, then rerun the regen chain.

## The journey layer (route → gates → chain, 2026-08-17)

The deepest layer: **556 endpoint journeys**, each tracing the full request lifecycle. Built by `tools/extract-journeys.mjs` from an authoritative `rails routes` dump (`tools/routes.txt`, 793 routes; 617 matched to parsed controller actions — the remainder are gem-provided controllers like devise, an honest gap) joined to the call graph, which gained two new edge kinds for this:

- **`before_action` edges** (2,309): each controller action → its full guard chain **including inherited guards** (base-controller auth, token validation, `check_authorization`/Pundit set-up), with `only:`/`except:` respected. This is where permissions actually live: 580 journeys carry guard chains, 104 surface explicit `authorize :predicate?` calls, 89 surface `feature_enabled?` flag gates.
- **event → listener edges** (61): `dispatcher.dispatch(SOME_EVENT)` in a body connects to the listener methods named for that event — the async side of the journey.

Each journey = route (verb + path) → action (+ its file's doc pages, features, plan tier, flags) → gates card → downstream chain BFS (depth ≤ 4, 60-hop cap, truncation reported). Example, verified: `POST …/macros/:id/execute` → `MacrosController#execute` → 5 gates (fetch_macro, check_authorization, validate_token_api_access, authenticate_by_access_token?, set_current_user) → `MacrosExecutionJob#perform` (d1) → `Macros::ExecutionService#perform` (d2) → every dispatchable action (d3). The Codex renders all of this under its "Journeys" group.

**Regeneration order** (each feeds the next): `rails routes > tools/routes.txt` → `extract-code-map.mjs` → `extract-call-graph.mjs` → `extract-journeys.mjs` → codex-data build → splice + republish → `annotate-biz-docs.mjs`.

## The Codex — the iterable explorer

The graph has a visual, drillable front-end: **Chatwoot Codex** — <https://claude.ai/code/artifact/86f827f7-db9e-4108-8b21-a441490547c4>. Miller-column drill (55 doc pages / 54 features → 2,961 files → 8,138 functions with line numbers), plus global file/function search with match highlighting; each file shows its context card (page, features, tier, help link). Regenerate after a map refresh: `extract-code-map.mjs` → `codex-data.json` (builder inline in provenance) → splice into the artifact's `var DATA = {};` line → republish to the same URL. Feature selections also surface their doc pages as clickable chips (entry points are curated; the page holds the full file set), and every doc reference in a file card jumps to that page's file list.

## In-source annotation layer (opt-in, chosen 2026-08-17; revised same day to uncommitted-in-tree)

The map also exists as **in-source comments** — the v2 "comprehensive" format, 1–2 lines above every mapped Ruby method, living **uncommitted in the main working tree** (8,138 methods / 12,095 comment lines across 1,118 files, per the user's explicit instruction: visible in the editor, never committed, never pushed). An earlier containment-branch variant was discarded at the user's direction.

```ruby
# biz-doc: .claude/ai-wiki/03-channels/whatsapp.md — WhatsApp Channel
# biz-doc: feature: WhatsApp · flag: whatsapp_embedded_signup_inbox_creation,whatsapp_reconfigure
def perform_reply
```

Multi-doc files add an `also:` line:

```ruby
# biz-doc: .claude/ai-wiki/03-channels/webhook-routing.md — Webhook Routing Across Channels
# biz-doc: also: .claude/ai-wiki/02-backend/identity-validation.md, .claude/ai-wiki/03-channels/whatsapp.md
def process_payload
```

(Second line appears only for files pinned to a named product feature, carrying feature · tier · flags · help URL, length-capped at 150 chars. The annotator strips-then-reinserts, so re-runs *replace* old annotations — format upgrades propagate, never stack.)

**⚠️ Never let `# biz-doc:` lines into a commit — now mechanically enforced.** A `PreToolUse` hook (`.claude/hooks/guard-biz-doc.sh`, wired in `.claude/settings.local.json`) **blocks any `git commit` while staged changes contain the marker, and any `git push` whose outgoing commits contain it** — tested against real staged annotations. The manual discipline remains for humans committing outside Claude Code:

```bash
# strip the entire layer (unique marker; run before staging real work)
grep -rl '# biz-doc:' app lib enterprise | xargs sed -i '' '/# biz-doc:/d'

# reapply (idempotent — never double-annotates)
node .claude/ai-wiki/tools/annotate-biz-docs.mjs /Users/sharma/Downloads/workspace/chatwoot

# verify nothing slipped into the index at any time
git diff --cached | grep -c 'biz-doc' # must be 0
```

AI agents committing in this repo: strip → stage/commit → reapply, every time, no exceptions. The JSON map remains the queryable source of truth; the comments are a human/editor convenience view of it.

## Honest limits

- **Frontend is file/component-level**, not per-function — Vue SFC methods aren't parsed; the component is the meaningful business unit there anyway.
- Ruby parsing is regex-based (namespace tracked by indentation): metaprogrammed methods (`define_method`, `has_flags` bitflag accessors, delegations) don't appear — the map covers *written* methods, which is what you navigate and edit.
- Regenerate after any [[path-index]] / [[feature-index]] change and after big code moves; it's cheap (~2s).

## Related

- [[path-index]], [[feature-index]], [[external-docs]] — the three indexes this composes
- [[harness]] — where this sits; [[feature-development-playbook]] §14 — keeping the indexes fresh keeps this map fresh
