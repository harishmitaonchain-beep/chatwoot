---
title: "Conversation Services & Actions"
tags: [chatwoot, backend, conversations, services, unread-counts, permissions]
generated: 2026-08-17
deepwiki_section: "Core Data Models (conversations/messages)"
---

# Conversation Services & Actions

## Purpose
Service objects that implement conversation-level business logic that doesn't belong on the `Conversation` model or in a controller: assignment (to an agent or agent bot), filtering/search (both the ACL layer and the query-builder layer), 24-hour/7-day messaging-window eligibility checks, soft-deletion, typing-indicator broadcast, and a fairly elaborate Redis-backed unread-conversation-count cache. `app/actions` is a second, much smaller and unrelated directory in scope for this page — it currently holds only contact-identity/merge actions (no conversation-specific actions exist there today); it's documented here because the task scope named it, but it's really part of the contact-identity flow, not the conversation domain.

## Key Files & Classes

**`app/services/conversations/`**
- `assignment_service.rb` — `Conversations::AssignmentService`: assigns a conversation to a `User` or an `AgentBot` (mutually exclusive — assigning an agent bot clears the human assignee and vice versa). Auto-reopens a `pending` conversation when a human is assigned over a bot. Wraps the mutation in `conversation.with_lock`.
- `filter_service.rb` — `Conversations::FilterService < FilterService`: the advanced-filter query builder for the conversation list. Builds `@conversations` from the shared `FilterService` DSL (`app/services/filter_service.rb`, driven by `lib/filters/filter_keys.yml`), then layers `PermissionFilterService` as its `base_relation`, and returns conversations plus `mine_count`/`assigned_count`/`unassigned_count`/`all_count`.
- `permission_filter_service.rb` — `Conversations::PermissionFilterService`: the ACL gate. Administrators see everything; everyone else is scoped to conversations in their assigned inboxes (`user.inboxes`). Has a `plan_hint_selective_filter` mode that swaps the `WHERE inbox_id IN (...)` for an arithmetic-obfuscated `(conversations.inbox_id + 0) IN (...)` subquery — a query-planner hint to stop Postgres from misestimating and driving through an inbox scan when a highly selective filter (e.g. an exact-match label) is also present on large accounts (referenced as CW-7787 in a code comment). Ends with `prepend_mod_with('Conversations::PermissionFilterService')` — the Enterprise override point.
- `message_window_service.rb` — `Conversations::MessageWindowService#can_reply?`: implements the outbound messaging-window rule per channel (API inbox custom window via `agent_reply_time_window`, WhatsApp/Twilio-WhatsApp 24h, TikTok 48h, Messenger/Instagram 24h or 7d gated by `ENABLE_MESSENGER_CHANNEL_HUMAN_AGENT`/`ENABLE_INSTAGRAM_CHANNEL_HUMAN_AGENT` via `GlobalConfigService`). Returns `true` (no window) for channels not listed in the `case` (e.g. web widget, email).
- `delete_service.rb` — `Conversations::DeleteService`: for email inboxes, records deleted incoming message `source_id`s via `Imap::DeletedMessageTracker` (so IMAP sync doesn't resurrect them), then enqueues `DeleteObjectJob` to do the actual async destroy.
- `typing_status_manager.rb` — `Conversations::TypingStatusManager`: dispatches `CONVERSATION_TYPING_ON`/`CONVERSATION_TYPING_OFF` events through `Rails.configuration.dispatcher` for the typing-indicator websocket broadcast; does not touch the database.
- `unread_counts.rb` + `unread_counts/` (18 files) — a Redis-backed cache subsystem for per-inbox/label/team/assignee unread conversation counts, kept in sync via an event listener rather than computed live on every request. Notable pieces:
  - `unread_counts/builder.rb` — `Builder#build_base!`/`build_assignment!`: bulk-populates the Redis membership sets from a DB query (open conversations with an incoming message newer than `agent_last_seen_at`), batched (`BATCH_SIZE = 1000`).
  - `unread_counts/listener.rb` — `Listener < BaseListener`: reacts to `message_created`, `conversation_status_changed`, `conversation_updated`, `conversation_contact_changed`, `assignee_changed`, `team_changed`, `conversation_mentioned`, `conversation_deleted` and incrementally refreshes/invalidates the cache instead of rebuilding it.
  - `unread_counts/store.rb` + `store_keys.rb` — the Redis (`Redis::Alfred`) read/write layer: per-account "ready" flags, membership sets keyed by inbox/label/team/assignee.
  - `unread_counts/notifier.rb`, `counter.rb`, `filtered_counter.rb`, `filter_query_counter.rb`, `filtered_count_store.rb`, `filtered_count_invalidator.rb`, `filtered_count_instrumentation.rb`, `filtered_count_snapshot_resolver.rb`, `filtered_count_version_cache.rb`, `broadcast_scope.rb` — the fresh/stale-with-background-refresh machinery for the *filtered* count variant (counts scoped to an arbitrary saved filter, not just inbox/label/team), including its own version-based cache invalidation and 5-minute freshness / 1-hour stale window (constants live in `unread_counts.rb`).
  - Gated behind account feature flags `conversation_unread_counts` and a separate filtered-count flag (`Conversations::UnreadCounts::FilteredCountInvalidator::FEATURE_FLAG`).

**`app/actions/`** (2 files, unrelated to conversations proper but in scope)
- `contact_identify_action.rb` — `ContactIdentifyAction`: handles widget `setUser`/identify — merges duplicate contacts by identifier/email/phone (via `ContactMergeAction`) before updating attributes, with priority rules (identifier > email > phone) for which merge is allowed to overwrite which field.
- `contact_merge_action.rb` — `ContactMergeAction`: the actual merge — reassigns `conversations`, `messages`, `contact_notes`, `contact_inboxes` from the mergee to the base contact, deep-merges attributes (base wins), destroys the mergee, and dispatches `CONTACT_MERGED`.

## How It Fits Together
- `Conversations::AssignmentService` is called directly from `Api::V1::Accounts::Conversations::AssignmentsController#set_agent`; it mutates `Conversation#assignee`/`assignee_agent_bot`/`status`, which — via model callbacks — fires the `assignee_changed`/`conversation_status_changed` events consumed by `Conversations::UnreadCounts::Listener` (see [[events-listeners]]).
- `Conversations::FilterService` is the backend for `Api::V1::Accounts::ConversationsController#index` (the advanced-filter / saved-filter conversation list). It composes the generic `FilterService` (`app/services/filter_service.rb`) with `Conversations::PermissionFilterService` as its ACL boundary — a two-layer split: query-DSL building vs. row-level access control.
- `Conversations::PermissionFilterService` is prepended by `Enterprise::Conversations::PermissionFilterService` (`enterprise/app/services/enterprise/conversations/permission_filter_service.rb`), which adds custom-role/permission-based scoping (`conversation_manage` / `conversation_unassigned_manage` / `conversation_participating_manage` hierarchy) on top of the OSS "administrator sees all, agent sees own inboxes" rule — see [[authorization-policies]] and [[models-services]].
- `Conversation#can_reply?` on the model (`app/models/conversation.rb`) just delegates to `Conversations::MessageWindowService.new(self).can_reply?` — see [[models]].
- `Conversations::DeleteService` is called from `ConversationsController#destroy` and enqueues `DeleteObjectJob` (see [[jobs]]) for the actual deletion; email-inbox conversations also feed `Imap::DeletedMessageTracker`.
- `Conversations::TypingStatusManager` is invoked from the conversations controller's toggle-typing-status action and dispatches through the same `Rails.configuration.dispatcher` used across the codebase — see [[events-listeners]].
- The unread-counts subsystem is driven entirely by dispatcher events, not direct calls from controllers — `Conversations::UnreadCounts::Listener` is registered as a listener (`BaseListener` subclass) and both refreshes the base membership store and dispatches `CONVERSATION_UNREAD_COUNT_CHANGED` for websocket broadcast (`unread_counts/notifier.rb`, `broadcast_scope.rb`). It reads/writes via `Redis::Alfred`.
- `ContactIdentifyAction`/`ContactMergeAction` are called from the widget-facing controllers (`Api::V1::Widget::ContactsController`, `ConversationsController`, `MessagesController`) and from `Api::V1::Accounts::Actions::ContactMergesController` (agent-initiated merge in the dashboard) — see [[contacts-services]].

## Product Behavior
- `Conversations::MessageWindowService` is the backend enforcement of the 24-hour (WhatsApp/Twilio WhatsApp/Messenger/Instagram default) and configurable messaging-window rules that the WhatsApp and other-channels setup guides describe as "you can only send a free-form reply within N hours of the customer's last message; after that you need a template message." The per-channel `case` in `messaging_window` is the single source of truth for which channels are windowed at all (web widget and email are not).
- `Conversations::FilterService` + `Conversations::PermissionFilterService` implement the **Conversation Filters** feature from the user guide (advanced filter builder producing mine/assigned/unassigned/all counts), with the ACL layer additionally implementing the **role-based permissions** feature (administrator vs. agent vs. custom-role scoping) described in the "Features explained" role-permissions article.
- `Conversations::AssignmentService`'s auto-reopen-on-human-assignment behavior (a `pending` bot-assigned conversation flips to `open` when a human agent is assigned) underlies the handoff step of agent-bot/AI-agent flows referenced in the "Chatwoot 101: AI actions" and Captain documentation.

## Notes for AI Agents
- `Conversations::PermissionFilterService` is the Enterprise extension point for this whole area — do not hardcode custom-role logic into the OSS file; extend via `Enterprise::Conversations::PermissionFilterService` and `prepend_mod_with`, following the existing pattern.
- The `(conversations.inbox_id + 0)` trick in `hinted_accessible_conversations` is intentional query-planner obfuscation, not a bug — it's only applied when `plan_hint_selective_filter` is true (computed in `Conversations::FilterService#label_filter_present?`, which only fires for an `equal_to` label filter ANDed with the rest of the query). Don't "simplify" it away without understanding CW-7787.
- `Conversations::AssignmentService#assign_agent` and `#assign_agent_bot` are mutually exclusive by construction (each clears the other's assignee field) — any new assignment path must preserve this invariant or the two count separately in reports/unread-counts.
- The unread-counts subsystem has two independently-built stores: "base" (by inbox/label/team) and "assignment" (by inbox/label/team/assignee, and explicitly excludes `assignee_agent_bot_id`-assigned conversations). Code that reads counts needs to know which one it wants; `store.base_ready?`/`assignment_ready?` gate whether a given account's cache has been built at all (first-load / feature-flag-just-enabled case falls back to a live/inline count path elsewhere in this subsystem — not fully read for this page, see `filtered_count_snapshot_resolver.rb`/`filter_query_counter.rb` if you need the inline-fallback details).
- `app/actions/` is not a "conversation actions" directory despite being named in this module's investigation scope — as of this writing it contains only `ContactIdentifyAction` and `ContactMergeAction`. If you're looking for conversation-mutation actions (assign, resolve, snooze, etc.), they live in `app/services/conversations/` or directly as `Conversation` model methods/callbacks, not `app/actions/`.
- `ContactMergeAction` reassigns rows with plain `.update` (not `update!` / not going through model callbacks per-row) for `conversations`, `messages`, and `contact_inboxes` — bulk `ActiveRecord::Relation#update` skips callbacks and validations, so anything that depends on a `contact_id` change callback on those models won't fire during a merge.
- Both `app/actions` classes and several `conversations/` services use `pattr_initialize` (from the `pattr_initializer`/attr-related gem already in the Gemfile) instead of hand-written `attr_reader` + `initialize` — follow that convention for new small service objects in this area rather than writing boilerplate initializers.

## Related
- [[models]]
- [[contacts-services]]
- [[authorization-policies]]
- [[events-listeners]]
- [[jobs]]
- [[assignment]]
- [[models-services]]
- [[whatsapp]]
- [[api-v1-controllers]]
