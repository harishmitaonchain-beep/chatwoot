---
title: "System Architecture Overview"
tags: [chatwoot, architecture, overview]
generated: 2026-08-17
deepwiki_section: "System Architecture Overview"
---

# System Architecture Overview

## The 30-second version

Chatwoot is a Ruby on Rails monolith serving several Vue 3 single-page apps, with Sidekiq for background work, PostgreSQL as the only database, Redis for everything ephemeral (Sidekiq queues, ActionCable pub/sub, presence, distributed locks, reauthorization counters), and ActionCable over WebSockets for realtime. There are no microservices. One `config/routes.rb` maps every URL — the agent dashboard, four distinct API surfaces, unauthenticated channel webhooks, the Help Center portal, Super Admin, and Sidekiq Web — into the same process ([[routing-config]]).

The product shape drives the code shape: customers write in on some channel (WhatsApp, email, web chat, Facebook, …), each channel funnels into a common `Conversation`/`Message` model, agents reply from a shared dashboard, and replies fan back out to the originating provider. Almost everything interesting happens in one of two pipelines — the inbound message pipeline and the outbound reply pipeline — both of which converge on a `Message` row being created and a domain event being dispatched.

## The pieces

**Multi-tenancy.** `Account` is the tenant root, and tenancy is convention, not infrastructure: nearly every table carries an indexed `account_id`, but there is no row-level security and almost no DB foreign keys (4 in ~100 tables) — isolation is enforced entirely by Rails-layer scoping (`Current.account.conversations`, Pundit policies). A `User` is global; per-account role, availability, and custom role live on the `AccountUser` join model, which is why the same person can be an administrator on one account and an agent on another ([[data-model]], [[models]], [[authorization-policies]], [[glossary]]).

**Inbox/channel polymorphism.** The "channel vs inbox" product concept is implemented as delegated polymorphism, not STI: `Inbox` holds a `channel_type`/`channel_id` pair pointing at one row in a per-channel table (`Channel::Whatsapp` → `channel_whatsapp`, `Channel::Email` → `channel_email`, `Channel::WebWidget`, `Channel::Api`, and nine more). The channel row owns provider credentials and provider-specific config; the inbox wraps it with cross-channel settings — auto-assignment, working hours, CSAT, `lock_to_single_conversation`. Every channel model includes the `Channelable` concern (`has_one :inbox, as: :channel`). See [[models]] and the per-channel pages ([[whatsapp]], [[email]]).

**The conversation triad.** `Conversation` (status/priority/assignee, per-account `display_id` set by a Postgres trigger) is the hub; `Message` (incoming/outgoing/activity/template) hangs off it; `Contact` is a person's account-global identity, while `ContactInbox` gives that contact a channel-specific `source_id` (wa_id, email address, PSID) per inbox. When channel identity resolution goes wrong, `ContactInbox` is where it goes wrong ([[data-model]], [[glossary]]).

**The event bus.** Models and services fire named domain events (`message.created`, `conversation.resolved`, `assignee.changed`, …) through a single Wisper-based `Dispatcher` singleton (`Rails.configuration.dispatcher`). Every dispatch fans out twice: the `SyncDispatcher` runs `ActionCableListener` and `AgentBotListener` in-process for low latency, and the `AsyncDispatcher` enqueues `EventDispatcherJob` (Sidekiq `:critical` queue), which later publishes to everything else — `WebhookListener`, `AutomationRuleListener`, `NotificationListener`, `ReportingEventListener`, `CsatSurveyListener`, `HookListener`, `CampaignListener`, and friends. This bus is the decoupling point between "a record changed" and every downstream reaction ([[events-listeners]]).

**Sidekiq.** All deferred work runs as ActiveJob jobs on prioritized queues (`critical` → `high` → `medium` → `low` → housekeeping), with `sidekiq-cron` driving scheduled entry points like `TriggerScheduledItemsJob` every 5 minutes ([[jobs]], [[routing-config]]).

## The life of an inbound message

Take WhatsApp Cloud as the representative channel (other channels differ in the first two hops, then converge).

1. **Provider webhook → thin controller.** Meta POSTs to `webhooks/whatsapp/:phone_number`, landing on `Webhooks::WhatsappController#process_payload` — an unauthenticated `ActionController::API` endpoint whose only jobs are verifying the provider signature (Meta's `X-Hub-Signature-256`, via `MetaTokenVerifyConcern`) and returning `200 OK` fast so the provider doesn't retry. Channel resolution quirks (Meta's country-mangled `display_phone_number`) are handled by `Whatsapp::WebhookChannelFinderService`. Every channel has an equivalent front door, though not all live in `app/controllers/webhooks/` — Facebook Messenger is the `facebook-messenger` gem's server mounted at `/bot`, Twilio has its own `Twilio::CallbackController` namespace ([[webhook-routing]]).
2. **Controller → job.** The controller enqueues `Webhooks::WhatsappEventsJob` (queue `low`) with the raw payload and returns. This job is a `MutexApplicationJob`: it takes a 30s Redis lock per `(inbox, contact)` so concurrent webhooks (multi-image albums) serialize into one conversation instead of racing to create duplicates ([[jobs]]).
3. **Job → incoming message service.** The job resolves the `Channel::Whatsapp` row, filters out inactive/reauth-required channels and coexistence SMB echoes, then hands the payload to the channel-specific `Incoming*Service` (e.g. `Whatsapp::IncomingMessageService` variants — see [[whatsapp]]), which finds-or-creates the `Contact`/`ContactInbox`/`Conversation` and builds the `Message` ([[messages-services]], [[conversations-services]]).
4. **Message create → event dispatch.** `Message`'s `after_create_commit` chain updates conversation bookkeeping (`waiting_since`, reopen-on-reply) and dispatches `MESSAGE_CREATED` through the `Dispatcher` ([[models]], [[events-listeners]]).
5. **Listeners fan out.** Synchronously, `ActionCableListener` computes recipient `pubsub_token`s and enqueues `ActionCableBroadcastJob`, which calls `ActionCable.server.broadcast` per token over the Redis adapter — the agent's dashboard and the contact's widget see the message without polling ([[realtime-actioncable]]). Asynchronously (via `EventDispatcherJob`), `AutomationRuleListener` evaluates matching automation rules ([[automation-rules]]), `WebhookListener` delivers account/inbox outgoing webhooks via `WebhookJob`, `NotificationListener` builds agent `Notification` records and push/email deliveries ([[notifications]]), and `ReportingEventListener` writes the `ReportingEvent` rows that reports are computed from ([[reports]]). Auto-assignment may pick an agent along the way ([[assignment]]).

The pattern to internalize: **webhook controllers never touch application state** — they verify, enqueue, and return. All real processing, locking, and identity resolution happens in jobs and services, and everything downstream of `Message.create` is driven by the event bus, not by explicit calls.

## The life of an outbound reply

1. **Agent reply → API controller.** The dashboard POSTs the reply to `Api::V1::Accounts::Conversations::MessagesController#create` — part of the agent-facing Application API under `Api::V1::Accounts::*`, where `Api::V1::Accounts::BaseController` has already resolved `Current.account`/`Current.user`/`Current.account_user` and Pundit has authorized the action ([[api-v1-controllers]], [[authorization-policies]]).
2. **Controller → builder → Message create.** The controller is deliberately thin: it delegates to `Messages::MessageBuilder`, which creates an outgoing `Message` on the conversation ([[messages-services]]).
3. **Message create → SendReplyJob.** The same `after_create_commit` chain that handles inbound messages enqueues `SendReplyJob` (queue `high`) for outgoing ones — and dispatches `MESSAGE_CREATED`, so the ActionCable/webhook/reporting fan-out from the inbound flow happens here too (that's how the reply appears instantly in the widget and in other agents' dashboards).
4. **SendReplyJob → channel send service → provider API.** `SendReplyJob` maps `message.conversation.inbox.channel.class` through its `CHANNEL_SERVICES` hash to the per-channel `SendOn*Service` (WhatsApp, Telegram, Line, Twilio SMS, Instagram, TikTok, Email, …), which calls the provider's API — for WhatsApp, through the provider abstraction (`Whatsapp::Providers::WhatsappCloudService` vs 360dialog) on `Channel::Whatsapp` ([[jobs]], [[whatsapp]], [[email]]). Delivery status flows back later as another provider webhook, re-entering the inbound pipeline.

## Frontend surfaces

Five distinct frontends share the one backend, all under `app/javascript/` and mounted from `app/javascript/entrypoints/`:

- **Dashboard** — the agent SPA (`app/javascript/dashboard`), a Vue 3 app mid-migration from Vuex (`store/`) to Pinia (`stores/`) with a shared `storeFactory.js` bridging both. It talks REST to the Application API through `dashboard/api/*` client classes and receives realtime pushes via an `ActionCableConnector` that dispatches ~25 event types into the stores ([[dashboard-store]], [[api-v1-controllers]]). Newer message-bubble UI lives in `components-next/` ([[components-next]]).
- **Widget + SDK** — the contact-facing live chat: a tiny embed script (`window.chatwootSDK.run`) that injects an iframe, and a full Vue app inside the iframe, bridged only by `postMessage`. It authenticates against the separate `/api/v1/widget/*` API using contact tokens (no agent auth) and subscribes to the same `RoomChannel` using the `ContactInbox`'s `pubsub_token` ([[widget-sdk]]).
- **Portal** — the public Help Center, served by the `hc/:slug/...` routes ([[routing-config]]).
- **Survey** — the standalone CSAT survey page, another small Vue app on the same ActionCable infrastructure ([[realtime-actioncable]]).
- **Super Admin** — the installation operator's panel under `namespace :super_admin`, notably the only surface using cookie sessions (agent/API auth is devise_token_auth header tokens everywhere else); it also mounts Sidekiq Web ([[routing-config]]).

Realtime is uniform across surfaces: a single `RoomChannel`, identity resolved from a `pubsub_token` parameter that maps to either a `User` (agent) or a `ContactInbox` (contact) — the dashboard and the widget are distinguished by nothing more than which record the token resolves to ([[realtime-actioncable]]).

## The enterprise overlay & Cloud plans

Chatwoot ships an Enterprise overlay under `enterprise/` that `config/application.rb` adds to the eager-load paths when present. The mechanism is `prepend_mod_with`/`include_mod_with` (defined in `config/initializers/01_inject_enterprise_edition_module.rb`): OSS classes end with a call like `Account.prepend_mod_with('Account')`, which resolves the same-named `Enterprise::*` module and prepends it — so Enterprise code sits ahead of OSS methods and can wrap them with `super`, or no-ops silently when the overlay is absent. Enterprise-exclusive controllers/models (SLA policies, custom roles, Captain AI, calls) have no OSS stub at all; their routes are gated inline in `routes.rb` with `if ChatwootApp.enterprise?` ([[routing-config]], [[models-services]], [[controllers-jobs-listeners]]). Note that `ChatwootApp.enterprise?` is a directory check, not a license check — on Chatwoot Cloud, what a paying account actually gets is decided by per-account feature-flag bits (`Featurable`, `config/features.yml`) that `Enterprise::Billing::ReconcilePlanFeaturesService` flips in response to Stripe subscription events; services then guard behavior with `feature_enabled?` checks ([[models-services]], [[plan-tiers-billing]]).

## Where to go deeper

- Working conventions for AI agents in this repo → [[ai-agent-guide]]; recurring terms → [[glossary]]
- Schema ground truth (tenancy, triggers, missing FKs) → [[data-model]]; the model layer on top → [[models]]
- URL map, feature flags, initializers, cron schedule → [[routing-config]]
- Event bus and every listener → [[events-listeners]]; the Sidekiq jobs they enqueue → [[jobs]]
- WebSocket path end to end → [[realtime-actioncable]]
- Agent-facing API → [[api-v1-controllers]]; who may do what → [[authorization-policies]]
- Inbound webhook front doors per channel → [[webhook-routing]]; deep dives → [[whatsapp]], [[email]]
- Message/conversation service objects → [[messages-services]], [[conversations-services]]
- Downstream reactions → [[automation-rules]], [[assignment]], [[notifications]], [[reports]]
- Frontend state → [[dashboard-store]]; contact side → [[widget-sdk]]; new UI → [[components-next]]
- Enterprise overlay → [[models-services]], [[controllers-jobs-listeners]]; Cloud billing/plan gating → [[plan-tiers-billing]]
