---
title: "Business Feature Index"
tags: [chatwoot, meta, features, business]
generated: 2026-08-17
---

# Business Feature Index

Maps product features (as a customer/PM would name them) to the code entry points where the business logic lives, the gating feature flag from `config/features.yml`, the Cloud plan tier from `Enterprise::Billing::ReconcilePlanFeaturesService` (see [[plan-tiers-billing]]), and the vault page(s) covering the area. Every code path listed was verified to exist on this checkout (2026-08-17, branch off `develop`). A "—" means no flag/tier applies or the entry point wasn't verified — go grep before trusting anything not listed. Plan tiers: features without a tier note are available on all plans (subject to the flag's default); "Startups+" / "Business+" / "Enterprise" = enabled by `ReconcilePlanFeaturesService` at that Cloud tier and above.

## Conversations & inbox basics

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Conversation assignment (agent/team) | `app/models/conversation.rb` (assignee/team), `app/controllers/api/v1/accounts/conversations/assignments_controller.rb` | — | [[assignment]], [[conversations-services]] |
| Statuses, resolve & snooze | `app/models/conversation.rb` (`enum status`, `snoozed_until`), `app/controllers/api/v1/accounts/conversations_controller.rb` (`toggle_status`) | `auto_resolve_conversations` (auto-resolve) | [[models]], [[conversations-services]] |
| Priority | `app/models/conversation.rb` (`enum priority`), `app/controllers/api/v1/accounts/conversations_controller.rb` (`toggle_priority`) | — | [[models]] |
| Labels | `app/models/label.rb`, `app/controllers/api/v1/accounts/labels_controller.rb`, `app/controllers/api/v1/accounts/conversations/labels_controller.rb` | `labels` | [[models]] |
| Private notes & @mentions | `app/models/mention.rb`, `app/services/messages/mention_service.rb`, `app/builders/notification_builder.rb` | — | [[notifications]], [[messages-services]] |
| Canned responses | `app/models/canned_response.rb`, `app/controllers/api/v1/accounts/canned_responses_controller.rb` | `canned_responses` | [[models]] |
| Conversation filters & custom views | `app/models/custom_filter.rb`, `app/services/conversations/filter_service.rb`, `app/controllers/api/v1/accounts/custom_filters_controller.rb` | — | [[conversations-services]] |

**Decomposed capabilities:**

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Conversations: unread counts | `app/services/conversations/unread_counts.rb`, `app/services/conversations/unread_counts/listener.rb`, `app/services/conversations/unread_counts/builder.rb`, `app/services/conversations/unread_counts/store.rb` | `conversation_unread_counts`, `unread_count_for_filters` | [[conversations-services]] · _Redis-backed, event-driven count cache (18-file subsystem); unread_count_for_filters gates only the saved-filter count variant._ |
| Conversations: messaging window | `app/services/conversations/message_window_service.rb`, `app/models/conversation.rb` | — | [[conversations-services]] · _Per-channel can_reply? rule (WhatsApp/Twilio 24h, TikTok 48h, Messenger/Instagram 24h-or-7d, API custom window); Conversation#can_reply? delegates here._ |
| Conversations: typing indicators | `app/services/conversations/typing_status_manager.rb`, `app/controllers/api/v1/accounts/conversations_controller.rb`, `app/controllers/api/v1/widget/conversations_controller.rb` | — | [[conversations-services]] · _Dispatcher-only websocket broadcast (no DB writes), toggled from both agent dashboard and widget/public API controllers._ |
| Conversations: email transcripts | `app/controllers/api/v1/accounts/conversations_controller.rb`, `app/mailers/conversation_reply_mailer.rb`, `enterprise/app/models/enterprise/account/plan_usage_and_limits.rb` | — | [[conversations-services]] · _Not a features.yml flag: Cloud gates via the Enterprise email_transcript_enabled? override (paid plans only, plan_name vs default plan), OSS always allows._ |
| Conversations: bulk actions | `app/controllers/api/v1/accounts/bulk_actions_controller.rb`, `app/jobs/bulk_actions_job.rb` | — | [[contacts-services]] · _Shared BulkActionsController dispatches by type; the conversation path runs top-level BulkActionsJob, kept separate from the contacts bulk subsystem._ |
| Contacts: bulk actions | `app/services/contacts/bulk_action_service.rb`, `app/jobs/contacts/bulk_action_job.rb`, `app/controllers/api/v1/accounts/bulk_actions_controller.rb` | — | [[contacts-services]] · _Contacts-list multi-select toolbar: BulkActionService fans out to bulk delete / label add / label remove services with non-uniform return contracts._ |
| Contacts: merge | `app/actions/contact_merge_action.rb`, `app/controllers/api/v1/accounts/actions/contact_merges_controller.rb` | — | [[contacts-services]], [[conversations-services]] · _Agent-initiated dashboard merge; reassigns conversations/messages/notes/contact_inboxes via bulk .update (skips callbacks) then destroys the mergee._ |
| Contacts: identity & dedupe (widget identify) | `app/actions/contact_identify_action.rb`, `app/actions/contact_merge_action.rb`, `app/controllers/api/v1/widget/contacts_controller.rb` | — | [[conversations-services]] · _Widget setUser/identify flow: auto-merges duplicate contacts by identifier > email > phone priority before applying attribute updates._ |

## Contacts

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Contact management | `app/models/contact.rb`, `app/controllers/api/v1/accounts/contacts_controller.rb` | `crm` | [[models]], [[contacts-services]] |
| Segments (saved contact filters) | `app/models/custom_filter.rb`, `app/services/contacts/filter_service.rb` | — | [[contacts-services]] |
| Contact notes | `app/models/note.rb`, `app/controllers/api/v1/accounts/contacts/notes_controller.rb` | — | [[models]] |
| Custom attributes (contact & conversation) | `app/models/custom_attribute_definition.rb`, `app/controllers/api/v1/accounts/custom_attribute_definitions_controller.rb` | `custom_attributes`; required conversation attrs → `conversation_required_attributes` (Business+) | [[models]] |
| Companies | `enterprise/app/models/company.rb`, `enterprise/app/services/companies/` | `companies` (Business+) | [[models]], [[plan-tiers-billing]] |
| Data import (contact CSV import) | `app/models/data_import.rb`, `app/controllers/api/v1/accounts/data_imports_controller.rb` | `data_import` (Startups+) | [[data-import]] |

## Channels

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| WhatsApp (channel umbrella) | `app/models/channel/whatsapp.rb` | — | [[whatsapp]], [[whatsapp-field-guide]] |

## Email channel capabilities

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Email: channel setup (forwarding & IMAP/SMTP config) | `app/models/channel/email.rb` | `channel_email` (Startups+) | [[email]] · _Two setup modes: forward-to the auto-generated forward_to_email (ActionMailbox path) vs direct IMAP/SMTP with manual or OAuth credentials._ |
| Email: inbound ingress (ActionMailbox) | `app/mailboxes/application_mailbox.rb`, `app/mailboxes/reply_mailbox.rb`, `app/finders/email_channel_finder.rb`, `app/mailboxes/mailbox_helper.rb` | — | [[email]] · _Forwarded/relay mail path; BCC routing is gated by the SKIP_INCOMING_BCC_PROCESSING global config, not a feature flag._ |
| Email: conversation matching & threading | `app/services/mailbox/conversation_finder.rb`, `app/services/mailbox/conversation_finder_strategies`, `app/presenters/mail_presenter.rb` | — | [[email]] · _Strategy chain (reply+uuid / In-Reply-To / References / new-conversation) shared by both the ActionMailbox and IMAP paths._ |
| Email: IMAP polling (BYO mailbox) | `app/jobs/inboxes/fetch_imap_emails_job.rb`, `app/services/imap/base_fetch_email_service.rb`, `app/services/imap/google_fetch_email_service.rb`, `app/services/imap/microsoft_fetch_email_service.rb`, `app/mailboxes/imap/imap_mailbox.rb` | — | [[email]] · _Scheduled poller bypassing ActionMailbox entirely; Imap::ImapMailbox is a plain Ruby class, not an ActionMailbox mailbox._ |
| Email: mailbox OAuth (Google/Microsoft) | `app/controllers/api/v1/accounts/google/authorizations_controller.rb`, `app/controllers/api/v1/accounts/microsoft/authorizations_controller.rb`, `app/controllers/google/callbacks_controller.rb`, `app/controllers/microsoft/callbacks_controller.rb`, `app/services/google/refresh_oauth_token_service.rb` | — | [[email]] · _OAuth connect + callback builds/finds the Channel::Email with XOAUTH2 IMAP config; Microsoft::RefreshOauthTokenService mirrors the Google refresh service._ |
| Email: outbound reply delivery (SMTP/OAuth send) | `app/services/email/send_on_email_service.rb`, `app/mailers/conversation_reply_mailer.rb`, `app/builders/email/from_builder.rb`, `app/builders/email/reply_to_builder.rb` | — | [[email]], [[notifications]] · _Builds threading headers (Message-Id/In-Reply-To/References) that the inbound matching strategies parse on the way back in._ |
| Email: conversation continuity (widget/API → email) | `app/services/messages/send_email_notification_service.rb`, `app/jobs/conversation_reply_email_job.rb`, `app/builders/email/reply_to_builder.rb` | `inbound_emails`, `email_continuity_on_api_channel`, `custom_reply_email`, `custom_reply_domain` (Startups+) | [[email]] · _reply+<uuid>@inbound_email_domain addressing round-trips via ReceiverUuidStrategy; API-channel continuity has its own flag, widget uses channel.continuity_via_email._ |
| Email: templates & branding | `app/services/email_templates/db_resolver_service.rb`, `app/models/email_template.rb`, `app/controllers/api/v1/accounts/branded_email_layouts_controller.rb`, `app/models/concerns/inbox_branded_email_layoutable.rb` | `branded_email_templates` | [[email]], [[notifications]] · _DB-backed Liquid templates/layouts win over filesystem views, resolved inbox → account → installation scope order._ |

## Facebook & Instagram capabilities

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Facebook & Instagram: Facebook Page connect & inbox setup | `app/controllers/api/v1/accounts/callbacks_controller.rb`, `app/models/channel/facebook_page.rb`, `config/initializers/facebook_messenger.rb` | `channel_facebook` (Startups+) | [[facebook-instagram]], [[webhook-routing]] · _OAuth Page picker + inbox creation (register_facebook_page); subscribe/unsubscribe swallow errors silently._ |
| Facebook & Instagram: Messenger inbound pipeline | `config/initializers/facebook_messenger.rb`, `app/jobs/webhooks/facebook_events_job.rb`, `lib/integrations/facebook/message_parser.rb`, `lib/integrations/facebook/message_creator.rb`, `app/builders/messages/facebook/message_builder.rb` | `channel_facebook` (Startups+) | [[facebook-instagram]], [[webhook-routing]], [[lib-integrations]] · _Inbound is the facebook-messenger gem's server mounted at /bot, not a Rails webhook controller._ |
| Facebook & Instagram: Messenger outbound send | `app/services/facebook/send_on_facebook_service.rb` | `channel_facebook` (Startups+) | [[facebook-instagram]] · _Token invalidation is string-matched (not numeric code) before triggering authorization_error!._ |
| Facebook & Instagram: Instagram webhook ingress & event dispatch | `app/controllers/webhooks/instagram_controller.rb`, `app/jobs/webhooks/instagram_events_job.rb`, `app/services/instagram/base_message_text.rb`, `app/services/instagram/webhooks_base_service.rb`, `app/services/instagram/test_event_service.rb` | `channel_instagram` (Startups+) | [[facebook-instagram]], [[webhook-routing]] · _find_channel prefers Channel::Instagram, falls back to Channel::FacebookPage, then dispatches to the matching connection-mode services._ |
| Facebook & Instagram: Instagram direct login connection | `app/controllers/instagram/callbacks_controller.rb`, `app/controllers/api/v1/accounts/instagram/authorizations_controller.rb`, `app/services/instagram/refresh_oauth_token_service.rb`, `app/models/channel/instagram.rb` | `channel_instagram` (Startups+) | [[facebook-instagram]] · _Standalone Instagram Login OAuth with long-lived token refresh; access_token can return nil when expired._ |
| Facebook & Instagram: Instagram direct-login messaging | `app/services/instagram/message_text.rb`, `app/services/instagram/send_on_instagram_service.rb`, `app/services/instagram/base_send_service.rb`, `app/builders/messages/instagram/message_builder.rb` | `channel_instagram` (Startups+) | [[facebook-instagram]] · _Channel::Instagram path via graph.instagram.com with the channel's own token; codes 9010/100 become synthetic Unknown contacts._ |
| Facebook & Instagram: Instagram via Facebook Page messaging | `app/services/instagram/messenger/message_text.rb`, `app/services/instagram/messenger/send_on_instagram_service.rb`, `app/builders/messages/instagram/messenger/message_builder.rb` | `channel_instagram` (Startups+) | [[facebook-instagram]] · _Page-linked mode via Koala/graph.facebook.com with page_access_token + appsecret_proof — do not conflate with direct login._ |
| Facebook & Instagram: delivery & read receipts | `lib/integrations/facebook/delivery_status.rb`, `app/jobs/webhooks/facebook_delivery_job.rb`, `app/services/instagram/read_status_service.rb` | `channel_facebook`, `channel_instagram` (Startups+) | [[facebook-instagram]], [[lib-integrations]] · _Maps Meta delivery/read watermarks to Conversations::UpdateMessageStatusJob; IG payload shape is shared across both connection modes._ |
| Facebook & Instagram: Human Agent tag (24h window extension) | `app/services/facebook/send_on_facebook_service.rb`, `app/services/instagram/base_send_service.rb`, `app/controllers/super_admin/app_configs_controller.rb` | — | [[facebook-instagram]] · _Gated by GlobalConfig keys ENABLE_MESSENGER_CHANNEL_HUMAN_AGENT / ENABLE_INSTAGRAM_CHANNEL_HUMAN_AGENT (Super Admin app configs), not features.yml._ |

## SMS / Telegram / Line / TikTok / API / Twitter channels capabilities

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| SMS: inbound & outbound messaging (Bandwidth) | `app/services/sms/incoming_message_service.rb`, `app/services/sms/send_on_sms_service.rb`, `app/services/sms/delivery_status_service.rb`, `app/models/channel/sms.rb`, `app/controllers/webhooks/sms_controller.rb` | — | [[other-channels]], [[webhook-routing]] · _Generic SMS API channel (Bandwidth-style); delivery-status webhook maps message-delivered/failed onto Message#status._ |
| Twilio: SMS & WhatsApp-via-Twilio messaging | `app/services/twilio/incoming_message_service.rb`, `app/services/twilio/send_on_twilio_service.rb`, `app/services/twilio/whatsapp_identifier_helper.rb`, `app/services/twilio/delivery_status_service.rb`, `app/models/channel/twilio_sms.rb` | — | [[other-channels]], [[webhook-routing]] · _One Channel::TwilioSms serves both mediums (sms/whatsapp); webhooks land on app/controllers/twilio/ callback + delivery_status controllers, and whatsapp_identifier_helper owns the BSUID-vs-phone identity problem._ |
| Twilio: content templates & CSAT provisioning | `app/services/twilio/template_sync_service.rb`, `app/services/twilio/template_processor_service.rb`, `app/services/twilio/csat_template_service.rb`, `app/services/twilio/csat_template_api_client.rb` | — | [[other-channels]] · _Syncs approved Content Templates onto channel.content_templates and provisions the CSAT survey call-to-action template._ |
| SMS: one-off campaigns | `app/services/sms/oneoff_sms_campaign_service.rb`, `app/services/twilio/oneoff_sms_campaign_service.rb` | `campaigns` (Startups+) | [[other-channels]] · _Audience-label blast sends with per-contact rescue; invoked from the campaigns feature's scheduling side._ |
| Telegram: bot & Business messaging | `app/services/telegram/incoming_message_service.rb`, `app/services/telegram/send_on_telegram_service.rb`, `app/services/telegram/send_attachments_service.rb`, `app/services/telegram/update_message_service.rb`, `app/models/channel/telegram.rb` | — | [[other-channels]], [[webhook-routing]] · _Handles Telegram Business payloads (agent-sent echoes stored as outgoing) and edited_message sync by source_id._ |
| Line: messaging | `app/services/line/incoming_message_service.rb`, `app/services/line/send_on_line_service.rb`, `app/models/channel/line.rb`, `app/controllers/webhooks/line_controller.rb` | — | [[other-channels]], [[webhook-routing]] · _Stickers rendered as markdown images off LINE's CDN; outbound deliberately uses permanent file_url over 5-min signed download_url._ |
| TikTok: OAuth & token lifecycle | `app/services/tiktok/auth_client.rb`, `app/services/tiktok/token_service.rb`, `app/services/tiktok/client.rb`, `app/models/channel/tiktok.rb` | `channel_tiktok` (Startups+) | [[other-channels]] · _Short-lived tokens refreshed lazily under a Redis lock via Tiktok::TokenService; both-expired triggers prompt_reauthorization!._ |
| TikTok: messaging, capabilities & read receipts | `app/services/tiktok/message_service.rb`, `app/services/tiktok/send_on_tiktok_service.rb`, `app/services/tiktok/read_status_service.rb`, `app/controllers/webhooks/tiktok_controller.rb` | `channel_tiktok` (Startups+) | [[other-channels]], [[webhook-routing]] · _image_send_capable? probed once and cached on the conversation; text and attachment are mutually exclusive per send._ |
| API channel: custom-channel conversations & email continuity | `app/models/channel/api.rb`, `app/services/messages/send_email_notification_service.rb` | `email_continuity_on_api_channel` | [[other-channels]] · _Messages arrive via the REST API and leave via account webhooks; the flag gates only the email-continuity fallback notification._ |
| Twitter: tweets & DMs (legacy) | `app/services/twitter/tweet_parser_service.rb`, `app/services/twitter/direct_message_parser_service.rb`, `app/services/twitter/send_on_twitter_service.rb`, `app/services/twitter/webhook_subscribe_service.rb`, `app/models/channel/twitter_profile.rb` | — | [[other-channels]], [[webhook-routing]] · _Legacy Account Activity API (webhook enters via Api::V1::WebhooksController#twitter_events, not app/controllers/webhooks/); treat as lower-confidence given X API changes._ |

## Voice calling capabilities

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Voice: Twilio channel setup & provisioning | `enterprise/app/models/enterprise/channel/twilio_sms.rb`, `enterprise/app/services/twilio/voice_webhook_setup_service.rb`, `enterprise/app/services/twilio/voice_teardown_service.rb`, `enterprise/app/controllers/enterprise/api/v1/accounts/inboxes_controller.rb` | `channel_voice` (Startups+) | [[other-channels]], [[controllers-jobs-listeners]] · _voice_enabled toggle on Channel::TwilioSms provisions/tears down the TwiML app; inboxes_controller adds the 'voice' channel type and calling toggles._ |
| Voice: Twilio call webhooks & call legs | `enterprise/app/controllers/twilio/voice_controller.rb`, `enterprise/app/services/voice/inbound_call_builder.rb`, `enterprise/app/services/voice/outbound_call_builder.rb`, `enterprise/app/services/voice/provider/twilio/adapter.rb` | `channel_voice` (Startups+) | [[controllers-jobs-listeners]], [[other-channels]] · _TwiML call/status webhooks resolve inbound/outbound/agent legs; returns empty TwiML when inbound calls are disabled on the inbox._ |
| Voice: conference management | `enterprise/app/services/voice/conference/manager.rb`, `enterprise/app/services/voice/provider/twilio/conference_service.rb`, `enterprise/app/controllers/api/v1/accounts/conference_controller.rb` | `channel_voice` (Startups+) | [[controllers-jobs-listeners]], [[models-services]] · _Join/leave/end Twilio conferences per call; case-store evidence of orphaned-conference hold-music failure modes lives here._ |
| Voice: call lifecycle & status (shared Call model) | `enterprise/app/models/call.rb`, `enterprise/app/services/voice/call_status/manager.rb`, `enterprise/app/services/voice/status_update_service.rb`, `enterprise/app/services/voice/call_message_builder.rb` | `channel_voice` (Startups+) | [[models-services]] · _Unified Twilio+WhatsApp Call record with status transitions and the voice_call message bubble builder._ |
| Voice: WhatsApp calling (Meta Calling API) | `enterprise/app/controllers/api/v1/accounts/whatsapp_calls_controller.rb`, `enterprise/app/services/whatsapp/incoming_call_service.rb`, `enterprise/app/services/whatsapp/call_service.rb`, `enterprise/app/services/enterprise/whatsapp/providers/whatsapp_cloud_service.rb`, `enterprise/app/jobs/enterprise/webhooks/whatsapp_events_job.rb` | `channel_voice` (Startups+) | [[controllers-jobs-listeners]], [[models-services]] · _initiate/accept/reject/terminate against Graph API calling endpoints; field=calls webhooks routed under a per-call_id Redis mutex; docs/WHATSAPP_CALL_ARCHITECTURE.md is authoritative for the media plane._ |
| Voice: WhatsApp call permissions | `enterprise/app/services/whatsapp/call_permission_request_service.rb`, `enterprise/app/services/whatsapp/call_permission_reply_service.rb` | `channel_voice` (Startups+) | [[controllers-jobs-listeners]], [[models-services]] · _Meta requires user-granted permission before business-initiated calls; request/interactive-reply flow intercepted from the WhatsApp events job._ |
| Voice: recording & transcription | `enterprise/app/services/voice/recording_status_service.rb`, `enterprise/app/services/voice/call_transcription_service.rb`, `enterprise/app/jobs/voice/call_transcription_job.rb`, `enterprise/app/services/voice/provider/twilio/recording_attachment_service.rb`, `enterprise/app/jobs/voice/provider/twilio/recording_attachment_job.rb` | `channel_voice` (Startups+) | [[controllers-jobs-listeners]], [[models-services]] · _Recording-status webhook handling, recording attachment onto the call message, and the async transcription pipeline._ |
| Voice: call history & visibility | `enterprise/app/finders/call_finder.rb`, `enterprise/app/controllers/api/v1/accounts/calls_controller.rb`, `enterprise/app/controllers/api/v1/accounts/contacts/calls_controller.rb` | `channel_voice` (Startups+) | [[controllers-jobs-listeners]] · _Account-wide call list only for admins/report_manage custom roles; others see calls they handled within permitted conversations._ |
| Voice: agent call session (browser SDK & tokens) | `app/javascript/dashboard/composables/useCallSession.js`, `app/javascript/dashboard/composables/useWhatsappCallSession.js`, `enterprise/app/services/voice/provider/twilio/token_service.rb` | `channel_voice` (Startups+) | [[controllers-jobs-listeners]] · _Shared frontend session state (global join lock, duration timer) over Twilio Voice SDK and WhatsApp WebRTC; token_service mints the short-lived Voice Grant JWTs._ |

## Website live chat & widget capabilities

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Website live chat: visitor session & auth token | `app/controllers/api/v1/widget/configs_controller.rb`, `app/controllers/concerns/website_token_helper.rb`, `app/services/widget/token_service.rb`, `app/helpers/widget_helper.rb`, `app/models/channel/web_widget.rb` | `channel_website` | [[widget-backend]], [[identity-validation]] · _Bootstrap config call creates contact/contact_inbox and mints the per-visitor JWT (X-Auth-Token); expired/garbage tokens silently behave like a brand-new anonymous visitor._ |
| Website live chat: conversations & messaging | `app/controllers/api/v1/widget/conversations_controller.rb`, `app/controllers/api/v1/widget/messages_controller.rb`, `app/controllers/api/v1/widget/base_controller.rb` | `channel_website` | [[widget-backend]] · _Conversation create/resolve/typing/read/transcript plus message CRUD; conversation scope widens to all hmac_verified contact_inboxes when the session is verified._ |
| Website live chat: SDK embed & public JS API | `app/javascript/entrypoints/sdk.js`, `app/javascript/sdk/IFrameHelper.js`, `app/javascript/sdk/cookieHelpers.js`, `app/javascript/sdk/settingsHelper.js` | `channel_website` | [[widget-sdk]] · _window.$chatwoot API (setUser/setCustomAttributes/toggle/reset) and the string-matched postMessage bridge; every platform install guide reduces to chatwootSDK.run({websiteToken, baseUrl})._ |
| Website live chat: widget app (in-iframe UI) | `app/javascript/entrypoints/widget.js`, `app/javascript/widget/App.vue`, `app/javascript/widget/store`, `app/javascript/widget/api`, `app/javascript/widget/helpers/actionCable.js` | `channel_website` | [[widget-sdk]], [[widget-backend]] · _The Vue 3 app inside the iframe: chat UI, Vuex store, /api/v1/widget/* REST clients, and the ActionCable subscriber mirroring agent-side message/typing/presence events._ |
| Website live chat: continuity via email | `app/services/messages/send_email_notification_service.rb`, `app/controllers/api/v1/widget/messages_controller.rb`, `app/models/channel/web_widget.rb` | `channel_website` | [[widget-backend]] · _Gated by the per-inbox continuity_via_email toggle (not a features.yml flag — email_continuity_on_api_channel gates only the API-channel sibling); input_email content_type in messages#update captures the visitor's address._ |
| Website live chat: dark mode & appearance | `app/javascript/widget/composables/useDarkMode.js`, `app/javascript/sdk/settingsHelper.js` | `channel_website` | [[widget-sdk]] · _darkMode light/auto/dark threaded from chatwootSettings through config-set postMessage to the appConfig store; runtime switch via $chatwoot.setColorScheme()._ |
| Website live chat: campaigns on widget | `app/controllers/api/v1/widget/campaigns_controller.rb`, `app/javascript/widget/helpers/campaignHelper.js`, `app/javascript/widget/store/modules/campaign.js` | `campaigns` (Startups+) | [[widget-backend]], [[widget-sdk]] · _Client-side delivery of ongoing campaigns (URL match + delay timer, cookie-based snooze); authoring/triggering lives in the Campaigns rows._ |

## WhatsApp capabilities

The WhatsApp channel decomposed into its real sub-capabilities — each row is its own graph node, so registration, embedded signup, templates, reauthorization etc. are separately traversable (functions shared between capabilities, like `FacebookApiClient`, link to every capability using them). Groupings mirror [[whatsapp]]'s own Key Files sections.

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| WhatsApp: registration & webhook setup | `app/services/whatsapp/webhook_setup_service.rb`, `app/services/whatsapp/webhook_teardown_service.rb`, `app/services/whatsapp/facebook_api_client.rb` | — | [[whatsapp]], [[whatsapp-field-guide]] |
| WhatsApp: embedded signup | `app/services/whatsapp/embedded_signup_service.rb`, `app/services/whatsapp/channel_creation_service.rb`, `app/services/whatsapp/token_exchange_service.rb`, `app/services/whatsapp/phone_info_service.rb`, `app/controllers/api/v1/accounts/whatsapp/authorizations_controller.rb` | `whatsapp_embedded_signup_inbox_creation` | [[whatsapp]], [[whatsapp-field-guide]] |
| WhatsApp: reauthorization & credential transfer | `app/services/whatsapp/reauthorization_service.rb`, `app/models/concerns/reauthorizable.rb` | `whatsapp_reconfigure`, `whatsapp_manual_transfer` | [[whatsapp]] |
| WhatsApp: templates & business token | `app/services/whatsapp/template_processor_service.rb`, `app/services/whatsapp/populate_template_parameters_service.rb`, `app/services/whatsapp/csat_template_service.rb`, `app/services/whatsapp/business_management_token_service.rb` | — | [[whatsapp]], [[whatsapp-field-guide]] |
| WhatsApp: inbound pipeline | `app/services/whatsapp/incoming_message_base_service.rb`, `app/services/whatsapp/webhook_channel_finder_service.rb`, `app/jobs/webhooks/whatsapp_events_job.rb` | — | [[whatsapp]], [[webhook-routing]] |
| WhatsApp: outbound sending | `app/services/whatsapp/send_on_whatsapp_service.rb`, `app/services/whatsapp/providers` | — | [[whatsapp]] |
| WhatsApp: coexistence identity (BSUID) | `app/services/whatsapp/identifier_sync_service.rb`, `app/services/whatsapp/incoming_message_identifier_helper.rb`, `app/services/whatsapp/in_reply_to_message_finder.rb` | — | [[whatsapp]], [[whatsapp-field-guide]] |
| WhatsApp: health monitoring | `app/services/whatsapp/health_service.rb`, `app/jobs/channels/whatsapp/health_sync_job.rb` | — | [[whatsapp]], [[whatsapp-field-guide]] |
| WhatsApp: phone normalization | `app/services/whatsapp/phone_number_normalization_service.rb`, `app/services/whatsapp/phone_normalizers` | — | [[whatsapp]], [[whatsapp-field-guide]] |
| WhatsApp: campaigns | `app/services/whatsapp/oneoff_campaign_service.rb` | `whatsapp_campaign` | [[whatsapp]], [[jobs]] |

## Automation & routing

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Macros | `app/models/macro.rb`, `app/services/macros/execution_service.rb`, `app/controllers/api/v1/accounts/macros_controller.rb` | `macros` | [[macros]] |
| Agent capacity limits | `enterprise/app/models/agent_capacity_policy.rb`, `enterprise/app/models/inbox_capacity_limit.rb` | `advanced_assignment` (Business+) | [[assignment]], [[plan-tiers-billing]] |
| SLA | `enterprise/app/models/sla_policy.rb`, `enterprise/app/models/applied_sla.rb`, `enterprise/app/services/sla/evaluate_applied_sla_service.rb` | `sla` (Business+) | [[reports]], [[plan-tiers-billing]] |
| Business hours | `app/models/working_hour.rb`, `app/models/inbox.rb` (working-hours config) | — | [[models]] |
| Auto-responder (greeting / out-of-office) | `app/services/message_templates/hook_execution_service.rb`, `app/services/message_templates/template/out_of_office.rb`, `app/services/message_templates/template/greeting.rb` | — | [[messages-services]] |

**Decomposed capabilities:**

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Automation rules: rule engine (events, conditions, actions) | `app/models/automation_rule.rb`, `app/listeners/automation_rule_listener.rb`, `app/services/automation_rules/conditions_filter_service.rb`, `app/services/automation_rules/action_service.rb`, `app/controllers/api/v1/accounts/automation_rules_controller.rb` | `automations` | [[automation-rules]] · _Event-triggered immediate rules; shares the base ActionService action vocabulary with macros, and Enterprise adds the add_sla action via Enterprise::ActionService._ |
| Automation rules: delayed execution (episodes & sweep) | `app/models/automation_rule_pending_execution.rb`, `app/jobs/automation_rules/trigger_pending_executions_job.rb`, `app/jobs/automation_rules/process_pending_execution_job.rb` | `delayed_automations` | [[automation-rules]] · _Episode-keyed pending-execution queue with fire-time re-checks; read AutomationRulePendingExecution directly before touching episode-key mechanics._ |
| Automation rules: condition validation & auto-disable | `app/services/automation_rules/condition_validation_service.rb`, `app/models/concerns/reauthorizable.rb` | `automations` | [[automation-rules]] · _Conditions are re-validated at match time; two consecutive failures auto-disable the rule and email account admins via Reauthorizable._ |
| Auto-assignment: legacy per-conversation (V1) | `app/services/auto_assignment/agent_assignment_service.rb`, `app/models/concerns/auto_assignment_handler.rb`, `app/models/concerns/inbox_agent_availability.rb` | — | [[assignment]] · _Synchronous single-conversation assignment inside the Conversation save callback; default path when assignment_v2 is off, toggled per-inbox via enable_auto_assignment._ |
| Auto-assignment: policy-driven bulk (V2) | `app/services/auto_assignment/assignment_service.rb`, `app/models/assignment_policy.rb`, `app/services/auto_assignment/rate_limiter.rb`, `app/jobs/auto_assignment/assignment_job.rb`, `app/jobs/auto_assignment/periodic_assignment_job.rb` | `assignment_v2` | [[assignment]] · _SKIP LOCKED bulk claim driven by AssignmentPolicy; Enterprise overlay (enterprise/app/services/enterprise/auto_assignment/) adds balanced selection and capacity filtering under advanced_assignment (see Agent capacity limits row)._ |
| Auto-assignment: round-robin rotation queue | `app/services/auto_assignment/inbox_round_robin_service.rb`, `app/services/auto_assignment/round_robin_selector.rb`, `app/models/inbox_member.rb` | — | [[assignment]] · _Redis-backed per-inbox rotation shared by both V1 and V2; self-heals membership from inbox_members but resets order on Redis flush._ |

## Teams & permissions

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Teams | `app/models/team.rb`, `app/controllers/api/v1/accounts/teams_controller.rb`, `app/controllers/api/v1/accounts/team_members_controller.rb` | `team_management` (Startups+) | [[models]] |
| Agents & roles (admin/agent) | `app/models/account_user.rb` (role enum), `app/controllers/api/v1/accounts/agents_controller.rb` | `agent_management` | [[models]], [[authorization-policies]] |
| Custom roles | `enterprise/app/models/custom_role.rb` | `custom_roles` (Business+) | [[authorization-policies]], [[plan-tiers-billing]] |
| Audit logs | `enterprise/app/models/enterprise/audit_log.rb`, `enterprise/app/controllers/api/v1/accounts/audit_logs_controller.rb` | `audit_logs` (Enterprise) | [[plan-tiers-billing]] |

## Campaigns

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Live-chat (ongoing) campaigns | `app/models/campaign.rb`, `app/controllers/api/v1/accounts/campaigns_controller.rb` | `campaigns` (Startups+) | [[models]], [[widget-backend]] |
| One-off WhatsApp / SMS campaigns | `app/jobs/campaigns/trigger_oneoff_campaign_job.rb`, `app/services/whatsapp/oneoff_campaign_service.rb`, `app/services/twilio/oneoff_sms_campaign_service.rb` | `campaigns` (Startups+), `whatsapp_campaign` | [[whatsapp]], [[jobs]] |

## CSAT

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|

## CSAT capabilities

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| CSAT: inbox enablement & survey rules | `app/controllers/api/v1/accounts/inboxes_controller.rb`, `app/models/inbox.rb` | — | [[portal-survey-superadmin]] · _Per-inbox csat_survey_enabled + csat_config jsonb (display_type emoji/star, message, button_text, label-based survey_rules, template) permitted/normalized in InboxesController#format_csat_config._ |
| CSAT: survey trigger on resolution | `app/listeners/csat_survey_listener.rb`, `app/services/csat_survey_service.rb`, `app/services/message_templates/template/csat_survey.rb` | — | [[events-listeners]] · _conversation_status_changed → eligibility checks (enabled, not tweet, not already sent, label survey_rules, messaging window) → input_csat message, WhatsApp/Twilio template fallback, or a not-sent activity message._ |
| CSAT: WhatsApp & Twilio template management | `app/controllers/api/v1/accounts/inbox_csat_templates_controller.rb`, `app/services/csat_template_management_service.rb`, `app/services/whatsapp/csat_template_service.rb`, `app/services/twilio/csat_template_service.rb`, `app/services/csat_template_name_service.rb` | — | [[whatsapp]] · _Creates/status-checks the auto-generated versioned CSAT template on the WABA (or Twilio Content API) so resolved conversations outside the 24h window still get a survey._ |
| CSAT: template utility analysis (Captain) | `app/services/csat_template_utility_analysis_service.rb`, `app/services/csat_template_utility_rubric.rb`, `app/controllers/api/v1/accounts/inbox_csat_templates_controller.rb` | `captain_integration` | [[whatsapp]] · _AI pre-check (analyze action, 403 without captain_integration) scoring a draft CSAT template against a rubric before submitting it to Meta._ |
| CSAT: public survey response page | `app/controllers/survey/responses_controller.rb`, `app/controllers/public/api/v1/csat_survey_controller.rb`, `app/javascript/survey/views/Response.vue` | — | [[portal-survey-superadmin]] · _Standalone Vue SPA keyed by conversation UUID (not a survey id); GET/PATCH /public/api/v1/csat_survey/:uuid with rating+feedback, edits 422-locked after 14 days._ |
| CSAT: response capture & storage | `app/listeners/csat_survey_listener.rb`, `app/builders/csat_surveys/response_builder.rb`, `app/models/csat_survey_response.rb` | — | [[events-listeners]], [[portal-survey-superadmin]] · _message_updated on the input_csat message upserts CsatSurveyResponse (unique per message, snapshots assigned agent) — the rows CSAT reports aggregate._ |
| CSAT: review notes | `enterprise/app/controllers/enterprise/api/v1/accounts/csat_survey_responses_controller.rb`, `enterprise/app/policies/enterprise/csat_survey_response_policy.rb`, `app/models/csat_survey_response.rb` | `csat_review_notes` (Business+) | [[portal-survey-superadmin]] · _Enterprise-only update of csat_review_notes on a response with review_notes_updated_by/at audit fields._ |

## Reports

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| CSAT report | `app/controllers/api/v1/accounts/csat_survey_responses_controller.rb` | `reports` | [[reports]] |
| SLA report | `enterprise/app/models/applied_sla.rb`, `enterprise/app/models/sla_event.rb` | `sla` (Business+) | [[reports]] |

## Reports capabilities

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Reports: overview live metrics | `app/controllers/api/v2/accounts/live_reports_controller.rb` | `reports` | [[reports]], [[feature-uis]] · _Realtime Overview page (LiveReports.vue): open/unattended conversation metrics and agent/team/inbox-grouped metrics computed live from conversations, not reporting_events._ |
| Reports: conversation timeseries & summary (read path) | `app/controllers/api/v2/accounts/reports_controller.rb`, `app/builders/v2/reports/timeseries/base_timeseries_builder.rb`, `app/services/reports/raw_data_source.rb`, `app/services/reports/report_metric_registry.rb`, `app/services/reports/data_source.rb` | `reports` | [[reports]], [[feature-uis]] · _Core index/summary metrics; Reports::DataSource.for still always returns RawDataSource — the rollup-backed read path is not wired._ |
| Reports: agent/inbox/label/team/channel summaries | `app/controllers/api/v2/accounts/summary_reports_controller.rb`, `app/builders/v2/reports/base_summary_builder.rb`, `app/builders/v2/reports/agent_summary_builder.rb`, `app/builders/v2/report_builder.rb` | `reports` | [[reports]], [[feature-uis]] · _Two generations coexist: revised index-table summaries via V2::Reports::*SummaryBuilder, while legacy V2::ReportBuilder still powers the old entity pages and the conversations action._ |
| Reports: drilldown | `app/builders/v2/reports/drilldown_builder.rb`, `app/services/reports/drilldown_timestamp_validator.rb`, `app/builders/v2/reports/drilldown_record_serializer.rb` | `reports` | [[reports]], [[feature-uis]] · _Click a chart bucket to see underlying conversations/messages/events; admin-only at both controller and UI level._ |
| Reports: bot reports | `app/builders/v2/reports/bot_metrics_builder.rb`, `app/controllers/api/v2/accounts/reports_controller.rb` | `reports` | [[reports]], [[feature-uis]] · _bot_summary/bot_metrics actions over bot_resolutions_count/bot_handoffs_count; handoff uniqueness enforced by DISTINCT conversation_id, not the DB._ |
| Reports: CSV downloads | `app/controllers/api/v2/accounts/reports_controller.rb`, `app/helpers/api/v2/accounts/reports_helper.rb`, `app/helpers/report_helper.rb` | `reports` | [[reports]], [[feature-uis]] · _Server-generated CSV exports (agents/inboxes/labels/teams/conversations_summary/conversation_traffic); CSAT and SLA have their own download actions on their controllers._ |
| Reports: metric event capture & rollups (write path) | `app/listeners/reporting_event_listener.rb`, `app/services/reporting_events/rollup_service.rb`, `app/services/reporting_events/backfill_service.rb`, `app/services/reporting_events/event_metric_registry.rb` | `report_rollup` | [[reports]] · _ReportingEvent + ReportingEventsRollup producers; rollup writes run unconditionally (report_rollup only ever gates the not-yet-wired read side) and BackfillService has no scheduler/job caller._ |

## Captain AI

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Copilot (agent sidebar) | `enterprise/app/models/copilot_thread.rb`, `enterprise/app/services/captain/copilot/chat_service.rb` | `captain_integration` (Startups+) | [[captain-ai]] |
| Memories (contact facts) | `enterprise/app/services/captain/llm/contact_notes_service.rb`, `enterprise/app/services/captain/llm/contact_attributes_service.rb` | `captain_integration` (Startups+) | [[captain-ai]] |

## Captain AI capabilities

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Captain: assistants (bot reply pipeline) | `enterprise/app/models/captain/assistant.rb`, `enterprise/app/services/captain/conversation/response_scheduler_service.rb`, `enterprise/app/jobs/captain/conversation/response_builder_job.rb`, `enterprise/app/services/captain/assistant/agent_runner_service.rb`, `enterprise/app/controllers/api/v1/accounts/captain/assistants_controller.rb` | `captain_integration`, `captain_integration_v2` (Startups+) | [[captain-ai]], [[models-services]], [[controllers-jobs-listeners]] · _ResponseBuilderJob branches v1 (chat + action classifier) vs v2 (tool-using agent runner); captain_integration_v2 is eligibility-gated, not in any plan array._ |
| Captain: reply control & auto-resolution | `enterprise/app/jobs/captain/inbox_pending_conversations_resolution_job.rb`, `enterprise/lib/captain/conversation_completion_service.rb`, `enterprise/app/models/captain/assistant.rb`, `enterprise/app/models/conversation_outcome.rb` | `captain_integration`, `captain_tasks` (Startups+) | [[controllers-jobs-listeners]], [[models-services]] · _Guardrails/auto_resolve_mode/inactivity threshold live on Captain::Assistant; LLM-evaluated completion needs captain_tasks + assistant config, else pure time-based._ |
| Captain: documents & knowledge sync | `enterprise/app/models/captain/document.rb`, `enterprise/app/services/captain/documents/sync_service.rb`, `enterprise/app/jobs/captain/documents/perform_sync_job.rb`, `enterprise/app/jobs/captain/documents/crawl_job.rb`, `enterprise/app/controllers/api/v1/accounts/captain/documents_controller.rb` | `captain_integration`, `captain_document_auto_sync` (Startups+) | [[models-services]], [[controllers-jobs-listeners]] · _PerformSyncJob layers permanent-discard/transient-retry/catch-all policies under a per-document Redis lock; Firecrawl webhook feeds the crawl pipeline._ |
| Captain: FAQ learning & suggestions | `enterprise/app/models/captain/faq_suggestion.rb`, `enterprise/app/services/captain/llm/conversation_faq_service.rb`, `enterprise/app/jobs/captain/llm/conversation_faq_job.rb`, `enterprise/app/services/captain/faq_suggestion_approval_service.rb`, `enterprise/app/controllers/api/v1/accounts/captain/faq_suggestions_controller.rb` | `captain_integration` (Startups+) | [[captain-ai]], [[controllers-jobs-listeners]] · _CaptainListener enqueues ConversationFaqJob on conversation_resolved when the assistant's feature_faq config is on; suggestions are permission-scoped via FaqSuggestionFinder._ |
| Captain: custom tools | `enterprise/app/models/captain/custom_tool.rb`, `enterprise/app/models/concerns/toolable.rb`, `enterprise/app/services/captain/tools/custom_http_tool.rb`, `enterprise/app/controllers/api/v1/accounts/captain/custom_tools_controller.rb` | `custom_tools`, `captain_integration_v2` (Business+) | [[models-services]], [[controllers-jobs-listeners]] · _Controller allows either flag; user-defined HTTP tools with Liquid templating, SSRF-guarded endpoints (SafeEndpointValidatable), 15-per-account cap._ |
| Captain: agent task assists (summarize/reply/rewrite/label) | `app/controllers/api/v1/accounts/captain/tasks_controller.rb`, `lib/captain/base_task_service.rb`, `lib/captain/summary_service.rb`, `lib/captain/reply_suggestion_service.rb`, `lib/captain/rewrite_service.rb` | `captain_tasks` | [[captain-ai]] · _OSS lib/captain task services behind the tasks controller (also label_suggestion/follow_up/overview_summary/csat_utility_analysis); captain_tasks ships enabled by default._ |
| Captain: AI credits & usage limits | `enterprise/app/models/enterprise/account/plan_usage_and_limits.rb`, `enterprise/app/services/enterprise/billing/handle_stripe_event_service.rb`, `enterprise/app/services/enterprise/billing/topup_checkout_service.rb`, `enterprise/app/services/enterprise/billing/topup_fulfillment_service.rb` | — | [[models-services]], [[captain-ai]] · _Per-plan CAPTAIN_CLOUD_PLAN_LIMITS (not a feature-flag array); usage_limits gates document/response creation; credit delta math has a known stuck-at-0 bug history._ |
| Captain: model routing & preferences | `config/llm.yml`, `lib/llm/feature_router.rb`, `lib/llm/models.rb`, `app/models/concerns/captain_featurable.rb`, `app/controllers/api/v1/accounts/captain/preferences_controller.rb` | `captain_integration_v2` | [[captain-ai]], [[controllers-jobs-listeners]] · _Precedence: account captain_models override > hardcoded gpt-5.2 for v2-flagged assistant feature > llm.yml default; credit_multiplier per model is advertised here, not debited._ |

## Help Center

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|

## Help Center capabilities

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Help Center: portal management & branding | `app/models/portal.rb`, `app/models/concerns/portal_config_schema.rb`, `app/controllers/api/v1/accounts/portals_controller.rb` | `help_center` (Startups+) | [[help-center-models]] · _Portal CRUD: slug, locales, layout (classic/documentation), color/logo branding, analytics snippets, and per-locale popular-content recommendations, all schema-validated via PortalConfigSchema._ |
| Help Center: category & folder taxonomy | `app/models/category.rb`, `app/models/folder.rb`, `app/models/related_category.rb`, `app/controllers/api/v1/accounts/categories_controller.rb` | `help_center` (Startups+) | [[help-center-models]] · _Locale-scoped categories with three distinct self-referential links: parent/sub hierarchy, cross-locale associated categories, and RelatedCategory join for related topics._ |
| Help Center: article authoring & publishing | `app/models/article.rb`, `app/controllers/api/v1/accounts/articles_controller.rb`, `app/controllers/api/v1/accounts/articles/bulk_actions_controller.rb` | `help_center` (Startups+) | [[help-center-models]] · _Draft/published/archived workflow with per-locale draft publishing, hand-rolled position rebalancing (not acts_as_list), and cross-locale linked translations via associated_article_id._ |
| Help Center: public portal rendering | `app/controllers/public/api/v1/portals_controller.rb`, `app/controllers/public/api/v1/portals/base_controller.rb`, `app/controllers/public/api/v1/portals/articles_controller.rb`, `app/controllers/public/api/v1/portals/categories_controller.rb`, `app/javascript/portal` | `help_center` (Startups+) | [[portal-survey-superadmin]], [[help-center-models]] · _Server-rendered Turbo/ERB site with small Vue islands (search, TOC, theme toggle) reading window.portalConfig; on Cloud the flag gate returns 402 not_active when help_center is off._ |
| Help Center: article search (full-text & semantic) | `app/controllers/public/api/v1/portals/search_controller.rb`, `app/services/search_service.rb`, `enterprise/app/models/enterprise/concerns/article.rb`, `enterprise/app/jobs/portal/article_indexing_job.rb` | `help_center`, `help_center_embedding_search` (Startups+) | [[help-center-models]], [[portal-survey-superadmin]] · _OSS path is pg_search text_search (public portal search + agent-side SearchService); Enterprise pgvector vector_search is gated by help_center_embedding_search, a manual-only flag granted by no plan tier._ |
| Help Center: custom domain & SSL | `enterprise/app/models/enterprise/concerns/portal.rb`, `enterprise/app/jobs/enterprise/cloudflare_verification_job.rb`, `enterprise/app/services/cloudflare` | `help_center` (Startups+) | [[help-center-models]] · _Portal#custom_domain changes enqueue Cloudflare custom-hostname verification on Chatwoot Cloud only; ssl_settings jsonb lives on Portal._ |
| Help Center: widget/iframe embedding (plain layout) | `app/controllers/public/api/v1/portals/base_controller.rb`, `app/javascript/portal/portalHelpers.js` | `help_center` (Startups+) | [[portal-survey-superadmin]] · _show_plain_layout=true switches rendering to the :plain variant (chrome-less layout, X-Frame-Options removed) for embedding articles inside the web widget or an iframe._ |

## Integrations

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Slack | `lib/integrations/slack/send_on_slack_service.rb`, `app/controllers/api/v1/accounts/integrations/slack_controller.rb`, `app/models/integrations/hook.rb` | `integrations` | [[integrations]], [[lib-integrations]] |
| Dialogflow | `lib/integrations/dialogflow/processor_service.rb`, `lib/integrations/bot_processor_service.rb` | `integrations` | [[lib-integrations]] |
| Linear | `lib/integrations/linear/processor_service.rb`, `app/controllers/api/v1/accounts/integrations/linear_controller.rb` | `linear_integration` (Startups+) | [[lib-integrations]] |
| Dashboard apps | `app/models/dashboard_app.rb`, `app/controllers/api/v1/accounts/dashboard_apps_controller.rb` | — | [[integrations]] |
| Webhooks (account) | `app/models/webhook.rb`, `lib/webhooks/trigger.rb`, `app/jobs/webhook_job.rb`, `app/controllers/api/v1/accounts/webhooks_controller.rb` | `api_and_webhooks` (Startups+) | [[webhook-routing]] |
| Google Translate | `lib/integrations/google_translate/processor_service.rb`, `lib/integrations/google_translate/detect_language_service.rb` | `integrations` | [[lib-integrations]] |
| Video calls (Dyte) | `lib/integrations/dyte/processor_service.rb`, `app/controllers/api/v1/accounts/integrations/dyte_controller.rb` | `integrations` | [[lib-integrations]] |

## Integrations & platform capabilities

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Shopify | `app/controllers/api/v1/accounts/integrations/shopify_controller.rb`, `app/controllers/shopify/callbacks_controller.rb`, `app/controllers/webhooks/shopify_controller.rb` | `shopify_integration` | [[webhook-routing]], [[integrations]] · _Per-store OAuth connect plus customer-order lookup in the conversation sidebar; the webhooks controller only handles Shopify's shop/redact GDPR topic (destroys the Integrations::Hook), and availability also requires SHOPIFY_CLIENT_ID global config._ |
| CRM sync (LeadSquared) | `app/services/crm/leadsquared/processor_service.rb`, `app/services/crm/leadsquared/setup_service.rb`, `app/services/crm/base_processor_service.rb`, `app/jobs/crm/setup_job.rb`, `app/jobs/hook_job.rb` | `crm_integration` | [[integrations]] · _Pushes contacts as LeadSquared leads and posts conversation-created/transcript activities; HookJob wraps calls in a per-hook Redis mutex to prevent duplicate-lead races, and Crm::SetupJob provisions activity types on hook creation._ |
| Notion | `app/controllers/api/v1/accounts/notion/authorizations_controller.rb`, `app/controllers/notion/callbacks_controller.rb`, `app/controllers/api/v1/accounts/integrations/notion_controller.rb` | `notion_integration` | [[integrations]] · _OAuth connect/disconnect storing an Integrations::Hook (app_id 'notion', requires NOTION_CLIENT_ID); no HookJob processor or lib/enterprise consumer exists yet, so the hook is consumed from the frontend only._ |

## Platform

| Feature | Entry points (code) | Feature flag / plan | Vault page |
|---|---|---|---|
| Pre-chat forms | `app/models/channel/web_widget.rb` | `channel_website` | [[widget-backend]] · _pre_chat_form_options on the widget channel_ |
| Identity validation (HMAC) | `app/models/channel/web_widget.rb`, `app/models/channel/api.rb`, `app/controllers/api/v1/widget/contacts_controller.rb` | — | [[identity-validation]], [[widget-backend]] |
| Agent bots | `app/models/agent_bot.rb`, `lib/integrations/bot_processor_service.rb`, `app/controllers/api/v1/accounts/agent_bots_controller.rb` | `agent_bots` | [[public-platform-api]], [[webhook-routing]] |
| White-label / disable branding | `config/installation_config.yml` (brand configs), `app/javascript/shared/composables/useBranding.js` | `disable_branding` (Enterprise) | [[plan-tiers-billing]], [[portal-survey-superadmin]] |

## Related

- [[plan-tiers-billing]] — full tier arrays and how `ReconcilePlanFeaturesService` reconciles flags on plan change
- [[models]] — schema-level detail for the domain models named above
- [[api-v1-controllers]] — controller conventions all the account-scoped endpoints follow
- [[external-docs]] — where each feature's user-guide article lives
- [[glossary]] — product-term ↔ code-term mapping
