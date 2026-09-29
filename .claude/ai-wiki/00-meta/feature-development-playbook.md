---
title: "Feature Development Playbook"
tags: [chatwoot, meta, workflow, development]
generated: 2026-08-17
---

# Feature Development Playbook

The vault mostly describes what the code *is*; this page operationalizes it for the harness's other job — **changing** the code. It's the anatomy of adding a feature to Chatwoot, in build order, with each step linking the page that owns the detail. It composes three sources: the repo's `CLAUDE.md` (committed conventions), the vault's per-subsystem "Notes for AI Agents," and standing review feedback taught across real PRs (auto-memory: `feedback_pr_review_patterns`, `reference_chatwoot_api_conventions`) — the things reviewers here actually flag.

## Before writing any code

1. Find the closest existing feature in [[feature-index]] and read its entry points — Chatwoot strongly rewards pattern-matching an adjacent feature over inventing a shape.
2. Read the owning vault page(s) via [[path-index]] / [[ai-agent-guide]] — especially their "Notes for AI Agents" sections.
3. Decide the gating story up front: feature flag? Cloud plan tier? Enterprise-only? (Steps 2–3 below.) Retrofitting gating is much messier than wiring it first.
4. Check `enterprise/` for a sibling of anything you're about to touch (`rg -n "TheClass" app enterprise`) — per `CLAUDE.md`, EE extends OSS via `prepend_mod_with`, and editing an OSS file without checking its EE overlay is the classic drift bug.

## The anatomy, in build order

### 1. Data layer
Migration + `db/schema.rb`. Every account-owned table gets a bare `account_id` column + index — isolation is a Rails-layer convention, not FK-enforced ([[data-model]]). If the record needs a human-facing per-account number, that's the trigger-based `display_id` pattern — don't reinvent it ([[glossary]]).

### 2. Feature flag (`config/features.yml`)
The file's own header is law: the `feature_flags` column is **FULL (63/63)** — new flags MUST set `column: feature_flags_ext_1` and be **appended at the end**; never reorder or remove entries, never change an existing flag's `column`. Add `help_url` when a help article exists (and then add the row to [[external-docs]]). `premium: true` is a UI-visibility marker, not plan gating ([[plan-tiers-billing]]).

### 3. Plan-tier wiring (Cloud-gated features only)
Add the flag to the right array in `Enterprise::Billing::ReconcilePlanFeaturesService` (`STARTUP_PLAN_FEATURES` / `BUSINESS_PLAN_FEATURES` / `ENTERPRISE_PLAN_FEATURES`) — this is the **sole** enforcement mechanism; `enabled:` in features.yml is only the self-hosted default. If staff should be able to grant it manually, also extend `InternalAttributesService#valid_feature_list`. Details and gotchas (e.g. the `advanced_assignment`/`assignment_v2` auto-sync trap): [[plan-tiers-billing]].

### 4. Model layer
Concerns for shared behavior; `prepend_mod_with('ClassName')` hook at file end if EE will extend it. Validations + indexes per `CLAUDE.md`. For nested jsonb updates use the codebase idiom `(existing || {}).deep_merge('key' => patch)`, and `compact` to drop nils — not manual nested writes.

### 5. Service layer
Small single-purpose POROs under `app/services/<domain>/`. Reuse existing bases (`Base::SendOnChannelService` for outbound channel sends, `ActionService` for conversation-action runners). External-API failures must **raise typed errors** (in a `CustomExceptions`-style namespace), never return false and let local state diverge from the provider. Don't add speculative guards/fallbacks (`CLAUDE.md`: build for the production path; let impossible states fail loudly).

### 6. Controller + routes + policy + jbuilder ([[api-v1-controllers]])
The rulebook, condensed — the canonical exemplar for controller shape is `app/controllers/api/v1/profile/mfa_controller.rb`:
- Inherit `Api::V1::Accounts::BaseController`; load-and-authorize in one `set_x` before_action; **one concern per before_action guard**, each reading `return if ok?; render_error`.
- Actions stay 1–3 lines; typed errors get class-level `rescue_from`, never in-action rescues; use `RequestExceptionHandler` helpers (`render_could_not_create_error` etc.) — a typed error surfacing as a 500 is a bug, and `raise ArgumentError` on a controller-reachable path *is* a 500.
- Resource responses via jbuilder: shape lives once in `app/views/api/v1/models/_<resource>.json.jbuilder`, action views just `json.partial!` it. Existing partials are the contract — don't invent parallel shapes.
- Pundit policy per resource **only if authorizing the parent doesn't cover it** (Calls/Messages authorize their Conversation). `prepend_mod_with` at policy file end for custom-role EE extension ([[authorization-policies]]).
- Routes: `resources` in the accounts namespace; `member`/`collection` correctly; EE-only routes behind `if ChatwootApp.enterprise?`.

### 7. Events & side effects ([[events-listeners]])
Fire domain events through the `Dispatcher`; check whether an existing listener already gives you webhooks/notifications/reporting for free before adding a new call site. Listener methods are the snake_cased event name; listeners are stateless singletons.

### 8. Background jobs ([[jobs]])
Pick the queue deliberately; use `MutexApplicationJob` when concurrent invocations for one key must serialize. For check-then-write races use `record.with_lock { ... }` — and `next`/`raise` inside the block, never `return`. Re-check guard conditions **under the lock** when an external call happened in between.

### 9. Frontend
New UI lands in `components-next/` ([[components-next]]), not the legacy tree. Composition API + `<script setup>`, Tailwind only (no scoped/custom CSS), PascalCase components. API calls through a resource class in [[api-client]]; state in [[dashboard-store]] (note the Vuex→Pinia split); frontend flag checks via `featureFlags.js` ([[composables-mixins-helpers]]). Real-time updates ride [[realtime-actioncable]] — check `ActionCableListener` already broadcasts what you need.

### 10. i18n
No bare strings in templates. Backend → `config/locales/en.yml`, frontend → `en.json` — **English only**; other locales flow through Crowdin. The bar for backend strings: "would a non-English customer ever see this?" — if yes (API error messages, message-bubble content), it goes through `I18n.t`.

### 11. Enterprise overlay
For EE-only behavior on an OSS class: `enterprise/app/<root>/enterprise/<oss-path>.rb` defining `Enterprise::<OssConst>`, wired by the `prepend_mod_with` you added in steps 4/6. For EE-exclusive features: code directly under `enterprise/`, specs under `spec/enterprise/` mirroring layout. Never `prepend ... if defined?`. ([[models-services]], [[controllers-jobs-listeners]])

### 12. Specs
Request specs describing the API surface (`RSpec.describe '<Resource> API', type: :request`), auth via `create_new_auth_token` headers, one context per auth scenario. `let` values over custom helper methods; never test private methods; ~10–12 examples per service is the ceiling before it reads as noise. `with_modified_env` over stubbing `ENV`. Only write specs when asked (`CLAUDE.md`) — but when asked, this is the shape.

### 13. Pre-commit review sweep (the taught standards)
Before pushing, sweep for the patterns reviewers here flag every time: comments one-line and WHY-only (delete anything derivable from the code); magic strings/numbers with semantic meaning → named constants; no single-use one-line helpers; verb-noun handler names; i18n on every user-facing string; **never** `# rubocop:disable`; **never** force-push after first push; Conventional Commits with single-line subject and no co-author trailer. Full list: auto-memory `feedback_pr_review_patterns` (30 items).

### 14. Close the loop on the harness itself
A shipped feature changes the ground truth this vault documents: update the owning vault page's Key Files section, add a [[feature-index]] row, add the [[path-index]] row if a new directory appeared, and [[external-docs]] if you added a `help_url`. Then `mark-synced.sh` when the change lands on `develop` ([[harness]]).

## Related

- [[harness]] — where this playbook sits in the overall system
- [[feature-index]] — find the adjacent feature to pattern-match
- [[api-v1-controllers]], [[authorization-policies]], [[events-listeners]], [[jobs]] — the deep pages behind steps 6–8
- [[plan-tiers-billing]] — gating and monetization wiring
- [[product-signals]] — check whether the feature you're building addresses a documented friction theme
