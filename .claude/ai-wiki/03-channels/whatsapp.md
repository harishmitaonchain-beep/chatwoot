---
title: "WhatsApp Channel"
tags: [chatwoot, backend, whatsapp, channels, integrations, messaging]
generated: 2026-08-17
deepwiki_section: "Multi-Channel Communication"
---

# WhatsApp Channel

## Purpose

Everything under `app/services/whatsapp` implements Chatwoot's WhatsApp integration: onboarding a WABA (WhatsApp Business Account) via embedded signup or manual API keys, receiving inbound messages/status updates/calls from Meta's Cloud API (or the legacy 360dialog provider), sending outbound session and template messages, keeping message templates and phone-number "health" in sync, and handling the country-specific phone-number quirks that WhatsApp's `wa_id` format produces. It is the service layer behind `Channel::Whatsapp` (`app/models/channel/whatsapp.rb`) and is invoked from webhook controllers/jobs, dashboard controllers, and campaign jobs.

## Key Files & Classes

**Provider abstraction** (outbound sending + template sync, two providers behind one interface):
- `app/services/whatsapp/providers/base_service.rb` — abstract base (`send_message`, `send_template`, `sync_template`, `validate_provider_config`); also owns `recipient_params` (routes to `to` for a phone number vs `recipient`/`recipient_type: individual` for a coexistence BSUID — passing a BSUID in `to` returns HTTP 200 but silently drops the message) and interactive button/list payload builders shared by both providers.
- `app/services/whatsapp/providers/whatsapp_cloud_service.rb` — Meta Cloud API implementation: text/attachment/interactive/template sends, `sync_templates` (paginated), `validate_provider_config?` (checks WABA/token, and phone_number_id membership when config just changed), CSAT template delegation, opus→ogg content-type normalization for voice notes. `prepend_mod_with('Whatsapp::Providers::WhatsappCloudService')` is the enterprise override point (used for calling).
- `app/services/whatsapp/providers/whatsapp_360_dialog_service.rb` — legacy/default provider (`provider == 'default'`), same interface, no BSUID/coexistence support, no calling.

**Inbound message pipeline** (webhook → `Message`/`Conversation`/`Contact`):
- `app/services/whatsapp/incoming_message_base_service.rb` — shared `perform`/`process_messages`/`process_statuses` state machine: dedups by source_id via Redis lock, sets contact/conversation, builds `Message` records for text/media/location/contact-share/unsupported types, and updates message `status` from delivery-status webhooks.
- `app/services/whatsapp/incoming_message_whatsapp_cloud_service.rb` — Cloud API subclass; parses `entry[0].changes[0].value`, downloads media via `media_url`/`api_headers`, preserves the original filename from the payload.
- `app/services/whatsapp/incoming_message_service.rb` — 360dialog subclass (empty; relies entirely on the base class's default `processed_params`/`download_attachment_file`).
- `app/services/whatsapp/incoming_message_service_helpers.rb` — mixin: content extraction (`message_content`), flow-response JSON parsing, attachment-type mapping, dedup lock acquisition (`Whatsapp::MessageDedupLock`).
- `app/services/whatsapp/incoming_message_identifier_helper.rb` — resolves contacts/`ContactInbox` from webhook identifiers (phone `wa_id`, coexistence user_id/parent_user_id/BSUID), including the separate "echo" path for messages sent from the WhatsApp Business app.
- `app/services/whatsapp/identifier_sync_service.rb` — persists newly-seen source_ids as extra `ContactInbox` rows on the same contact (coexistence gives one contact multiple identifiers) and backfills contact phone_number/WhatsApp username; swallows `ActiveRecord::RecordNotUnique` as a benign race.
- `app/services/whatsapp/in_reply_to_message_finder.rb` — resolves a webhook's `context.id` (quoted/reply message) to a local `Message`, first by exact `source_id`, then by decoding the WAMID's embedded token to match across phone-scoped vs BSUID-scoped source_ids for the same underlying message (bails out on ambiguous matches).
- `app/services/whatsapp/message_dedup_lock.rb` — Redis `SET NX EX` (1-day TTL) so retried/duplicate Meta webhooks for the same message id are processed once.
- `app/services/whatsapp/webhook_channel_finder_service.rb` — resolves which `Channel::Whatsapp` a Cloud API webhook belongs to from `display_phone_number` + `phone_number_id`, trying raw digits then a country-normalized fallback.

**Onboarding / embedded signup**:
- `app/services/whatsapp/embedded_signup_service.rb` — orchestrates the Meta "Embedded Signup" flow end-to-end: exchange OAuth code → fetch phone info → create a new channel or reauthorize an existing one → explicitly call `channel.setup_webhooks` → best-effort post-signup health check that flags the channel for reauth if Meta reports a pending/unprovisioned state (skipped on reauth and on coexistence signups).
- `app/services/whatsapp/channel_creation_service.rb` — builds the `Channel::Whatsapp` + `Inbox` pair for a fresh embedded signup, rejecting duplicate phone numbers.
- `app/services/whatsapp/reauthorization_service.rb` — updates an existing channel's `provider_config` (token/phone_number_id/waba_id) after a reauth flow; validates the phone number didn't change and drops a stale `business_management_token` if the WABA id changed.
- `app/services/whatsapp/token_exchange_service.rb`, `app/services/whatsapp/phone_info_service.rb` — thin wrappers around `Whatsapp::FacebookApiClient` for the OAuth code→token exchange and phone-number lookup steps of signup.
- `app/services/whatsapp/facebook_api_client.rb` — the single HTTP client for Meta Graph API calls used across signup/webhook/reauth flows (token exchange, `debug_token`, phone register/deregister, WABA/phone webhook subscription, callback override).
- `app/services/whatsapp/webhook_setup_service.rb` — decides whether to call Meta's `/register` for a phone number (skipped for coexistence and already-provisioned numbers) and always (re)subscribes the WABA + overrides the phone-level webhook callback URL; also computes `calls` field subscription, checking sibling channels on the same WABA so one inbox's setup doesn't drop another's voice subscription.
- `app/services/whatsapp/webhook_teardown_service.rb` — `before_destroy` counterpart: clears the phone-level callback override, deregisters the phone number, and unsubscribes the app from the WABA (embedded-signup-only, and only if no sibling inbox still uses that WABA) — all best-effort, never blocking the destroy.

**Business Management token** (Cloud-only, embedded-signup-only feature for template sync with a longer-lived token):
- `app/services/whatsapp/business_management_token_service.rb` — validates preconditions (`ChatwootApp.chatwoot_cloud?`, embedded-signup provider) then delegates validation and saves the token with `save!(validate: false)`.
- `app/services/whatsapp/business_management_token_validation_service.rb` — calls Graph `/me/permissions` to confirm the `whatsapp_business_management` scope, then a live templates call against the given WABA to confirm access.

**Health monitoring**:
- `app/services/whatsapp/health_service.rb` — polls Graph API for phone-number + business-account health (quality rating, messaging limit tier, status, `is_on_biz_app`, portfolio info), persists to `Channel::Whatsapp#phone_number_health`, and logs a `[WHATSAPP HEALTH] risky_phone_number` warning on transition into a risky quality/status. Uses `update_all` (bypasses model callbacks/validation) guarded by a `phone_number_health_checked_at <` condition to avoid clobbering a concurrent fresher check.

**Templates & outbound sending**:
- `app/services/whatsapp/send_on_whatsapp_service.rb` (`Base::SendOnChannelService` subclass) — entry point called for outgoing `Message`s on a WhatsApp inbox; sends a session message if the conversation's 24-hour window is open, else requires `template_params` or fails the message with `errors.whatsapp.message_outside_messaging_window`.
- `app/services/whatsapp/template_processor_service.rb` — looks up the approved template by name+language+status, converts legacy parameter formats via `TemplateParameterConverterService`, and builds the Cloud API `components` array (header/body/footer/button parameters).
- `app/services/whatsapp/template_parameter_converter_service.rb` — normalizes legacy array/flat-hash template params into the current component-based (`{body: {...}, header: {...}, buttons: [...]}`) shape; marked for eventual removal.
- `app/services/whatsapp/populate_template_parameters_service.rb` — builds individual Cloud API parameter objects (text, currency, date_time, media, coupon_code button), including URL sanitization/validation for media/button-URL parameters.
- `app/services/whatsapp/template_content_renderer_service.rb` — renders a template body string (used for previews/CSAT-style rendering) through Liquid while protecting `{{n}}`/`{{name}}` WhatsApp placeholders from being interpreted as Liquid variables.
- `app/services/whatsapp/csat_template_service.rb` — creates/deletes/status-checks the auto-generated CSAT survey template on the WABA (`CsatTemplateNameService` supplies the versioned name).
- `app/services/whatsapp/oneoff_campaign_service.rb` — drives one-off WhatsApp campaigns: resolves the audience by label, runs each contact's template params through `LiquidTemplateProcessorService`, and sends via the channel's `send_template`, tolerating individual contact failures.
- `app/services/whatsapp/liquid_template_processor_service.rb` — Liquid-renders campaign template params per-contact (contact/agent/inbox/account drops), treating a rendered-blank required placeholder as "skip this contact".

**Phone number normalization** (WhatsApp's `wa_id` doesn't always match the number a contact is stored under):
- `app/services/whatsapp/phone_number_normalization_service.rb` — entry point used by the incoming-message pipeline; extracts a clean digit string per provider (Cloud vs Twilio-prefixed), runs it through the first matching country normalizer, and looks up an existing `ContactInbox` under the normalized id, falling back to the raw id if nothing matches.
- `app/services/whatsapp/phone_normalizers/base_phone_normalizer.rb` — `handles_country?`/`normalize` contract.
- `app/services/whatsapp/phone_normalizers/brazil_phone_normalizer.rb` — adds the mobile "9" digit for 12-digit Brazilian numbers (issue #5840).
- `app/services/whatsapp/phone_normalizers/argentina_phone_normalizer.rb` — Argentina-specific digit handling (mirrors Brazil's pattern; not read in full but structurally identical, 18 lines).
- `app/services/whatsapp/phone_normalizers/mexico_phone_normalizer.rb` — strips the mobile "1" WhatsApp inserts after Mexico's `52` country code, only on the 13-digit form.

## How It Fits Together

- **Model**: `app/models/channel/whatsapp.rb` (`Channel::Whatsapp`, includes `Channelable` and `Reauthorizable` from `app/models/concerns/reauthorizable.rb`) is the ActiveRecord anchor. It `delegate`s `send_message`/`send_template`/`sync_templates`/`media_url`/`api_headers` to `provider_service` (picks Cloud vs 360dialog by `provider`), calls `Whatsapp::WebhookSetupService`/`WebhookTeardownService` directly for lifecycle hooks (`after_commit ... on: :create` for manual setup only — embedded signup calls `setup_webhooks` explicitly to control ordering), and validates credentials at save time via `provider_service.validate_provider_config?`.
- **Inbound path**: `app/controllers/webhooks/whatsapp_controller.rb` → `app/jobs/webhooks/whatsapp_events_job.rb` (a `MutexApplicationJob`, per-inbox/contact locked for album uploads) → resolves the channel (`WebhookChannelFinderService` for Cloud "whatsapp_business_account" payloads) → routes to `IncomingMessageWhatsappCloudService` (or plain `IncomingMessageService` for 360dialog, or with `outgoing_echo: true` for coexistence `smb_message_echoes`). This creates/updates [[models]] (`Contact`, `ContactInbox`, `Conversation`, `Message`, `Attachment`) and can trigger the standard message pipeline covered by [[messages-services]] and [[conversations-services]].
- **Outbound path**: `SendReplyJob` → `Whatsapp::SendOnWhatsappService` → `channel.send_message`/`send_template` (delegated to provider) — see [[jobs]] for the job layer.
- **Scheduled jobs**: `app/jobs/channels/whatsapp/health_sync_job.rb` / `health_sync_scheduler_job.rb` call `Whatsapp::HealthService`; `templates_sync_job.rb` / `templates_sync_scheduler_job.rb` call `sync_templates` — part of [[jobs]].
- **Onboarding controllers**: `app/controllers/api/v1/accounts/whatsapp/authorizations_controller.rb` and `app/controllers/api/v1/accounts/concerns/whatsapp_health_management.rb` are the dashboard-facing entry points into `EmbeddedSignupService`/`HealthService` — part of [[api-v1-controllers]].
- **Enterprise overlay**: WhatsApp *voice calling* lives almost entirely under `enterprise/app/services/whatsapp/` (`call_service.rb`, `incoming_call_service.rb`, `call_permission_request_service.rb`, `call_permission_reply_service.rb`, `inbound_call_identity_builder.rb`, `call_conversation_builder.rb`) plus `enterprise/app/services/enterprise/whatsapp/providers/whatsapp_cloud_service.rb`, which extends the OSS Cloud provider via the `prepend_mod_with('Whatsapp::Providers::WhatsappCloudService')` hook at the bottom of `whatsapp_cloud_service.rb`. `Channel::Whatsapp#voice_enabled?`/`enable_voice_calling!`/`disable_voice_calling!` gate this on `provider == 'whatsapp_cloud'` plus the `channel_voice` feature flag and `provider_config['calling_enabled']`. See [[controllers-jobs-listeners]] and [[models-services]] for the rest of the enterprise tree.
- **Campaigns**: `Whatsapp::OneoffCampaignService` is invoked from the campaign job layer for one-off WhatsApp broadcasts, gated by the `whatsapp_campaign` feature flag; see [[jobs]].

## Product Behavior

- The official **WhatsApp channel setup** guide covers the three connection paths this code implements: embedded signup (OAuth code → `EmbeddedSignupService`), manual API-key setup (direct `provider_config` with `api_key`/`phone_number_id`/`business_account_id`, webhooks auto-registered per `Channel::Whatsapp#should_auto_setup_webhooks?`), and the legacy Twilio/360dialog path (`Whatsapp360DialogService`).
- **WhatsApp coexistence** (business responds from both Chatwoot and the native WhatsApp Business app) shows up throughout the code as BSUID handling (`recipient_params`, `IncomingMessageIdentifierHelper`'s echo path, `IdentifierSyncService` multi-source-id contacts) and as the `is_coexistence` flag threaded through `EmbeddedSignupService`/`WebhookSetupService` to skip phone registration and defer the post-signup health check.
- **Embedded-signup-to-manual migration** is tracked explicitly: `Channel::Whatsapp#embedded_to_manual_transfer_pending?` / `log_credentials_transfer` detect when a save drops the `source: 'embedded_signup'` marker, and `WhatsappCloudService#log_transfer_failure` logs (rather than silently swallows) WABA/token/phone-id check failures specifically during that transfer window.
- **Brazil/Argentina/Mexico number quirks**, called out explicitly in the official guide, are the direct subject of `Whatsapp::PhoneNormalizers::*` and `PhoneNumberNormalizationService`.
- **Business Management token** setup (used to sync templates with a longer-lived token) maps to `Whatsapp::BusinessManagementTokenService`/`BusinessManagementTokenValidationService`, gated to Chatwoot Cloud + embedded-signup inboxes only.
- **WhatsApp templates / template variables / CSAT templates** guides correspond to the `TemplateProcessorService` → `PopulateTemplateParametersService` pipeline and `CsatTemplateService`.
- **WhatsApp voice calling** guide corresponds to the enterprise call services layered on top of `Channel::Whatsapp#voice_enabled?`.

## Notes for AI Agents

- **BSUID vs phone number routing is load-bearing, not cosmetic.** `Providers::BaseService#recipient_params` must be used for every outbound Cloud API send; passing a coexistence BSUID through the `to` field returns HTTP 200 with a message id but the message is silently dropped by Meta. Any new send path must call `recipient_params`, not build `to:` directly.
- **Dedup is Redis-based and required, not optional.** `IncomingMessageBaseService#process_messages` checks `find_message_by_source_id` first, then acquires `Whatsapp::MessageDedupLock` before doing any writes — Meta redelivers webhooks, and skipping the lock reintroduces duplicate-message bugs.
- **`unsupported` message type still creates a placeholder message** (`create_unsupported_message`), specifically so coexistence companion-device sync failures (error 131060) don't leave a "headless" contact/conversation with nothing for the agent to see.
- **`Whatsapp::InReplyToMessageFinder` matches across differently-scoped WAMIDs** (phone-scoped vs BSUID-scoped) by decoding the token embedded in the base64 WAMID — it deliberately declines to guess when more than one local message shares that token (`ambiguous_match`), so don't "simplify" this to a plain `source_id` lookup for coexistence inboxes.
- **`HealthService` and `WebhookSetupService`/`WebhookTeardownService` are intentionally best-effort/non-blocking** in several places (rescue-and-log around individual Graph API calls, `update_all` scoped by `phone_number_health_checked_at <` to avoid stomping a fresher concurrent write). Preserve that pattern — a Meta outage or stale response must not raise out of a `before_destroy` or block channel creation.
- **`subscribed_fields`/`calls` subscription is WABA-wide, not per-inbox.** `WebhookSetupService#calls_enabled_on_waba?` explicitly queries sibling `Channel::Whatsapp` rows on the same `business_account_id` before deciding whether to keep `calls` in the subscription — a naive per-channel check would silently disable voice for a sibling inbox.
- **`Whatsapp::Providers::WhatsappCloudService` is an enterprise extension point** via `prepend_mod_with('Whatsapp::Providers::WhatsappCloudService')` at the file's end — calling-related sends are added there, not by editing the OSS provider directly.
- **Legacy template parameter formats (array/flat-hash) are still supported** via `TemplateParameterConverterService#normalize_to_enhanced` but are explicitly marked for future removal ("TODO: Legacy format support will be deprecated and removed after 2-3 releases") — don't build new features on the legacy shape.
- **Business Management token save uses `save!(validate: false)`** deliberately (`BusinessManagementTokenService#update!`) to skip `validate_provider_config`'s remote credential check, which validates `api_key`, not the business management token.
- Files sampled but not read in full: `phone_normalizers/argentina_phone_normalizer.rb` (18 lines, structurally mirrors the Brazil normalizer) and the back half of `template_parameter_converter_service.rb` (legacy array/flat-hash → enhanced-format conversion internals, ~80 lines not shown above).

## Related

- [[whatsapp-field-guide]] — how this integration **fails in production**: 17-case-backed error-code table, symptom discriminators, setup-path taxonomy, disproven hypotheses
- [[models]] — `Contact`, `ContactInbox`, `Conversation`, `Message` records this module creates/updates
- [[messages-services]] — downstream message-creation pipeline shared across channels
- [[conversations-services]] — conversation reuse/reopen logic (`lock_to_single_conversation`) referenced in `set_conversation`
- [[jobs]] — `Webhooks::WhatsappEventsJob`, health/template sync scheduler jobs, `SendReplyJob`
- [[api-v1-controllers]] — dashboard-facing embedded signup / health controllers
- [[models-services]] and [[controllers-jobs-listeners]] — enterprise WhatsApp voice calling overlay
- [[other-channels]] — Twilio-based channels for contrast with the Cloud/360dialog providers here
- [[facebook-instagram]] — sibling Meta Graph API integrations
