---
title: "Attachments & Active Storage"
tags: [chatwoot, backend, attachments, active-storage, uploads, file-handling]
generated: 2026-08-17
deepwiki_section: "Core Data Models (attachments)"
---

# Attachments & Active Storage

## Purpose

This is the layer that turns a Rails `ActiveStorage::Blob` into a first-class, polymorphic Chatwoot domain object — the `Attachment` model — and everything around it: file-type/size validation, per-type metadata shaping for the frontend, direct-upload endpoints scoped to conversations and the widget, avatar handling, inline-email-image handling, and the storage backend configuration (`config/storage.yml`) that lets a self-hosted install point at local disk, S3, GCS, Azure Blob, or any S3-compatible service (DigitalOcean Spaces, MinIO). It is not just "file uploads" — several unrelated models (`Macro`, `AutomationRule`, `DataImport`, `Account`, `Portal`, `Call`, `Captain::Document`, any `Avatarable`) attach files directly via plain ActiveStorage, while `Attachment` itself is specifically the model backing `message.attachments`.

## Key Files & Classes

- `app/models/attachment.rb` — the core model. `belongs_to :message`, `has_one_attached :file`, an `enum file_type` (`image, audio, video, file, location, fallback, share, story_mention, contact, ig_reel, ig_post, ig_story, embed`), file-size/content-type validation, and `push_event_data` which builds the JSON shape sent to the frontend per `file_type`.
- `enterprise/app/models/enterprise/concerns/attachment.rb` — mixed into `Attachment` via `Attachment.include_mod_with('Concerns::Attachment')` at the bottom of the OSS file. Enqueues `Messages::AudioTranscriptionJob` for audio attachments and re-broadcasts the message update once the file is attached, so the frontend bubble picks up transcribed audio.
- `config/storage.yml` — Active Storage service definitions: `test`/`local` (Disk), `amazon` (S3), `google` (GCS), `microsoft` (AzureBlob), `s3_compatible` (S3-protocol, configurable endpoint/path-style — used for Spaces/MinIO). Selected at runtime via `ACTIVE_STORAGE_SERVICE` env var in `config/environments/{development,production}.rb`.
- `config/initializers/active_storage.rb` — four small patches worth knowing:
  - extends `content_types_allowed_inline` with audio MIME types so voice notes/call recordings stream in an `<audio>` tag instead of forcing a download;
  - `ActiveStorageDirectUploadMetadataFilter` strips internal ActiveStorage metadata keys (`identified`, `analyzed`, `composed`) from client-supplied direct-upload params;
  - `ActiveStorageBareDirectUploadGuard` returns 403 on the bare Rails-mounted `ActiveStorage::DirectUploadsController` route — only the account-scoped and widget-scoped subclasses below are legitimate;
  - `ActiveStorageProxyRangeLimit` caps HTTP Range requests (max 1 range, ≤100MB) on blob streaming to bound memory/IO per request.
- `app/controllers/api/v1/accounts/conversations/direct_uploads_controller.rb` — conversation-scoped direct upload, subclasses `ActiveStorage::DirectUploadsController`, authenticates via Devise session or `api_access_token` (agent-bot), gated by `Current.account.api_and_webhooks_enabled?` on the token path.
- `app/controllers/api/v1/widget/direct_uploads_controller.rb` — widget-scoped direct upload, authenticates via the website token + contact.
- `app/controllers/concerns/attachment_concern.rb` — `validate_and_prepare_attachments`, used by automation/macro "send attachment" actions to resolve a signed blob ID (`ActiveStorage::Blob.find_signed`) or fall back to an already-attached blob on the record.
- `app/models/concerns/avatarable.rb` — shared `has_one_attached :avatar` concern (content-type/size validation, `avatar_url`, Gravatar fallback job) included by `User`/`Contact`/etc.
- `app/mailboxes/mailbox_inline_attachment_helper.rb` — detects CID-referenced inline images in inbound email and rewrites `cid:` URLs to the uploaded blob URL (with RFC 2392 URL-encoding variants for Outlook compatibility).
- `app/mailers/conversation_reply_mailer_attachment_helper.rb` — for outbound email replies, inlines attachments as real email attachments up to a 20MB total budget, and demotes anything over that to `@large_attachments` (rendered as links).
- `app/views/api/v1/models/_attachment.json.jbuilder` — the shared attachment JSON partial, built from `attachment.push_event_data`.
- `app/controllers/api/v1/accounts/contacts/attachments_controller.rb` — paginated "all attachments for this contact across their conversations" endpoint, respecting `Conversations::PermissionFilterService`.
- `rubocop/attachment_download.rb` — a custom Rubocop cop banning `.file.download`/`.blob.download` in favor of `blob.open`/streaming, to avoid loading whole files into memory.

## How It Fits Together

- `Attachment` belongs to `Message` and is the mechanism by which [[messages-services]] (message creation/reply flows) and channel-specific inbound processing attach media to a conversation. `Message#attachments` is `has_many ... dependent: :destroy, before_add: :validate_attachments_limit` (see `app/models/message.rb`), capping the number of attachments per message.
- The two direct-upload controllers sit alongside the rest of [[api-v1-controllers]] and [[widget-backend]] — they're how the dashboard composer and the website widget get a signed blob ID *before* the message-create request, the standard Active Storage direct-upload pattern.
- [[automation-rules]] and [[macros]] both use `has_many_attached :files` directly (not through `Attachment`) and share `AttachmentConcern#validate_and_prepare_attachments` to validate the signed blob IDs a "send attachment" action references.
- Enterprise's audio-transcription hook (`enqueue_audio_transcription`) ties into the job system documented in [[jobs]], and its re-broadcast call goes through [[realtime-actioncable]] via `message.send_update_event`.
- `Portal#logo`, `Account#contacts_export`, `Call#recording` (Twilio voice), and `Captain::Document#pdf_file` are all plain `has_one_attached` usages outside the `Attachment` model — relevant if you're touching [[portal-survey-superadmin]], [[data-import]], voice/[[other-channels]], or [[captain-ai]] respectively.
- Inline email image handling (`mailbox_inline_attachment_helper.rb`) is invoked from inbound mail processing, which is covered in [[email]].
- `Attachment#thumb_url`/`file_url` use Rails' `url_for`/`rails_storage_redirect_url` route helpers, which is why the model `include`s `Rails.application.routes.url_helpers` — worth knowing when tracing 500s that mention missing `default_url_options`.

## Product Behavior

- The `MAXIMUM_FILE_UPLOAD_SIZE` global config (read via `GlobalConfigService.load('MAXIMUM_FILE_UPLOAD_SIZE', 40)`, defaulting to 40MB) is surfaced to the dashboard and widget through `dashboard_controller.rb`, `widgets_controller.rb`, and `api/v1/widget/configs_controller.rb`, and is editable from Super Admin → App Configs. This directly maps to file-upload limits users hit in the widget and dashboard composer.
- File-type/size validation in `Attachment#should_validate_file?` only applies **when the inbox's channel is `Channel::WebWidget`** — attachments arriving from other channels (WhatsApp, email, etc.) are not filtered by `ACCEPTABLE_FILE_TYPES`/size here (channel-specific ingestion may apply its own limits upstream).
- Audio attachments get transcribed automatically (enterprise) and the transcript is surfaced via `meta['transcribed_text']` in the attachment's push event data — this is the backend half of the audio-transcription feature referenced in the AI/Captain product surface.
- The account-wide "attachments for a contact" list (`Contacts::AttachmentsController`) backs the Contact sidebar's attachment/media gallery in the dashboard.

## Notes for AI Agents

- Don't call `.file.download` or `.blob.download` on an `Attachment` — the repo has a custom Rubocop cop (`rubocop/attachment_download.rb`) that will flag it; use `blob.open { |f| ... }` or stream instead, as `conversation_reply_mailer_attachment_helper.rb`'s `read_blob_content` does.
- `Attachment#file_url` does a 301 redirect (`url_for(file)` → Rails' proxy/redirect route) which does not always work well for external/webhook consumers; `download_url` (`file.blob.url`, a direct signed storage URL) exists specifically for that case — pick the right one when writing new integrations.
- The enterprise audio-transcription hook explicitly does **not** guard on `file.attached?` before enqueuing the job, because the social-media ingest path saves the `Attachment` row before the blob is attached (a real race); `AudioTranscriptionJob` is expected to retry on `ActiveStorage::FileNotFoundError`. Don't "fix" this by adding an `attached?` guard without checking that job's retry behavior first.
- The bare `/rails/active_storage/direct_uploads` route is deliberately blocked in production via `ActiveStorageBareDirectUploadGuard` — always use the conversation- or widget-scoped controller instead; a new direct-upload use case should subclass `ActiveStorage::DirectUploadsController` the same way rather than trying to open the base route back up.
- `instagram_incoming_message?` in `Attachment#file_metadata` swaps `data_url`/`thumb_url` to `external_url` for Instagram — a channel-specific special case, not a general pattern to copy elsewhere without checking why (Instagram CDN URLs vs. proxying through our own storage).
- `set_extension` only fills `extension` if it's blank, from the attached file's filename — pre-set values (e.g. from an inbound-message payload) are preserved as-is.
- `ACCEPTABLE_FILE_EXTENSIONS` (`pfx`, `xml`) exists specifically to allow `application/octet-stream`-typed uploads through when the browser/OS can't identify a more specific MIME type — this is a narrow escape hatch, not a general extension allowlist.

## Related

- [[messages-services]]
- [[widget-backend]]
- [[api-v1-controllers]]
- [[automation-rules]]
- [[macros]]
- [[jobs]]
- [[realtime-actioncable]]
- [[email]]
- [[captain-ai]]
- [[models]]
