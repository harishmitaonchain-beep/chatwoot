---
title: "Message Services"
tags: [chatwoot, backend, messages, notifications, markdown, webhooks]
generated: 2026-08-17
deepwiki_section: "Multi-Channel Communication"
---

# Message Services

## Purpose
`app/services/messages/` holds the small, focused service objects that `Message` and its presenter/model callbacks delegate to for cross-cutting concerns that don't belong in the model itself: resolving reply-threading, rendering outbound content per-channel markdown dialect, detecting @mentions, deciding who gets notified about a new message, deciding whether to send an email-continuity notification, transitioning delivery status, and normalizing content for outbound webhook payloads. None of these are queue-backed jobs — they are plain Ruby service objects invoked synchronously from model callbacks, listeners, and per-channel "send" services.

## Key Files & Classes
- `app/services/messages/in_reply_to_message_builder.rb` — `Messages::InReplyToMessageBuilder`: resolves `content_attributes[:in_reply_to]`/`in_reply_to_external_id` on a message by looking up the referenced message in the same conversation (by id or by `source_id`), called from `Message#ensure_in_reply_to` (a `before_create`-style callback in `app/models/message.rb`).
- `app/services/messages/markdown_renderer_service.rb` — `Messages::MarkdownRendererService`: dispatches outbound markdown to a channel-specific `CommonMarker::Renderer` subclass via a `CHANNEL_RENDERERS` hash keyed by `channel_type` string; special-cases `Channel::TwilioSms` to render as WhatsApp when `channel.whatsapp?` is true (Twilio's WhatsApp-over-SMS-API product).
- `app/services/messages/markdown_renderers/base_markdown_renderer.rb` — `BaseMarkdownRenderer < CommonMarker::Renderer`: shared node handlers (paragraph, text, softbreak/linebreak, strikethrough) plus a `method_missing` catch-all that renders unhandled node types' children generically.
- `app/services/messages/markdown_renderers/whats_app_renderer.rb`, `instagram_renderer.rb`, `telegram_renderer.rb`, `line_renderer.rb`, `plain_text_renderer.rb` — channel-specific overrides of `strong`/`emph`/`code`/`list`/`blockquote`/etc. WhatsApp and Instagram use `*bold*`/`_italic_` markup; Telegram emits HTML tags (`<strong>`, `<code>`, `<a href>`); Line and plain-text strip most formatting down to spacing/prefixes.
- `app/services/messages/mention_service.rb` — `Messages::MentionService`: parses `(mention://user/<id>/...)` and `(mention://team/<id>/...)` tokens out of private note content via regex, expands team mentions to member user ids, filters against inbox-eligible users (account admins + inbox members), enqueues `Conversations::UserMentionJob`, adds mentioned users as `conversation_participants`, and fires `NotificationBuilder` with `notification_type: 'conversation_mention'` (skipping self-mentions).
- `app/services/messages/new_message_notification_service.rb` — `Messages::NewMessageNotificationService`: on a notifiable message, notifies the conversation assignee (`assigned_conversation_new_message`) and all `conversation_participants` (`participating_conversation_new_message`) via `NotificationBuilder`, de-duplicating against notifications already created (e.g. by a mention) using `conversation.notifications.exists?(user:, secondary_actor: message)`.
- `app/services/messages/send_email_notification_service.rb` — `Messages::SendEmailNotificationService`: decides whether an outgoing reply on a Web Widget or API-channel conversation should also go out as an email (continuity), using a Redis `SET NX EX` lock (`Redis::Alfred::CONVERSATION_MAILER_KEY`) to dedupe concurrent workers, then schedules `ConversationReplyEmailJob` 2 minutes out and increments the account's email-sent counter.
- `app/services/messages/status_update_service.rb` — `Messages::StatusUpdateService`: the single place that transitions `message.status` (validates the target is a real `Message.statuses` enum value and blocks `read → delivered` regressions) and records `external_error` only when the new status is `failed`.
- `app/services/messages/webhook_content_normalizer.rb` — `Messages::WebhookContentNormalizer`: strips CommonMark hard-break backslashes (`\<newline>` → `<newline>`) and trailing newlines that ProseMirror/TipTap's editor emits, so webhook consumers and outbound gateways (e.g. WhatsApp) get plain text.

## How It Fits Together
- **Model callbacks**: `app/models/message.rb` calls `Messages::InReplyToMessageBuilder` from `ensure_in_reply_to`, and uses `Messages::WebhookContentNormalizer.normalize` directly inside `webhook_push_event_data` for the `content`/`processed_message_content` fields sent over outbound webhooks.
- **Presentation layer**: `app/presenters/message_content_presenter.rb` (`MessageContentPresenter < SimpleDelegator`) is the main consumer of `MarkdownRendererService` (`outgoing_content`, used when composing the payload actually sent to a channel) and `WebhookContentNormalizer` (`webhook_content`). It also appends CSAT survey links to content before rendering.
- **Event listener**: `app/listeners/notification_listener.rb#message_created` (subscribed to the `message_created` event fired by the [[events-listeners]] dispatcher) runs `Messages::MentionService` then `Messages::NewMessageNotificationService` for every new message — this is the entry point for all in-app notification fan-out for messages.
- **Outbound send services call `StatusUpdateService`**: channel-specific senders — `Facebook::SendOnFacebookService`, `Line::SendOnLineService`, `Tiktok::SendOnTiktokService`, `Instagram::BaseSendService`, `Email::SendOnEmailService`, `Twilio::SendOnTwilioService` (see [[whatsapp]], [[facebook-instagram]], [[other-channels]], [[email]]) — call `Messages::StatusUpdateService.new(message, 'failed'/'delivered', error).perform` on send success/failure. It's also called from `app/jobs/conversations/update_message_status_job.rb` (inbound status webhooks) and directly from `Api::V1::Accounts::Conversations::MessagesController` (manual status update / marking a message `sent`).
- **Email continuity job**: `SendEmailNotificationService` is wired into `app/jobs/send_reply_job.rb`'s per-channel-type dispatch table for `Channel::WebWidget` and `Channel::Api`, and it in turn enqueues `ConversationReplyEmailJob` — see [[jobs]] and [[notifications]].
- **Notifications**: both `MentionService` and `NewMessageNotificationService` build on `NotificationBuilder` (not in this directory) — see [[notifications]].
- **Enterprise overlay**: `enterprise/app/services/messages/` adds `Messages::ReindexService` and `Messages::AudioTranscriptionService` (Captain-related), extending the same `Messages::` namespace from outside this OSS directory — see [[models-services]] and [[captain-ai]].

## Product Behavior
- The per-channel markdown renderers directly implement how agent-composed rich text (bold/italic/lists/links/code) degrades gracefully for channels with limited formatting support — e.g. WhatsApp's `*bold*`/`_italic_` convention (relevant background: the WhatsApp channel setup and template-variable behavior covered in the official guide's "Other channels" and "Advanced features → template variables" articles) versus Telegram's HTML subset versus SMS/Twitter's plain-text stripping.
- `MentionService`'s participant/notification behavior underlies the "@mention" affordance described in the agent collision/notifications-adjacent parts of the "Features explained" guide section — mentioning a teammate in a private note adds them as a conversation participant and notifies them, mentioning a team expands to its members.
- `SendEmailNotificationService` implements "continue via email" / email-continuity for the Website widget (and API channel, gated by the `email_continuity_on_api_channel` account feature flag) — the corresponding product surface is documented under the Website live chat guide's "Continue via email" article.

## Notes for AI Agents
- All service objects here use `pattr_initialize` (from the `attr_extras` gem) except `StatusUpdateService` and `WebhookContentNormalizer`, which use plain `initialize`/`attr_reader` and a bare class method respectively — don't assume a uniform constructor style across this directory.
- `MarkdownRendererService`'s `CHANNEL_RENDERERS` dispatch table is keyed by the *string* class name (`'Channel::Whatsapp'`), not the constant — adding a new channel's renderer means adding an entry there AND a new `Messages::MarkdownRenderers::*Renderer` subclass; channels not in the hash fall through to returning `@content` unmodified (no renderer, not an error).
- The `Channel::TwilioSms` → WhatsApp special-case in `effective_channel_type` is the only place channel *type* is overridden based on channel *instance* state (`channel.whatsapp?`) rather than purely by class — a reminder that Twilio's WhatsApp product shares the SMS channel model.
- The markdown renderers all follow the same "preserve multiple newlines via placeholder, then restore" trick (`preserve_multiple_newlines`/`restore_multiple_newlines` in `MarkdownRendererService`) to work around CommonMark's standard collapsing of 2+ newlines into a single paragraph break — this is duplicated per-channel-render-method rather than extracted, so if you touch one you likely need to touch the sibling methods too (the code itself doesn't refactor this into one helper; treat that as an existing footgun, not a pattern to copy uncritically).
- `StatusUpdateService.valid_status_transition?` is intentionally minimal: it only special-cases blocking `read → delivered`; it does not otherwise enforce a full state machine, so out-of-order webhook status updates (e.g. `delivered` after `read` from race conditions) are the one guarded case — don't assume other invalid transitions are blocked.
- `SendEmailNotificationService`'s Redis lock comment explicitly documents *why* the TTL (1 hour) is longer than the job's own delay (2 minutes): to survive slow queues without producing duplicate email jobs. Don't shorten that TTL without re-reading that reasoning.
- `NewMessageNotificationService#already_notified?` checks `conversation.notifications.exists?(user:, secondary_actor: message)` — this is how it avoids double-notifying a user who was already notified via `MentionService` for the same message; the two services are always invoked together (in that order) from `NotificationListener#message_created`, so ordering matters if you ever refactor that listener.
- `MentionService` restricts valid mentionable users to `inbox.account.administrators` plus `inbox.members` — a user who is an agent on the account but not a member of that specific inbox will have their mention silently filtered out by `filter_mentioned_ids_by_inbox`, not erred on.
- This directory is OSS-only in terms of file location, but the `Messages::` namespace is extended from `enterprise/app/services/messages/` (`ReindexService`, `AudioTranscriptionService`) — grep the whole `Messages::` namespace across both trees before assuming you've found every consumer/producer.

## Related
- [[models]]
- [[conversations-services]]
- [[notifications]]
- [[events-listeners]]
- [[jobs]]
- [[whatsapp]]
- [[email]]
- [[facebook-instagram]]
- [[other-channels]]
- [[captain-ai]]
