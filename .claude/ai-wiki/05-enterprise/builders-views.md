---
title: "Enterprise Builders & Views"
tags: [chatwoot, enterprise, builders, views]
generated: 2026-08-17
deepwiki_section: null
---

# Enterprise Builders & Views

## Purpose

Covers the last two directories of the backend Enterprise overlay: `enterprise/app/builders` (7 files on this branch, 12 on develop) and `enterprise/app/views` (111 files). Builders here are of the same two structural kinds as the rest of the overlay (see [[controllers-jobs-listeners]]): standalone Enterprise-only classes (SAML user provisioning, Captain analytics) and `Enterprise::*` extension modules prepended onto OSS builders (agent invites, contact-inbox source IDs, message types — all in service of SAML and Twilio voice). Views are almost entirely jbuilder API responses for Enterprise-only endpoints (Captain, SLA, custom roles, companies, calls, agent capacity, SAML settings), plus a small set of ERB partials: Super Admin `administrate` field partials and one Devise mailer override.

> **Branch divergence (important):** this checkout (`fix/whatsapp-coexistence-embedded-signup`) diverged from `develop` before PR #15425 (`feat: add Captain outcome reporting builders`, commit `40f5381da6`) landed. `develop` has **five additional builder files** this branch lacks; two view files also differ by one line each. Both are documented below from `git show develop:...`.

## Key Files & Classes

### Builders — standalone (present on this branch and develop)

- `enterprise/app/builders/saml_user_builder.rb` — `SamlUserBuilder` (top-level class, no namespace). Called from `enterprise/app/controllers/enterprise/devise_overrides/omniauth_callbacks_controller.rb` after a successful SAML assertion. `perform` finds a user by email or creates one (`provider: 'saml'`, random password, `skip_confirmation`), then attaches them to the account. Rules worth knowing:
  - An existing user who belongs to **other** accounts raises `SamlUserBuilder::AuthenticationFailed` (i18n `auth.saml.authentication_failed`) — SAML sign-in cannot absorb a multi-account user.
  - An existing single-account user gets force-confirmed and converted to `provider: 'saml'`.
  - `AccountUser` is `find_or_create_by`, default role `agent`; then IdP group → role mapping is applied from `AccountSamlSettings#role_mappings` (groups read from `extra.raw_info` keys `groups`/`Group`/`memberOf`). A mapping can set a built-in `role` or a `custom_role_id` (the latter gated on `feature_enabled?('custom_roles')`). See [[account-onboarding]] for the surrounding SAML login flow.
- `enterprise/app/builders/captain/assistant_stats_window.rb` — `Captain::AssistantStatsWindow`. Resolves current + previous comparison ranges from a `range` param (`'7'`/`'30'`/`'90'`/`'this_month'`/`'last_month'`, default `'7'`) and a viewer `timezone_offset` (hours, same convention as the reports API). Shared by the stats and drilldown builders so a drilldown covers exactly the rows its stat card counted. `this_month`'s previous window is elapsed-clamped to the prior month's end to avoid double counting.
- `enterprise/app/builders/captain/assistant_stats_builder.rb` — `Captain::AssistantStatsBuilder`. Per-assistant overview metrics (conversations handled, auto-resolution rate, handoff rate, hours saved, reopen rate, conversation depth), each packed as `{current, previous, trend}`. Message-derived counts for both windows come from **one scan** using SQL `FILTER` conditional aggregation. Key semantics: "handled" = conversations where the assistant authored any message (`sender_type: 'Captain::Assistant'`); resolves count `conversation_captain_inference_resolved` + `conversation_bot_resolved` reporting events, but a bot-resolve on a conversation that was also handed off in the window is excluded (mirrors the reports `:exclude_bot_handoffs` rule); `hours_saved` is an estimate — public replies × `SECONDS_SAVED_PER_REPLY` (2 min), not measured effort. Also exposes `faq_stats` (approved/suggestions/documents/coverage in one round trip). Consumed by `Api::V1::Accounts::Captain::AssistantsController#metrics`/`#faq_stats`/`#summary` (see [[captain-ai]]).
- `enterprise/app/builders/captain/assistant_drilldown_builder.rb` — `Captain::AssistantDrilldownBuilder`. Drills from a stat card into the underlying conversations for metrics `conversations_handled`, `auto_resolution_rate`, `handoff_rate`, `reopen_rate` (`SUPPORTED_METRICS`; controller 422s anything else via `supported_metric?`). Paginated (default 25, max 100), serialized with the shared OSS `V2::Reports::DrilldownRecordSerializer` so the existing reports drilldown drawer renders it. Its resolved/reopened scopes deliberately mirror `AssistantStatsBuilder`'s clauses so drilldown rows match card counts exactly.

### Builders — `Enterprise::*` extension modules (prepended onto OSS builders)

The OSS counterparts live in `app/builders` (see [[backend-support-objects]]) and each ends with `prepend_mod_with(...)`:

- `enterprise/app/builders/enterprise/agent_builder.rb` — `Enterprise::AgentBuilder`, prepended at `app/builders/agent_builder.rb:86`. On a SAML-enabled account: blocks inviting an email that already belongs to *other* accounts (raises `ActiveRecord::RecordInvalid` with i18n `errors.saml.multi_account_invitation_not_allowed`) and converts a successfully invited persisted user to `provider: 'saml'`.
- `enterprise/app/builders/enterprise/contact_inbox_builder.rb` — `Enterprise::ContactInboxBuilder`, prepended at `app/builders/contact_inbox_builder.rb:107`. For a voice-enabled `Channel::TwilioSms` inbox, the contact-inbox `source_id` becomes the contact's phone number (or a random UUID when phone is blank), and `allowed_channels?` admits the voice inbox type.
- `enterprise/app/builders/enterprise/messages/message_builder.rb` — `Enterprise::Messages::MessageBuilder`, prepended at `app/builders/messages/message_builder.rb:237`. Lets an agent-side API call create an `incoming` message when `content_type == 'voice_call'` on a voice-enabled inbox (OSS would coerce it to outgoing).

### Builders — on develop only (missing from this branch)

All added by PR #15425; from `git show develop:enterprise/app/builders/captain/...`:

- `assistant_outcome_classification.rb` — `Captain::AssistantOutcomeClassification`, a mixin of Arel predicate helpers (`involved`, `autonomous`, `assisted`, `handoff`, `reopened_within_7_days`, `durable`) over the Captain conversation-outcome episode table. Encodes edge rules like: a `usage_limit` handoff with no prior Captain reply is blocked demand, not involvement; durable = stayed closed ≥ 7 days.
- `assistant_overview_stats_builder.rb` — `Captain::AssistantOverviewStatsBuilder`. Episode-based (outcome-table) successor to `AssistantStatsBuilder`'s metric set: 12 packed metrics via `PACKED_METRICS` (adds `autonomous_resolutions`, `handoff_count`, `durable_resolution_rate`, `autonomous_csat_score`, `assisted_csat_score`, `human_only_csat_score`, `median_resolution_seconds`). Funnel metrics group episodes by when demand started so cohorts stay stable; reply activity stays message-derived.
- `assistant_resolution_flow_builder.rb` — `Captain::AssistantResolutionFlowBuilder`. Builds a mutually-exclusive Sankey (handled → resolved-by-Captain / handed-off / closed-with-team; resolved → reopened-within-7-days / stayed-closed) plus a handoff-reason distribution grouped by `handoff_reason_category` (nil → `'unclassified'`).
- `assistant_resolution_trend_stats_builder.rb` — `Captain::AssistantResolutionTrendStatsBuilder`. Time series of involvement/autonomous resolution; day buckets ≤ 15 days else week buckets (weeks start Sunday), computed in one outcome-table scan, calendar-aligned to the viewer's timezone.
- `conversation_usage_builder.rb` — `Captain::ConversationUsageBuilder`. Lists/counts conversations where Captain used a specific knowledge record (`document_ids` / `used_faq_ids` JSONB columns on `Captain::AgentSession`), with per-record CTE queries sized to one API page so the JSONB GIN index is usable. On develop it's consumed by `assistant_responses_controller.rb` and `documents_controller.rb` (drilldown + `used_in_conversations_count` in index views, and `order_documents_by_conversation_count`).
- On develop, `AssistantOverviewStatsBuilder`/`ResolutionFlowBuilder`/`ResolutionTrendStatsBuilder` have **no controller call sites yet** — only specs under `spec/enterprise/builders/captain/` reference them (verified with `git grep` on develop as of 2026-08-17). They are landed-ahead-of-wiring analytics for the Captain overview revamp.

### Views — jbuilder API responses (~100 of the 111 files; sampled, not read in full)

Registered via `config/application.rb:49` — `config.paths['app/views'].unshift('enterprise/app/views')` — so enterprise views are resolved **before** OSS views and a same-path enterprise file shadows the OSS one.

- `enterprise/app/views/api/v1/models/` — the shared partial layer, mirroring OSS `app/views/api/v1/models/`: `_applied_sla`, `_sla_event`, `_sla_policy`, `_custom_role`, `_company`, `_call`, `_whatsapp_call`, `_agent_capacity_policy`, `_reporting_event`, `_account_saml_settings`, `_account_user`, and `captain/` partials (`_assistant`, `_assistant_response`, `_document`, `_copilot_thread`, `_copilot_message`, `_custom_tool`, `_faq_suggestion`, `_faq_observation`, `_scenario`). Sampled: `_account_saml_settings` exposes `sso_url`/`certificate`/`fingerprint`/entity IDs/`role_mappings`; `captain/_assistant` merges `auto_resolve_mode`, `auto_resolve_after`, `send_inactivity_resolution_message` into the `config` hash.
- `enterprise/app/views/api/v1/accounts/**` — per-controller CRUD views for Enterprise endpoints (see [[controllers-jobs-listeners]] and [[api-v1-controllers]]): `agent_capacity_policies/` (+ nested `inbox_limits/`, `users/`), `applied_slas/` (including `download.csv.erb` and `metrics.json.jbuilder`), `audit_logs/show` (serializes the `audited` gem's fields inline, no model partial), `calls/index` (paginated meta + `_call` partial), `captain/**` (13 resource dirs), `companies/**` (with nested `contacts/`, `conversations/`, `notes/`), `conversations/reporting_events`, `custom_roles/`, `reporting_events/index`, `saml_settings/`, `sla_policies/`, `whatsapp_calls/` (accept/initiate/reject/show/terminate/upload_recording). Standard shape is `json.payload { json.array! ... json.partial! 'api/v1/models/<x>' }`, some with a `meta` block (e.g. `captain/assistants/index` hardcodes `page 1` — pagination reserved, not implemented).
- `enterprise/app/views/enterprise/api/v1/accounts/partials/_account.json.jbuilder` — one line: `json.subscribed_features @account.subscribed_features`. Rendered *into* the OSS account payload by the OSS show view's enterprise-partial hook, surfacing plan features to the dashboard (see [[plan-tiers-billing]]).
- `enterprise/app/views/enterprise/api/v1/conversations/partials/_conversation.json.jbuilder` — merged into the OSS conversation payload: when the account has the `sla` feature, emits `applied_sla` + `sla_events` (or explicit `nil`/`[]` when the conversation predates/escapes SLA applicability).

### Views — ERB (Super Admin + Devise mailer)

- `enterprise/app/views/fields/*/` — `administrate` field partials for the four custom field classes in `enterprise/app/fields` (documented in [[controllers-jobs-listeners]]), wired into the **OSS** `app/dashboards/account_dashboard.rb`:
  - `account_features_field/` (`_form`, `_show`) — checkbox grid of account features split into regular vs premium (star icon); premium checkboxes are disabled when `ChatwootHub.pricing_plan == 'community'`.
  - `account_limits_field/` (`_form`, `_index`, `_show`) — number inputs per key of the account `limits` JSON.
  - `manually_managed_features_field/` (`_form`, `_show`) — Cloud-only (`ChatwootApp.chatwoot_cloud?` gate in the dashboard): features pinned on even after a plan downgrade; premium set derived from `Enterprise::Billing::HandleStripeEventService::BUSINESS_PLAN_FEATURES + ENTERPRISE_PLAN_FEATURES`.
  - `captain_model_overrides_field/` (`_form`, `_show`) — per-Captain-feature LLM model override dropdowns posting to `account[captain_models][<feature_key>]`.
  These render inside the OSS Super Admin console — see [[portal-survey-superadmin]].
- `enterprise/app/views/devise/mailer/confirmation_instructions.html.erb` — shadows OSS `app/views/devise/mailer/confirmation_instructions.html.erb` (view-path precedence, no Ruby override needed). Reuses the OSS `devise/mailer/_confirmation_body` partial but computes SAML-aware copy: invited users on a SAML-enabled account get "use your organization's SSO portal" with **no** action button (no password-set link), while non-SAML invitees get an accept-invitation link built from `set_reset_password_token`. Also branches for email-change confirmation and already-confirmed users, and brands via `global_config['BRAND_NAME']`. Related mailer infrastructure: [[notifications]].

## How It Fits Together

- **Load path**: `enterprise/app` is an autoload path, so standalone builders (`SamlUserBuilder`, `Captain::*Builder`) are ordinary classes; `Enterprise::*` builder modules are spliced into OSS builders by the `prepend_mod_with` calls at the bottom of each OSS file (mechanism detailed in [[controllers-jobs-listeners]]). Views need neither — `config/application.rb:49` prepends `enterprise/app/views` to the view path, which both *adds* views for enterprise-only controllers and *shadows* same-path OSS views (the Devise mailer is the only shadowing case today; the two `enterprise/.../partials/` files are additive partials the OSS views render conditionally).
- **Captain analytics stack**: `AssistantStatsWindow` (window math) → `AssistantStatsBuilder` (card metrics) → `AssistantDrilldownBuilder` (card → conversations, same clauses) → rendered as raw JSON from `AssistantsController` (no jbuilder; `render json:`). The develop-only episode builders share `AssistantOutcomeClassification` and read the outcome-episode table written by the listeners described in [[controllers-jobs-listeners]] and [[captain-ai]], instead of re-deriving outcomes from `reporting_events` at query time.
- **SAML triangle**: `SamlUserBuilder` (IdP-initiated provisioning) + `Enterprise::AgentBuilder` (admin-initiated invites) enforce the same invariant from both directions — a SAML account never shares a user with other accounts — and both force `provider: 'saml'`. The mailer override closes the loop by not sending password links to SAML invitees. Models/settings side: [[models-services]]; flow: [[account-onboarding]].
- **Voice-call plumbing**: the two Twilio-voice builder extensions make OSS primitives voice-aware (phone-number source IDs; incoming `voice_call` messages), feeding the calls controllers/views (`calls/index`, `whatsapp_calls/*`) covered in [[controllers-jobs-listeners]].

## Product Behavior

- SAML sign-in silently provisions agents (default role, or IdP-group-mapped role/custom role); a user with memberships in other accounts is refused with a generic authentication-failed error.
- Captain's Overview page numbers (handled/auto-resolution/handoff/hours-saved/reopen/depth, with prior-period trend arrows) and their click-through drilldowns come from these builders; "hours saved" is an assumption-based estimate (2 min per public reply), not a measurement.
- Super Admin's Account edit page — feature toggles, limits, manually-managed (downgrade-proof) features, and Captain model overrides — is rendered by the `fields/*` partials here.
- Confirmation/invitation emails adapt: SAML invitees are told to use SSO and get no password link; email-change and already-confirmed states get distinct copy.

## Notes for AI Agents

- **This branch is stale for Captain analytics.** Before reasoning about `enterprise/app/builders/captain/`, diff against develop: `git diff --stat develop -- enterprise/app/builders`. On this checkout the five outcome-episode builders (`AssistantOutcomeClassification`, `AssistantOverviewStatsBuilder`, `AssistantResolutionFlowBuilder`, `AssistantResolutionTrendStatsBuilder`, `ConversationUsageBuilder`) and the two `used_in_conversations_count` view lines exist only on develop.
- The name "builder" means two unrelated things in this directory: query/aggregation builders (Captain analytics — closer to the OSS report builders in [[backend-support-objects]]) and record-creation builders (`SamlUserBuilder`, the `Enterprise::*` extensions). Don't assume a shared interface; `AssistantStatsBuilder` exposes `metrics`, drilldown exposes `build`, `SamlUserBuilder` exposes `perform`.
- When touching an OSS view under `app/views/api/v1/...` or `app/views/devise/mailer/...`, check for a same-path file under `enterprise/app/views` first — the enterprise copy wins at render time, so an OSS-only edit can silently not ship on EE installs.
- The stats↔drilldown clause mirroring is load-bearing: `AssistantDrilldownBuilder` copies `AssistantStatsBuilder`'s resolved/reopen exclusion logic (bot-resolve-with-handoff exclusion, `event_end_time`-based reopen join). Changing one without the other makes drilldown rows disagree with card counts.
- Enterprise jbuilder views follow the same conventions as OSS ([[api-v1-controllers]]): `payload` array + `api/v1/models/` partials, `formats: [:json]` on every `json.partial!`, epoch ints for Captain timestamps.
- Views count (111) is identical on both branches; only content of the two Captain index views differs. Roughly 15 of the 111 were read for this page; the rest were sampled by directory pattern — per-file claims outside the sampled set are extrapolated from the naming convention, not read.

## Related

- [[controllers-jobs-listeners]] — the controllers these views render for, the `prepend_mod_with` wiring, and the `enterprise/app/fields` classes behind the `fields/*` partials
- [[models-services]] — `AccountSamlSettings`, Captain models, SLA/company/call models these builders and partials serialize
- [[captain-ai]] — the Captain subsystem the analytics builders report on
- [[backend-support-objects]] — OSS `app/builders` (the classes the `Enterprise::*` modules prepend into) and OSS Super Admin fields
- [[account-onboarding]] — SAML SSO login/invite flow around `SamlUserBuilder`
- [[portal-survey-superadmin]] — the Super Admin console that renders the `fields/*` partials
- [[api-v1-controllers]] — OSS jbuilder/view conventions these views follow
- [[plan-tiers-billing]] — `subscribed_features`, premium feature lists, `ChatwootHub.pricing_plan`
- [[notifications]] — mailer infrastructure related to the Devise mailer override
