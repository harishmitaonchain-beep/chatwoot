---
title: "DeepWiki Cross-check"
tags: [chatwoot, meta]
generated: 2026-08-17
updated: 2026-08-17
---

# DeepWiki Cross-check

This vault was cross-checked against the table of contents of [deepwiki.com/chatwoot/chatwoot](https://deepwiki.com/chatwoot/chatwoot) — a third-party, AI-generated wiki for the same repo — to surface real coverage gaps rather than assume parity. The DeepWiki content itself was **not** fetched or read; only its published section tree was used as a checklist. Matches below are honest: a DeepWiki topic is mapped to a vault page only where that page substantively covers it, not wherever a keyword overlaps.

**Revision note (2026-08-17, second pass):** a disk-level completeness audit (comparing every `app/*` and top-level `lib/` directory against the module map actually used to build this vault) found nine directories with zero coverage, independent of anything DeepWiki flagged: `app/channels`, `app/presenters`, `app/builders`, `app/finders`, `app/fields`, `app/dashboards`, `app/drops`, `app/helpers`, and the entire `lib/` tree. Nine new pages plus a [[glossary|Glossary]] and a [[path-index|Path Index]] were added to close those gaps; several of the DeepWiki-flagged gaps below were closed as a side effect (real-time/WebSockets, frontend build system, webhook routing, Attachments, Help Center models, Slack, Dialogflow). Rows below are updated accordingly — see the diff in bold status changes.

## Section-by-section mapping

| # | DeepWiki section | Coverage in this vault | Status |
|---|---|---|---|
| 1 | Overview | [[overview\|System Architecture Overview]] | **Covered** (was not covered) — narrative cold-start walkthrough incl. the life of a message in both directions |
| 2 | Features and Capabilities | [[feature-index\|Business Feature Index]] | **Covered** (was not covered) — 54 product features mapped to verified code entry points, flags, and plan tiers |
| 3 | System Architecture Overview | [[overview\|System Architecture Overview]], [[data-model\|Database Schema & Data Model Overview]], [[routing-config\|Routing & App-wide Configuration]] | **Covered** (was partial) — dedicated narrative page synthesized from the vault |
| 4 | Installation and Deployment | [[external-docs\|External Docs Map]] | **Covered by reference** — the developer docs repo (`self-hosted/deployment/`, `contributing-guide/environment-setup/`, env-var references) is the canonical source; the vault links it rather than duplicating content that would drift |
| 5a | Core Data Models — multi-tenancy | [[models\|Data Models]], [[data-model\|Database Schema & Data Model Overview]] | Covered |
| 5b | Core Data Models — users/roles/auth | [[models\|Data Models]], [[authorization-policies\|Authorization (Pundit Policies)]], [[account-onboarding\|Account, Onboarding, MFA, Sessions]] | Covered |
| 5c | Core Data Models — contacts | [[models\|Data Models]], [[contacts-services\|Contact Services]] | Covered |
| 5d | Core Data Models — conversations/messages | [[models\|Data Models]], [[conversations-services\|Conversation Services & Actions]], [[messages-services\|Message Services]] | Covered |
| 5e | Core Data Models — inboxes/channels | [[models\|Data Models]], [[whatsapp\|WhatsApp Channel]], [[email\|Email Channel & Mailboxes]], [[facebook-instagram\|Facebook & Instagram Channels]], [[other-channels\|SMS, Telegram, Line, TikTok, Twitter, Twilio Voice]] | Covered |
| 5f | Core Data Models — attachments | [[attachments-storage\|Attachments & Active Storage]] | **Covered** (was partial) — dedicated page: the `Attachment` model, ActiveStorage backends, direct-upload endpoints |
| 6a | API Layer — auth/security | [[authorization-policies\|Authorization (Pundit Policies)]], [[identity-validation\|Identity Validation & HMAC Trust Boundaries]], [[rate-limiting\|Rate Limiting (Rack::Attack)]], [[account-onboarding\|Account, Onboarding, MFA, Sessions]] | **Covered** (was partial) |
| 6b | API Layer — Platform API | [[public-platform-api\|Public & Platform APIs]] | Covered |
| 6c | API Layer — Application API | [[api-v1-controllers\|Application API (Agent-facing Controllers)]] | Covered |
| 6d | API Layer — Public API | [[public-platform-api\|Public & Platform APIs]] | Covered |
| 6e | API Layer — filtering/search | [[conversations-services\|Conversation Services & Actions]] (ACL/filtering), [[contacts-services\|Contact Services]] (segment/filter query builder) | Partial — no cross-cutting search page |
| 6f | API Layer — WebSockets | [[realtime-actioncable\|Real-time Layer (ActionCable)]] | **Covered** (was partial) — dedicated page: `app/channels`, `ActionCableListener`, `ActionCableBroadcastJob`, the full event-to-browser path |
| 7a | Frontend — build system | [[build-system\|Frontend Build System (Vite)]] | **Covered** (was not covered) — `vite_rails`/`vite_ruby` config, entrypoints, aliases, the widget SDK's special-cased library build |
| 7b | Frontend — app structure | [[dashboard-routes-components\|Dashboard Routes & Legacy Components]] | Covered |
| 7c | Frontend — Vuex state | [[dashboard-store\|Dashboard State Management (Vuex/Pinia)]] | Covered |
| 7d | Frontend — conversation list/view | [[components-next\|components-next (current UI system)]], [[dashboard-routes-components\|Dashboard Routes & Legacy Components]] | Covered |
| 7e | Frontend — composer/rich text | [[dashboard-routes-components\|Dashboard Routes & Legacy Components]] (WootWriter editor mentioned) | Partial |
| 7f | Frontend — contacts UI | [[components-next\|components-next (current UI system)]] | Covered |
| 7g | Frontend — inbox mgmt UI | [[feature-uis\|Dashboard Feature UIs (Reports, Settings, Inbox Management)]] | **Covered** (was partial) — four-step channel-creation wizard + per-inbox settings tabs |
| 7h | Frontend — settings UI | [[feature-uis\|Dashboard Feature UIs (Reports, Settings, Inbox Management)]] | **Covered** (was partial) — all ~23 settings section modules and the shared shell pattern |
| 7i | Frontend — reports UI | [[feature-uis\|Dashboard Feature UIs (Reports, Settings, Inbox Management)]], [[reports\|Reports & Analytics Backend]] | **Covered** (was not covered) — report views, drilldown drawer, CSV download flow |
| 8a | Widget SDK — integration guide | [[widget-sdk\|Website Widget & Client SDK]] | Covered |
| 8b | Widget SDK — iframe events | [[widget-sdk\|Website Widget & Client SDK]] (postMessage bridge mentioned generally) | Partial — no documented iframe event catalog |
| 8c | Widget SDK — widget app architecture | [[widget-sdk\|Website Widget & Client SDK]] | Covered |
| 9a | Multi-Channel — channel polymorphism | [[models\|Data Models]], [[data-model\|Database Schema & Data Model Overview]] | Covered |
| 9b | Multi-Channel — web widget | [[widget-backend\|Widget Backend]], [[widget-sdk\|Website Widget & Client SDK]] | Covered |
| 9c | Multi-Channel — email | [[email\|Email Channel & Mailboxes]] | Covered |
| 9d | Multi-Channel — WhatsApp | [[whatsapp\|WhatsApp Channel]] | Covered |
| 9e | Multi-Channel — social | [[facebook-instagram\|Facebook & Instagram Channels]] | Covered |
| 9f | Multi-Channel — messaging apps | [[other-channels\|SMS, Telegram, Line, TikTok, Twitter, Twilio Voice]] | Covered |
| 9g | Multi-Channel — SMS/voice | [[other-channels\|SMS, Telegram, Line, TikTok, Twitter, Twilio Voice]] | Covered |
| 9h | Multi-Channel — webhook routing | [[webhook-routing\|Webhook Routing Across Channels]] | **Covered** (was partial) — dedicated page tracing `app/controllers/webhooks/*` for every channel that shares that entry point, and noting which channels don't (Facebook, Twilio) |
| 9i | Multi-Channel — outbound delivery | [[messages-services\|Message Services]] (delivery status transitions), [[jobs\|Background Jobs (Sidekiq)]] (send jobs) | Partial |
| 10a | Background Jobs — Sidekiq queues | [[jobs\|Background Jobs (Sidekiq)]] | Covered |
| 10b | Background Jobs — dispatcher/listener pattern | [[events-listeners\|Event Dispatcher & Listeners]] | Covered |
| 10c | Background Jobs — message/notification jobs | [[jobs\|Background Jobs (Sidekiq)]], [[notifications\|Notifications & Mailers]] | Covered |
| 10d | Background Jobs — scheduled jobs | [[jobs\|Background Jobs (Sidekiq)]] | Covered |
| 11a | AI and Automation — Captain | [[captain-ai\|Captain AI / LLM Formatter]], [[models-services\|Enterprise Models & Services]] | Covered |
| 11b | AI and Automation — automation rules/macros | [[automation-rules\|Automation Rules Engine]], [[macros\|Macros]] | Covered |
| 11c | AI and Automation — agent bots | [[lib-integrations\|Third-party Bot & AI Integration Protocols (lib/integrations)]] | **Covered** (was not covered) — `Integrations::BotProcessorService`, `Dialogflow::ProcessorService`; page explicitly flags that this bot-dispatch path looks unused versus the live `Captain::BaseTaskService` path, which is a real finding, not just documentation |
| 12a | Configuration — global config | [[routing-config\|Routing & App-wide Configuration]], [[lib-core-infrastructure\|Core Library Infrastructure (lib/)]] | Covered |
| 12b | Configuration — feature flags/premium | [[routing-config\|Routing & App-wide Configuration]], [[plan-tiers-billing\|Cloud Plan Tiers & Billing]] | Covered — plan-tiers-billing adds the Cloud plan-tier → feature-flag mapping specifically, cross-checked against the public pricing page |
| 12c | Configuration — user prefs | [[user-preferences\|User Preferences & UI Settings]] | **Covered** (was not covered) — all four per-user preference stores |
| 13a | Security — auth | [[authorization-policies\|Authorization (Pundit Policies)]], [[account-onboarding\|Account, Onboarding, MFA, Sessions]] | Covered |
| 13b | Security — Pundit authorization | [[authorization-policies\|Authorization (Pundit Policies)]] | Covered |
| 13c | Security — Rack::Attack rate limiting | [[rate-limiting\|Rate Limiting (Rack::Attack)]], [[external-docs\|External Docs Map]] (public operator doc) | **Covered** (was partial) — rule-by-rule dissection of all 25 throttles |
| 13d | Security — HMAC/identity validation | [[identity-validation\|Identity Validation & HMAC Trust Boundaries]] | **Covered** (was partial) — cross-channel: widget + API channel contact identity vs provider webhook signatures |
| 14a | Help Center — data models | [[help-center-models\|Help Center Data Models]] | **Covered** (was not covered) — dedicated page: `Portal`/`Category`/`Folder`/`Article` |
| 14b | Help Center — dashboard UI | [[components-next\|components-next (current UI system)]] (HelpCenter pages mentioned) | Partial |
| 14c | Help Center — public portal rendering | [[portal-survey-superadmin\|Help Center Portal, CSAT Survey App, Super Admin]] | Covered |
| 15a | Integrations — Slack | [[lib-integrations\|Third-party Bot & AI Integration Protocols (lib/integrations)]] | **Covered** (was not covered) — `Integrations::Slack::*Service` trio (send/incoming/update), OAuth hook builder, link unfurling |
| 15b | Integrations — Linear | [[integrations\|CRM & Third-party Integrations]], [[lib-integrations\|Third-party Bot & AI Integration Protocols (lib/integrations)]] | Covered |
| 15c | Integrations — Dialogflow | [[lib-integrations\|Third-party Bot & AI Integration Protocols (lib/integrations)]] | **Covered** (was not covered) — `Dialogflow::ProcessorService`, language-fallback table, reauthorization-on-`PermissionDeniedError` |
| 15d | Integrations — OpenAI | [[lib-integrations\|Third-party Bot & AI Integration Protocols (lib/integrations)]], [[captain-ai\|Captain AI / LLM Formatter]] | **Covered** (was partial) — the page explicitly resolves the ambiguity: `Integrations::LlmBaseService` was the historical intended home but the live implementation is `Captain::BaseTaskService` in `lib/captain/` |
| 16 | Glossary | [[glossary\|Glossary]] | **Covered** (was not covered) — 20 cross-linked, codebase-grounded terms |

## Coverage beyond DeepWiki's own table of contents

The disk-level audit surfaced real, sizeable directories that DeepWiki's section tree doesn't call out as their own topics either — now covered here anyway: [[presenters|Presenters]] (`app/presenters`), [[backend-support-objects|Backend Support Objects]] (`app/builders`, `app/finders`, `app/fields`, `app/dashboards`, `app/drops`, `app/helpers` — 97 files combined), and [[lib-core-infrastructure|Core Library Infrastructure]] (`lib/`, ~90 files excluding `lib/integrations`).

## Suggested follow-up pages

**2026-08-17 coverage-completion pass**: seven pages closed the entire previous follow-up list — [[builders-views]] (incl. `enterprise/app/views`), [[user-preferences]], [[rate-limiting]], [[identity-validation]], [[feature-uis]], [[overview]], and [[feature-index]]. What genuinely remains is the residue of "Partial" rows above:

1. **Composer / rich-text editor deep-dive** (7e) — WootWriter/ProseMirror internals are only mentioned, not dissected.
2. **Cross-cutting search** (6e) — conversation/contact/article search paths exist in separate pages; no single page traces the search stack (incl. the `advanced_search`/GIN paths).
3. **Widget iframe event catalog** (8b) — the postMessage bridge is described generally; an event-by-event catalog would close it.
4. **Cross-channel outbound delivery** (9i) — send jobs and delivery-status transitions are split across pages; a single outbound-pipeline page could unify them.

Branch note: [[builders-views]] documents `develop`'s five Captain outcome builders (PR #15425) that the current feature branch predates — that divergence self-resolves when the branch rebases; no vault action needed.
