---
title: "Webhook Routing Across Channels"
tags: [chatwoot, backend, webhooks, channels, whatsapp, security]
generated: 2026-08-17
deepwiki_section: "Multi-Channel Communication (webhook routing)"
---

# Webhook Routing Across Channels

## Purpose

`app/controllers/webhooks/` is the front door for every inbound message-provider callback that isn't handled by a dedicated gem mount point. Each controller here is a thin, unauthenticated (`ActionController::API`) HTTP endpoint whose entire job is: verify the request came from the real provider (when the provider supports that), then hand the raw payload off to a background job as fast as possible. None of these controllers touch application state directly — they enqueue a `Webhooks::*EventsJob` and return `200 OK` (or `head :ok`) immediately, keeping Meta/Twilio/Telegram/etc. from retrying or timing out the webhook.

This directory does **not** cover every channel's inbound path — Facebook Messenger and Twilio SMS/WhatsApp use different entry points (see "How It Fits Together" below). It specifically covers WhatsApp Cloud, Instagram, Line, SMS (generic/Bandwidth-style), Telegram, TikTok, and Shopify (data-subject-request compliance, not a message channel).

## Key Files & Classes

- `app/controllers/webhooks/whatsapp_controller.rb` — `Webhooks::WhatsappController#process_payload`. Verifies Meta's `X-Hub-Signature-256` HMAC (conditionally — see Notes), checks an `INACTIVE_WHATSAPP_NUMBERS` global-config denylist, then enqueues `Webhooks::WhatsappEventsJob`. Resolves the channel via `Whatsapp::WebhookChannelFinderService` (handles Meta's country-specific `display_phone_number` quirks) to decide *whether* signature verification is even required.
- `app/controllers/webhooks/instagram_controller.rb` — `Webhooks::InstagramController#events`. Verifies Meta signature, detects "echo" events (agent's own outbound message reflected back) and delays their job by 2s to dodge a race with the send-message API, then enqueues `Webhooks::InstagramEventsJob`. Supports two verify-token config keys (`IG_VERIFY_TOKEN` for Instagram-via-Facebook-Page, `INSTAGRAM_VERIFY_TOKEN` for direct Instagram login).
- `app/controllers/webhooks/line_controller.rb`, `telegram_controller.rb`, `sms_controller.rb` — minimal one-method controllers with **no signature verification in the controller itself**; they just forward params (plus, for Line, the raw body and `x-line-signature` header) to their respective `Webhooks::*EventsJob` for the job to validate.
- `app/controllers/webhooks/tiktok_controller.rb` — `Webhooks::TiktokController#events`. Verifies TikTok's own HMAC scheme (`Tiktok-Signature` header, format `t=<timestamp>,s=<sig>`) with a 5-second replay-window check, computed independently of `MetaTokenVerifyConcern` since TikTok isn't a Meta product.
- `app/controllers/webhooks/shopify_controller.rb` — `Webhooks::ShopifyController#events`. Verifies Shopify's HMAC and only handles the `shop/redact` GDPR topic, destroying matching `Integrations::Hook` rows. Not a messaging channel — this is compliance plumbing for the Shopify integration.
- `app/controllers/concerns/meta_token_verify_concern.rb` — shared `MetaTokenVerifyConcern` used by the WhatsApp and Instagram controllers. Provides the `verify` GET-challenge action (for Meta's webhook subscription handshake), `verify_meta_signature!` before_action, and `channel_meta_app_secrets`/`provider_config_meta_app_secrets` helpers that pull per-channel app secrets out of `provider_config` (keys: `app_secret`, `app_secret_key`, `client_secret`, `api_secret`) so each controller can check a payload's signature against the *specific* channel's secret, not just one global one.
- `app/services/whatsapp/webhook_channel_finder_service.rb` — `Whatsapp::WebhookChannelFinderService`, resolves which `Channel::Whatsapp` a `whatsapp_business_account` payload belongs to by matching `display_phone_number` (raw and country-normalized) against `phone_number_id`.
- `app/jobs/webhooks/*_events_job.rb` — the actual downstream processors (`WhatsappEventsJob`, `InstagramEventsJob`, `LineEventsJob`, `SmsEventsJob`, `TelegramEventsJob`, `TiktokEventsJob`, `FacebookEventsJob`, `FacebookDeliveryJob`, `TwilioEventsJob`, `TwilioDeliveryStatusJob`) — out of scope for this page but the natural next read (covered in [[jobs]]).

## How It Fits Together

Routes are declared in `config/routes.rb` (around line 647 onward, under "Routes for channel integrations"):

```
mount Facebook::Messenger::Server, at: 'bot'
get  'webhooks/twitter',            to: 'api/v1/webhooks#twitter_crc'
post 'webhooks/twitter',            to: 'api/v1/webhooks#twitter_events'
post 'webhooks/line/:line_channel_id',    to: 'webhooks/line#process_payload'
post 'webhooks/telegram/:bot_token',      to: 'webhooks/telegram#process_payload'
post 'webhooks/sms/:phone_number',        to: 'webhooks/sms#process_payload'
get  'webhooks/whatsapp/:phone_number',   to: 'webhooks/whatsapp#verify'
post 'webhooks/whatsapp/:phone_number',   to: 'webhooks/whatsapp#process_payload'
get  'webhooks/instagram',                to: 'webhooks/instagram#verify'
post 'webhooks/instagram',                to: 'webhooks/instagram#events'
post 'webhooks/tiktok',                   to: 'webhooks/tiktok#events'
post 'webhooks/shopify',                  to: 'webhooks/shopify#events'
namespace :twilio do
  resources :callback,        only: [:create]
  resources :delivery_status, only: [:create]
end
```

Notably, three channels' inbound webhooks live **outside** `app/controllers/webhooks/` entirely, which is why a directory-scoped read alone misses them:
- **Facebook Messenger** is not a Rails controller at all — it's the `facebook-messenger` gem's own Sinatra-style server, `Facebook::Messenger::Server`, mounted at `/bot`. Its callbacks are wired in `config/initializers/facebook_messenger.rb`, which registers a `ChatwootFbProvider` (implements `valid_verify_token?`, `app_secret_for`, `access_token_for` per page) and hooks `Facebook::Messenger::Bot.on :message / :delivery / :read / :message_echo` to enqueue `Webhooks::FacebookEventsJob` / `FacebookDeliveryJob`. See [[facebook-instagram]].
- **Twitter/X** goes through `Api::V1::WebhooksController#twitter_crc` / `#twitter_events` (in `app/controllers/api/v1/webhooks_controller.rb`, not `app/controllers/webhooks/`), which uses the `Twitty` gem for CRC handshake and delegates event consumption to `Webhooks::Twitter`. Covered under [[other-channels]].
- **Twilio** (SMS and WhatsApp-via-Twilio) posts to `Twilio::CallbackController#create` and `Twilio::DeliveryStatusController` (`app/controllers/twilio/`), which enqueue `Webhooks::TwilioEventsJob` / `TwilioDeliveryStatusJob`. This is a separate controller namespace from the generic `webhooks/sms` endpoint used for other SMS providers.

Everything in this directory converges on the same enqueue-and-return-200 pattern documented for the whole event pipeline in [[jobs]] and [[events-listeners]]. The channels these webhooks feed are documented per-channel in [[whatsapp]] and [[other-channels]] (for Line, Telegram, TikTok, SMS). `Integrations::Hook` (touched by the Shopify redact handler) belongs to [[integrations]].

## Product Behavior

This is the server-side landing zone for every "Other channels" setup guide (WhatsApp embedded signup/manual/Twilio, SMS, Telegram, Line, TikTok) — once an admin finishes the provider-side webhook configuration described in those guides, this is where the traffic actually arrives. Two specifics worth calling out for support/product grounding:

- The `verify` action (WhatsApp and Instagram) implements the GET challenge-response handshake Meta requires when an admin (re-)points a webhook subscription at Chatwoot — a wrong or missing `hub.verify_token` here is the "mismatch badge" scenario covered in the WhatsApp webhook-registration reference material.
- `inactive_whatsapp_number?` in `WhatsappController` checks a comma-separated `INACTIVE_WHATSAPP_NUMBERS` global-config value and rejects matching numbers with `422 Inactive WhatsApp number` before even reaching the job queue — an operator-level kill switch for a specific WABA number, independent of the channel's own active/inactive DB state.

## Notes for AI Agents

- **Signature verification is conditional for WhatsApp, not unconditional.** `WhatsappController#meta_signature_verification_required?` returns `true` unconditionally only when the channel can't be resolved at all; for a resolved `whatsapp_cloud` channel it's required only if the channel has its own app secret configured (`channel_meta_app_secrets` non-blank) **or** `provider_config['source'] == 'embedded_signup'`. A manually-configured (BYO-app) WhatsApp Cloud channel with no per-channel secret set can skip signature verification entirely — don't assume every WhatsApp webhook is HMAC-checked.
- **Every provider has its own signature scheme** — Meta uses `X-Hub-Signature-256` (`sha256=` prefix, checked in `MetaTokenVerifyConcern`), TikTok uses a custom `Tiktok-Signature: t=<ts>,s=<sig>` header with a 5-second freshness window, Shopify uses `X-Shopify-Hmac-SHA256`. Line, Telegram, and SMS controllers do **no** verification at the controller layer at all — if signature checking exists for those, it happens inside the corresponding `*EventsJob`, not here. Don't assume parity across controllers.
- **`Webhooks::WhatsappEventsJob` is where the real per-message concurrency logic lives**, not the controller — it's a `MutexApplicationJob` that takes a Redis lock keyed by `(inbox_id, sender_id)` for 30 seconds specifically to serialize concurrent webhooks for multi-image album uploads (first webhook creates the conversation, rest append). The controller has already returned `200 OK` well before this lock resolves.
- **`Whatsapp::WebhookChannelFinderService`** exists because Meta's `display_phone_number` in the payload metadata doesn't always match what's stored on the channel byte-for-byte (Brazil drops the mobile "9", Argentina inserts a digit after the country code) — it tries the raw digits, then a country-specific normalizer (`Whatsapp::PhoneNumberNormalizationService::NORMALIZERS`), and only accepts a candidate whose `phone_number_id` also matches. Per existing project memory, that normalizer list is known to be incomplete (confirmed gap: Mexico's own leading "1" quirk isn't covered), so an unrecognized country format silently fails channel resolution and the webhook is dropped with only a WARN log (`"Inactive WhatsApp channel: unknown"` in the job, not this controller).
- **`meta_app_secrets` must be overridden per-controller** — the concern raises `'Overwrite this method in your controller'` if not implemented, and both `WhatsappController` and `InstagramController` do so, each combining channel-specific secrets (via `channel_meta_app_secrets`) with a global fallback (`WHATSAPP_APP_SECRET` / `INSTAGRAM_APP_SECRET` / `FB_APP_SECRET`).
- All controllers in this directory inherit `ActionController::API`, not `ApplicationController` — no session, no CSRF, no `authenticate_user!` concerns to worry about; auth is entirely provider-signature-based (or absent).

## Related

- [[whatsapp]] — full WhatsApp channel documentation (inbound/outbound, templates, embedded signup)
- [[facebook-instagram]] — Facebook Messenger `facebook-messenger` gem mount and Instagram channel details
- [[other-channels]] — SMS, Telegram, Line, TikTok, Twitter, Twilio Voice channel docs
- [[jobs]] — background job/Sidekiq architecture, including the `Webhooks::*EventsJob` classes this directory enqueues
- [[events-listeners]] — event dispatcher pattern these jobs feed into once a message is processed
- [[integrations]] — `Integrations::Hook` and third-party integration webhook handling (Shopify, Slack, Linear)
- [[api-v1-controllers]] — sibling `Api::V1::WebhooksController` (Twitter) and account-level webhook CRUD (`Api::V1::Accounts::WebhooksController`)
