---
title: "Enterprise Controllers, Jobs, Listeners, Fields"
tags: [chatwoot, enterprise, backend, whatsapp-calling, captain, billing]
generated: 2026-08-17
deepwiki_section: "Configuration and Feature Management"
---

# Enterprise Controllers, Jobs, Listeners, Fields

## Purpose

This is the "everything except models/services" half of the `enterprise/` overlay (see [[models-services]] for the model/service half): the HTTP-facing controllers, background jobs, event listeners/dispatchers, Super Admin `administrate` fields, query finders and an audience validator that only exist in Chatwoot's Enterprise Edition. It covers premium/Cloud-only surface area: WhatsApp/Twilio voice calling, Captain AI (assistants, document sync, copilot, FAQ, conversation outcomes), SLAs, SAML SSO, Stripe billing, agent capacity policies, custom roles, audit logs, Cloud-only Super Admin tooling, and CSAT/company/portal extensions layered onto OSS controllers.

Two structurally different kinds of files live side by side here:
- **Standalone Enterprise-only classes** — new controllers/jobs/finders that have no OSS counterpart (e.g. `CallFinder`, `Twilio::VoiceController`, `Sla::ProcessAppliedSlaJob`). These are just regular Rails classes loaded from `enterprise/app` because it's an added autoload/eager-load path.
- **Extension modules** — `module Enterprise::Foo::Bar` files that get spliced into an OSS class at boot via `prepend_mod_with`/`include_mod_with`, adding or overriding behavior on an existing OSS controller, job, listener, finder, or dispatcher (e.g. `Enterprise::Api::V1::Accounts::InboxesController`, `Enterprise::Webhooks::WhatsappEventsJob`, `Enterprise::ConversationFinder`).

## Key Files & Classes

**Wiring mechanism**
- `config/initializers/01_inject_enterprise_edition_module.rb` — defines `prepend_mod_with`/`include_mod_with`/`extend_mod_with` on `Module`. Given a constant name, it looks up `Enterprise::<ConstantName>` (via `ChatwootApp.extensions`, i.e. the `enterprise` namespace) and prepends/includes it if present. OSS files call `SomeClass.prepend_mod_with('SomeClass')` at the bottom; if `enterprise/app/.../some_class.rb` defines `module Enterprise::SomeClass`, it gets spliced into the ancestor chain automatically.
- `enterprise/lib/enterprise.rb` — just `module Enterprise; end`, the empty root namespace all the `Enterprise::*` extension modules nest under.

**Dispatchers & listeners (event system, see [[events-listeners]])**
- `enterprise/app/dispatchers/enterprise/async_dispatcher.rb`, `enterprise/app/dispatchers/enterprise/sync_dispatcher.rb` — append Captain listeners (`CaptainListener`, `Captain::ReportingEventListener`, `Captain::ConversationOutcomeEventListener`) to the OSS `AsyncDispatcher`/`SyncDispatcher` listener lists via `super + [...]`.
- `enterprise/app/listeners/captain_listener.rb` — on `message_updated`, records CSAT into `Captain::ConversationOutcomeTracker` when the message is an input-CSAT reply; on `conversation_resolved`, triggers Captain memory-note generation (`Captain::Llm::ContactNotesService`) and enqueues `Captain::Llm::ConversationFaqJob` if the assistant has `feature_memory`/`feature_faq` config enabled.
- `enterprise/app/listeners/captain/reporting_event_listener.rb` — on `captain_conversation_handed_off`/`captain_conversation_resolved` (source `'inference'` only), writes a `ReportingEvent` row with time-to-event.
- `enterprise/app/listeners/captain/conversation_outcome_event_listener.rb` — feeds `Captain::ConversationOutcomeTracker` from `message_created` (human reply), `captain_conversation_handed_off` (handoff), and `conversation_updated` (reopen, detected via `changed_attributes['status'][0] == 'resolved'`).
- `enterprise/app/listeners/enterprise/action_cable_listener.rb` — extension module prepended onto OSS `ActionCableListener`; adds `copilot_message_created` to broadcast Copilot messages to the requesting user's pubsub token.

**Controllers — WhatsApp / Twilio voice calling**
- `enterprise/app/controllers/api/v1/accounts/whatsapp_calls_controller.rb` — the densest file in this module. Handles `show`/`accept`/`reject`/`terminate`/`upload_recording`/`initiate` for WhatsApp Business Calling. Notable: builds/reuses a `conversation` only after a dial succeeds (so a failed call leaves nothing to roll back); a `RecordNotUnique` race on `provider_call_id` (webhook beat the controller to inserting the `Call` row) is reconciled by re-fetching rather than erroring; distinguishes 409 (`already_accepted`/`already_ended`) from 422 (permission-required / generic failure) so the frontend can tell "stale ringing UI" from "real failure".
- `enterprise/app/controllers/api/v1/accounts/calls_controller.rb` — thin `index` wrapper around `CallFinder`.
- `enterprise/app/controllers/api/v1/accounts/conference_controller.rb`, `enterprise/app/controllers/api/v1/accounts/contacts/calls_controller.rb` — additional voice/conference endpoints (not read in full).
- `enterprise/app/controllers/twilio/voice_controller.rb` — Twilio TwiML webhook endpoints (`call_twiml`, `status`, `conference_status`, `recording_status`) for the Twilio-voice inbox type. Resolves inbound/outbound/agent legs, builds/joins Twilio conferences, and persists `Call#conference_sid`/`twilio_conference_sid`. Rejects a fresh inbound leg with empty TwiML if the inbox has inbound calls disabled.
- `enterprise/app/finders/call_finder.rb` — paginated `Call` query with visibility scoping: admins/`report_manage` custom-role users see the whole account; everyone else is restricted to calls they personally handled within conversations `Conversations::PermissionFilterService` still lets them access.

**Controllers — Captain AI**
- `enterprise/app/controllers/api/v1/accounts/captain/*` — 13 controllers covering assistants, documents, custom tools, scenarios, agent sessions, bulk actions, copilot threads/messages, FAQ suggestions, message reports, inboxes.
- `enterprise/app/finders/captain/faq_suggestion_finder.rb` — scopes FAQ suggestions to conversations the current user can access (via `Captain::FaqObservation` → `PermissionFilterService`) unless the user is an admin.
- `enterprise/app/validators/captain/audience_validator.rb` — validates a Captain campaign/scenario `audience` condition tree (recursive AND/OR groups up to `Captain::AudienceMatcher::MAX_DEPTH`, per-attribute allowed operator sets for standard vs. custom contact attributes).
- `enterprise/app/controllers/enterprise/webhooks/firecrawl_controller.rb` — Firecrawl crawl-page webhook; validates a per-assistant HMAC-style token (`Captain::FirecrawlHelper`) before enqueuing `Captain::Tools::FirecrawlParserJob`.

**Jobs — Captain**
- `enterprise/app/jobs/captain/conversation/response_builder_job.rb` — orchestrates AI reply generation for a conversation; branches between a v1 flow (`generate_and_process_response`, with action classification and "false promise" repair) and a v2 flow (`generate_response_with_v2`, tool-using agent runner) gated by `captain_v2_enabled?`. Discards stale generations if a newer customer message arrived while generating.
- `enterprise/app/jobs/captain/documents/perform_sync_job.rb` — syncs a Captain knowledge-base document. Uses a Redis mutex per document (`with_lock`/`LOCK_TIMEOUT`), and layers three `retry_on`/`discard_on` policies: `PermanentSyncError` (404/403/empty) discards immediately, `TransientSyncError` (network/5xx) retries 4x with custom per-attempt backoff, and any other `StandardError` retries 3x and reports to Sentry only on final exhaustion (to avoid one Sentry event per attempt).
- `enterprise/app/jobs/captain/inbox_pending_conversations_resolution_job.rb` — auto-resolves or hands off pending conversations that have gone inactive past `captain_assistant.inactivity_threshold_minutes`. Two modes: pure time-based, or (if `captain_tasks` feature + assistant config enabled) LLM-evaluated via `Captain::ConversationCompletionService`, re-validating pending/inactive state under a row lock immediately before transitioning to guard against races with a human reply.
- `enterprise/app/jobs/captain/articles/translate_job.rb`, `documents/crawl_job.rb`, `documents/schedule_syncs_job.rb`, `llm/conversation_faq_job.rb`, `llm/update_embedding_job.rb`, `tools/firecrawl_parser_job.rb`, `tools/simple_page_crawl_parser_job.rb`, `copilot/response_job.rb` — sampled but not read in full; names indicate document crawling/embedding pipeline and Copilot response generation.

**Jobs — SLA**
- `enterprise/app/jobs/sla/trigger_slas_for_accounts_job.rb` (scheduled) → `Sla::ProcessAccountAppliedSlasJob` (per account) → `Sla::ProcessAppliedSlaJob` (per `AppliedSla`) → `Sla::EvaluateAppliedSlaService`. Each layer independently re-checks `account.feature_enabled?('sla')` because a job can already be queued when a plan is downgraded mid-flight — the comments explicitly flag this as defense against a stale-queue race, not redundant guarding.

**Jobs — webhooks / misc**
- `enterprise/app/jobs/enterprise/webhooks/whatsapp_events_job.rb` — extension module prepended onto OSS `Webhooks::WhatsappEventsJob` (see [[whatsapp]]). Intercepts `field=calls` webhook payloads before the OSS message-handling path, routing `value.calls[]`/`value.statuses[]` (Meta's two shapes for connect/terminate vs. ringing/accepted) into `Whatsapp::IncomingCallService`, each serialized under a per-`call_id` Redis mutex distinct from the OSS per-sender mutex. Also intercepts `call_permission_reply` interactive-message replies into `Whatsapp::CallPermissionReplyService`.
- `enterprise/app/jobs/enterprise/create_stripe_customer_job.rb`, `enterprise/webhooks/whatsapp_events_job.rb`'s sibling `enterprise/webhooks/stripe_controller.rb` — Stripe billing plumbing (verifies webhook signature via `Stripe::Webhook.construct_event`, delegates to `Enterprise::Billing::HandleStripeEventService`).
- `enterprise/app/jobs/enterprise/account/conversations_resolution_scheduler_job.rb`, `enterprise/cloudflare_verification_job.rb`, `enterprise/delete_object_job.rb`, `enterprise/internal/check_new_versions_job.rb`, `enterprise/internal/trigger_daily_scheduled_items_job.rb`, `enterprise/trigger_scheduled_items_job.rb` — scheduled/internal Cloud jobs (sampled by name only).
- `enterprise/app/jobs/voice/call_transcription_job.rb`, `voice/provider/twilio/recording_attachment_job.rb`, `messages/audio_transcription_job.rb` — voice call recording/transcription pipeline (not read in full).
- `enterprise/app/jobs/migration/*`, `companies/delete_job.rb`, `companies/sync_contact_names_job.rb`, `saml/update_account_users_provider_job.rb`, `onboarding/help_center_article_*`, `portal/article_indexing_job.rb` — one-off/maintenance jobs (sampled by name only, not read).

**Controllers — Auth / SAML / DeviseOverrides**
- `enterprise/app/controllers/enterprise/devise_overrides/omniauth_callbacks_controller.rb` — extension module adding SAML support to the OSS OmniAuth callback flow: `redirect_callbacks`/`omniauth_success` branch on `provider == 'saml'`; `handle_saml_auth` builds/signs in a user via `SamlUserBuilder`, gated by `account.feature_enabled?('saml')` and presence of an `AccountSamlSettings` row; distinguishes mobile deep-link error redirects (via a `RelayState == 'mobile'` convention) from web login-page redirects.
- `enterprise/app/controllers/api/v1/accounts/saml_settings_controller.rb`, `enterprise/config/initializers/omniauth_saml.rb` — SAML settings CRUD and the `omniauth-saml` strategy initializer.
- `enterprise/app/controllers/enterprise/devise_overrides/sessions_controller.rb`, `passwords_controller.rb` — small Enterprise overrides on Devise session/password controllers.

**Controllers — Billing / Accounts**
- `enterprise/app/controllers/enterprise/api/v1/accounts_controller.rb` — standalone (non-extension) controller mounted under the `enterprise` route namespace: Stripe subscription/checkout, currency selection (`billing_currency_selection_required?`, locked once a Stripe customer exists or is being created), plan `limits`, soft-delete (`toggle_deletion`), and credit top-ups (`Enterprise::Billing::TopupCheckoutService`).
- `enterprise/app/controllers/enterprise/api/v1/accounts_settings.rb` — extension module on OSS `Api::V1::AccountsSettings` (this is the **only** file in this module found wired via an explicit `prepend_mod_with('Api::V1::AccountsSettings')` call on the OSS side, at `app/controllers/api/v1/accounts_controller.rb:152`). Adds marketing-attribution recording on account creation, suppresses the self-hosted "new version available" banner on Cloud, and permits `conversation_required_attributes` in settings params.
- `enterprise/app/controllers/enterprise/api/v2/accounts_controller.rb` — v2 accounts endpoint variant.

**Controllers — misc extension modules on OSS controllers**
- `enterprise/app/controllers/enterprise/api/v1/accounts/inboxes_controller.rb` — adds `auto_assignment_config.max_assignment_limit` to permitted inbox attributes; adds `enable_whatsapp_calling`/`disable_whatsapp_calling`/`set_inbound_calls` actions (the last saved with `validate: false` to bypass WhatsApp's remote credential re-check on what is just a flag toggle); adds a `voice` channel type backed by `Channel::TwilioSms` with `medium: :sms, voice_enabled: true`.
- `enterprise/app/controllers/enterprise/api/v1/accounts/conversations_controller.rb` — adds `inbox_assistant` (surfaces the Captain assistant for a conversation's inbox) and `reporting_events`; merges `sla_policy_id` into permitted update params only when the account's `sla` feature is enabled.
- `enterprise/app/controllers/enterprise/api/v1/accounts/agents_controller.rb`, `contacts_controller.rb`, `csat_survey_responses_controller.rb`, `onboardings_controller.rb`, `portals_controller.rb`, `articles/bulk_actions_controller.rb` — smaller extension modules (sampled by name, not all read in full).

**Controllers — Super Admin / other**
- `enterprise/app/controllers/super_admin/enterprise_base_controller.rb` — 2-line base class for Enterprise Super Admin controllers.
- `enterprise/app/controllers/super_admin/responses_controller.rb`, `response_documents_controller.rb` — internal "canned response library" admin CRUD.
- `enterprise/app/controllers/enterprise/super_admin/accounts_controller.rb`, `app_configs_controller.rb` — extension modules on OSS Super Admin controllers. `app_configs_controller.rb` gates additional `GlobalConfig` keys (custom branding, internal Cloud secrets, Captain provider keys, SAML toggle) behind `ChatwootHub.pricing_plan != 'community'`.
- `enterprise/app/controllers/enterprise/widgets_controller.rb`, `custom_domains_controller.rb` (portal custom-domain SSL Cloudflare verification challenge endpoint), `enterprise/api/v1/accounts/companies/*`, `enterprise/api/v1/accounts/agent_capacity_policies*`, `sla_policies_controller.rb`, `custom_roles_controller.rb`, `audit_logs_controller.rb`, `applied_slas_controller.rb`, `reporting_events_controller.rb` — Cloud/Enterprise-only resource CRUD controllers, mostly thin (`Api::V1::Accounts::EnterpriseAccountsController` subclasses); sampled by name.

**Finders (query objects, extension + standalone)**
- `enterprise/app/finders/enterprise/conversation_finder.rb` — extension module on OSS `ConversationFinder`; eager-loads `applied_sla`/`sla_events`/`inbox.working_hours` only when `sla` feature is enabled.
- `enterprise/app/finders/enterprise/message_finder.rb` — extension module on OSS `MessageFinder`; eager-loads `call: [:contact, { inbox: :channel }]` on every conversation-messages query (unconditional — no feature-flag gate for calls, unlike the conversation finder's SLA gate).
- `enterprise/app/finders/call_finder.rb`, `enterprise/app/finders/captain/faq_suggestion_finder.rb` — standalone finders, see above.

**Fields (Super Admin `administrate` custom field renderers)**
- `enterprise/app/fields/account_features_field.rb` — trivial `to_s` passthrough.
- `enterprise/app/fields/account_limits_field.rb` — merges stored limits over a fixed default shape (`agents`, `inboxes`, `captain_responses`, `captain_documents`, `emails`) and renders as JSON.
- `enterprise/app/fields/captain_model_overrides_field.rb` — builds per-feature LLM routing rows for the Super Admin account view, resolving each via `Llm::FeatureRouter.resolve` and `Llm::Models`, including a special-cased default model when `captain_integration_v2` is enabled.
- `enterprise/app/fields/manually_managed_features_field.rb` — reads/writes the list of Business/Enterprise plan features an account admin has manually toggled, via `Internal::Accounts::InternalAttributesService`.

## How It Fits Together

- **Routing gate**: essentially all Enterprise routes in `config/routes.rb` are wrapped in `if ChatwootApp.enterprise?` — both entire route blocks (e.g. `namespace :enterprise do ... end` around the Stripe/billing routes) and individual lines inside the main `accounts` resource block (e.g. `resources :calls, only: [:index] if ChatwootApp.enterprise?`, `resources :whatsapp_calls`, `get :reporting_events`). This is the primary place OSS vs. Enterprise routing branches, separate from the `prepend_mod_with` mechanism used for behavior extension.
- **Extension wiring**: any OSS class ending in `SomeClass.prepend_mod_with('SomeClass')` (or `include_mod_with`/`extend_mod_with`) will pick up a same-named `Enterprise::SomeClass` module automatically if one exists under `enterprise/app` or `enterprise/lib` — confirmed for `AsyncDispatcher`, `SyncDispatcher`, `ConversationFinder`, `MessageFinder`, `ActionCableListener`, `Webhooks::WhatsappEventsJob`, and `Api::V1::AccountsController` (→ `AccountsSettings`). `enterprise/app/controllers/enterprise/concerns/application_controller_concern.rb` defines an empty `Enterprise::Concerns::ApplicationControllerConcern` module with no observed include site — likely a scaffold placeholder.
- **Events → listeners → jobs**: `conversation_resolved`/`message_updated`/`conversation_updated`/`message_created`/`captain_conversation_handed_off`/`captain_conversation_resolved` events (see [[events-listeners]]) drive Captain's CSAT tracking, memory-note generation, FAQ job enqueueing, and `ReportingEvent` writes. `CaptainListener#conversation_resolved` enqueues `Captain::Llm::ConversationFaqJob`; `Captain::Conversation::ResponseBuilderJob` is itself enqueued elsewhere (Captain's inbound-message pipeline, in [[models-services]]) and can enqueue further work through its v1/v2 branches.
- **Feature-flag gating**: nearly every Enterprise behavior checks `account.feature_enabled?('<key>')` against the keys in `enterprise/config/premium_features.yml` (`sla`, `custom_roles`, `captain_integration`, `captain_integration_v2`, `captain_document_auto_sync`, `csat_review_notes`, `conversation_required_attributes`, `audit_logs`, `disable_branding`) before doing anything — this repeats at multiple layers deliberately for SLA jobs (queue-then-downgrade race) but is a single unconditional include for the message-finder call preload.
- **Voice calling** ties together `enterprise/app/controllers/api/v1/accounts/whatsapp_calls_controller.rb` (WhatsApp), `enterprise/app/controllers/twilio/voice_controller.rb` (Twilio), `enterprise/app/jobs/enterprise/webhooks/whatsapp_events_job.rb` (inbound webhook routing), and `enterprise/app/finders/call_finder.rb`/`enterprise/app/finders/enterprise/message_finder.rb` (surfacing `Call` records in the UI) — all writing to the shared `Call` model. See prior investigation notes on WhatsApp call architecture for the DTLS/media-server side of this (`docs/WHATSAPP_CALL_ARCHITECTURE.md`, not part of this module).
- **Captain** spans this module (controllers/jobs/listeners here) and `enterprise/app/models`, `enterprise/app/services` (in [[models-services]]) plus `enterprise/lib/captain/*` (prompt templates, tool definitions, schemas — sampled but not detailed here).

## Product Behavior

- WhatsApp/Twilio voice calling backs the **Voice Channels** guide topics (Twilio voice, WhatsApp voice calling) — `whatsapp_calls_controller.rb`'s `initiate`/`accept`/`reject`/`terminate` actions and the inbox-level `enable_whatsapp_calling`/`set_inbound_calls` toggles are the backend for turning calling on per-inbox and placing/receiving calls.
- SLAs correspond to the **Advanced features → SLAs** guide topic; `sla_policies_controller.rb`/`applied_slas_controller.rb` and the `Sla::*` job chain are what evaluates and reports on SLA breach state.
- Captain AI controllers/jobs correspond to the **Captain** guide category (assistants, documents, FAQs, Memories, Copilot, custom tools, reply-control rules) — `captain/documents_controller.rb` + `Captain::Documents::PerformSyncJob` back "Documents" sync; `captain/custom_tools_controller.rb` backs "Custom tools"; `Captain::InboxPendingConversationsResolutionJob`'s inactivity auto-resolve/handoff backs "reply-control rules".
- SAML login (`omniauth_callbacks_controller.rb`, `saml_settings_controller.rb`) corresponds to the **Advanced features → SAML auth** guide topic.
- `agent_capacity_policies_controller.rb` and related sub-controllers correspond to the **Advanced features → agent capacity policies** guide topic.
- `custom_roles_controller.rb` corresponds to **Features explained → role-based permissions**.
- `audit_logs_controller.rb` corresponds to **Advanced features → audit logs**.
- Stripe billing controllers/jobs correspond to Chatwoot Cloud's plan/billing management, not directly named in the condensed guide list but adjacent to **Other topics → free trial limits**.

## Notes for AI Agents

- Two different extension mechanisms coexist and are easy to confuse: (1) `prepend_mod_with`/`include_mod_with`, which requires the OSS file to explicitly opt in (`SomeClass.prepend_mod_with('SomeClass')`) and only works if the Enterprise module is a same-named `Enterprise::SomeClass`; and (2) `ChatwootApp.enterprise?` conditional routing, which mounts wholly new Enterprise-only controllers with no OSS counterpart at all. Do not assume every `enterprise/app/controllers/**` file is an "extension module" — most are standalone classes (`Api::V1::Accounts::CallsController < Api::V1::Accounts::EnterpriseAccountsController`, not `module Enterprise::...`).
- Grepping found only **one** explicit OSS-side `prepend_mod_with` call for a controller (`Api::V1::AccountsController.prepend_mod_with('Api::V1::AccountsSettings')`). Other extension modules found here (`Enterprise::Api::V1::Accounts::InboxesController`, `ConversationsController`, action-cable listener, finders, dispatchers, whatsapp events job) rely on `prepend_mod_with`/`include_mod_with` calls that live in their respective OSS files under `app/` — this page did not exhaustively verify every one, so when adding a new Enterprise extension module, always check the target OSS class already has (or needs) the matching `prepend_mod_with`/`include_mod_with` call, since the Enterprise module alone does nothing without it.
- `enterprise/app/controllers/enterprise/concerns/application_controller_concern.rb` is an empty module with no include call found anywhere searched — treat it as unused scaffolding, not an active hook, unless you find a new usage.
- SLA jobs deliberately re-check `feature_enabled?('sla')` at every layer of the `TriggerSlasForAccountsJob → ProcessAccountAppliedSlasJob → ProcessAppliedSlaJob` chain — this is intentional defense against a plan-downgrade race with an already-queued job, not redundant code to simplify away.
- `Captain::Documents::PerformSyncJob` layers three separate `retry_on`/`discard_on` policies (permanent discard, transient 4x backoff, unexpected 3x-then-Sentry) — the ordering matters because `retry_on` handlers dispatch bottom-to-top in Rails; the top-most `retry_on StandardError` block is the catch-all and is declared first in the file for that reason.
- `WhatsappCallsController#create_call_record` handles a `RecordNotUnique` race against the inbound webhook job by re-querying rather than treating it as an error — a pattern worth mirroring anywhere a controller and an async webhook job can race to insert the same row keyed by an external provider id.
- `enterprise/app/finders/enterprise/message_finder.rb`'s call preload is unconditional (no feature flag), unlike `enterprise/app/finders/enterprise/conversation_finder.rb`'s SLA preload which is gated — don't assume all finder extensions here follow the same feature-flag-gating convention.
- Not exhaustively read: most `enterprise/app/jobs/captain/*`, `enterprise/app/jobs/migration/*`, `enterprise/app/jobs/voice/*`, `enterprise/app/jobs/onboarding/*`, several `enterprise/app/controllers/api/v1/accounts/captain/*` and `companies/*` controllers, and `enterprise/lib/captain/*` (prompt liquid templates, tool classes, schemas). Directory names and the files that were read strongly suggest their purpose, but verify by reading them directly before relying on specifics not stated here.

## Related
- [[models-services]] — the enterprise models/services these controllers and jobs call into (Captain, Billing, SLA, Voice services).
- [[whatsapp]] — OSS WhatsApp channel this module's calling/coexistence webhook extensions build on.
- [[other-channels]] — Twilio Voice channel base that `Twilio::VoiceController` and voice jobs extend.
- [[events-listeners]] — the OSS event dispatcher/listener pattern that `Enterprise::AsyncDispatcher`/`SyncDispatcher` and the Captain listeners plug into.
- [[jobs]] — OSS Sidekiq job conventions (`ApplicationJob`, `MutexApplicationJob`) these jobs inherit.
- [[captain-ai]] — Captain AI backend internals beyond this controllers/jobs layer.
- [[authorization-policies]] — Pundit policies (`authorize @call.conversation, :show?` etc.) used throughout these controllers.
- [[api-v1-controllers]] — the OSS `Api::V1::Accounts::*` controllers many of these extend or subclass (`EnterpriseAccountsController < BaseController`).
- [[account-onboarding]] — SAML/SSO and account creation flows extended by the Devise override modules.
