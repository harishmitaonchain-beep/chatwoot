---
title: "Glossary"
tags: [chatwoot, meta]
generated: 2026-08-17
---

# Glossary

Chatwoot-specific terms that recur across this vault without being defined in any one place. Generic Rails/Vue/Postgres vocabulary is skipped — this is only for terms that would confuse a newcomer to *this* codebase specifically.

## account_id scoping
The convention that enforces multi-tenancy: almost every table carries a bare `account_id` column with an index, but the schema has essentially no DB-level foreign keys (only 4 exist in ~100 tables). Isolation between tenants is a Rails-layer convention, not something Postgres enforces — a missing `account_id` scope in a controller or service is a cross-tenant data leak. See [[01-architecture/data-model|Database Schema & Data Model Overview]].

## account_user
The join model between `User` and `Account` (`app/models/account_user.rb`). Per-tenant `role` (agent/administrator), `availability`, `agent_capacity_policy_id`, and `custom_role_id` (Enterprise) all live here, not on `User` — the same `User` row can be an administrator on one account and a plain agent on another. It's also the record every Pundit policy pivots its `(user, account, account_user)` check on. See [[02-backend/models|Data Models]] and [[02-backend/authorization-policies|Authorization (Pundit Policies)]].

## ActionCable listener
`ActionCableListener`, the largest of the sync dispatcher's listeners — translates roughly 20 domain events into realtime websocket pushes (via `ActionCableBroadcastJob`) to per-user/per-contact pubsub tokens, powering dashboard and widget live updates. It runs synchronously (in-process, not through Sidekiq) alongside `AgentBotListener`, because realtime UI updates need low latency. See [[02-backend/events-listeners|Event Dispatcher & Listeners]].

## BSUID
Business System User ID — Meta's identifier for a WhatsApp **coexistence** contact (one who messages through the linked WhatsApp Business app, not a phone number). Routing a BSUID through the wrong outbound field (`to` instead of `recipient`) returns HTTP 200 but Meta silently drops the message — `Providers::BaseService#recipient_params` exists specifically to route correctly. A BSUID/phone-number mismatch is also the root cause of the coexistence duplicate-contact bug, where one contact ends up split across two `contact_inboxes`. See [[03-channels/whatsapp|WhatsApp Channel]].

## Channelable
The concern every `Channel::*` model includes (`app/models/concerns/channelable.rb`). Declares `belongs_to :account` and `has_one :inbox, as: :channel`, and gives Enterprise an empty `create_audit_log_entry` hook to fill in. Not to be confused with the `channel_type`/`channel_id` polymorphic pair on `Inbox` itself. See [[02-backend/models|Data Models]].

## channel vs inbox
The backend implementation of a product concept: a **channel** (`Channel::Whatsapp`, `Channel::Email`, etc., one table per channel type, e.g. `channel_whatsapp`) is the external connection and its credentials; an **inbox** (`Inbox`, one table, `channel_type`/`channel_id` pointing polymorphically at the channel row) wraps it with Chatwoot-side config — assignment, working hours, auto-responder, CSAT — that's identical across channel types. Not Rails STI: each channel type is a separate table, not a `type` column on one table. See [[02-backend/models|Data Models]] and [[01-architecture/data-model|Database Schema & Data Model Overview]].

## coexistence
The WhatsApp mode where a business responds to customers from both Chatwoot and the native WhatsApp Business app simultaneously. Shows up in code as BSUID handling (`recipient_params`, the echo path in `IncomingMessageIdentifierHelper`, multi-source-id contacts in `IdentifierSyncService`), and as an `is_coexistence` flag threaded through `EmbeddedSignupService`/`WebhookSetupService` that skips phone registration and defers the post-signup health check. See [[03-channels/whatsapp|WhatsApp Channel]].

## contact_inbox / ContactInbox vs Contact
`Contact` is a person's identity **global to the account** (one row per person, unique on email/identifier/phone_number per account). `ContactInbox` is the join between a `Contact` and an `Inbox` that gives that contact a **channel-specific identity for that one inbox** — its `source_id` column holds the WhatsApp `wa_id`, an email address, a Facebook PSID, etc., unique per `inbox_id`. A contact can have many `contact_inboxes` (one per channel they've reached out on). This is the table implicated in the WhatsApp coexistence duplicate-conversation bug, where a BSUID/phone mismatch splits one contact into two `contact_inboxes` on the same inbox, breaking `lock_to_single_conversation` and reopen behavior. See [[02-backend/models|Data Models]] and [[01-architecture/data-model|Database Schema & Data Model Overview]].

## display_id
The small, per-account-sequential, human-facing conversation/campaign number (as opposed to the global auto-increment `id`). It is **not set by Ruby** — a Postgres `AFTER INSERT ON accounts` trigger creates per-account sequences (`conv_dpid_seq_<account_id>`, `camp_dpid_seq_<account_id>`), and a `BEFORE INSERT` trigger on `conversations`/`campaigns` populates `display_id` from `nextval()` of the matching sequence. Application code re-fetches via `self.class.find(id)` after create rather than `reload`, specifically to preserve `previous_changes` for the event dispatcher. See [[02-backend/models|Data Models]] and [[01-architecture/data-model|Database Schema & Data Model Overview]].

## dispatcher (singleton)
`Rails.configuration.dispatcher` — the single `Dispatcher` instance (`app/dispatchers/dispatcher.rb`) that every domain-event producer calls via `Dispatcher.dispatch(event_name, timestamp, data, async)`. It always fans the event to both a `SyncDispatcher` (in-process, immediate — `ActionCableListener`, `AgentBotListener`) and an `AsyncDispatcher` (enqueues `EventDispatcherJob` on Sidekiq's `:critical` queue — everything else: webhooks, automation rules, notifications, reporting). Built on the `wisper` gem, not ActiveSupport::Notifications. See [[02-backend/events-listeners|Event Dispatcher & Listeners]].

## episode / episode_key
The unit of state that Chatwoot's delayed **automation rules** wait on. When a rule has an `execution_delay`, an `AutomationRulePendingExecution` row is armed with an `episode_key` identifying one qualifying stretch of conversation state (e.g. "conversation has been pending since timestamp X"); if the conversation's status changes or a new reply arrives, that key changes and the stale wait is invalidated rather than firing on outdated state. Arm-time and fire-time key computation differ (`arm_episode_key_for` vs `episode_key_for`) because `message_created` dispatches asynchronously and some state may not have settled yet. See [[02-backend/automation-rules|Automation Rules Engine]].

## Featurable / feature flags
The account-level feature-flag concern (`app/models/concerns/featurable.rb`), mixed into `Account` via `FlagShihTzu` (a bitset gem). Flags live in two bigint bitmask columns (`feature_flags`, `feature_flags_ext_1` — capped at 63 flags per column, driven by `config/features.yml`), not a features table. Enabling a feature for an account is a DB bit flip, checked in controllers/UI via `feature_enabled?`. See [[02-backend/models|Data Models]] and [[01-architecture/data-model|Database Schema & Data Model Overview]].

## HMAC identity validation
The mechanism that lets a website widget verify a visitor's claimed identity before trusting `set_user`/identify calls. When a `Channel::WebWidget` is `hmac_mandatory`, identifying or rebinding a contact requires a correct `identifier_hash` computed as `HMAC-SHA256(hmac_token, identifier)`, checked with `ActiveSupport::SecurityUtils.secure_compare` (a timing-safe comparison) in `Api::V1::Widget::ContactsController#valid_hmac?`. `ContactInbox#hmac_verified` persists the result. See [[02-backend/widget-backend|Widget Backend]] and [[01-architecture/data-model|Database Schema & Data Model Overview]].

## include_mod_with / prepend_mod_with
The two Enterprise Edition extension hooks called at the bottom of core OSS classes (e.g. `Account.prepend_mod_with('Account')`, `ActionService.include_mod_with('ActionService')`). They resolve to the matching `Enterprise::*` module under `enterprise/app/**` if the EE overlay is loaded, or no-op otherwise. `prepend_mod_with` puts the Enterprise module ahead of the OSS methods in the ancestor chain (so Enterprise code can call `super` to fall through to OSS behavior); this is the standard pattern for extending models, services, policies, listeners, and dispatchers without forking the OSS file. See [[05-enterprise/models-services|Enterprise Models & Services]] and [[02-backend/authorization-policies|Authorization (Pundit Policies)]].

## MutexApplicationJob
A Sidekiq job base class that wraps execution in a Redis lock (`Redis::LockManager`) so concurrent invocations for the same key serialize instead of racing. Used by `Webhooks::WhatsappEventsJob` (per `(inbox, contact)`, so multi-part WhatsApp album uploads append to one conversation instead of creating duplicates) and `HookJob` (per-hook, so LeadSquared CRM sync doesn't create duplicate leads from near-simultaneous events). Its unlock is not owner-checked — a job that outruns its lock TTL can have the lock stolen and deleted out from under the new holder, an accepted tradeoff, not a bug. See [[02-backend/jobs|Background Jobs (Sidekiq)]].

## Pundit policy
Chatwoot's authorization layer: one `*Policy` class per resource (`app/policies/`), exposing `action_name?` predicate methods that controllers call via `authorize`/`policy_scope`. Every check is a function of `(user, account, account_user)` — never the user alone — because role is per-account. Enterprise extends specific OSS policies via `prepend_mod_with` plus a `custom_role_permission_check || super` pattern. See [[02-backend/authorization-policies|Authorization (Pundit Policies)]].

## source_id
The `ContactInbox` column holding a contact's channel-specific identifier for one inbox — a WhatsApp `wa_id`, an email address, a Facebook PSID, a Twilio number, etc. Unique per `inbox_id` (not globally), which is what lets the same phone number exist as different `source_id`s across different WhatsApp inboxes. Format is validated per-channel via regex constants (`RegexHelper`) for Twilio and WhatsApp inboxes specifically. See [[02-backend/models|Data Models]] and [[01-architecture/data-model|Database Schema & Data Model Overview]].

## wa_id
Meta's WhatsApp identifier for a phone-number contact, as delivered in Cloud API webhook payloads. It doesn't always match the digit string a contact is already stored under in Chatwoot — country-specific quirks (e.g. Brazil's mobile "9" digit, Mexico's inserted "1" after the `52` country code) mean the raw `wa_id` needs normalization (`Whatsapp::PhoneNumberNormalizationService` + per-country `PhoneNormalizers`) before it reliably matches an existing `ContactInbox`. Not the same as a BSUID, which identifies a coexistence contact rather than a phone number. See [[03-channels/whatsapp|WhatsApp Channel]].

## WABA
WhatsApp Business Account — Meta's account object that owns one or more phone numbers and their message templates. Onboarded into Chatwoot either via embedded signup (OAuth) or manual API-key setup. Several WhatsApp behaviors are WABA-wide rather than per-inbox: `calls` field subscription must check sibling `Channel::Whatsapp` rows on the same `business_account_id` before being toggled, so one inbox's webhook setup doesn't silently disable voice calling for a sibling inbox on the same WABA. See [[03-channels/whatsapp|WhatsApp Channel]].

## Wisper listener
A subscriber object registered on the `Dispatcher` (built on the `wisper` gem) that reacts to domain events by defining a method matching the event's snake_case name (e.g. `conversation.created` → `def conversation_created`). All listeners are Ruby `Singleton`s and must be stateless. There's no per-event registration table — Wisper just calls the matching method if a subscribed listener defines one, silently doing nothing otherwise; grep listener classes for the method name to find every consumer of a given event. See [[02-backend/events-listeners|Event Dispatcher & Listeners]].
