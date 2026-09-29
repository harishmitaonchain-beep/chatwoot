---
title: "Real-time Layer (ActionCable)"
tags: [chatwoot, backend, actioncable, websocket, realtime, events]
generated: 2026-08-17
deepwiki_section: "API Layer (WebSockets)"
---

# Real-time Layer (ActionCable)

## Purpose

`app/channels` holds Chatwoot's entire server-side WebSocket surface — it's the transport that pushes new messages, conversation updates, presence, typing indicators, and notifications to the dashboard, the website widget, and the survey app without polling. The directory itself is tiny (three files); the real "layer" is small on disk because almost everything interesting — figuring out *who* to notify and *what* to send — lives one hop away, in `app/listeners/action_cable_listener.rb` and `app/jobs/action_cable_broadcast_job.rb`. This page documents the whole path from a domain event to a browser receiving a WebSocket frame.

## Key Files & Classes

- `app/channels/application_cable/connection.rb` — empty subclass of `ActionCable::Connection::Base`; Chatwoot does no connection-level auth here (no `identified_by`), so all identity/authorization happens per-subscription inside the channel.
- `app/channels/application_cable/channel.rb` — empty base class for all channels; only exists as a hook point.
- `app/channels/room_channel.rb` — the single channel in the app, `RoomChannel`. Handles `subscribed` and `update_presence`. Resolves the caller's identity from a `pubsub_token` param (looked up against `User` or `ContactInbox`), streams from that token's private pubsub stream, and (for logged-in users) also streams from `"account_#{account_id}"`. Also drives presence tracking via `OnlineStatusTracker` and broadcasts a `presence.update` event on subscribe/heartbeat.
- `config/cable.yml` — Redis-adapter config (`redis://...`, `channel_prefix: chatwoot_#{Rails.env}_action_cable`); `test` env uses the in-process `test` adapter. No custom `cable.rb` initializer — Rails' default `/cable` mount path is used.
- `app/listeners/action_cable_listener.rb` — **not in `app/channels` but the real brain of this subsystem**: a `BaseListener` subclass (`Wisper`-style pub/sub, see [[events-listeners]]) that reacts to ~20 domain events (`message_created`, `conversation_updated`, `notification_created`, `conversation_typing_on`, `contact_deleted`, `conversation_mentioned`, etc.) and computes the list of `pubsub_token`s that should receive each one (agents/admins on the inbox via `user_tokens`, the contact via `contact_inbox_tokens`, or an `account_#{id}` broadcast for contact CRUD events). Enqueues delivery via `ActionCableBroadcastJob`; extended by `enterprise/app/listeners/enterprise/action_cable_listener.rb` (adds `copilot_message_created`) through `prepend_mod_with`.
- `app/jobs/action_cable_broadcast_job.rb` — `ActionCableBroadcastJob`, queue `:critical`. Takes `(members, event_name, data)`; for a fixed set of conversation-related events (`CONVERSATION_READ`, `CONVERSATION_UPDATED`, `TEAM_CHANGED`, `ASSIGNEE_CHANGED`, `CONVERSATION_STATUS_CHANGED`) it re-fetches the conversation and rebuilds `push_event_data` fresh at delivery time (comment: "prevent... outdated data" during high-traffic bursts / out-of-order job execution) rather than trusting the payload captured at enqueue time. Then loops the token list and calls `ActionCable.server.broadcast(member, { event:, data: })` per token.
- `app/models/concerns/pubsubable.rb` — `Pubsubable` concern, included by `User` and `ContactInbox` (via `has_secure_token :pubsub_token`). Regenerates the token lazily if blank, and rotates a `User`'s token whenever their password changes (`rotate_pubsub_token`, triggered by `will_save_change_to_encrypted_password?`) — this invalidates old browser sessions' WebSocket subscription on password change.
- `lib/events/types.rb` — `Events::Types`, the shared string-constant registry (`MESSAGE_CREATED = 'message.created'`, etc.) used both by domain-event dispatch and directly as the wire-level `event` field the frontend switches on.
- `lib/online_status_tracker.rb` — Redis-backed presence tracker (`get_available_users`, `get_available_contacts`, `update_presence`) that `RoomChannel` calls into.
- Direct broadcasters outside the listener pattern: `enterprise/app/services/whatsapp/incoming_call_service.rb` and `enterprise/app/services/whatsapp/call_service.rb` call `ActionCable.server.broadcast` directly for `voice_call.incoming` / `voice_call.outbound_accepted` / `voice_call.outbound_connected` / `voice_call.ended` — these bypass the listener/job indirection entirely since call signaling needs to be immediate, not routed through the domain event bus.
- Frontend: `app/javascript/shared/helpers/BaseActionCableConnector.js` (uses `@rails/actioncable`'s `createConsumer`, subscribes to `RoomChannel` with `{ pubsub_token, account_id, user_id }`, runs a presence heartbeat via `update_presence`, and handles reconnect/disconnect) is subclassed by `app/javascript/dashboard/helper/actionCable.js` (dashboard — dispatches ~25 event types into Vuex/Pinia) and `app/javascript/widget/helpers/actionCable.js` (website widget, contact-side).

## How It Fits Together

The pipeline is: a model callback or service fires a domain event (e.g. `message_created`) through the pub/sub bus described in [[events-listeners]] → `ActionCableListener` (one of several listeners subscribed to the same event, alongside `WebhookListener`, `NotificationListener`, `AutomationRuleListener`, `AgentBotListener`, `CsatSurveyListener`, `ReportingEventListener`) computes recipient `pubsub_token`s and enqueues `ActionCableBroadcastJob` → the job calls `ActionCable.server.broadcast` per token over the Redis adapter → `RoomChannel` streams matching subscriptions to connected browsers.

The payloads broadcast are built by `push_event_data` methods on the domain models (`Message#push_event_data`, `Conversation#push_event_data`, `Contact#push_event_data`, `Notification#push_event_data`) — see [[models]] and [[presenters]] for where that serialization logic lives. [[messages-services]] and [[conversations-services]] are the typical origin points that trigger `message_created`/`conversation_updated` and friends. [[notifications]] covers `NOTIFICATION_CREATED`/`_UPDATED`/`_DELETED`, which this listener also relays. [[jobs]] covers the Sidekiq queue (`:critical`) that `ActionCableBroadcastJob` runs on. On the frontend, [[dashboard-store]] is what the dashboard's `ActionCableConnector` dispatches into, and [[widget-sdk]] / [[widget-backend]] is the contact-facing counterpart that authenticates via `ContactInbox#pubsub_token` instead of a `User` token.

## Product Behavior

This is the mechanism behind the "How to setup a WebSocket connection" guide topic and everything that feels "live" in Chatwoot: new messages appearing without refresh, the assignee/status changing on screen when a teammate acts, typing indicators, the green online/offline dot on agents and contacts, and unread-count badges. Contacts on the website widget and agents in the dashboard share the exact same `RoomChannel`/token mechanism — they're distinguished only by which kind of record (`User` vs `ContactInbox`) the `pubsub_token` param resolves to.

## Notes for AI Agents

- `ApplicationCable::Connection` does no auth — don't assume a rejected/authorized connection concept exists. All access control is inside `RoomChannel#current_user`/`#current_account`, which raises (`find_by!`) if the token doesn't resolve, and the guard clauses in `broadcast_presence`/`update_subscription`/`ensure_stream` are there because `current_account` can legitimately be blank for some contact tokens.
- A contact's real-time identity is the `ContactInbox`, not the `Contact` — a contact with multiple inboxes has multiple independent `pubsub_token`s, and `contact_inbox_tokens` in `ActionCableListener` fans a broadcast out to *all* HMAC-verified inboxes for that contact when `hmac_verified?` is true, or just the one inbox otherwise.
- `ActionCableBroadcastJob`'s re-fetch-at-delivery-time behavior only applies to the 5 conversation events in `CONVERSATION_UPDATE_EVENTS`; other events (e.g. `message.created`) broadcast exactly the payload captured when the listener ran, with no re-fetch — don't assume all events get "freshest data" treatment.
- `RoomChannel` streams two channels for a logged-in user: their own `pubsub_token` stream and `"account_#{account_id}"`. Only `contact_created`/`contact_updated`/`contact_merged`/`contact_deleted` broadcast to the account-wide stream (via `account_token`); everything else targets specific user/contact tokens. If you add a new event that should reach "every agent in the account" regardless of inbox membership, the `account_#{id}` stream is the existing pattern to reuse, not iterating every agent's token.
- Password change silently invalidates a user's existing WebSocket identity (`pubsub_token` rotates) — any support case of "my browser stopped getting live updates after I reset my password" is expected behavior, not a bug, until the page is reloaded and a fresh consumer subscribes.
- Not every real-time event goes through this listener/job path — the WhatsApp voice-calling code (`enterprise/app/services/whatsapp/*_service.rb`) calls `ActionCable.server.broadcast` directly for call signaling events (`voice_call.*`), skipping the domain-event/listener indirection for latency reasons. Don't assume `grep`ing `ActionCableListener` finds every broadcast in the codebase.
- The frontend event-name strings (`'message.created'`, `'conversation.typing_on'`, etc.) must match `Events::Types` constants exactly; there's no shared codegen between Ruby and JS for this — they're duplicated by hand in `app/javascript/dashboard/helper/actionCable.js`'s `this.events` map.

## Related

- [[events-listeners]] — the domain event bus that `ActionCableListener` subscribes to; also where `WebhookListener`, `NotificationListener`, `AutomationRuleListener` and other listeners react to the same events.
- [[jobs]] — Sidekiq/`ApplicationJob` conventions; `ActionCableBroadcastJob` runs on the `:critical` queue.
- [[messages-services]] — typical origin of `message_created`/`message_updated` events.
- [[conversations-services]] — typical origin of `conversation_created`/`_updated`/`_status_changed`/typing events.
- [[notifications]] — `notification_created`/`_updated`/`_deleted`, relayed by this same listener.
- [[presenters]] — where `push_event_data` serialization for broadcast payloads lives.
- [[models]] — `User`, `ContactInbox`, `Pubsubable` concern.
- [[dashboard-store]] — Vuex/Pinia mutations driven by the dashboard's `ActionCableConnector`.
- [[widget-sdk]] / [[widget-backend]] — contact-side real-time connection over the same `RoomChannel`.
- [[whatsapp]] — WhatsApp voice calling broadcasts `voice_call.*` events directly via `ActionCable.server.broadcast`, bypassing the listener pattern.
