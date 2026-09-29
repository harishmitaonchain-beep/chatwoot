---
title: "Enterprise Models & Services"
tags: [chatwoot, enterprise, backend, captain, billing, sla]
generated: 2026-08-17
deepwiki_section: "AI and Automation"
---

# Enterprise Models & Services

## Purpose

`enterprise/app/models` and `enterprise/app/services` hold the paid-tier ("EE") data model and business logic that Chatwoot Cloud and self-hosted-Enterprise installs load on top of the OSS core (`app/models`, `app/services`). This is where SLAs, custom roles, agent capacity policies, SAML SSO, Stripe billing, WhatsApp/Twilio voice calling, and the entire Captain AI subsystem (assistants, documents, tools, copilot, FAQ generation) live. Almost nothing here stands alone — most files either extend a core OSS class via `prepend_mod_with`/`include_mod_with`, or are net-new tables/services that OSS models `has_many`/`belongs_to` into once the module is loaded.

## Key Files & Classes

**Extension points (prepend/include into OSS classes)**
- `enterprise/app/models/enterprise/application_record.rb`, `enterprise/app/models/enterprise/account.rb`, `enterprise/app/models/enterprise/account/plan_usage_and_limits.rb` — prepended onto `Account`; add SAML/billing-currency/Captain-plan-limit logic and `usage_limits` (agents/inboxes/Captain documents & responses).
- `enterprise/app/models/enterprise/concerns/account.rb` (`Audit::Account` sibling too) — included into `Account`; declares the EE `has_many` associations (`sla_policies`, `custom_roles`, `agent_capacity_policies`, `captain_assistants`, `companies`, `calls`, `saml_settings`, etc.).
- `enterprise/app/models/enterprise/inbox.rb`, `enterprise/app/models/enterprise/concerns/inbox.rb`, `enterprise/app/models/enterprise/inbox_agent_availability.rb` — prepended/included into `Inbox`; add `captain_active?`, capacity-aware `member_ids_with_assignment_capacity`, max-assignment-limit enforcement.
- `enterprise/app/models/enterprise/conversation.rb`, `enterprise/app/models/enterprise/concerns/conversation.rb` — prepended/included into `Conversation`; SLA policy association, Captain pending→open status resolution, applied-SLA completion bookkeeping.
- `enterprise/app/models/enterprise/message.rb`, `enterprise/app/models/enterprise/concerns/message.rb` — prepended into `Message`; adds `has_one :call`, `captain_response_triggering?` scope, and the logic that reopens a resolved conversation or flips a pending one back to open when a human agent replies around Captain.
- `enterprise/app/models/enterprise/automation_rule.rb` — prepended into `AutomationRule`; adds `sla_policy_id` as a condition and `add_sla` as an action.
- `enterprise/app/models/enterprise/channelable.rb` — prepended into channel models; writes `Enterprise::AuditLog` entries on channel config changes (skips template-only WhatsApp updates).
- `enterprise/app/models/enterprise/channel/twilio_sms.rb` — prepended into `Channel::TwilioSms`; adds voice-calling fields/validations, TwiML app provisioning, and delegates outbound calls to `Voice::Provider::Twilio::Adapter`.
- `enterprise/app/models/enterprise/audit_log.rb` (`Enterprise::AuditLog < Audited::Audit`) plus `enterprise/app/models/enterprise/audit/*.rb` — per-model `audited` concerns (Account, User, Conversation, Inbox, Macro, Webhook, AgentBot, Team, etc.) included into their OSS counterparts to drive the Audit Logs feature.
- `enterprise/app/services/enterprise/action_service.rb` — included into `ActionService`; implements the `add_sla` automation action (gated on the `sla` feature flag).
- `enterprise/app/services/enterprise/auto_assignment/assignment_service.rb` — included into the OSS auto-assignment service; layers assignment-policy config, capacity filtering, and a balanced-vs-round-robin selector switch on top.
- `enterprise/app/services/enterprise/macros/execution_service.rb` — included into macro execution; blocks `resolve_conversation`/`change_status(resolved)` when required conversation custom attributes are missing.
- `enterprise/app/services/enterprise/message_templates/hook_execution_service.rb` — included into the message-template hook service; routes inbound messages to Captain (`Captain::Conversation::ResponseSchedulerService`) or performs a usage-limit handoff, and suppresses greeting/OOO/email-collect templates while Captain owns the conversation.
- `enterprise/app/services/enterprise/whatsapp/providers/whatsapp_cloud_service.rb` — included into the WhatsApp Cloud provider service; adds the Graph API calling endpoints (`pre_accept_call`, `accept_call`, `reject_call`, `terminate_call`, `initiate_call`, `update_calling_status`).
- `enterprise/app/services/enterprise/search_service.rb` — included into the message search service; adds sender/time-range/inbox filters used by the Application API's advanced search.

**Net-new EE models (own tables, no core equivalent)**
- `enterprise/app/models/sla_policy.rb`, `sla_event.rb`, `applied_sla.rb` — SLA policy definitions, per-conversation applications, and the FRT/NRT/RT breach event log; `AppliedSla#due_at_values` computes deadlines via `Sla::BusinessHoursService` when `only_during_business_hours` is set.
- `enterprise/app/models/custom_role.rb` — account-scoped custom permission sets (`conversation_manage`, `report_manage`, `knowledge_base_manage`, etc.), with unread-count cache invalidation hooks on permission changes.
- `enterprise/app/models/agent_capacity_policy.rb` / `inbox_capacity_limit.rb` — per-inbox open-conversation caps per agent, joined through `account_users`.
- `enterprise/app/models/account_saml_settings.rb` — one-per-account SAML IdP config (certificate, SSO URL, entity IDs); flips `account_users.provider` between `email`/`saml` via `Saml::UpdateAccountUsersProviderJob`.
- `enterprise/app/models/company.rb` — CRM-style company records linked to contacts, with favicon fetch and domain uniqueness per account.
- `enterprise/app/models/call.rb` — unified voice/WhatsApp call record (Twilio + WhatsApp Calling API), conference/recording metadata, `push_event_data` for the frontend call bubble.
- `enterprise/app/models/conversation_outcome.rb` — Captain-owned per-conversation "episode" tracking (handoff reason, CSAT, first/last Captain reply) with half-open-interval `covering` scope.
- **Captain namespace** (`enterprise/app/models/captain/*`): `assistant.rb` (the AI agent config: guardrails, response guidelines, auto-resolve mode, audience targeting via `Captain::AudienceMatcher`), `document.rb` (knowledge-base sources, SSRF-safe citation URLs, sync-status state machine), `custom_tool.rb` (user-defined HTTP tools with Liquid templating, SSRF-safe endpoint validation, 15-per-account cap), `agent_session.rb` (assistant/copilot run ledger with polymorphic subject/result), plus `assistant_response.rb`, `faq_observation.rb`, `faq_suggestion.rb`, `scenario.rb`, `message_report.rb`.
- `enterprise/app/models/captain_inbox.rb` — join table wiring one `Captain::Assistant` to one `Inbox` (unique per inbox).
- `enterprise/app/models/concerns/agentable.rb`, `toolable.rb`, `captain_tools_helpers.rb`, `safe_endpoint_validatable.rb` — shared Captain building blocks: `Agentable` builds a `RubyLLM`-style `Agents::Agent` from a model's `agent_instructions`/`agent_tools`/`agent_model`; `Toolable` dynamically builds a `Captain::Tools::HttpTool` subclass per custom tool; `SafeEndpointValidatable` blocks non-HTTPS/localhost/IP/non-ASCII custom-tool endpoints (SSRF guard).

**Services by domain**
- `enterprise/app/services/captain/**` (~70 files) — the largest cluster: `assistant/agent_runner_service.rb` + helpers run the LLM agent loop; `llm/*_service.rb` are per-task OpenAI-backed services (article writer, FAQ generator, contact attributes/notes, embeddings, translation, widget tagline); `tools/**` are the built-in and Copilot agent tools (search articles/contacts/conversations, HTML crawling, Linear search); `documents/sync_service.rb` + `single_page_fetcher.rb` crawl knowledge-base sources; `conversation/response_scheduler_service.rb` and `conversation_events.rb` drive when/how Captain replies and logs handoffs; `assistant_migration/*` handles V1→V2 instruction auditing/classification.
- `enterprise/app/services/enterprise/billing/**` — Stripe integration: `create_session_service.rb`, `create_stripe_customer_service.rb`, `handle_stripe_event_service.rb` (subscription webhook processing, Captain credit reconciliation, currency assignment), `reconcile_plan_features_service.rb`, `currencies.rb`, `plan_configuration.rb`, `topup_checkout_service.rb`/`topup_fulfillment_service.rb`, `cancel_cloud_subscriptions_service.rb`.
- `enterprise/app/services/enterprise/auto_assignment/**` — `assignment_service.rb` (see above), `balanced_selector.rb`, `capacity_service.rb` (`agent_has_capacity?` checks a user's `AgentCapacityPolicy` against open-conversation count per inbox).
- `enterprise/app/services/sla/**` — `evaluate_applied_sla_service.rb` (checks FRT/NRT/RT thresholds, creates `SlaEvent`s and notifications on miss, flips `AppliedSla#sla_status`), `business_hours_service.rb`, `backfill_applied_sla_completed_at_service.rb`.
- `enterprise/app/services/voice/**` and `enterprise/app/services/whatsapp/**` (call-related) — Twilio and WhatsApp Calling API adapters, conference/call-status managers, call transcription; see `docs/WHATSAPP_CALL_ARCHITECTURE.md` for the authoritative deep dive (not duplicated here).
- `enterprise/app/services/companies/**`, `contacts/company_association_service.rb` — company/contact matching (business-email detection, membership sync).
- `enterprise/app/services/cloudflare/**` — custom-hostname provisioning for Help Center custom domains.
- `enterprise/app/services/internal/**` — Chatwoot-internal (not customer-facing) account analysis/threat detection and marketing-attribution tracking, used by Cloud ops.
- `enterprise/app/services/onboarding/**` — AI-assisted Help Center bootstrap during account onboarding.
- `enterprise/app/services/llm/base_ai_service.rb` — shared low-level OpenAI client wrapper other LLM services build on.

## How It Fits Together

- **Loading mechanism**: OSS classes call `SomeClass.prepend_mod_with('SomeClass')` / `.include_mod_with('SomeClass')` at the bottom of the file (e.g. `app/models/account.rb`, `app/models/inbox.rb`, `app/models/conversation.rb`, `app/models/message.rb`, `app/models/automation_rule.rb`, `app/services/action_service.rb`). This resolves to the `Enterprise::*` module of the same name if the enterprise overlay is loaded, otherwise it's a no-op — the standard Chatwoot EE extension pattern.
- **Automation rules** ([[automation-rules]]): `Enterprise::AutomationRule` adds the `add_sla` action; `Enterprise::ActionService` (mixed into [[conversations-services]]'s `ActionService`) implements it, guarded by `account.feature_enabled?('sla')`.
- **Macros** ([[macros]]): `Enterprise::Macros::ExecutionService` blocks resolving a conversation via macro when required custom attributes (`conversation_required_attributes`, gated by the `conversation_required_attributes` feature) are missing.
- **Assignment** ([[assignment]]): `Enterprise::AutoAssignment::AssignmentService` and `Enterprise::Inbox`/`Enterprise::InboxAgentAvailability` layer capacity-policy filtering and a balanced selector on top of OSS round-robin, gated by the `advanced_assignment` feature flag (itself auto-synced from `assignment_v2` in `Enterprise::Account#sync_assignment_features`).
- **Captain and conversations**: `Enterprise::MessageTemplates::HookExecutionService` is the entry point from an inbound message into Captain — it decides between scheduling an AI response (`Captain::Conversation::ResponseSchedulerService`), performing a usage-limit handoff, or suppressing OSS greeting/OOO/email-collect templates. `Enterprise::Message`/`Enterprise::Conversation` handle the reverse direction: a human reply reopens a Captain-pending conversation and logs an activity message via [[jobs]] (`Conversations::ActivityMessageJob`). `ConversationOutcome` records the resulting episode for reporting.
- **Billing**: Stripe webhooks land in `Enterprise::Billing::HandleStripeEventService`, which updates `Account#custom_attributes` (plan name, currency, subscription status), calls `Enterprise::Billing::ReconcilePlanFeaturesService` to flip feature flags, and reconciles Captain response credits — all consumed by `Enterprise::Account::PlanUsageAndLimits#usage_limits`, which gates Captain document/response creation (see `Captain::Document#ensure_within_plan_limit`).
- **Audit Logs**: `Enterprise::AuditLog < Audited::Audit` plus the per-model `Enterprise::Audit::*` concerns (included into `Account`, `User`, `Conversation`, `Inbox`, `Macro`, `Webhook`, `AgentBot`, `Team`, their member join models, and `AutomationRule`) drive the Advanced Features "audit logs" product surface; `Enterprise::Channelable` additionally writes audit entries on channel config changes.
- **SAML**: `AccountSamlSettings` drives `account.saml_enabled?`; on create/destroy it enqueues `Saml::UpdateAccountUsersProviderJob` to flip `account_users.provider`, which the login flow ([[account-onboarding]]) checks.
- **Voice/WhatsApp calling**: `Call`, `Enterprise::Channel::TwilioSms`, and the `Voice::*`/`Whatsapp::*` (call) services connect to [[whatsapp]] and [[other-channels]] (Twilio) — this is covered in depth by the existing `docs/WHATSAPP_CALL_ARCHITECTURE.md`, not restated here.
- **Controllers/jobs/listeners that call into this module** live in the companion page [[controllers-jobs-listeners]] (e.g. Stripe webhook controller invoking `HandleStripeEventService`, SLA sweep jobs invoking `Sla::EvaluateAppliedSlaService`, Captain document sync jobs).

## Product Behavior

- SLA policies, agent capacity policies, and audit logs map to the official guide's **Advanced features** topics ("SLAs", "agent capacity policies", "audit logs").
- Custom roles map to **Features explained → role-based permissions**.
- SAML maps to **Advanced features → SAML auth**.
- The Captain models/services underpin the **Captain (AI agent)** guide category end to end: assistants, documents, FAQs, Memories (`Captain::FaqObservation`/`FaqSuggestion`), Copilot, custom tools, and AI credits (Stripe topups/plan limits in `Enterprise::Billing`).
- `Call` and the Twilio/WhatsApp calling services back **Voice Channels** (Twilio voice, WhatsApp voice calling).
- Per the **Enterprise Edition** doc page, all of this is gated behind `ChatwootApp.chatwoot_cloud?` / `ChatwootApp.self_hosted_enterprise?` and account `feature_enabled?` flags — self-hosted OSS installs without the enterprise overlay never load this code at all.

## Notes for AI Agents

- **The extension pattern is load-bearing, not optional.** Adding a method to `Account`, `Inbox`, `Conversation`, `Message`, or `AutomationRule` in the EE overlay means adding it to the matching `Enterprise::*` module and confirming the OSS file's `prepend_mod_with`/`include_mod_with` call already exists — grep the OSS file before assuming a hook is missing.
- **`prepend` vs `include` matters here.** `Enterprise::Message`, `Enterprise::Conversation`, `Enterprise::Account`, `Enterprise::Inbox`, `Enterprise::AutomationRule` are *prepended* (so `super` calls into OSS behavior from EE, letting EE short-circuit or wrap it); the `Enterprise::Concerns::*` and `Enterprise::Audit::*` modules are *included* (pure additions — associations, `audited` calls). `Enterprise::Channelable` explicitly notes in a comment that `ActiveSupport::Concern`'s `included do` runs methods too early in the lookup chain for override behavior, so it manually `prepend`s an inner `InstanceMethods` module — a pattern worth copying if you need to override a method from a concern.
- **Feature flags gate almost everything.** `sla`, `advanced_assignment`, `assignment_v2`, `conversation_required_attributes`, `captain_integration` / `captain_integration_v2`, `api_and_webhooks` are checked directly in these services (e.g. `Enterprise::ActionService#add_sla` no-ops if `sla` is off even if an `SlaPolicy` row exists). Don't assume a record's existence implies the feature is active.
- **Captain has a V1→V2 split** (`captain_integration` vs `captain_integration_v2`, `CAPTAIN_V2_DEFAULT_ELIGIBLE` internal attribute, `assistant_migration/*` services). New Captain work should check which version an account is on rather than assuming V2 everywhere.
- **SSRF guards are duplicated, not shared, across two features.** `Captain::Document#customer_visible_uri?`/`publicly_routable_address?` and `Concerns::SafeEndpointValidatable` (used by `Captain::CustomTool`) both re-implement "don't let this URL point at an internal host," using different techniques (`SsrfFilter` DNS resolution vs. regex/host-blocklist). If you touch one, check whether the other needs the same fix.
- **Captain credit math is easy to get wrong.** `Enterprise::Billing::HandleStripeEventService#adjust_captain_credits`/`handle_plan_change_credits` do manual delta arithmetic against `account.limits['captain_responses']` distinguishing plan credits from top-up credits — per project memory this has had at least one real bug (credits stuck at 0 after cancel+resubscribe due to stale `plan_name`). Re-derive the math from `previous_usage`/`new_plan_credits` carefully rather than pattern-matching nearby code.
- **`Captain::CustomTool#tool`** dynamically defines and registers a Ruby class per invocation under `Concerns::Toolable::CustomTools`, keyed by slug — it explicitly removes and re-`const_set`s the constant each time "to reflect current metadata," since anonymous classes break the LLM API's function-name requirement. This is intentional metaprogramming, not a leak to clean up.
- **`AppliedSla`/`SlaEvent` back-fill their own foreign keys** in `before_validation` callbacks (`ensure_account_id`, `ensure_applied_sla_id`, etc.) rather than requiring callers to pass them — follow that convention rather than making callers thread `account_id` through manually.
- Enterprise services that override OSS services do so via **Ruby `include`/module composition into the OSS service class**, not via a Pundit-style policy indirection layer — when tracing behavior for a core service like `ActionService` or the macro/message-template hook services, always check for a same-named `enterprise/app/services/enterprise/...` module before concluding OSS code is the whole story.
- Some services in this tree are **not Enterprise-Cloud-gated at all** — `enterprise/app/services/internal/**` is Chatwoot-internal tooling (account risk analysis, marketing attribution) that only makes sense on Chatwoot Cloud infrastructure, not a customer-facing EE feature; don't assume everything under `enterprise/` is a paid customer feature.

## Related

- [[models]] — the OSS models these prepend/include into (`Account`, `Inbox`, `Conversation`, `Message`, `AutomationRule`).
- [[conversations-services]] — `ActionService`, macro execution, message-template hooks that this module extends.
- [[automation-rules]] — automation rule engine extended by `Enterprise::AutomationRule` / `Enterprise::ActionService`.
- [[macros]] — macro execution extended by `Enterprise::Macros::ExecutionService`.
- [[assignment]] — round-robin/auto-assignment extended by `Enterprise::AutoAssignment::*`.
- [[captain-ai]] — the broader Captain AI/LLM subsystem this module's `Captain::*` models and services implement.
- [[whatsapp]] — WhatsApp channel/calling integration touched by `Enterprise::Whatsapp::Providers::WhatsappCloudService` and `Call`.
- [[other-channels]] — Twilio SMS/voice extended by `Enterprise::Channel::TwilioSms`.
- [[reports]] — SLA and Captain conversation-outcome data feeds SLA/bot reports.
- [[authorization-policies]] — `CustomRole` permissions consumed by Pundit policies.
- [[controllers-jobs-listeners]] — the companion enterprise page: controllers, jobs, and listeners that call into these models/services (Stripe webhooks, SLA sweep jobs, Captain document sync jobs).
- [[jobs]] — background jobs enqueued by this module (`Captain::Documents::CrawlJob`, `Saml::UpdateAccountUsersProviderJob`, `Conversations::ActivityMessageJob`, etc.).
