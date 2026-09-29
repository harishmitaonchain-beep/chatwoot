---
title: "Third-party Bot & AI Integration Protocols (lib/integrations)"
tags: [chatwoot, backend, integrations, ai, webhooks]
generated: 2026-08-17
deepwiki_section: "Integrations (Slack, Linear, Dialogflow, OpenAI)"
---

# Third-party Bot & AI Integration Protocols (lib/integrations)

## Purpose

`lib/integrations` is the protocol/plumbing layer for Chatwoot's "Apps and Integrations" hooks — the code that speaks each third-party API's wire format (Slack Web API, Dialogflow gRPC, Linear GraphQL, Google Translate v3, Cloudflare RealtimeKit REST, raw OpenAI-compatible chat completions) and translates it to/from Chatwoot's `Message`/`Conversation` domain. It sits underneath `app/models/integrations/hook.rb` (`Integrations::Hook`, the polymorphic per-account/per-inbox credential+settings record keyed by `app_id`) and `app/models/integrations/app.rb` (the static manifest of installable apps), and is invoked from `app/jobs/hook_job.rb`, dedicated controllers under `app/controllers/api/v1/accounts/integrations/`, and a few conversation-flow callbacks. It also hosts a shared OpenTelemetry/Langfuse instrumentation mixin (`Integrations::LlmInstrumentation`) that is reused well beyond this directory — by Captain's own task services in `lib/captain/`.

This is plain Ruby library code (`lib/`, not `app/`), organized one subfolder per integration plus a handful of shared LLM-instrumentation files at the top level.

## Key Files & Classes

**Bot dispatch base (conversation-level chatbots)**
- `lib/integrations/bot_processor_service.rb` — `Integrations::BotProcessorService`: base class that decides whether an incoming/updated message should be forwarded to a bot (message not private, `reportable?`, conversation `pending?`), extracts message content (handling `input_select` submitted-value updates), and exposes `process_action` for `handoff`/`resolve` bot actions. Subclasses implement `get_response`/`process_response`.
- `lib/integrations/dialogflow/processor_service.rb` — `Integrations::Dialogflow::ProcessorService < BotProcessorService`. Wraps `google/cloud/dialogflow/v2` `Sessions::Client`, builds the session path from `hook.settings['project_id']`/`region`, resolves the query language via a large `SUPPORTED_LANGUAGE_CODES`/`AUTO_LANGUAGE_CODE_MAP` table (falls back to the contact's `additional_attributes['language_code']` when the hook is set to `auto`), calls `detect_intent`, and turns `fulfillment_messages` into outgoing messages or bot actions. On `Google::Cloud::PermissionDeniedError` it calls `hook.prompt_reauthorization!` and `hook.disable`.
- `lib/integrations/captain/processor_service.rb` — `Integrations::Captain::ProcessorService < BotProcessorService`. POSTs message content + prior conversation history to a Captain assistant's `/chat` HTTP endpoint (URL built from `GlobalConfigService.load('CAPTAIN_API_URL', ...)` + `hook.settings['account_id']`/`assistant_id`) and either hands the conversation off or posts the reply as an outgoing message.

**LLM plumbing**
- `lib/integrations/llm_base_service.rb` — `Integrations::LlmBaseService`: a generic "run one of a fixed set of prompt events (`summarize`, `reply_suggestion`, `fix_spelling_grammar`, `casual`, `professional`, `friendly`, `confident`, `straightforward`, `improve`) through an OpenAI-compatible chat endpoint" service. Handles per-conversation Redis response caching (`Redis::Alfred::OPENAI_CONVERSATION_KEY`, keyed off `conversation.last_activity_at`), a 400k-character token-budget constant, and drives the request through `Llm::Config.with_api_key` (the `ruby_llm`-based client wrapper) rather than hand-rolled HTTP.
- `lib/integrations/llm_instrumentation.rb` + `llm_instrumentation_constants.rb`/`_helpers.rb`/`_spans.rb`/`_completion_helpers.rb` — `Integrations::LlmInstrumentation` mixin providing `instrument_llm_call`, `instrument_agent_session`, `instrument_tool_call`, `instrument_embedding_call`, `instrument_audio_transcription`, `instrument_moderation_call`. Each wraps a block in an OpenTelemetry span (no-op unless `ChatwootApp.otel_enabled?`) tagged with GenAI semantic-convention attributes (`gen_ai.*`) and Langfuse-specific attributes (`langfuse.trace.*`, `langfuse.observation.*`) so LLM calls show up as traces in Langfuse via OTel. Exceptions inside the instrumented block are captured via `ChatwootExceptionTracker` and the block is re-yielded so a tracing failure never breaks the underlying LLM call.
- `lib/integrations/openai/key_validator.rb` — `Integrations::Openai::KeyValidator.valid?(api_key)`: a lightweight `GET /v1/models` probe (5s timeout, honors `CAPTAIN_OPEN_AI_ENDPOINT` override) used both at hook-save time and by a backfill job. Network errors are treated as "valid" (fail open) so transient outages don't nuke a working key.
- `lib/integrations/openai/openai_prompts/*.liquid` — the actual Liquid prompt templates (`summary`, `reply`, `improve`, `tone_rewrite`, `fix_spelling_grammar`, `label_suggestion`, `csat_utility_analysis`, `captain_overview_summary`). These are read directly off disk by `Rails.root.join('lib/integrations/openai/openai_prompts', "#{file_name}.liquid").read` inside `lib/captain/base_task_service.rb` — i.e. the prompt files live under `lib/integrations/` but the class that renders them is `Captain::BaseTaskService`, not anything in this directory.

**Slack**
- `lib/integrations/slack/send_on_slack_service.rb` — `Integrations::Slack::SendOnSlackService < Base::SendOnChannelService`: posts Chatwoot messages into the linked Slack channel/thread (`chat_postMessage`, `thread_ts` = `conversation.identifier`), uploads attachments via `files_upload_v2`, and on `MissingScope`/`InvalidAuth`/etc. calls `hook.prompt_reauthorization!` + `hook.disable`. Also exposes `link_unfurl` for the unfurl feature.
- `lib/integrations/slack/incoming_message_builder.rb` — parses Slack's inbound webhook payload (`url_verification` challenge, `event_callback`/`message`/`link_shared`), filters out bot/subtype echoes, and either processes a threaded reply into an existing conversation or enqueues `SlackUnfurlJob`.
- `lib/integrations/slack/slack_message_helper.rb` — shared mixin (`process_message_payload`, `handle_conversation`, reauthorization-on-`MissingScope`) included by `IncomingMessageBuilder`.
- `lib/integrations/slack/update_slack_message_service.rb` — updates a previously-sent Slack message in place (`chat_update`) for interactive content types (`SUPPORTED_CONTENT_TYPES = input_select, form, input_csat, input_email`); swallows `MessageNotFound` gracefully (channel reconfigured).
- `lib/integrations/slack/slack_link_unfurl_service.rb` / `link_unfurl_formatter.rb` — implements Slack link unfurling (turns a pasted Chatwoot conversation URL into a rich Slack preview card).
- `lib/integrations/slack/hook_builder.rb` — OAuth code exchange (`oauth_v2_access`) that creates the `Integrations::Hook` record for a new Slack connection.
- `lib/integrations/slack/channel_builder.rb`, `emoji_formatter.rb` — channel-list fetch/update helper and `:shortcode:` → Unicode emoji conversion (via the `gemoji` gem's `Emoji.find_by_alias`).

**Google Translate**
- `lib/integrations/google_translate/processor_service.rb` — `Integrations::GoogleTranslate::ProcessorService`: on-demand translation of a single message via `google/cloud/translate/v3`, with email-channel-aware content selection (prefers HTML body, falls back to plain text, then `message.content`).
- `lib/integrations/google_translate/detect_language_service.rb` — auto-detects and stores `conversation.additional_attributes['conversation_language']` from the first 1500 chars of an incoming message, skipping if already set.

**Linear**
- `lib/integrations/linear/processor_service.rb` — thin wrapper around a `Linear` GraphQL client (`teams`, `team_entities`, `create_issue`, `link_issue`/`unlink_issue`, `search_issue`, `linked_issues`), reshaping GraphQL responses into `{ data: ... }`/`{ error: ... }`.
- `lib/integrations/linear/access_token_service.rb` — OAuth token lifecycle: refreshes via `refresh_token` when expired (`TOKEN_EXPIRY_BUFFER = 1.minute`), or migrates legacy non-expiring tokens via Linear's `migrate_old_token` endpoint, persisting the rotated token/expiry back onto the hook.
- `lib/integrations/linear/auto_link_service.rb` — regex-scans private agent notes for a pasted `linear.app/<workspace>/issue/<ID>-<n>` URL and auto-links it to the conversation (dedupes against `linked_issues`, posts an activity message via `Linear::ActivityMessageService` on success).

**Facebook/Instagram wire parsing**
- `lib/integrations/facebook/message_parser.rb` — `Integrations::Facebook::MessageParser`: parses a single Messenger `messaging` (or `standby`) webhook entry into sender/recipient/content/attachments/echo?/delivery-and-read watermarks.
- `lib/integrations/facebook/message_creator.rb` — turns a parsed message into a Chatwoot `Message` (agent-echo vs. contact-inbound branching).
- `lib/integrations/facebook/delivery_status.rb` — maps Messenger delivery/read watermarks to `Conversations::UpdateMessageStatusJob` calls.

**Video calling**
- `lib/integrations/dyte/processor_service.rb` — `Integrations::Dyte::ProcessorService`: creates a RealtimeKit ("Dyte") meeting, posts it as a `content_type: :integrations` message, and manages per-user participant tokens (stored per-message in `content_attributes.data.participants`, keyed by `"#{user.class.name}:#{user.id}"`) so returning to the same message reuses/refreshes the same participant instead of minting a new one.
- `lib/integrations/cloudflare/realtime_kit_credentials_validator.rb` — `Integrations::Cloudflare::RealtimeKitCredentialsValidator`: validates a Cloudflare API token + RealtimeKit app ID at hook-save time by hitting `/user/tokens/verify` then paginating `/accounts/:id/realtime/kit/apps` looking for the app ID. Returns a `Result = Data.define(:success?, :error)` value object with a specific error symbol (`:invalid_api_token`, `:app_not_found`, `:invalid_account_or_permissions`, `:verification_failed`) rather than a bare boolean.

## How It Fits Together

- `app/jobs/hook_job.rb` is the central dispatcher: on `message.created`/`message.updated`/etc. events it looks up `Integrations::Hook.app_id` in an `INTEGRATION_PROCESSORS` map and routes to `Integrations::Dialogflow::ProcessorService`, `Integrations::GoogleTranslate::DetectLanguageService`, `Integrations::Linear::AutoLinkService`, or (for Slack) enqueues `SendOnSlackJob`/`UpdateSlackMessageJob`, which in turn call the `Integrations::Slack::*Service` classes documented here. This is the same [[events-listeners]]/[[jobs]] Sidekiq pipeline used everywhere else in the app.
- `Integrations::Hook` (`app/models/integrations/hook.rb`) is the credential/settings record every service in this directory reads from (`hook.settings['api_key']`, `hook.settings['project_id']`, `hook.access_token`, etc.) — see [[models]] for its validations and the `Reauthorizable` concern that backs `prompt_reauthorization!`/`disable`.
- `Integrations::Slack::SendOnSlackService` subclasses `Base::SendOnChannelService`, the same base outbound-delivery abstraction used by real channel-sending services documented in [[whatsapp]] and [[other-channels]] (Twilio, etc.) — Slack is modeled as a bolt-on delivery target, not a first-class `Channel` STI subtype.
- The Facebook parsing trio (`MessageParser`/`MessageCreator`/`DeliveryStatus`) is consumed by the Facebook Messenger webhook controller covered in [[facebook-instagram]] — this page only documents the raw payload-shape parsing, not the controller/routing.
- `Integrations::LlmInstrumentation` is included both here (`LlmBaseService`, `Dialogflow`'s Rails logger warnings aside) and by `Captain::BaseTaskService` under `lib/captain/` — the AI reply/summary/rewrite/label-suggestion/follow-up services documented in [[captain-ai]]. The instrumentation module, the OpenAI key validator, and the Liquid prompt files are the actual shared surface between this directory and Captain; the OpenAI *chat* prompts render off `lib/integrations/openai/openai_prompts/*.liquid` even though the rendering class lives in `lib/captain/`.
- `Integrations::Dyte::ProcessorService` is called from `app/controllers/api/v1/accounts/integrations/dyte_controller.rb` and the widget-side equivalent under `app/controllers/api/v1/widget/integrations/dyte_controller.rb`, tying into [[widget-backend]] for the customer-facing video-call join flow.
- `Integrations::Linear::AutoLinkService` posts through `Linear::ActivityMessageService` (outside this directory, under `app/services/linear/`), which in turn creates conversation activity messages — see [[conversations-services]] for that side.

## Product Behavior

Maps directly to several "Apps and Integrations" user-guide topics:
- **Dialogflow** ("How to bring your Dialogflow chatbot to Chatwoot?") — `Integrations::Dialogflow::ProcessorService` is the entire bot-reply engine; the language-code fallback table explains why a misconfigured/unsupported contact locale silently falls back to `en-US` rather than erroring.
- **Slack** ("How to answer conversations from Slack?") — the Send/Incoming/Update trio implements two-way sync between a Chatwoot conversation and a Slack thread, including file uploads, emoji shortcode rendering, and link unfurling of pasted Chatwoot links back into Slack.
- **OpenAI** ("How to enhance conversations with OpenAI integration?") — historically the intended home of the reply/summarize/rewrite features, but as of this reading the live implementation is `Captain::BaseTaskService` and its subclasses in `lib/captain/`, not `Integrations::LlmBaseService` (see the gotcha below). The Liquid prompt copy itself, though, does still live under this directory.
- **Dyte/Cloudflare RealtimeKit video calls** ("How to enable video calls with Dyte/Cloudflare RealtimeKit?") — `Dyte::ProcessorService` + `Cloudflare::RealtimeKitCredentialsValidator` implement meeting creation, participant token issuance, and hook-credential validation for the in-conversation video-call button.
- **Linear** ("How to track Issues with Linear Integration?") — issue search/create/link/unlink plus the auto-link-a-pasted-URL convenience feature.
- **Google Translate** ("How to translate messages with Google Translate?") — on-demand per-message translation and automatic conversation-language detection (used to drive UI language badges/auto-translate suggestions).

## Notes for AI Agents

- **`Integrations::LlmBaseService` and `Integrations::BotProcessorService`/`Captain::ProcessorService` appear to be unused in the live request path.** A repo-wide grep found no caller of `Integrations::LlmBaseService` outside its own spec (`spec/lib/integrations/llm_base_service_spec.rb`, which instantiates `described_class` directly rather than a subclass), and no caller of `Integrations::Captain::ProcessorService` or a hand-written subclass of `BotProcessorService` anywhere in `app/` or `enterprise/`. The real, wired-up equivalents are `Captain::BaseTaskService` and its subclasses (`Captain::SummaryService`, `Captain::ReplySuggestionService`, `Captain::RewriteService`, `Captain::LabelSuggestionService`, `Captain::FollowUpService`) under `lib/captain/`, invoked from `Api::V1::Accounts::Captain::TasksController`. Don't assume `LlmBaseService`/`BotProcessorService`/`Captain::ProcessorService` are on the hot path for AI reply features — verify against `lib/captain/` and `hook_job.rb`'s `INTEGRATION_PROCESSORS` map before changing behavior here expecting it to affect the dashboard's AI actions.
- `HookJob::INTEGRATION_PROCESSORS` only lists `slack`, `dialogflow`, `google_translate`, `leadsquared`, `linear` — there is no `openai` or `captain` entry, which is consistent with the point above.
- Several services reauthorize-and-disable the hook on specific provider error classes rather than retrying (`Dialogflow` on `Google::Cloud::PermissionDeniedError`, Slack on `MissingScope`/`InvalidAuth`/`IsArchived`/`AccountInactive`/`ChannelNotFound`/`NotInChannel`). If you add a new failure mode, check whether it should join this reauthorization list or just log-and-swallow (link unfurling deliberately does the latter — see the comment in `send_on_slack_service.rb#link_unfurl`).
- `Integrations::Openai::KeyValidator.valid?` fails **open** (returns `true`) on `Faraday::Error` — a network blip during key validation will not flag a working key as invalid. Contrast with `Cloudflare::RealtimeKitCredentialsValidator`, which fails **closed** on the same class of error.
- Dyte participant IDs are cached per-message in `content_attributes.data.participants`, not in a database column — `update_realtimekit_participant_id` uses `update_columns` (skips validations/callbacks) specifically so re-fetching a participant token doesn't touch `updated_at` semantics elsewhere or re-trigger callbacks.
- Dialogflow's region handling: `hook.settings['region']` blank or `'global'` both map to the global `dialogflow.googleapis.com` endpoint and the `projects/:id/agent/sessions/:id` path (no `/locations/:region/` segment) — any other region value switches both the endpoint host and the session path shape.
- The Linear `AutoLinkService` regex intentionally requires the pasted URL to be inside a **private** note from a **User** sender (`message.private? && message.sender.is_a?(User)`) — it will not trigger off a contact's message or a public reply.

## Related

- [[captain-ai]] — the actual live AI reply/summary/rewrite pipeline (`lib/captain/`) that shares `Integrations::LlmInstrumentation` and the Liquid prompt files with this directory but is architecturally separate from `Integrations::LlmBaseService`.
- [[jobs]] — `HookJob` and the Sidekiq queues that dispatch into most of these services.
- [[events-listeners]] — the event names (`message.created`, `message.updated`, etc.) these processors key off of.
- [[whatsapp]], [[facebook-instagram]], [[other-channels]] — the channel-specific counterparts; this page covers cross-channel bolt-on integrations, not channel delivery itself.
- [[models]] — `Integrations::Hook`/`Integrations::App` and the `Reauthorizable` concern backing `prompt_reauthorization!`/`disable`.
- [[widget-backend]] — the widget-side Dyte controller that also drives `Integrations::Dyte::ProcessorService`.
- [[lib-core-infrastructure]] — sibling `lib/` infrastructure outside the integrations subtree.
- [[conversations-services]] — where Linear's `ActivityMessageService` and general conversation-message creation live.
