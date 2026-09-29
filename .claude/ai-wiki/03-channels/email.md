---
title: "Email Channel & Mailboxes"
tags: [chatwoot, backend, email, action-mailbox, imap, channels]
generated: 2026-08-17
deepwiki_section: "Multi-Channel Communication"
---

# Email Channel & Mailboxes

## Purpose

Handles the email channel end-to-end: receiving inbound mail (both via Rails ActionMailbox ingress for forwarded/routed mail, and via a direct IMAP poller for BYO-mailbox setups), matching each mail to the right account/inbox/conversation, turning it into a `Message` with attachments, and sending outgoing replies back out as email (SMTP, or OAuth-based Google/Microsoft send). It also owns the DB-backed, Liquid-rendered email template/layout system used to brand outgoing mail.

## Key Files & Classes

**ActionMailbox ingress (forwarded/relay mail path)**
- `app/mailboxes/application_mailbox.rb` — routes all inbound mail; routes to `:reply` if the `to` address matches the `reply+<conversation-uuid>@domain` pattern or resolves to a known `Channel::Email` via `EmailChannelFinder`, else falls back to `:default` (no-op).
- `app/mailboxes/reply_mailbox.rb` — the single mailbox all real email lands on. Uses `Mailbox::ConversationFinder` (`before_processing`) to resolve/build a conversation, then in one DB transaction: persists the conversation if new, decorates the mail, creates the message, attaches files.
- `app/mailboxes/default_mailbox.rb` — catchall no-op for mail that doesn't route anywhere (`process; end`).

**IMAP polling path (BYO mailbox, no forwarding)**
- `app/mailboxes/imap/imap_mailbox.rb` (`Imap::ImapMailbox`) — invoked directly by a job, not via ActionMailbox routing. Given a raw mail + `Channel::Email`, resolves account/inbox, finds/creates contact + conversation (via `In-Reply-To` header, then `References` header with a fallback regex for agent-initiated conversations), creates the message and attachments, all inside one transaction.
- `app/services/imap/base_fetch_email_service.rb` — shared IMAP mechanics: opens a `Net::IMAP` connection, authenticates, searches `SINCE` a date window, fetches headers in batches (`BODY.PEEK[HEADER]`) to get message-ids first, skips ones already present (`Message#source_id` lookup or `Imap::DeletedMessageTracker`), then fetches full bodies (`BODY.PEEK[]`) only for new mail, capped at `MAX_MESSAGES_PER_SYNC = 500` per sync.
- `app/services/imap/fetch_email_service.rb`, `google_fetch_email_service.rb`, `microsoft_fetch_email_service.rb` — provider-specific subclasses; only differ in `authentication_type` (`plain`/configured vs `XOAUTH2`) and how the password/access token is obtained (stored `imap_password` vs `Google::RefreshOauthTokenService` / `Microsoft::RefreshOauthTokenService`).
- `app/services/imap/authentication.rb` (`Imap::Authentication`) — normalizes/validates the user-configurable IMAP auth mechanism (`plain`, `login`, `cram-md5`) and dispatches the right `Net::IMAP` auth call.
- `app/services/imap/deleted_message_tracker.rb` — Redis-backed (`Redis::Alfred`, 2-day TTL) record of message-ids seen-and-deleted, so a message manually deleted from the mailbox isn't re-fetched forever; only tracks for `inbox.email?`.
- `app/jobs/inboxes/fetch_imap_emails_job.rb` (`Inboxes::FetchImapEmailsJob`) — scheduled job entry point. Guards on `channel.imap_enabled? && !channel.reauthorization_required?`, takes a Redis mutex per inbox (`with_lock`, 5 min), picks the right fetch service by `channel.microsoft?`/`channel.google?`, then feeds each fetched mail into `Imap::ImapMailbox.new.process` under a per-message `Timeout` (`EMAIL_PROCESSING_TIMEOUT_SECONDS` global config, default 60s) with a 3-strikes-then-skip failure cache (`Rails.cache`, key `email_failures:<message_id>`). On `OAuth2::Error` marks the channel `authorization_error!`.

**Conversation matching (shared by both paths)**
- `app/services/mailbox/conversation_finder.rb` (`Mailbox::ConversationFinder`) — runs an ordered chain of strategy classes, returns the first hit; logs which strategy matched.
- `app/services/mailbox/conversation_finder_strategies/` — `ReceiverUuidStrategy` (matches `reply+<uuid>@` in the `to` address → `Conversation.find_by(uuid:)`), `InReplyToStrategy` (parses the `In-Reply-To` header against `conversation/<uuid>/messages/<id>@` or the agent-initiated fallback `account/<id>/conversation/<uuid>@` pattern, falling back to `Message#source_id` lookup), `ReferencesStrategy` (same patterns but scanning the `References` header, scoped to the resolved channel's inbox to avoid cross-account matches), `NewConversationStrategy` (resolves the channel via `EmailChannelFinder`, validates the sender via `IncomingEmailValidityHelper`, finds/creates the contact, and **builds but does not persist** a new `Conversation` — persistence is deferred to `ReplyMailbox` so message/attachment creation stays in the same transaction and job retries stay idempotent).
- `app/finders/email_channel_finder.rb` (`EmailChannelFinder`) — resolves a `Channel::Email` from an inbound mail by checking `to`/`cc`/`X-Original-To` first, then falls back to `bcc` recipients (gated per-account by the `SKIP_INCOMING_BCC_PROCESSING` global config). Matches case-insensitively against both `channel_email.email` and `channel_email.forward_to_email`, with plus-addressing normalized away (`EmailHelper#normalize_email_with_plus_addressing`).
- `app/presenters/mail_presenter.rb` (`MailPresenter < SimpleDelegator`) — the central mail-decoding object wrapped around a `Mail::Message`. Extracts/encodes subject, text/html content (full vs `reply`-trimmed via `EmailReplyTrimmer` vs `quoted`), attachments (uploads each to an `ActiveStorage::Blob`), `original_sender`/`sender_name` (prefers `Reply-To` over `From`), auto-reply/bounce detection, and `notification_email_from_chatwoot?` (compares sender against `MAILER_SENDER_EMAIL` to avoid processing Chatwoot's own notification mail as inbound).

**Shared mailbox helpers**
- `app/mailboxes/mailbox_helper.rb` (`MailboxHelper`) — `create_message` (idempotent on `source_id`, dedupes retried jobs), `add_attachments_to_message` (caps at `Message::NUMBER_OF_PERMITTED_ATTACHMENTS`, splits inline vs regular), `create_contact` (via `ContactInboxWithContactBuilder`).
- `app/mailboxes/mailbox_inline_attachment_helper.rb` — decides if an attachment is inline (explicit `inline?`, or an image whose CID is referenced in the HTML body — with an Outlook-compatibility fallback that checks both raw and URL-encoded CID forms per RFC 2392) and rewrites `cid:` URLs in the HTML/text body to point at the uploaded blob URL.
- `app/mailboxes/mailbox_sanitizer.rb` (`MailboxSanitizer`) — strips null bytes recursively from any value before it hits Postgres/JSONB columns, and builds the sanitized message/`content_attributes` hash (embeds `processed_mail.serialized_data` under `content_attributes[:email]`).
- `app/mailboxes/incoming_email_validity_helper.rb` — rejects mail when the account isn't active, the mail is Chatwoot's own notification mail, or the sender address fails `Devise.email_regexp`.

**Outbound send**
- `app/services/email/send_on_email_service.rb` (`Email::SendOnEmailService < Base::SendOnChannelService`) — the reply side; triggered for outgoing `Channel::Email` messages. Skips unless `message.email_notifiable_message?`, delivers via `ConversationReplyMailer#email_reply`, stamps `message.source_id` with the sent mail's `Message-Id`, and on failure reports via `ChatwootExceptionTracker` + `Messages::StatusUpdateService.new(message, 'failed', ...)`.
- `app/services/base/send_on_channel_service.rb` (`Base::SendOnChannelService`) — the generic per-channel outbound base class every channel's send service inherits (validates the channel type matches, skips private/looped-back/`voice_call` messages).
- `app/mailers/conversation_reply_mailer.rb` (`ConversationReplyMailer`) — builds the actual outgoing email: chooses `reply+<uuid>@<inbound_email_domain>` as the reply-to address when using the shared conversation email address vs the inbox's own `email_address`, builds `In-Reply-To`/`References`/custom `Message-Id` headers keyed off `conversation/<uuid>/messages/<id>@<domain>` (with an `account/<id>/conversation/<uuid>@<domain>` fallback for agent-initiated or channel-switched conversations — the same patterns `InReplyToStrategy`/`ReferencesStrategy` parse on the way back in), and picks between the DB-backed branded layout and the default `mailer/base` layout.

**Email template/layout branding**
- `app/services/email_templates/db_resolver_service.rb` (`EmailTemplates::DbResolverService < ActionView::Resolver`, singleton) — overrides Rails' template resolution so `EmailTemplate` DB rows (rendered as Liquid) win over filesystem views when present, resolved in inbox → account → installation scope order, gated by the `branded_email_templates` feature flag for account/inbox-level lookups.
- `app/models/email_template.rb` (`EmailTemplate`) — `layout`/`content` templates scoped to installation, account, or inbox (uniqueness enforced per scope), validated for parseable Liquid and (for layouts) the presence of a `{{ content_for_layout }}` slot.
- `app/models/channel/email.rb` (`Channel::Email`) — the channel record: `email`/`forward_to_email` (auto-generated on create, unique), IMAP and SMTP config columns (passwords encrypted via `encrypts` when encryption keys are configured), `provider` (`google`/`microsoft`/manual), `verified_for_sending`, and helpers like `microsoft?`, `google?`, `legacy_google?`.

## How It Fits Together

- **Inbound (forwarded/relay)**: mail server → Rails `action_mailbox.ingress` (configured via `RAILS_INBOUND_EMAIL_SERVICE`, default `relay`) → `ApplicationMailbox` routing → `ReplyMailbox#process` → `Mailbox::ConversationFinder` → creates/finds `Conversation`/`Message`/`ActiveStorage::Attachment` rows. See [[models]] for the `Conversation`/`Message`/`ContactInbox` shapes involved.
- **Inbound (IMAP)**: `Inboxes::FetchImapEmailsJob` (a scheduled Sidekiq job — see [[jobs]]) polls per `Channel::Email`, feeding raw `Mail::Message` objects straight into `Imap::ImapMailbox#process`, bypassing `ApplicationMailbox` routing entirely (it isn't an ActionMailbox mailbox — it's a plain Ruby class with the same method-naming convention).
- **Contact/conversation creation** goes through `ContactInboxWithContactBuilder` (shared with other channels — see [[contacts-services]]) and plain `Conversation.create!`/`.new`, not a dedicated conversation-creation service.
- **Outbound**: an agent reply becomes an outgoing `Message` (see [[messages-services]]), which some dispatcher/listener wires to `Email::SendOnEmailService` (the `channel_class` check means this only fires for `Channel::Email` inboxes) — worth cross-checking [[events-listeners]] for exactly which event/listener invokes per-channel send services, as that wiring lives outside this module's directories.
- **Templates**: `EmailTemplates::DbResolverService` is only consulted through `EmailTemplate.resolver`, wired into mailers' `append_view_path`/resolver configuration (not itself inside the investigated directories) — `ConversationReplyMailer#choose_layout` is the concrete call site that decides branded vs default layout per account/inbox feature flag.
- **Global config gates**: `SKIP_INCOMING_BCC_PROCESSING` (BCC-routed inbound) and `EMAIL_PROCESSING_TIMEOUT_SECONDS` (per-mail IMAP processing timeout) are read via `GlobalConfigService`.
- **Errors/observability**: IMAP auth/connection failures are caught broadly in the job (`ExceptionList::IMAP_EXCEPTIONS`, various `Net::IMAP::*` errors) and logged rather than retried per-message; unexpected errors go through `ChatwootExceptionTracker`.

## Product Behavior

The official user guide's "How to setup an Email channel" flow maps directly onto `Channel::Email`'s two configuration modes seen in the model/services here: a **forward-to-address** setup (agent forwards or configures their provider to send mail to the auto-generated `forward_to_email`, hitting the ActionMailbox/`ReplyMailbox` path) versus a **direct IMAP/SMTP** setup with OAuth for Google/Microsoft or manual credentials (hitting the `Imap::*FetchEmailService` polling path, with `provider_config['access_token']` gating whether Google/Microsoft polling even attempts a fetch). "Continue conversations through email" (widget → email handoff) is reflected in the `In-Reply-To`/`References` fallback patterns explicitly commented in `InReplyToStrategy`/`ReferencesStrategy` as covering "conversation originated from a non-email channel... but is now using email."

## Notes for AI Agents

- `Imap::ImapMailbox` is **not** an `ActionMailbox::Base` subclass despite living under `app/mailboxes/imap/` and sharing `MailboxHelper` — it's invoked directly by `Inboxes::FetchImapEmailsJob`, not via ActionMailbox routing. Don't assume every file in `app/mailboxes/` is reachable through `ApplicationMailbox`'s `routing` DSL.
- `NewConversationStrategy#find` deliberately returns an **unpersisted** `Conversation.new` — persistence happens later in `ReplyMailbox#persist_conversation_if_needed` inside the same transaction as message creation. If you add a new strategy or touch this path, don't `save!` inside the strategy or you'll break the retry-idempotency guarantee the comments call out.
- `EmailChannelFinder` matches both `channel_email.email` and `channel_email.forward_to_email`, case-insensitively, with plus-addressing stripped — a test/repro that only checks exact `email` match will miss the `forward_to_email` and BCC branches.
- BCC-routed mail is gated per-account by `SKIP_INCOMING_BCC_PROCESSING` (a comma-separated account-id list in `GlobalConfigService`), independent of the primary `to`/`cc` match path — don't conflate the two when debugging "email not received."
- `Imap::DeletedMessageTracker` only tracks for `inbox.email?` — reusing it for a non-email inbox type silently no-ops (`record` returns early).
- `Imap::BaseFetchEmailService` fetches headers first (`BODY.PEEK[HEADER]`) to filter out already-seen/Chatwoot-notification mail *before* paying the cost of a full-body fetch (`BODY.PEEK[]`); the `MAX_MESSAGES_PER_SYNC = 500` cap applies per sync run, so a mailbox with a large backlog needs multiple scheduled runs to drain, not one.
- `MailPresenter#original_sender` and `#from` both prefer `Reply-To` over `From` — if you're chasing a "message attributed to wrong contact" bug, check `Reply-To` first.
- `EmailTemplates::DbResolverService` is a `Singleton` explicitly built to bypass Rails' template cache lookup (see the file's own header comment) — it re-derives `@template_name`/`@template_type`/`@db_template` as instance state on every `find_templates` call, so it is not safe to assume thread-local isolation the way a normal resolver instance would give you; treat its instance state as request-scoped only because Rails calls it synchronously per render.
- No `enterprise/` overrides exist for anything under the four investigated directories (`app/mailboxes`, `app/services/email`, `app/services/imap`, `app/services/email_templates`) — the only enterprise email-adjacent file found repo-wide is `enterprise/app/services/companies/business_email_detector_service.rb`, which is unrelated to inbound/outbound mail processing.
- I did not trace where in the event/listener/dispatcher layer `Email::SendOnEmailService` actually gets invoked from an outgoing `Message` create — that wiring lives outside the four investigated directories; check [[events-listeners]] or [[messages-services]] before assuming the call site.

## Related

- [[models]] — `Conversation`, `Message`, `ContactInbox`, `Channel::Email` schema details
- [[messages-services]] — outgoing message lifecycle that triggers `Email::SendOnEmailService`
- [[contacts-services]] — `ContactInboxWithContactBuilder` used for inbound contact/contact_inbox creation
- [[jobs]] — `Inboxes::FetchImapEmailsJob` scheduling and Sidekiq queue conventions
- [[events-listeners]] — likely home of the dispatcher wiring that calls per-channel `SendOnChannelService` subclasses
- [[notifications]] — other mailer conventions (`ApplicationMailer`, layout/branding patterns) alongside `ConversationReplyMailer`
- [[whatsapp]] / [[other-channels]] — sibling channel implementations sharing the `Base::SendOnChannelService` pattern
