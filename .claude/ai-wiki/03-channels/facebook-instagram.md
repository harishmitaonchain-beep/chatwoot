---
title: "Facebook & Instagram Channels"
tags: [chatwoot, backend, channels, facebook, instagram, webhooks]
generated: 2026-08-17
deepwiki_section: "Multi-Channel Communication"
---

# Facebook & Instagram Channels

## Purpose

Handles inbound and outbound messaging for two Meta-owned channels: Facebook Messenger (via a connected Facebook Page) and Instagram Direct (via either a Facebook Page's linked Instagram account, or a standalone Instagram Login connection). `app/services/facebook` and `app/services/instagram` hold the outbound "reply" services and the Instagram inbound message-processing services; the inbound Facebook Messenger path lives mostly in `lib/integrations/facebook`. Both channels share the generic `Base::SendOnChannelService` outbound contract and a webhook → job → service → message-builder pipeline, but Instagram has **two independent connection modes** that behave differently at almost every layer.

## Key Files & Classes

**Outbound (send message to Meta)**
- `app/services/facebook/send_on_facebook_service.rb` — `Facebook::SendOnFacebookService`, sends text/attachments to Messenger via the `facebook-messenger` gem's `Facebook::Messenger::Bot.deliver`; sets `authorization_error!` on the channel when Facebook reports an invalidated/expired token.
- `app/services/instagram/base_send_service.rb` — `Instagram::BaseSendService < Base::SendOnChannelService`, shared HTTP-response handling (`process_response`, `external_error`, attachment/text param building); leaves `send_message` and `merge_human_agent_tag` abstract.
- `app/services/instagram/send_on_instagram_service.rb` — `Instagram::SendOnInstagramService`, posts to `graph.instagram.com/v22.0/<instagram_id>/messages` using the channel's own `access_token`. Used for `Channel::Instagram` (direct Instagram Login).
- `app/services/instagram/messenger/send_on_instagram_service.rb` — `Instagram::Messenger::SendOnInstagramService`, posts to `graph.facebook.com/v11.0/me/messages` using the Facebook Page's `page_access_token` plus an `appsecret_proof`. Used for Instagram-via-Facebook-Page.

**Inbound (Instagram DM processing)**
- `app/services/instagram/webhooks_base_service.rb` — `Instagram::WebhooksBaseService`, shared contact lookup/creation (`find_or_create_contact`) and profile-attribute syncing (`social_instagram_*` additional attributes) used by both Instagram connection modes.
- `app/services/instagram/base_message_text.rb` — `Instagram::BaseMessageText`, orchestrates one webhook `messaging` event: resolves inbox, skips if `reauthorization_required?`, handles unsend (`is_deleted`) events, decides sender vs recipient id based on whether the event is an agent echo, and delegates contact-fetch/message-creation to subclasses.
- `app/services/instagram/message_text.rb` — `Instagram::MessageText`, fetches the IG user profile from `graph.instagram.com` using the channel's own token (direct Instagram Login path); handles Meta error codes 190 (reauth), 230 (consent, ignored), 9010/100 (unknown user, synthesized contact).
- `app/services/instagram/messenger/message_text.rb` — `Instagram::Messenger::MessageText`, fetches the IG user profile via the **Koala** Facebook Graph client using the Page's `page_access_token` (Instagram-via-Facebook-Page path).
- `app/services/instagram/read_status_service.rb` — `Instagram::ReadStatusService`, maps an IG `read` webhook event to `Conversations::UpdateMessageStatusJob`; shared by both connection modes since the payload shape is identical.
- `app/services/instagram/refresh_oauth_token_service.rb` — `Instagram::RefreshOauthTokenService`, refreshes a long-lived Instagram Login token when it's valid, ≥24h old, and within 10 days of expiry (per Meta's refresh window rules); called from `Channel::Instagram#access_token`.
- `app/services/instagram/test_event_service.rb` — `Instagram::TestEventService`, handles Meta's synthetic test webhook (`sender.id == '12334'`, `recipient.id == '23245'`) sent from the App Dashboard during review, creating a throwaway conversation on `Channel::Instagram.last`.

**Supporting layers referenced but outside the investigated paths** (read for context):
- `app/services/base/send_on_channel_service.rb` — shared outbound template: validates channel type, skips private/looping/`voice_call` messages, calls `perform_reply`.
- `lib/integrations/facebook/message_parser.rb`, `message_creator.rb`, `delivery_status.rb` — parse the raw Messenger webhook JSON and create/update messages for `Channel::FacebookPage` (the Instagram-via-webhook path uses jobs/services in `app/services/instagram` instead, not these).
- `app/builders/messages/instagram/base_message_builder.rb` (`< Messages::Messenger::MessageBuilder`) plus `messages/instagram/message_builder.rb` and `messages/instagram/messenger/message_builder.rb` — turn a parsed webhook `messaging` payload into a `Conversation`/`Message`, dedupe by `source_id`/`mid`, and honor `lock_to_single_conversation`.
- `app/builders/messages/facebook/message_builder.rb` — the Facebook Messenger equivalent.
- `app/jobs/webhooks/facebook_events_job.rb`, `facebook_delivery_job.rb`, `instagram_events_job.rb` — entry jobs from the webhook controllers/gem callbacks.
- `config/initializers/facebook_messenger.rb` — configures the `facebook-messenger` gem (`ChatwootFbProvider`), wires `Bot.on :message/:delivery/:read/:message_echo` to the jobs above.
- `app/controllers/webhooks/instagram_controller.rb` — Instagram webhook receiver (Facebook Messenger's equivalent webhook is handled by the gem's own Sinatra-style callback, not a Rails controller).
- `app/controllers/instagram/callbacks_controller.rb`, `app/controllers/api/v1/accounts/instagram/authorizations_controller.rb` — OAuth callback and authorize-URL endpoints for the direct **Instagram Login** connection flow.
- `app/models/channel/facebook_page.rb`, `app/models/channel/instagram.rb` — the two channel models; both `include Reauthorizable`.

## How It Fits Together

**Two distinct Instagram connection modes** exist side by side and are treated as separate integrations throughout the stack:
1. **Instagram via Facebook Page** — `Channel::FacebookPage` has an `instagram_id` column; the Page's Messenger subscription (`messages`, `standby`, `messaging_handovers`, etc.) also carries Instagram DMs. Profile fetch uses **Koala** + `page_access_token`; sending uses `graph.facebook.com` + `appsecret_proof`.
2. **Instagram via Instagram Login** (`Channel::Instagram`) — a standalone OAuth connection (`Instagram::CallbacksController`), its own `access_token`/`expires_at`, refreshed by `Instagram::RefreshOauthTokenService`. Profile fetch and sending both hit `graph.instagram.com` directly with the channel's own token.

`Webhooks::InstagramEventsJob#find_channel` prefers `Channel::Instagram` and falls back to `Channel::FacebookPage` when resolving which channel a given `instagram_id` belongs to, then dispatches to `Instagram::MessageText` or `Instagram::Messenger::MessageText` accordingly. This dual-path split is also the subject of a known bug tracked separately in memory (see the coexistence duplicate-conversation note) — BSUID-style splitting of one contact across two `contact_inboxes` breaks reopen/`lock_to_single_conversation` semantics.

Both webhook jobs (`Webhooks::FacebookEventsJob`, `Webhooks::InstagramEventsJob`) are `MutexApplicationJob`s that lock per sender/recipient (`Redis::Alfred::FACEBOOK_MESSAGE_MUTEX`, `IG_MESSAGE_MUTEX`) to dampen races between concurrent webhook deliveries — the Instagram job additionally falls back to lock-free processing on lock-acquisition exhaustion rather than dropping the webhook.

- **Models**: `Channel::FacebookPage`, `Channel::Instagram` (see [[models]]) — both `include Channelable` and `Reauthorizable` (`reauthorization_required?`, `authorization_error!`, `reauthorized!`).
- **Message creation**: routes through `Messages::Instagram::*MessageBuilder` / `Messages::Facebook::MessageBuilder`, which build `Conversation`/`Message` records and enqueue attachment downloads — closely related to [[messages-services]].
- **Contact creation**: `ContactInboxWithContactBuilder` (called from both channel models' `create_contact_inbox`) and `Instagram::WebhooksBaseService#find_or_create_contact` — related to [[contacts-services]].
- **Jobs enqueued**: `Conversations::UpdateMessageStatusJob` (read/delivery receipts), `Avatar::AvatarFromUrlJob` (contact avatar), `Webhooks::FacebookEventsJob`/`FacebookDeliveryJob`/`InstagramEventsJob` — see [[jobs]].
- **Status updates**: `Messages::StatusUpdateService` marks outbound messages `failed` on Meta API errors — see [[messages-services]].
- **Error reporting**: `ChatwootExceptionTracker` is used pervasively for non-fatal Graph API errors (unmapped error codes, consent errors kept out of Sentry noise).
- **Human Agent tag**: gated per-installation via `GlobalConfigService`/`GlobalConfig` keys `ENABLE_MESSENGER_CHANNEL_HUMAN_AGENT` and `ENABLE_INSTAGRAM_CHANNEL_HUMAN_AGENT` (configurable from Super Admin → App Configs, per `app/controllers/super_admin/app_configs_controller.rb`); when enabled, outbound message params get `messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT'` instead of the default `RESPONSE` type, which lets support-driven messages bypass Meta's 24-hour standard messaging window.

## Product Behavior

- The official user guide's Facebook/Instagram setup topics (under "Other channels") describe connecting a Page/IG account through Meta's OAuth consent screen from the dashboard's "Add Inbox" flow — this maps to `Instagram::CallbacksController`/`Api::V1::Accounts::Instagram::AuthorizationsController` for the direct Instagram Login path, and to the Facebook Page connect flow (not in the investigated paths) for the Page-linked path.
- The "Human Agent tag" guide topic (under "Advanced features", IG/Messenger) documents Meta's policy allowing a `HUMAN_AGENT` message tag to extend the standard 24-hour customer-service messaging window for human-agent replies — this is exactly the `merge_human_agent_tag` behavior in both send services, gated by the installation-level toggles above.
- Instagram story replies and story mentions (`story_reply_attributes` / `ig_story` attachment type in `Messages::Instagram::BaseMessageBuilder`) back the "reply to an Instagram story" interaction visible in the dashboard conversation view.

## Notes for AI Agents

- Do not assume a single "Instagram service" — always check whether code is on the `Channel::Instagram` (direct login, `graph.instagram.com`) or `Channel::FacebookPage`-linked (`Instagram::Messenger::*`, Koala, `graph.facebook.com`) path. The class names and namespaces (`Instagram::MessageText` vs `Instagram::Messenger::MessageText`) are the tell; mixing up which token/endpoint pair belongs to which path is a real footgun here.
- `Instagram::BaseMessageText`/`Instagram::BaseSendService` are true abstract base classes (`raise NotImplementedError`) — new Instagram connection modes must implement `ensure_contact`/`create_message` (inbound) or `send_message`/`merge_human_agent_tag` (outbound), not fork the base logic.
- Facebook error code 190 and Instagram error code 190 both mean "expired/invalid token" and trigger `channel.authorization_error!` — but the *outer* Messenger channel error (`Facebook::Messenger::FacebookError`, matched by message substring `"session has been invalidated"` / `"Error validating access token"`) is a separate, string-matched code path in `Facebook::SendOnFacebookService#handle_facebook_error`. Don't assume a numeric-code check will catch it.
- Error codes 9010 and 100 on Instagram profile fetch are deliberately swallowed and turned into a synthetic "Unknown (IG: ...)" contact rather than failing — this is a known, commented workaround for Meta's own review-bot traffic and privacy-restricted profiles, not a bug.
- `Instagram::TestEventService` hardcodes sender id `'12334'` / recipient id `'23245'` to detect Meta's App Dashboard test webhook, and always attaches it to `Channel::Instagram.last` — this is intentionally coarse (there's no per-account test channel) and will misfire if multiple engineers test simultaneously in the same environment.
- `Instagram::RefreshOauthTokenService#access_token` returns `nil` (not the stale token) when the token is already expired (`token_valid?` false) — callers relying on `Channel::Instagram#access_token` should handle a blank token, not assume it always returns something.
- Both `Channel::FacebookPage#subscribe`/`unsubscribe` and `Channel::Instagram#subscribe`/`unsubscribe` swallow `StandardError` and just log at debug level — a failed Meta subscription call will not surface as an error to the user creating the inbox.
- `ig_scope_id`/IG-scoped user ids are per-app and are what's stored as `contact_inboxes.source_id`, not the user's real Instagram user id — don't conflate the two when correlating contacts across inboxes or apps.

## Related

- [[whatsapp]] — sibling Meta-family channel with its own embedded-signup/manual-signup duality, similar coexistence-flag concerns.
- [[other-channels]] — remaining social/messaging channels (Telegram, Line, TikTok, Twitter, SMS, Twilio Voice).
- [[messages-services]] — `Messages::StatusUpdateService`, message builders shared across channels.
- [[contacts-services]] — contact/contact_inbox creation shared with other channels.
- [[jobs]] — `Webhooks::*EventsJob`, `Conversations::UpdateMessageStatusJob`, `Avatar::AvatarFromUrlJob`.
- [[models]] — `Channel::FacebookPage`, `Channel::Instagram`, `Reauthorizable` concern.
- [[integrations]] — broader third-party integration surface this module sits alongside.
