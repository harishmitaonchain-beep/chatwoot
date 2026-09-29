---
title: "Presenters"
tags: [chatwoot, backend, serialization, websocket, webhooks, email]
generated: 2026-08-17
deepwiki_section: "Background Jobs and Event System"
---

# Presenters

## Purpose
`app/presenters` holds small objects that shape a model's data for a specific output — a WebSocket broadcast payload, an outbound webhook body, a JSON API response, or a parsed/normalized version of inbound email — without cluttering the model itself. Most wrap a single model with Ruby's `SimpleDelegator`, so the presenter transparently exposes all of the model's own methods/attributes and only overrides the handful it needs to reshape. This is a thin, single-purpose directory (8 files, no base class, no shared module) — each presenter solves one narrow serialization or parsing problem for one caller.

## Key Files & Classes
- `app/presenters/agent_bot_presenter.rb` — `AgentBotPresenter < SimpleDelegator`. Wraps `AgentBot` for the agent-bot jbuilder views; overrides `access_token` so the bot's token is only ever returned when `Current.account` matches the bot's own account.
- `app/presenters/conversations/event_data_presenter.rb` — `Conversations::EventDataPresenter < SimpleDelegator`. Builds `push_data` (ActionCable broadcast payload) and `webhook_data` (webhook payload, with message content normalized via `webhook_push_event_data`) for a `Conversation`. Has an enterprise override point (`prepend_mod_with`).
- `app/presenters/inbox/event_data_presenter.rb` — `Inbox::EventDataPresenter < SimpleDelegator`. Builds `push_data`/`webhook_data` for an `Inbox` (business hours, auto-assignment config, CSAT/greeting flags, associated channel).
- `app/presenters/html_parser.rb` — plain `HtmlParser` class (no delegation). `HtmlParser.parse_reply(raw_body)` parses HTML with Nokogiri, replaces `<blockquote>` quote blocks with `&gt; `, then converts to text via `Html2Text.convert` — used to strip quoted reply chains from HTML emails.
- `app/presenters/mail_presenter.rb` — `MailPresenter < SimpleDelegator`. Wraps a `Mail::Message` for inbound email processing: multipart-aware text/HTML extraction (`text_content`, `html_content`), attachment upload to Active Storage (`attachments`), header parsing (`in_reply_to`, `references`, `from`, `sender_name`, `original_sender`), bounce/auto-reply detection (`bounced?`, `auto_reply?`), and a top-level `serialized_data` used to build inbound `Message` records.
- `app/presenters/message_content_presenter.rb` — `MessageContentPresenter < SimpleDelegator`. Wraps a `Message` to produce `outgoing_content` (survey link appended, then markdown-rendered per channel via `Messages::MarkdownRendererService`) and `webhook_content` (survey link appended, then normalized via `Messages::WebhookContentNormalizer`).
- `app/presenters/messages/search_data_presenter.rb` — `Messages::SearchDataPresenter < SimpleDelegator`. Builds the `search_data` hash (content, attachments' transcribed text, email subject, conversation display id) that feeds full-text/attribute search indexing for a `Message`. Has an enterprise override (`prepend_mod_with`) that folds voice-call transcripts into `attachment_data`.
- `app/presenters/reports/time_format_presenter.rb` — `Reports::TimeFormatPresenter` (plain class, includes `ActionView::Helpers::TextHelper`). Formats a raw seconds count into a human string like "2 days 3 hours" (top 2 non-zero units) or `'N/A'` for reports (avg first response/resolution/reply time).

## How It Fits Together
- `Conversations::EventDataPresenter` is invoked through `PushDataHelper` (`app/models/concerns/push_data_helper.rb`), a concern included in `Conversation` (`app/models/conversation.rb`) that defines `push_event_data`, `lock_event_data`, and `webhook_data` as thin wrappers around the presenter. This is the payload broadcast over ActionCable and read by [[realtime-actioncable]], and the same shape (via `webhook_data`) is delivered by the webhook dispatch path covered in [[webhook-routing]] and [[events-listeners]].
- `Inbox::EventDataPresenter` is called directly from `app/listeners/webhook_listener.rb` when an inbox is created/updated, feeding the same webhook pipeline.
- `MessageContentPresenter` and `Messages::SearchDataPresenter` are called from `Message` model methods (`outgoing_content`, `webhook_content`, `search_data` in `app/models/message.rb`), so they sit on the hot path for outbound delivery formatting and search indexing described in [[messages-services]].
- `MailPresenter` (with `HtmlParser` as a helper it delegates HTML-reply-trimming to) is the parsing layer for inbound email, used by `app/mailboxes/reply_mailbox.rb`, `app/mailboxes/imap/imap_mailbox.rb`, `app/services/imap/base_fetch_email_service.rb`, and the mailbox conversation-finder strategies under `app/services/mailbox/conversation_finder_strategies/` — see [[email]] for the surrounding mailbox/channel logic.
- `AgentBotPresenter` is used only in the `agent_bots` jbuilder views (`app/views/api/v1/accounts/agent_bots/*.json.jbuilder`), part of the [[api-v1-controllers]] surface.
- `Reports::TimeFormatPresenter` is used by `app/helpers/api/v2/accounts/reports_helper.rb`, feeding the CSV/summary formatting layer for [[reports]].
- Two presenters have Enterprise overrides via `prepend_mod_with`/`Enterprise::` modules, matching the extension pattern used elsewhere: `enterprise/app/presenters/enterprise/conversations/event_data_presenter.rb` adds SLA fields (`applied_sla`, `sla_events`, `sla_policy_id`) to `push_data` when the account's `sla` feature is enabled, and `enterprise/app/presenters/enterprise/messages/search_data_presenter.rb` folds voice-call transcripts into searchable attachment data. This is the same [[models-services]] extension convention used across the Enterprise overlay.

## Product Behavior
No direct product-guide mapping — this is internal serialization/formatting plumbing, not a user-facing feature. Its effects are indirect: it determines exactly what fields appear in webhook payloads (relevant to the "Webhooks" apps-and-integrations doc) and how response/resolution time reads in Reports (e.g. the `Reports::TimeFormatPresenter` output like "2 days 3 hours" is what a user sees in report exports).

## Notes for AI Agents
- Almost every presenter here is a `SimpleDelegator`: unknown method calls fall straight through to the wrapped model, so a presenter's public API is "everything the model has, plus/override these specific methods." When reading a presenter, check what it overrides — everything else is just the underlying model.
- `PushDataHelper#lock_event_data` calls `Conversations::EventDataPresenter.new(self).lock_data`, but no `lock_data` method exists anywhere in the presenter, its Enterprise mod, or `Conversation` — and `lock_event_data` itself has no callers in the codebase. This appears to be dead/unreachable code; calling it would raise `NoMethodError`.
- `Messages::SearchDataPresenter` and `Conversations::EventDataPresenter` both call `.prepend_mod_with(...)` at the bottom of the file — the standard Chatwoot Enterprise extension hook. If you're adding enterprise-only fields to a push/webhook/search payload, look for (or add) a matching module under `enterprise/app/presenters/enterprise/...` rather than editing the OSS file directly.
- `MessageContentPresenter#outgoing_content` and `webhook_content` diverge deliberately: `outgoing_content` runs content through `Messages::MarkdownRendererService` (channel-aware markdown rendering) for actually sending the message, while `webhook_content` runs it through `Messages::WebhookContentNormalizer` for third-party webhook consumers — don't assume they produce the same string.
- `MailPresenter#html_content` and `text_content` both call `EmailReplyTrimmer.trim` to strip quoted history, but `HtmlParser.parse_reply` is applied to the HTML body *first* — quote-stripping for HTML mail is two layered passes (blockquote removal + `Html2Text` conversion, then `EmailReplyTrimmer`), not one.
- `AgentBotPresenter#access_token` deliberately returns `nil` unless `Current.account.id == account_id` — this is a security-relevant guard against leaking a bot's token cross-account; don't "simplify" it away.
