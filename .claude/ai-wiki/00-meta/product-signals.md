---
title: "Product Signals"
tags: [chatwoot, meta, product, signals]
generated: 2026-08-17
---

# Product Signals

The harness's product-brain layer: what the system *knows about product reality* beyond what the code says — recurring customer friction, documented product debt, advertised-vs-implemented gaps — aggregated to product level so it can feed feature discussions and prioritization. Where [[feature-index]] answers "which code implements feature X," this page answers "where does feature X actually hurt."

**Privacy rule (non-negotiable): this page stays at product level.** Customer names, account ids, and case specifics live only in the support-harness case store (`.claude/support-harness/cases/`) — never copied here. Themes below cite case *files* and code, not customers.

## Signal sources available today

| Source | What it holds | Product use |
|---|---|---|
| `.claude/support-harness/cases/` (30+ solved cases + `INDEX.md`) | Verified root causes of real customer issues, incl. refuted hypotheses | The richest signal: what actually breaks, how often themes recur, what support costs |
| Vault "Notes for AI Agents" sections | Per-subsystem footguns found while reading code | Latent friction — things that *will* generate tickets |
| Auto-memory (`~/.claude/projects/.../memory/`) | Cross-session findings, incl. bugs disproven theories | Prevents re-litigating settled questions in product discussions |
| [[feature-index]] + [[plan-tiers-billing]] | What exists, what's gated where | The monetization frame for any proposal |
| [[external-docs]] | What's *promised* publicly (user guide, pricing) | The promise-vs-reality diff below |

## Documented friction themes (grounded, product-level)

### 1. Silent failure is the #1 recurring theme in the case store
The single largest cluster of solved cases is "something failed and nobody — user or support — could see it":
- Manual WhatsApp inbox creation swallows Meta webhook-registration failures — inbox looks created, inbound never arrives (cases: `2026-08-whatsapp-manual-inbox-webhook-register-failed-silent`, `...-register-webhook-100-surfaced`).
- Account webhooks swallow **all** delivery errors with no retry and no visible failure state (`Webhooks::Trigger`); the retry path exists only for agent-bot webhooks (case: `2026-08-webhook-account-webhook-silent-drop-no-retry`).
- Inbound WhatsApp from countries without a phone normalizer is dropped with a WARN log only (Mexico case predated the fix; the *pattern* remains for uncovered countries — [[whatsapp]]).
- Facebook Handover-Protocol (`standby`) events are dropped by the gem pre-Chatwoot, page-wide, zero logging (case: `2026-08-facebook-standby-handover-inbound-silent-drop`).
- WhatsApp template sync can silently discard a freshly-fetched template list on transient validation failure while still bumping the sync timestamp (case: `2026-08-whatsapp-template-sync-silent-discard-and-403-permission`).

**Product take**: a "delivery health / failure surfacing" investment (visible error states, retry, dead-letter views) would deflect a measurable share of support volume — the cases show customers churning through wrong self-diagnoses precisely because the product shows success.

### 2. Plan-gating UX asymmetries
- Free-plan accounts can *save* an account webhook through the UI that will never fire (`api_and_webhooks` gate checked at delivery, not at save) — invisible-failure by design ([[plan-tiers-billing]]).
- Inboxes without an AssignmentPolicy (creation UI-gated behind Business+) get **zero** periodic assignment sweep — a missed first assignment stays stuck forever on lower plans (case: `2026-08-assignment-hacker-plan-no-policy-no-periodic-sweep`).

**Product take**: gating a feature should gate the *configuration*, not silently the *effect*.

### 3. WhatsApp onboarding complexity cluster
Manual/BYOA setup is the highest-friction surface in the case store: token-type confusion (User vs System User token), `(#100)` webhook-override failures on self-service WABAs (matches open GitHub issue chatwoot/chatwoot#13154, no accepted fix), coexistence BSUID duplicate-conversation splits ([[whatsapp]], multiple cases). Embedded signup exists precisely to absorb this — the cases quantify what happens when users fall off that path. **The full 17-case distillation — error codes, discriminators, disproven hypotheses, and this area's engineering-debt list — is [[whatsapp-field-guide]].**

### 4. Promised-vs-implemented gaps
- The user guide advertises Zendesk and Front migrations; **no importer exists** for either ([[data-import]]).
- The mobile app lacks custom views / label / custom-attribute filtering although the backend APIs are fully client-agnostic — a confirmed app gap, not a platform one (case: `2026-08-mobile-app-missing-custom-views-label-filtering`).

### 5. Vestigial code worth a product/engineering decision
`Integrations::LlmBaseService` / `BotProcessorService`'s Captain path appear dead versus the live `lib/captain/` pipeline ([[lib-integrations]]) — either retire or re-adopt; ambiguity costs every future reader.

## How to run a product discussion with this harness

1. Name the feature/problem in product terms → find it in [[feature-index]] (or note its absence — itself a signal).
2. Read the owning vault page for the mechanism and its constraints.
3. Check this page + `rg` the case store INDEX for friction evidence.
4. Frame cost/monetization with [[plan-tiers-billing]] and the public promise with [[external-docs]].
5. Proposals cite evidence from steps 2–4 — the harness's value is that suggestions come with receipts, not vibes.

## Incoming: customer support data (planned slot)

The user intends to feed exported customer-support data into the harness for product-wise decisions. Design intent, so the integration has a home when it arrives:

- **Where**: alongside the case store, e.g. `.claude/support-harness/signals/` — same gitignore umbrella, same privacy posture.
- **Shape**: aggregate-level (theme × frequency × plan tier × channel), PII stripped before it enters; join key = the feature areas used as section names in [[feature-index]], so support volume can be laid directly against the feature → code → plan-tier map.
- **Synthesis point**: this page — themes above get frequency-weighted instead of anecdotal, and the "Product take" lines become testable claims.
- Until that data lands, treat the case store as a **biased sample** (escalations that reached this desk, WhatsApp-heavy) — strong for existence proofs, weak for prevalence claims.

## Maintenance

After each solved support case, ask: does it reinforce an existing theme (add the case file reference), start a new one, or falsify a "Product take" here? This page earns its place only if it stays synced with the case store.

## Related

- [[harness]] — where this layer sits; [[feature-index]] — the feature→code map this joins against
- [[plan-tiers-billing]], [[external-docs]] — monetization and public-promise frames
- [[feature-development-playbook]] — when a discussion becomes a build
