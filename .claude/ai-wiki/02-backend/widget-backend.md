---
title: "Widget Backend"
tags: [chatwoot, backend, widget, api, authentication, live-chat]
generated: 2026-08-17
deepwiki_section: "Widget SDK"
---

# Widget Backend

## Purpose
This is the unauthenticated-by-cookie, JWT-authenticated API surface the website (live chat) widget talks to. It sits behind `Api::V1::Widget::*` controllers and handles everything a visitor's browser needs before an agent ever gets involved: identifying/creating a `Contact` and `ContactInbox` for the visitor, minting and validating a per-visitor auth token, creating conversations and messages, HMAC identity validation, custom attributes, labels, typing/read events, campaigns, and a couple of small Dyte video-call and file-upload endpoints. It is the backend counterpart of the `widget-sdk` module — every request from the embedded widget iframe ultimately lands here.

## Key Files & Classes
- `app/controllers/api/v1/widget/base_controller.rb` — shared base for (almost) all widget controllers; loads `@web_widget`/`@contact`, and provides shared helpers for building conversations/messages from request params (`conversation_params`, `message_params`, `contact_email`/`contact_name`/`contact_phone_number`).
- `app/controllers/concerns/website_token_helper.rb` — the actual auth mechanism: `set_web_widget` looks up `Channel::WebWidget` by `website_token` and rejects suspended accounts; `set_contact` decodes the `X-Auth-Token` JWT (via `auth_token_params`) to find the `ContactInbox`/`Contact` and sets `Current.contact`; raises `ActiveRecord::RecordNotFound` if no contact is resolved.
- `app/services/widget/token_service.rb` (`Widget::TokenService < BaseTokenService`) — issues/decodes the visitor JWT (`generate_token`/`decode_token`), payload is `{source_id, inbox_id}`. Expiry defaults to 180 days but is overridable via the `WIDGET_TOKEN_EXPIRY` `InstallationConfig`.
- `app/services/base_token_service.rb` — generic HS256 JWT encode/decode using `Rails.application.secret_key_base`; swallows `JWT::ExpiredSignature`/`JWT::DecodeError` and returns `{}` on decode failure (so an expired/invalid token silently looks like "no contact").
- `app/controllers/api/v1/widget/configs_controller.rb` — `POST widget/config`: the widget's bootstrap call. Skips normal `set_contact` (defines its own), creates the contact/contact_inbox if missing via `@web_widget.create_contact_inbox`, and returns the auth token plus `GlobalConfig` values (logo, brand name, widget brand URL, max upload size, installation name).
- `app/controllers/api/v1/widget/contacts_controller.rb` — visitor identity endpoints (`show`, `update`, `set_user`, `destroy_custom_attributes`). Owns the HMAC identity-validation logic (`valid_hmac?`, `should_verify_hmac?`) used when a website has `hmac_mandatory` or the caller passes `identifier_hash`. `set_user` can rebind the session to a *different* contact (`a_different_contact?`) via `WidgetHelper#build_contact_inbox_with_token`, minting a fresh token for the new contact.
- `app/controllers/api/v1/widget/conversations_controller.rb` — conversation lifecycle: `create` (wraps `ContactIdentifyAction` + conversation + first message in a transaction), `toggle_status` (resolve, gated by `@web_widget.end_conversation?`), `toggle_typing` (dispatches `CONVERSATION_TYPING_ON/OFF` via the event dispatcher), `transcript` (emails a transcript, rate-limited via `account.within_email_rate_limit?` and gated by `email_transcript_enabled?`), `update_last_seen`, custom attributes CRUD.
- `app/controllers/api/v1/widget/messages_controller.rb` — `index` (via `MessageFinder`), `create` (builds attachments from `params[:message][:attachments]`), `update` (special-cases `content_type == 'input_email'` for the "continue via email" flow, otherwise updates `submitted_values` — used for interactive-message replies like CSAT). `set_message` deliberately scopes lookup across *all* of the visitor's conversations, not just the latest, per an inline comment about a future multi-conversation widget flow.
- `app/controllers/api/v1/widget/events_controller.rb` — fire-and-forget event dispatch (e.g. widget-triggered analytics events) via `Rails.configuration.dispatcher.dispatch`.
- `app/controllers/api/v1/widget/campaigns_controller.rb`, `inbox_members_controller.rb` — read-only listings gated by `account.feature_enabled?('campaigns')`; both `skip_before_action :set_contact` since they don't need an identified visitor.
- `app/controllers/api/v1/widget/labels_controller.rb` — add/remove conversation labels from the widget, validated against `@current_account.labels`.
- `app/controllers/api/v1/widget/direct_uploads_controller.rb` — subclasses Rails' `ActiveStorage::DirectUploadsController` directly (not `BaseController`) to support direct-to-storage attachment uploads from the widget.
- `app/controllers/api/v1/widget/integrations/dyte_controller.rb` — `add_participant_to_meeting`, validates the target message is `content_type == 'integrations'` before delegating to `Integrations::Dyte::ProcessorService`.
- `app/helpers/widget_helper.rb` (`WidgetHelper`) — `build_contact_inbox_with_token`, the shared "create a fresh contact_inbox + mint its token" helper used by `set_user`.
- `config/routes.rb` (`namespace :widget do ... end`, under `api/v1`) — defines the full widget route surface: `config`, `direct_uploads`, `campaigns`, `events`, `messages`, `conversations` (+ custom collection actions like `toggle_status`, `transcript`, `set_custom_attributes`), `contact` (+ `set_user`), `inbox_members`, `labels`, `integrations/dyte`.

## How It Fits Together
- **Auth model**: there's no Devise/session auth here. Every request carries `website_token` (identifying the `Channel::WebWidget`/inbox) as a param and, once a contact exists, an `X-Auth-Token` JWT header (identifying the `ContactInbox` via `source_id` + `inbox_id`). `ConfigsController#create` is the only endpoint that can operate without a prior token — it's the bootstrap call the widget SDK makes on load.
- **Models touched**: `Channel::WebWidget` (see [[models]]) for widget config/HMAC settings, `Contact`/`ContactInbox` (created via `ContactInboxWithContactBuilder`), `Conversation`, `Message`, `InstallationConfig`/`GlobalConfig` for token expiry and branding.
- **Shared actions/services**: `ContactIdentifyAction` (`app/actions/contact_identify_action.rb`) is reused across `contacts_controller`, `conversations_controller`, and `messages_controller` to merge in email/phone/name/custom-attribute updates from the widget — same action used elsewhere in the contact-identification flow, see [[contacts-services]].
- **Events**: `toggle_typing` and `events_controller#create` both dispatch through `Rails.configuration.dispatcher.dispatch`, landing in the same event bus described in [[events-listeners]] (e.g. `CONVERSATION_TYPING_ON`/`CONVERSATION_TYPING_OFF` from `Events::Types`).
- **Jobs**: `update_last_seen` enqueues `Conversations::UpdateMessageStatusJob` (see [[jobs]]). `transcript` calls `ConversationReplyMailer...deliver_later`.
- **Frontend counterpart**: the embedded widget SDK (`widget-sdk`, see [[widget-sdk]]) is the sole caller of this entire controller namespace — it holds the `website_token`/`X-Auth-Token` pair and drives config bootstrap, message send/receive, and identity flows against these endpoints.
- **Cross-controller reuse**: `BaseController#conversations` branches on `@contact_inbox.hmac_verified?` — if verified, it scopes to *all* HMAC-verified contact_inboxes for that contact/inbox (supporting the case where a visitor was re-identified across sessions); otherwise it scopes to just the current `@contact_inbox`.
- **Enterprise**: no `enterprise/` overrides were found for `app/controllers/api/v1/widget` or `app/services/widget` in this scan — this appears to be OSS-only surface.

## Product Behavior
- The **Website live chat settings** guide topics (widget install guides, dark mode, "continue via email", SDK additional user info) map directly onto this backend: `configs_controller` is what a freshly-loaded widget calls to fetch branding/config; `messages_controller#update`'s `input_email` special case backs the "continue via email" feature; `contacts_controller#update`/`set_user` back the SDK's `setUser`/`setCustomAttributes` JS APIs.
- The **identity validation/HMAC** guide topic is implemented by `contacts_controller`'s `valid_hmac?`/`should_verify_hmac?`: a website can be configured `hmac_mandatory` (via `Channel::WebWidget`), in which case identifying/rebinding a contact requires a correct `identifier_hash` computed as `HMAC-SHA256(hmac_token, identifier)`. Plain anonymous pre-chat updates (no `identifier`) are exempted from this check so pre-chat forms keep working on HMAC-mandatory inboxes.
- `toggle_status`'s gate on `@web_widget.end_conversation?` corresponds to the widget setting that lets visitors mark their own conversation resolved from the chat window.
- `transcript`'s gate on `account.email_transcript_enabled?` corresponds to the "email me a copy of this transcript" widget feature, subject to the account's email rate limit.

## Notes for AI Agents
- `set_contact` (in `WebsiteTokenHelper`) `raise`s `ActiveRecord::RecordNotFound` when the token doesn't resolve to a contact — controllers that need to operate without an identified contact (e.g. `campaigns_controller`, `inbox_members_controller`) must explicitly `skip_before_action :set_contact`. Don't assume `@contact` is always present in a widget controller.
- `configs_controller` and `direct_uploads_controller` each **override** `set_contact` rather than relying on the shared one from `WebsiteTokenHelper`/`BaseController`, because they need "find-or-create" semantics instead of "find-or-404". Check which `set_contact` is in effect before assuming 404-on-missing-contact behavior.
- `BaseTokenService#decode_token` swallows both expired and malformed JWTs and returns `{}` — a widget with a stale/garbage token doesn't error, it silently behaves like a brand-new anonymous visitor (falls through to `ActiveRecord::RecordNotFound` in `set_contact`, or triggers contact creation in `configs_controller`). Keep this in mind when debugging "why did my token stop working" — there's no distinct error path.
- `messages_controller#set_message` intentionally scopes the lookup query across **all** of the contact's conversations (`conversations.select(:id)`), not just `conversations.last` — per the inline comment, this is forward-looking for a multi-conversation widget UI; don't "simplify" it back to `conversation.messages.find`.
- `direct_uploads_controller` subclasses Rails' own `ActiveStorage::DirectUploadsController` instead of `Api::V1::Widget::BaseController` — it re-declares `set_web_widget`/`set_contact` via the `WebsiteTokenHelper` concern directly, so it doesn't inherit any of `BaseController`'s conversation/message-building helpers.
- HMAC comparison in `contacts_controller#valid_hmac?` uses `ActiveSupport::SecurityUtils.secure_compare` after a manual `bytesize` check — a timing-safe pattern; if you touch this code, preserve both the length pre-check and secure_compare (don't switch to `==`).
- `WIDGET_TOKEN_EXPIRY` is an `InstallationConfig` value stored in days (defaults to 180); it's read fresh on every `Widget::TokenService#expire_in` call, no caching — a super-admin change takes effect on the next token mint without a restart.
- I did not deeply trace `Integrations::Dyte::ProcessorService` or `MessageFinder` — they're referenced from this module but live outside the two scanned directories.

## Related
- [[widget-sdk]] — the frontend/client side that calls every endpoint documented here.
- [[contacts-services]] — `ContactIdentifyAction` and other contact-side services reused by this module.
- [[conversations-services]] — conversation creation/status logic this module wraps for widget-originated conversations.
- [[messages-services]] — `MessageFinder` and message-side services.
- [[events-listeners]] — the dispatcher/event-type system used by `toggle_typing` and `events_controller`.
- [[jobs]] — `Conversations::UpdateMessageStatusJob` enqueued from `update_last_seen`.
- [[models]] — `Channel::WebWidget`, `Contact`, `ContactInbox`, `Conversation`, `Message`.
- [[api-v1-controllers]] — sibling agent-facing `Api::V1` controllers, for contrast with this unauthenticated-cookie/JWT-based widget surface.
- [[integrations]] — Dyte and other third-party integrations touched via `Integrations::Dyte::ProcessorService`.
