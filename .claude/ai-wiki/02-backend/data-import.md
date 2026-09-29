---
title: "Data Import / Export & Migrations"
tags: [chatwoot, backend, data-import, migrations, sidekiq, jbuilder]
generated: 2026-08-17
deepwiki_section: "Background Jobs and Event System"
---

# Data Import / Export & Migrations

## Purpose

This module imports historical data into a Chatwoot account from two very different sources:

1. **Legacy contacts-only CSV import** — an admin uploads a CSV of contacts (with optional labels), and it's parsed and bulk-inserted as `Contact` records. This is the original, simple `DataImport` flow (`data_type == 'contacts'`, no `source_provider`).
2. **Integration-based migration from a helpdesk provider** (Intercom, Freshdesk) — a full contacts + conversations + messages import driven by the provider's API, paginated across many Sidekiq jobs, with per-record idempotency, resumability, and per-item error/skip logging.

There is **no Zendesk or Front import code in this codebase** despite the official user guide's "Migrations" section listing Intercom, Front, Freshdesk, and Zendesk — only Intercom and Freshdesk have `DataImports::Source` implementations (`DataImports::Source::PROVIDERS`). Front and Zendesk migrations, if offered, are handled outside this module (e.g. manually, or not yet built).

There is no "export" code under either investigated path — despite the module name in this vault's index, this directory is import-only. (Skip-log/error-log CSV downloads exist as a side effect of the import UI, not as a general data-export feature — see below.)

## Key Files & Classes

**Legacy CSV contact import** (`app/services/data_import/`, singular):
- `app/services/data_import/contact_manager.rb` — `DataImport::ContactManager`: finds-or-builds a `Contact` from a CSV row, matching by `identifier` → `email` → `phone_number`, merging in `additional_attributes`/`custom_attributes` from arbitrary extra CSV columns.
- `app/jobs/data_import_job.rb` — `DataImportJob`: reads the attached CSV (`import_file`), builds contacts via `ContactManager`, bulk-imports with `Contact.import(...on_duplicate_key_ignore: true, track_validation_failures: true)`, applies label tags via `ActsAsTaggableOn::Tagging.import`, attaches a `failed_records` CSV of rejected rows, and emails the admin (`AdministratorNotifications::AccountNotificationMailer#contact_import_complete`/`#contact_import_failed`). Explicitly marked with a `TODO` in the file as written narrowly for contacts and needing cleanup if generalized.

**Integration import framework** (`app/services/data_imports/`, plural — provider-agnostic core):
- `app/services/data_imports/source.rb` — `DataImports::Source`: the provider registry/factory. `PROVIDERS = {'freshdesk' => ..., 'intercom' => ...}`; `.for(data_import)` builds the right `*::Source` instance; `.supported?` gates the controller.
- `app/services/data_imports/importer.rb` — `DataImports::Importer` (~1350 lines, the core engine): drives paginated contact and conversation import, message batch writes, cursor/checkpoint persistence, per-item advisory-locking, mapping bookkeeping, and stats reconciliation. See "How It Fits Together" for the mechanics.
- `app/services/data_imports/message_batch_builder.rb` — `DataImports::MessageBatchBuilder`: given a source conversation, builds an ordered list of message "entries" (source + parts), looks up existing `DataImportMapping`/`Message` rows, and classifies each entry (`:new_message`, `:existing_message`, `:repairable_stale_mapping`, `:current_import`, `:previous_import`) so the importer knows whether to insert, skip, or repair.
- `app/services/data_imports/creation_service.rb` — `DataImports::CreationService`: validates credentials via the source's `credentials_validator`, then creates the `DataImport` row under an account-level lock, refusing if another integration import is already active (`active_integrations` scope).
- `app/services/data_imports/restart_service.rb` — `DataImports::RestartService`: restarts a `failed`/`abandoned` import from scratch-ish (resets status/timestamps, clears non-skip error logs, keeps skip-log counts), guarding against a concurrently active import.
- `app/services/data_imports/retry_service.rb` — `DataImports::RetryService`: resumes a *stalled* (`pending`/`processing` but not updated in 15 min) import in place, without resetting cursor/stats.
- `app/services/data_imports/placeholder_inbox_builder.rb` — `DataImports::PlaceholderInboxBuilder`: creates/reuses `Channel::Api` placeholder inboxes per "source bucket" (e.g. Email/WhatsApp/Messenger) so imported conversations land in a channel-appropriate inbox rather than a real live channel.

**Provider implementations** (`data_imports/intercom/`, `data_imports/freshdesk/`), one Source subclass each plus provider-specific helpers:
- `.../{provider}/source.rb` — implements the `Source` contract: pagination, payload → Chatwoot field mapping (custom attributes, source metadata), timestamp parsing, error-code constants, and wiring to the provider's `Client`, `Importer`, `PlaceholderInboxBuilder`, `MessageBatchBuilder`, page-job classes.
- `.../{provider}/client.rb` — thin HTTP client for the provider's REST API (list/retrieve contacts, conversations/tickets); raises provider-specific `Client::Error`/`AuthenticationError`/`RateLimitError`.
- `.../{provider}/credentials_validator.rb` — validates the access token (and, for Freshdesk, domain) up front and returns approximate record totals for the progress UI.
- `.../{provider}/source_bucket.rb` — maps a provider conversation "source type" (email, whatsapp, phone, messenger, ...) to a placeholder-inbox bucket key/name.
- `.../{provider}/message_batch_builder.rb` — provider-specific subclass/wiring of `DataImports::MessageBatchBuilder` (Freshdesk's is a 10-line file, mostly delegating).
- `app/services/data_imports/intercom/activity_content_builder.rb` — turns Intercom "activity" parts (assignment, note, close, etc.) into human-readable message content.
- `app/services/data_imports/freshdesk/ticket_page.rb`, `.../freshdesk/normalizer.rb`, `.../freshdesk/metadata.rb` — Freshdesk-specific pagination-with-checkpoints (tickets don't support cursor pagination the same way Intercom does) and payload normalization into a shape the shared `Importer` understands.
- `app/services/data_imports/intercom/creation_service.rb`, `intercom/restart_service.rb`, `intercom/retry_service.rb` — empty subclasses of the base services with no overrides; only referenced by their own specs, not by the controller (which calls the base `DataImports::*Service` classes directly for every provider). Looks like leftover/legacy scaffolding.

**Models**:
- `app/models/data_import.rb` — `DataImport`: the run record. Tracks `status` enum (`pending/processing/completed/failed/completed_with_errors/abandoned`), `cursor` (jsonb per-stage pagination state), `stats` (jsonb counters), `source_provider`/`data_type` (must match for integration imports), encrypted `access_token`. `INTEGRATION_DATA_TYPES = %w[freshdesk intercom]`. `active_import_run_id` (stored inside `source_metadata`) is the concurrency guard used to detect a stale/superseded run.
- `app/models/data_import_item.rb` — `DataImportItem`: one row per source object (`contact`/`conversation`) attempted, with `status` enum (`pending/processing/imported/skipped/failed`) and attempt count — the per-record idempotency ledger, unique on `(data_import_id, source_object_type, source_object_id)`.
- `app/models/data_import_mapping.rb` — `DataImportMapping`: source-object-id → Chatwoot-record-id mapping, unique per `(account, source_provider, source_object_type, source_object_id)` **account-wide** (not per-import), so re-running an import (or a second import from the same provider) recognizes previously-imported records instead of duplicating them.
- `app/models/data_import_error.rb` — `DataImportError`: unified log for both hard failures and expected skips, distinguished by `details->>'kind'` (`failed`/`skipped`/other). Scopes `skip_logs`, `failed`, `non_skip_logs` back this split.

**Jobs** (`app/jobs/data_import_job.rb` for legacy CSV; `app/jobs/data_imports/` for the integration flow):
- `app/jobs/data_imports/import_job.rb`, `contacts_page_job.rb`, `conversations_page_job.rb` — shared modules mixed into provider-specific job classes. `ImportJob` kicks off the run and enqueues the first contacts-or-conversations page job; `ContactsPageJob`/`ConversationsPageJob` each process one page then re-enqueue themselves with the next cursor, or move to the next stage, or call `importer.finish!`. This is how a single import is spread across many small Sidekiq jobs instead of one long-running job.
- `app/jobs/data_imports/base_job.rb` — shared `skip_import?`/`stale_import_run?`/`importer_for`/`fail_unexpected_error` helpers used by every provider job.
- `app/jobs/data_imports/intercom/*`, `app/jobs/data_imports/freshdesk/*` — provider `BaseJob` subclasses adding `retry_on` for provider-specific client errors/rate limits, plus the three job classes (`ImportJob`, `ContactsPageJob`, `ConversationsPageJob`) that `include` the shared modules above.

**API layer**:
- `app/controllers/api/v1/accounts/data_imports_controller.rb` — `index`/`show`/`create`/`validate_source`/`start`/`retry_import`/`abandon`/`skip_logs`/`error_logs`. Gated by the `data_import` account feature flag and `DataImportPolicy` (administrator-only). `skip_logs`/`error_logs` stream CSV downloads of `DataImportError` rows — this is the closest thing to "export" in this module, and it's an audit-log export, not a data export.
- `app/policies/data_import_policy.rb` — `DataImportPolicy`: every action requires `@account_user.administrator?`.
- `app/views/api/v1/accounts/data_imports/_data_import.json.jbuilder` — the show/index JSON representation (not read in full; sampled by name only).

## How It Fits Together

**Legacy CSV flow**: `DataImport#after_create_commit` calls `process_data_import`, which — only for `legacy_contacts_csv_import?` (`data_type == 'contacts'` and no `source_provider`) — enqueues `DataImportJob` with a 1-minute delay (to let the attached file finish uploading to cloud storage). The job builds and bulk-inserts `Contact` rows and `ActsAsTaggableOn::Tagging` rows directly; it does not go through [[contacts-services]] contact-creation service objects.

**Integration flow** is a state machine driven entirely through `DataImport.status`/`cursor`/`source_metadata['active_import_run_id']`, with no in-memory or Redis job-chain state:
1. `DataImportsController#create` → `DataImports::CreationService` validates credentials via the provider's `credentials_validator` and creates the `DataImport` row (guarded by `@account.with_lock` + the `active_integrations` scope so only one integration import can run per account at a time).
2. Controller enqueues `{Provider}::ImportJob` with `data_import` and its freshly assigned `active_import_run_id`.
3. `ImportJob` (via the shared `DataImports::ImportJob` module) builds a `DataImports::Importer` (or provider subclass) and enqueues the first `ContactsPageJob`/`ConversationsPageJob`.
4. Each page job processes one page of ~50–100 records via `Importer#import_contacts_page`/`#import_conversations_page`, persists the next pagination cursor into `data_import.cursor` (jsonb, keyed by `contacts`/`conversations`, each with `starting_after`/`completed`/`updated_at`), and re-enqueues itself — or moves to the next stage, or calls `importer.finish!`.
5. Every job checks `skip_import?`/`stale_import_run?` first: if the run's `active_import_run_id` no longer matches the id baked into the job args, or the import was abandoned/failed/completed concurrently, the job silently returns. This is what makes `abandon!`/restart/retry safe against in-flight jobs from a superseded run.
6. Per-conversation, `Importer` uses **Postgres advisory locks** (`pg_advisory_lock(-item.id)`) around `DataImportItem` processing to make concurrent page-job overlap safe, and relies on `DataImportMapping` (unique per account+provider+source-type+source-id, not per-import) so contacts/conversations/messages already imported by any prior run for that account are recognized and reused rather than duplicated — this is the core idempotency mechanism enabling safe retries and restarts.
7. Messages are written in bulk (`Message.insert_all!`, up to `MESSAGES_PER_BATCH = 100` at a time) with a fallback to one-by-one writes (`fallback_message_entries`) if the bulk path raises `ActiveRecordError` (e.g. a partial unique-constraint conflict). `ActiveRecord::QueryCanceled` gets one retry via `with_query_timeout_retry`.
8. Every conversation is routed into a placeholder `Channel::Api` inbox created by `PlaceholderInboxBuilder`/`{Provider}::SourceBucket`, named e.g. "Intercom Import - WhatsApp" — imported conversations never land in a real live channel inbox.
9. `Importer#finish!`/`#fail!` transition `DataImport.status` under `@data_import.with_lock`, and only if the run isn't stale/abandoned — this final-state race is guarded the same way as everything else in this module.

**Models touched**: `Contact`, `Conversation`, `Message`, `ContactInbox`, `Inbox`/`Channel::Api` (placeholder inboxes), `ActsAsTaggableOn::Tag`/`Tagging` (legacy CSV labels). See [[models]] for the base models and [[contacts-services]]/[[conversations-services]]/[[messages-services]] for the "normal" (non-import) creation paths these bypass in favor of direct `insert_all!`/`update_columns` for performance and idempotency control.

**Jobs/queue**: everything here runs on the Sidekiq `low` queue (`queue_as :low`) — see [[jobs]].

**Mailers**: legacy CSV completion/failure notifications go through `AdministratorNotifications::AccountNotificationMailer` — see [[notifications]].

**Search indexing**: imported messages call `message.__send__(:reindex_for_search)` (best-effort, warns and swallows errors on failure) rather than going through the normal message-creation → event → indexing path.

**Authorization**: gated by `DataImportPolicy` (administrator-only) and the `data_import` account feature flag — see [[authorization-policies]].

## Product Behavior

The official user guide's **Migrations** section covers Intercom, Front, Freshdesk, and Zendesk — but only Intercom and Freshdesk have working code in this repository; treat any Front/Zendesk guide content as aspirational or handled outside this codebase (manual CSV export/import, a separate tool, or not yet shipped) rather than assuming a matching service object exists.

For the two that do exist, the shape matches the guide's description of a self-serve migration: an admin supplies an access token (Intercom) or domain + API key (Freshdesk), the system validates and shows estimated totals before committing (`validate_source` action, `CredentialsValidator#perform` returning contact/conversation counts), and the import runs in the background with visible progress/stats, resumability after failure, and downloadable error/skip logs for anything that couldn't be imported cleanly (duplicate detection, malformed payloads, truncated conversation history, etc.).

The legacy CSV contact importer is the backend for the plain "import contacts" flow referenced generally under **Setup account** / **Features explained: contacts** in the guide, not the Migrations section specifically — it only ever produces `Contact` records with optional label tags, no conversations or messages.

## Notes for AI Agents

- **`app/services/data_import/` (singular) vs `app/services/data_imports/` (plural)** are two unrelated things sharing a similar name: the singular is the old CSV-only path (one file, `ContactManager`), the plural is the whole provider-based migration framework. Don't confuse `DataImport::ContactManager` with anything under `DataImports::`.
- **Zendesk and Front have no implementation here.** Grepping for "zendesk" or "front" import code will only turn up unrelated matches (e.g. `FRONTEND_URL`). If asked to "add Zendesk migration," there is no existing partial implementation to extend — `DataImports::Source::PROVIDERS` would need a new entry and an entire new `data_imports/zendesk/` tree mirroring Freshdesk's.
- **Adding a new provider means implementing the full `Source` contract**: `credentials_validator`, `source_metadata`, `default_import_name`, `credential_name`, `import_job_class`/`contacts_page_job_class`/`conversations_page_job_class`, `client_error?`/`authentication_error?`, plus the instance methods `list_contacts`/`list_conversations`/`retrieve_conversation`/`retrieve_contact`, `placeholder_inbox_builder`, `message_batch_builder`, `activity_part?`/`activity_content`, and the various `*_source_metadata`/`*_custom_attributes` mappers. `DataImports::Source::PROVIDERS` is the single registration point.
- **`DataImportMapping` uniqueness is per-account, not per-import** (`idx_data_import_mappings_on_account_and_source` on `account_id, source_provider, source_object_type, source_object_id`). This is intentional — it's what lets a restarted or second import recognize already-imported records — but it also means two different `DataImport` runs for the same account/provider can't independently re-import the same source object; the second run will always find and reuse the first run's mapping.
- **Advisory locks are keyed off `DataImportItem#id` negated** (`pg_advisory_lock(-item.id)`) — a convention specific to this importer to avoid needing a separate lock-key table; be careful about lock-id collisions if this pattern gets reused elsewhere in the codebase.
- **`active_import_run_id` lives inside `source_metadata` (jsonb), not a dedicated column.** `DataImport` also carries deprecated `ACTIVE_INTERCOM_IMPORT_RUN_ID_KEY`/`active_intercom_import_run_id`/`assign_active_intercom_import_run_id` aliases kept for backward compatibility with older Intercom-only code — new code should use the generic `active_import_run_id`/`assign_active_import_run_id`.
- **Every job and importer method that could straddle a stale run re-checks `stale_import_run?`/`skip_import?`/`inactive_import_run?` before writing.** When touching this code, don't assume a job that starts processing will still be the "active" run by the time it finishes a page — always re-check before persisting cursor/stats/status, following the existing pattern rather than trusting the initial state.
- **The `Freshdesk` conversations pager uses checkpoints, not simple cursors**, because ticket listing there doesn't provide stable pagination the same way — see `checkpoint_ticket_page`/`update_cursor` interplay in `DataImports::Freshdesk::Importer` before assuming `Importer#import_conversations_page` behaves identically across providers.
- **`DataImports::Importer` has multiple top-of-file rubocop disables** (`Metrics/ClassLength`, `Metrics/AbcSize`, etc.) — it's a genuinely large, intentionally-consolidated class; per this repo's "never disable rubocop to silence a cop" norm elsewhere, note that this file is a pre-existing exception, not a precedent to copy casually into new code.
- **`DataImports::Intercom::CreationService`/`RestartService`/`RetryService` are empty subclasses with their own specs but are not wired into the controller** (which calls the base `DataImports::*Service` classes for all providers). Treat them as legacy/dead code unless you find a caller that was missed in this investigation.
- **The importer writes messages/contacts/conversations via `insert_all!`/`update_columns`, bypassing ActiveRecord callbacks and validations** — this is deliberate for import-scale performance and idempotency, but means normal model hooks (e.g. anything on `after_create` for `Message`/`Contact`/`Conversation`) will not fire during import; reindexing is done manually (`reindex_for_search`), and conversation `last_activity_at` is updated manually (`update_conversation_activity`).
