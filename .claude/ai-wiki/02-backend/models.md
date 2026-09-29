---
title: "Data Models"
tags: [chatwoot, backend, activerecord, multi-tenancy, channels]
generated: 2026-08-17
deepwiki_section: "Core Data Models"
---

# Data Models

## Purpose

`app/models` holds every ActiveRecord model for Chatwoot's Rails core: the multi-tenant account graph, the conversation/message/contact triad, the polymorphic inbox/channel system, and the supporting join and configuration models (labels, automation rules, webhooks, notifications, attachments). Every table in the OSS schema that isn't Enterprise-only is modeled here. Enterprise-only models (Captain, SLA, Company, CustomRole, AgentCapacityPolicy, Calls, SAML settings, etc.) live under `enterprise/app/models` and either subclass/extend these OSS models via `prepend_mod_with`/`include_mod_with` or stand alone as their own tables.

Sampling note: I read `application_record.rb`, `account.rb`, `conversation.rb`, `message.rb`, `inbox.rb`, `contact.rb`, `contact_inbox.rb`, `user.rb`, `account_user.rb`, `attachment.rb`, `agent_bot.rb`, `super_admin.rb`, `channel/whatsapp.rb`, `channel/api.rb`, `channel/email.rb` (header), `channel/web_widget.rb` (header), `integrations/hook.rb`, and roughly a dozen `concerns/*.rb` files in full. For the smaller/peripheral models (`assignment_policy.rb`, `campaign.rb`, `note.rb`, `notification.rb`, `custom_attribute_definition.rb`, `working_hour.rb`, `team.rb`, `data_import.rb`, `webhook.rb`, `automation_rule.rb`) I grepped associations/validations/enums rather than reading the full file — flagged inline below where relevant. Several channel subclasses (`facebook_page.rb`, `instagram.rb`, `line.rb`, `sms.rb`, `telegram.rb`, `tiktok.rb`, `twilio_sms.rb`, `twitter_profile.rb`) and some concerns (`assignment_handler.rb`, `auto_assignment_handler.rb`, `sort_handler.rb`, `push_data_helper.rb`, `sla_activity_message_handler.rb`, etc.) were not opened — the module is large (111 files, ~5.5k lines) and I sampled the ones most central to understanding the shape.

## Key Files & Classes

**Foundation**
- `app/models/application_record.rb` — abstract base class. Enforces a generic max-length validation on every string/text column (`MAX_STRING_COLUMN_LENGTH = 255`, `MAX_TEXT_COLUMN_LENGTH = 20_000`) unless the model already declares its own length validator — a DOS-payload guard applied globally. Also defines `droppables`/`to_drop` for Liquid template support (`app/drops`). Ends with `ApplicationRecord.prepend_mod_with('ApplicationRecord')`, the Enterprise override hook every model chain uses.

**Multi-tenancy core**
- `app/models/account.rb` — the tenant root. `has_many` to nearly every other model with `dependent: :destroy_async`. Mixes in `FlagShihTzu` (bitset flags) via `Featurable` for the two-column feature-flag system (`feature_flags`, `feature_flags_ext_1`, `config/features.yml`-driven, capped at 63 flags/column). Also includes `Reportable`, `CacheKeys`, `CaptainFeaturable`, `AccountEmailRateLimitable`, `AccountSettingsSchema`. Uses Postgres `trigger.rb` (Rails `pg_trigger`/similar) to auto-create per-account sequences (`conv_dpid_seq_<id>`, `camp_dpid_seq_<id>`) used for per-account `display_id` numbering on conversations/campaigns.
- `app/models/account_user.rb` — the join model between `User` and `Account`; carries `role` (agent/administrator), `availability`, `agent_capacity_policy_id`, `custom_role_id` (Enterprise). This is where per-tenant role and online-status live, not on `User`.
- `app/models/user.rb` — global (cross-account) identity via Devise + `devise_token_auth`. Has a `type` STI column; `app/models/super_admin.rb` is a bare `SuperAdmin < User` subclass for the internal admin panel. Includes `AccessTokenable`, `Avatarable`, `Pubsubable`, `SsoAuthenticatable`, MFA delegated to `Mfa::ManagementService`. Notably works around a Devise 4.9.x confirmable-flow race condition (GHSA-57hq-95w6-v4fc) locally because upgrading is blocked by a `devise-two-factor` Rails-version constraint.

**Conversation/message/contact triad**
- `app/models/conversation.rb` — central object. `enum status: {open, resolved, pending, snoozed}`, `enum priority`. Owns most of the event-dispatch surface (`CONVERSATION_CREATED/UPDATED/OPENED/RESOLVED/STATUS_CHANGED/READ/CONTACT_CHANGED/DELETED/BOT_HANDOFF`) via `Rails.configuration.dispatcher.dispatch`. `display_id` is set by a DB trigger, not Ruby, and re-fetched after create (`load_attributes_created_by_db_triggers`) because `reload` would wipe `previous_changes` needed by the dispatcher. Includes `Labelable`, `LlmFormattable`, `AssignmentHandler`, `AutoAssignmentHandler`, `ActivityMessageHandler`, `SortHandler`, `PushDataHelper`, `ConversationMuteHelpers`.
- `app/models/message.rb` — `enum message_type: {incoming, outgoing, activity, template}`. Drives conversation `waiting_since`/`first_reply_created_at` bookkeeping and reopen logic (`reopen_conversation`, `reopen_resolved_conversation` — behavior differs for bot inboxes vs API inboxes vs everything else). `after_create_commit` chain fires `SendReplyJob`, dispatches `MESSAGE_CREATED`/`FIRST_REPLY_CREATED`, runs `MessageTemplates::HookExecutionService`, updates contact `last_activity_at`. Uses `store` (not `store_accessor`) on `content_attributes`/`external_source_ids` JSON columns for a large set of virtual attributes. Optional Searchkick indexing gated by `ChatwootApp.advanced_search_allowed?` plus, on Cloud, the `advanced_search_indexing` account feature flag.
- `app/models/contact.rb` — global identity within an account (not per-inbox — that's `ContactInbox`). Uniqueness on `email`/`identifier`/`phone_number` scoped to `account_id`. Delegates attribute normalization to `Contacts::SyncAttributes` (`before_save :sync_contact_attributes`).
- `app/models/contact_inbox.rb` — the join between a `Contact` and an `Inbox` representing one channel-specific identity (`source_id`). Validates channel-specific `source_id` formats for Twilio and WhatsApp inboxes via regex constants from `RegexHelper`. This is the model implicated in the WhatsApp coexistence duplicate-contact bug noted in project memory (a contact getting split across two `contact_inboxes` for the same inbox breaks `lock_to_single_conversation`/reopen).

**Inbox / channel polymorphism**
- `app/models/inbox.rb` — belongs to `channel, polymorphic: true`, where `channel_type` is a `Channel::*` class name string and `channel_id` its row id. All the `sms?`/`facebook?`/`whatsapp?`/`twilio_whatsapp?`/etc. predicate methods just string-compare `channel_type` (and sometimes peek at `channel` attributes, e.g. `instagram?` also checks `channel.instagram_id.present?`). `dispatch_reauthorization_event`/`INBOX_CREATED`/`INBOX_UPDATED` events are gated behind `ENV['ENABLE_INBOX_EVENTS']` — off by default.
- `app/models/concerns/channelable.rb` — the concern every `Channel::*` model includes. Declares `belongs_to :account`, `has_one :inbox, as: :channel, dependent: :destroy_async, touch: true`, and an empty `create_audit_log_entry` hook that Enterprise's `enterprise/app/models/enterprise/channelable.rb` presumably fills in.
- `app/models/channel/*.rb` — one model per channel type (`Api`, `Email`, `FacebookPage`, `Instagram`, `Line`, `Sms`, `Telegram`, `Tiktok`, `TwilioSms`, `TwitterProfile`, `WebWidget`, `Whatsapp`), each its own table (`channel_api`, `channel_whatsapp`, etc.) — this is has-one/belongs-to polymorphism, not STI. `Channel::Whatsapp` is the deepest one read: dual-provider (`default` = 360dialog, `whatsapp_cloud` = Meta Cloud API) selected via `provider_service`, encrypts `business_management_token`, auto-registers webhooks on create (`should_auto_setup_webhooks?` explicitly skips this for embedded-signup sources, which call setup themselves), and layers WhatsApp Calling support on top (`voice_enabled?`, `enable_voice_calling!`/`disable_voice_calling!`) gated by the `channel_voice` feature flag and provider (`whatsapp_cloud` only).
- `app/models/concerns/reauthorizable.rb` — shared "this external integration's credentials went stale" state machine, backed by Redis (`authorization_error_count`, `reauthorization_required?`), not a DB column. `AUTHORIZATION_ERROR_THRESHOLD = 2`. Included by `Channel::Whatsapp`, `Channel::Email`, `Channel::FacebookPage`, `Channel::Instagram`, `Channel::Tiktok`, `Integrations::Hook`, and `AutomationRule` (reused there for "disable a rule after repeated webhook failures", not a channel at all).

**Attachments & content**
- `app/models/attachment.rb` — belongs to a `Message`, uses ActiveStorage (`has_one_attached :file`). File-type-specific `push_event_data` payload shaping (location, contact card, audio w/ inline transcription, embed, generic file). File-size/content-type validation (`acceptable_file`) only runs for `Channel::WebWidget` inboxes (`should_validate_file?`) — other channels aren't restricted client-side the same way.

**Concerns worth knowing (`app/models/concerns/`)**
- `featurable.rb` — the account feature-flag system described above; also used to seed default-enabled features from `InstallationConfig` (`ACCOUNT_LEVEL_FEATURE_DEFAULTS`) on account creation.
- `liquidable.rb` — Liquid templating for message content, included by `Message`. Has a distinct code path for WhatsApp template messages (`raw_whatsapp_template_content?` → `Whatsapp::TemplateContentRendererService`) vs plain Liquid rendering for everything else; both rescue `Liquid::Error` silently.
- `labelable.rb` — thin wrapper over `acts_as_taggable_on :labels`, included by `Conversation` and `Contact`.
- `avatarable.rb` — `has_one_attached :avatar` + Gravatar backfill (`Avatar::AvatarFromGravatarJob`, 30s delayed) when `email` changes; 15MB / jpeg-png-gif-webp limits.
- `pubsubable.rb` — `has_secure_token :pubsub_token`, used for ActionCable auth; only rotates automatically for `User` on password change.
- `json_schema_validator.rb` / `jsonb_attributes_length_validator.rb` — generic JSONSchemer-backed and length-capping validators used across models with jsonb columns (`Account#settings`, `Message#additional_attributes`, `Integrations::Hook#settings`, etc.).
- `channelable.rb`, `reauthorizable.rb` — see above.

**Everything else read via grep (associations/enums confirmed, bodies not fully read):**
- `assignment_policy.rb` — `belongs_to :account`, `has_many :inboxes, through: :inbox_assignment_policies`, `enum conversation_priority`, `enum assignment_order: { round_robin: 0 } unless ChatwootApp.enterprise?` (Enterprise presumably adds more assignment orders).
- `campaign.rb` — belongs to `account`/`inbox`/optional `sender` (User); `enum campaign_type: {ongoing, one_off}`, `enum campaign_status`.
- `note.rb` — simple belongs-to `account`/`contact`/optional `user`, content required.
- `notification.rb` — `belongs_to :primary_actor, polymorphic: true` / `belongs_to :secondary_actor, polymorphic: true, optional: true`, `enum notification_type: NOTIFICATION_TYPES`.
- `custom_attribute_definition.rb` — `enum attribute_model: {conversation_attribute, contact_attribute, company_attribute}`, `enum attribute_display_type` (text/number/currency/percent/link/date/list/checkbox).
- `working_hour.rb` — belongs to `inbox`; hour/minute range validations, `closed_all_day?` guard.
- `team.rb` — belongs to `account`; `has_many :members, through: :team_members`.
- `data_import.rb` — belongs to `account`/optional `initiated_by` (User); `enum status` including `abandoned`; `has_many :items/:mappings/:import_errors`, ActiveStorage-attached `import_file`/`failed_records`.
- `webhook.rb` — `enum webhook_type: {account_type, inbox_type}`; unique `url` per account; includes `WebhookSecretable`.
- `integrations/hook.rb` — one row per account/inbox integration connection (Slack, Dialogflow, OpenAI, Dyte, Notion, CRM apps). `app_id` is a string key resolved against `Integrations::App.find` (config-driven, not a DB-backed app registry). Reuses `Reauthorizable`. Validates OpenAI keys / Cloudflare RealtimeKit credentials live against the provider only when those settings actually changed.

## How It Fits Together

- **Account** is the tenant boundary for essentially everything; almost every other model in this list `belongs_to :account` and most cross-model queries are scoped by `account_id` (several indexes are explicitly `(account_id, ...)` composites).
- **Inbox** sits between `Account` and the channel-specific `Channel::*` tables (polymorphic `belongs_to :channel`) and between `Account` and `Conversation`/`Message`/`ContactInbox`. See [[whatsapp]] and [[facebook-instagram]] and [[other-channels]] for the provider-specific service layers that sit on top of these channel models (e.g. `Whatsapp::Providers::WhatsappCloudService`, `Whatsapp::WebhookSetupService`, `MessageTemplates::HookExecutionService` referenced from `message.rb`/`channel/whatsapp.rb`).
- **Conversation** and **Message** fire most of the domain events (`CONVERSATION_CREATED`, `MESSAGE_CREATED`, `FIRST_REPLY_CREATED`, `CONVERSATION_BOT_HANDOFF`, `REPLY_CREATED`, etc.) through `Rails.configuration.dispatcher.dispatch` — see [[events-listeners]] for what listens on the other end, and [[jobs]] for the Sidekiq jobs enqueued directly from callbacks here (`SendReplyJob`, `ContactIpLookupJob`, `Avatar::AvatarFromGravatarJob`, `Agents::DestroyJob`, `Crm::SetupJob`).
- **Assignment**: `Conversation` includes `AssignmentHandler`/`AutoAssignmentHandler` (not read in depth here — see [[assignment]]), and `Inbox`/`AssignmentPolicy`/`InboxAssignmentPolicy` model the round-robin/policy configuration those services act on.
- **Automation**: `AutomationRule` (grepped, not fully read) belongs to `Account`, reuses `Reauthorizable` to auto-disable itself after repeated webhook failures, and has its own delayed-execution machinery (`AutomationRulePendingExecution`, `EXECUTION_DELAY_RANGE`, `discard_stale_pending_executions`) — full behavior documented in [[automation-rules]].
- **Reports/analytics**: `Reportable` concern is included by `Account`, `Inbox`, `User` — see [[reports]] for how `ReportingEvent`/`CsatSurveyResponse` (both modeled here, not deeply read) feed that subsystem.
- **Contacts services**: `Contact#sync_contact_attributes` delegates to `Contacts::SyncAttributes`; see [[contacts-services]] for that and related contact-merge/import logic.
- **Enterprise overlay**: every core model ends with `prepend_mod_with`/`include_mod_with` calls (`Account.prepend_mod_with('Account')`, `Account.prepend_mod_with('Account::PlanUsageAndLimits')`, `Conversation.include_mod_with('Concerns::Conversation')`, `Message.include_mod_with('Concerns::Message')`, `Inbox.include_mod_with('Audit::Inbox')`, etc.). The corresponding modules live in `enterprise/app/models/enterprise/**` (e.g. `enterprise/app/models/enterprise/account.rb`, `enterprise/app/models/enterprise/conversation.rb`, `enterprise/app/models/enterprise/inbox.rb`, plus an `Audit::*` namespace for audit-log hooks and an `Account::PlanUsageAndLimits` module). See [[models-services]] for the Enterprise-side model extensions and enterprise-only models (Captain::*, SlaPolicy, Company, CustomRole, AgentCapacityPolicy, Call, AccountSamlSettings).

## Product Behavior

- **Channel vs inbox**: the polymorphic `channel_type`/`channel_id` split on `Inbox` is the literal backend implementation of the "channel vs inbox" concept covered in the official *Setup account* guide — a channel (e.g. a WhatsApp phone number, a Facebook Page) is the external connection; an Inbox wraps it with Chatwoot-side config (assignment, working hours, auto-responder, CSAT) that's identical across channel types.
- **WhatsApp embedded signup vs manual**: `Channel::Whatsapp#provider` (`default` = 360dialog, `whatsapp_cloud` = Meta Cloud API) and `provider_config['source'] == 'embedded_signup'` are the model-level markers behind the *Other channels → WhatsApp (embedded signup, manual flow)* guide topics, and behind the *embedded-signup-to-manual migration* how-to (`embedded_to_manual_transfer_pending?`/`log_credentials_transfer` exist specifically to log that one-way transition).
- **Feature flags**: `Featurable`'s per-account bitset flags are the mechanism behind most "Enterprise Edition" / plan-gated feature toggles referenced throughout the guide (advanced assignment, Captain, CSAT templates, etc.) — enabling/disabling a feature for an account is a DB bit flip here, gated in the UI/controllers by `feature_enabled?`.
- **Business hours / auto-responder**: `WorkingHour` (`belongs_to :inbox`) plus `Inbox#out_of_office_message`/`working_hours_enabled` back the *Business hours & auto-responder* feature guide directly.
- **Assignment capacity / round robin**: `AssignmentPolicy`, `InboxAssignmentPolicy`, and `AccountUser#agent_capacity_policy_id` are the data model for the *advanced assignment policies* and *agent capacity policies* advanced-feature guides (the latter's full policy model is Enterprise: `enterprise/app/models/agent_capacity_policy.rb`).

## Notes for AI Agents

- **Polymorphic channel, not STI**: `Inbox.channel` is `belongs_to :channel, polymorphic: true` across separate `channel_*` tables — don't confuse this with `User`'s STI (`type` column, `SuperAdmin < User`), which is the only STI usage observed in this directory.
- **`display_id` is DB-trigger-set, not app-set**: `Conversation` (and `Campaign`, via the same per-account sequence pattern in `Account`) relies on Postgres triggers (`trigger.after(:insert)`/`trigger.before(:insert)`) to populate `display_id`. After create, the code re-fetches via `self.class.find(id)` rather than `reload`, specifically to preserve `previous_changes` for the event dispatcher — mirror this pattern if you add new trigger-populated columns.
- **Reauthorizable state lives in Redis, not the DB**: `reauthorization_required?`/`authorization_error_count` on `Channel::*` and `AutomationRule` are Redis-backed pseudo-attributes (`Redis::Alfred`), not migrations. Don't add a DB column for this without checking `reauthorizable.rb` first.
- **Feature flags are capped at 63 per bitset column**: `Featurable::MAX_FEATURES_PER_COLUMN = 63`; `Account` already uses two columns (`feature_flags`, `feature_flags_ext_1`). Adding a new feature past that cap requires a new column wired into `FEATURE_FLAG_COLUMNS`, not just an entry in `config/features.yml`.
- **`ApplicationRecord`'s automatic length validation is global and silent-by-default**: any string/text column without an explicit `length` validator gets one for free (255/20,000 chars). If a model needs a longer string column, add an explicit length validator rather than relying on/fighting this default.
- **Enterprise override points are the `prepend_mod_with`/`include_mod_with` calls at the bottom of each model file** — when modifying a core model's behavior for Enterprise, look for the existing `enterprise/app/models/enterprise/<model>.rb` (or `enterprise/.../concerns/<model>.rb`, or `enterprise/.../audit/<model>.rb`) before adding logic directly to the OSS file, per the CLAUDE.md Enterprise Edition practice.
- **`Message#content_attributes`/`external_source_ids` use `store` with a fixed accessor list** — adding a new virtual attribute on those jsonb columns means adding it to the `accessors:` array in `message.rb`, not just reading/writing the hash directly (though the hash is still accessible for ad hoc keys like `template_params`).
- **`Contact` uniqueness/format validations are per-account**, not global — `email`/`identifier`/`phone_number` uniqueness is `scope: [:account_id]`, and equivalent formats are re-validated in `discard_invalid_attrs`/`phone_number_format`/`email_format` as a defensive second pass (used by import flows that may carry pre-existing invalid data).
- **WhatsApp coexistence gotcha** (per project memory, not independently re-verified in this pass): `ContactInbox`'s per-inbox `source_id` uniqueness can end up splitting one WhatsApp contact into two `contact_inboxes` when a BSUID/phone-number mismatch occurs, which breaks `Inbox#lock_to_single_conversation` and conversation-reopen behavior. Worth checking `contact_inbox.rb`'s `valid_source_id_format?`/regexes and the `Whatsapp::*` services before touching WhatsApp contact-matching logic.

## Related

- [[conversations-services]]
- [[contacts-services]]
- [[messages-services]]
- [[automation-rules]]
- [[assignment]]
- [[reports]]
- [[notifications]]
- [[jobs]]
- [[events-listeners]]
- [[whatsapp]]
- [[facebook-instagram]]
- [[other-channels]]
- [[email]]
- [[models-services]]
- [[data-model]]
- [[authorization-policies]]
