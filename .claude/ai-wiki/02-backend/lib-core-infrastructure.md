---
title: "Core Library Infrastructure (lib/)"
tags: [chatwoot, backend, infra, config, redis, llm]
generated: 2026-08-17
deepwiki_section: "Configuration and Feature Management (global config, feature flags/premium, user prefs)"
---

# Core Library Infrastructure (lib/)

## Purpose

`lib/` is Chatwoot's grab-bag of framework-adjacent infrastructure: code that isn't a Rails model/controller/job/service but that the rest of the app depends on to boot, configure itself, talk to Redis, call LLM providers safely, render markdown, and fetch untrusted URLs without becoming an SSRF vector. Almost nothing here is account-scoped business logic — it's plumbing that `app/` and `enterprise/` build on top of. `lib/integrations/` (third-party bot/AI/webhook protocol adapters — Slack, Dialogflow, OpenAI, etc.) lives under this same directory but is covered by its own page, [[lib-integrations]], and is excluded from this one.

## Key Files & Classes

**App identity & installation config**
- `lib/chatwoot_app.rb` — `ChatwootApp` module: `enterprise?` (checks `enterprise/` dir exists, short-circuited by `DISABLE_ENTERPRISE`), `chatwoot_cloud?`, `self_hosted_enterprise?`, `custom?` (checks a `custom/` overlay dir), `extensions` (returns `%w[enterprise custom]` used to build Rails autoload/eager-load paths), `advanced_search_allowed?` (OpenSearch + enterprise gate), `otel_enabled?`.
- `lib/global_config.rb` — `GlobalConfig`: Redis-cached reads of `InstallationConfig` rows (1-day TTL, `GLOBAL_CONFIG` key prefix), with `clear_cache` and boolean typecasting driven by `config/installation_config.yml`.
- `lib/global_config_service.rb` — `GlobalConfigService.load(key, default)`: reads `GlobalConfig` first, falls back to `ENV`, and lazily writes the ENV value into `InstallationConfig` on first read (documented as a migration path off env vars).
- `lib/config_loader.rb` — `ConfigLoader#process`: reconciles `config/installation_config.yml` and `config/features.yml` into the `InstallationConfig` table on boot/deploy (`reconcile_only_new` controls whether existing values are overwritten).
- `lib/chatwoot_hub.rb` — `ChatwootHub`: talks to the external `hub.2.chatwoot.com` service for instance registration, telemetry ping (`sync_with_hub`), push-notification relay, event emission, and billing URL construction. Enterprise-extendable via `prepend_mod_with`.
- `lib/limits.rb` — `Limits` module: flat numeric constants (bulk action caps, message length caps, search time range) plus one ENV-driven method, `conversation_message_per_minute_limit`.

**Request context & error handling**
- `lib/current.rb` — `Current` module using `thread_mattr_accessor` for `user`, `account`, `account_user`, `executed_by`, `contact`, `inbox` — the per-request/per-job "who is doing this" context, with a `reset` used between jobs/requests.
- `lib/chatwoot_exception_tracker.rb` — `ChatwootExceptionTracker`: the single entry point (`.new(e, user:, account:).capture_exception`) for reporting exceptions to Sentry (only if `SENTRY_DSN` is set) and always logging to `Rails.logger`.
- `lib/exception_list.rb` — `ExceptionList`: curated arrays of RestClient/SMTP/IMAP exception classes meant to be `rescue`d together (e.g. `rescue *ExceptionList::REST_CLIENT_EXCEPTIONS`).
- `lib/custom_exceptions/` — `CustomExceptions::Base` (a `StandardError` with `to_hash`/`http_status`) plus domain subclasses: `Account` (signup failures, email limit), `CustomFilter` (invalid attribute/operator/value), `Inbox::LimitExceeded`, `Pdf` (upload/validation/FAQ generation errors), `CallAlreadyAccepted` (voice), `DataImport::FreshdeskTicketLimitError`. These are the vocabulary controllers rescue via `RequestExceptionHandler`-style helpers (see [[api-v1-controllers]]).

**Redis**
- `lib/redis/alfred.rb` — `Redis::Alfred`: the one wrapper every caller uses instead of touching `$alfred` directly (string/list/hash/sorted-set ops, `delete_if_equals` for compare-and-delete lock release, `pipelined`).
- `lib/redis/config.rb` — `Redis::Config`: builds the connection config from `REDIS_URL`/`REDIS_PASSWORD`, with Sentinel support (`REDIS_SENTINELS`).
- `lib/redis/lock_manager.rb` — `Redis::LockManager`: simple `SET NX EX`-based distributed lock (`lock`/`unlock`/`with_lock`/`locked?`), default 1-second timeout.
- `lib/redis/redis_keys.rb` — `Redis::RedisKeys`: every Redis key template in the app as a `sprintf`-style constant (round robin, unread-conversation caches, online presence, per-channel message-creation mutexes like `WHATSAPP_MESSAGE_MUTEX`/`FACEBOOK_MESSAGE_MUTEX`, assignment rate-limit keys). This is the canonical map of "what's in Redis and why."

**LLM / Captain plumbing** (distinct from the Captain domain services in `app/services/captain/`)
- `lib/llm/config.rb` — `Llm::Config`: configures the `ruby_llm` gem globally from `InstallationConfig` (`CAPTAIN_OPEN_AI_API_KEY`/`_ENDPOINT`), and `with_api_key` for per-call credential overrides (used when an account supplies its own OpenAI hook).
- `lib/llm/models.rb` — `Llm::Models`: loads `config/llm.yml` (providers/models/features) and exposes lookups like `default_model_for(feature)`, `valid_model_for?`, `provider_for`.
- `lib/llm/feature_router.rb` — `Llm::FeatureRouter.resolve(feature:, account:)`: picks the model for a Captain feature — account override → Captain V2 assistant model (gated by the `captain_integration_v2` feature flag, hardcoded to `gpt-5.2`) → YAML default.
- `lib/llm/exception_trackable.rb` — `Llm::ExceptionTrackable`: routes LLM errors to Sentry only when the credential source is `:system` (account-supplied keys just log, to avoid polluting Sentry with customer-key failures).
- `lib/llm_constants.rb` — `LlmConstants`: default model/embedding-model names and a `PROVIDER_PREFIXES` map used to infer a provider from a bare model-name prefix.
- `lib/captain/` — `BaseTaskService` (the shared base every Captain task service inherits: token-budget-aware `conversation_messages`, `make_api_call` → `ruby_llm` chat, follow-up-context building, `prepend_mod_with` auto-applied to every subclass via `self.inherited`) plus concrete task services (`SummaryService`, `ReplySuggestionService`, `RewriteService`, `LabelSuggestionService`, `FollowUpService`, `CsatUtilityAnalysisService`, `OverviewSummaryService`) and `ToolInstrumentation` (OpenTelemetry/Langfuse span emission around tool-calling chat sessions, no-ops unless `ChatwootApp.otel_enabled?`).
- `lib/captain_response_dequeued_logger.rb` — a Sidekiq server middleware-style class (`call(_worker, job, queue)`) that logs only when a Captain V2 `ResponseBuilderJob` is dequeued, for response-lifecycle tracing.
- `lib/opentelemetry_config.rb` — `OpentelemetryConfig`: lazily configures the `opentelemetry-sdk`/`opentelemetry-exporter-otlp` gems to export to Langfuse, gated on `OTEL_PROVIDER == 'langfuse'` plus three `InstallationConfig` credentials.

**Safe outbound HTTP**
- `lib/safe_fetch.rb` + `lib/safe_fetch/` (`fetcher.rb`, `private_network_request.rb`, `request_options.rb`) — `SafeFetch.fetch(url, **opts) { |result| }`: an SSRF-hardened HTTP client built on the `ssrf_filter` gem, streaming to a tempfile with a byte cap (`MAXIMUM_FILE_UPLOAD_SIZE`, default 40MB), content-type allowlisting (`image/`, `video/` prefixes by default), CRLF-injection header validation, and an explicit `SAFE_FETCH_ALLOW_PRIVATE_NETWORK` escape hatch (`PrivateNetworkRequest`) for trusted internal targets that bypasses the public-IP-only restriction while still validating scheme/redirects. Wraps every failure mode into its own error class (`InvalidUrlError`, `UnsafeUrlError`, `FetchError`, `FileTooLargeError`, `UnsupportedContentTypeError`).
- `lib/webhooks/trigger.rb` — `Webhooks::Trigger`: the shared outbound-webhook POST used for account webhooks, API-inbox webhooks, and agent-bot webhooks. Builds the HMAC signature (`X-Chatwoot-Signature: sha256=...`) when a secret is present, times out via `GlobalConfig.get_value('WEBHOOK_TIMEOUT')` (default 5s), and — critically — only retries (`RetryableError`, handled upstream by Sidekiq) for `:agent_bot_webhook` on HTTP 429/500; all other webhook types and all other statuses just log and swallow the failure (see the `feedback` memory note on account-webhook silent drops).
- `lib/webhooks/twitter.rb` — `Webhooks::Twitter`: dispatches incoming Twitter webhook payloads to `Twitter::DirectMessageParserService`/`Twitter::TweetParserService` based on which event key is present.

**Markdown rendering**
- `lib/base_markdown_renderer.rb` — `BaseMarkdownRenderer < CommonMarker::HtmlRenderer`: overrides `image` to turn `cw_image_width`/`cw_image_height` query params (set by the rich-text editor's drag-resize) into a sanitized inline `style` (bounded to 1–2000px to prevent attribute-injection).
- `lib/chatwoot_markdown_renderer.rb` — `ChatwootMarkdownRenderer`: the facade used app-wide — `render_message` (chat messages, via `BaseMarkdownRenderer`), `render_article` (Help Center articles, via `CustomMarkdownRenderer`), `render_markdown_to_plain_text`.
- `lib/custom_markdown_renderer.rb` — `CustomMarkdownRenderer < CommonMarker::HtmlRenderer`: the richer Help Center article renderer — sized `<table>`/`<colgroup>` reconstruction from a `<!--cw-colwidths:...-->` comment the article editor emits, `<sup>` support via `^text^` syntax, and embed expansion (YouTube/etc.) driven by `config/markdown_embeds.yml`.

**Misc single-purpose utilities**
- `lib/chatwoot_captcha.rb` — `ChatwootCaptcha`: hCaptcha server-side verification, no-ops (`valid? == true`) when `HCAPTCHA_SERVER_KEY` isn't configured.
- `lib/vapid_service.rb` — `VapidService`: lazily generates and persists Web Push VAPID keys into `InstallationConfig`.
- `lib/dyte.rb` — `Dyte`: thin HTTP client for Cloudflare RealtimeKit (formerly Dyte) video-call meetings/participants, including a legacy-preset-name fallback.
- `lib/linear.rb` + `lib/linear/` (`queries.rb`, `mutations.rb`) — `Linear`: GraphQL client for the Linear integration (issue create/link/unlink/search, team lookup, token revocation).
- `lib/microsoft_graph_auth.rb` — `MicrosoftGraphAuth < OmniAuth::Strategies::OAuth2`: custom OmniAuth strategy for Outlook/Microsoft 365 email channel OAuth.
- `lib/regex_helper.rb` — `RegexHelper`: shared regexes, notably the WhatsApp `WHATSAPP_BSUID_REGEX`/`WHATSAPP_WAMID_TOKEN_REGEX`/`TWILIO_CHANNEL_WHATSAPP_REGEX` patterns (see [[whatsapp]]) and a still-used `MENTION_REGEX` for parsing `[@name](mention://...)` markdown (comment notes it's still needed by the Slack integration even though notification rendering moved to CommonMarker).
- `lib/url_helper.rb` — `UrlHelper#url_valid?`: single-purpose HTTP(S)-only URL validator, mixed into models/services.
- `lib/online_status_tracker.rb` — `OnlineStatusTracker`: presence tracking for agents and contacts on top of `Redis::Alfred` sorted sets/hashes — `update_presence`, `get_available_users` (falls back to DB `availability` when Redis is cold), `get_available_contacts`.
- `lib/events/` — `Events::Base` (name/timestamp/data wrapper with a `method_name` helper for dispatcher method lookup) and `Events::Types` (every internal event-name string constant, e.g. `CONVERSATION_CREATED`, `CAPTAIN_RESPONSE_COMPLETED`) — the vocabulary consumed by the dispatcher/listener system (see [[events-listeners]]).
- `lib/filters/filter_keys.yml` — the single source of truth for filterable attributes/operators/data-types across conversation, contact, and message filters, consumed by `FilterService` and `AutomationRules::ConditionsFilterService`/`ConditionValidationService`.
- `lib/action_view/template/handlers/liquid.rb` — registers a `.liquid` ActionView template handler (used for canned-response/campaign-style templating with drops/filters/registers pulled from the controller).
- `lib/active_storage/migrator.rb` — `ActiveStorage::Migrator.migrate(from, to)`: ops utility for moving all blobs between two configured Active Storage services (e.g. disk → S3).

**Seeders & test-data generators** (dev/ops tooling, not runtime app code)
- `lib/seeders/account_seeder.rb` (+ `inbox_seeder.rb`, `message_seeder.rb`, `reports/*`, `seed_data.yml`) — `Seeders::AccountSeeder#perform!`: wipes and repopulates a single account with teams, custom roles, users, labels, canned responses, inboxes, contacts and conversations from `seed_data.yml`. Explicitly refuses to run in production unless `ENABLE_ACCOUNT_SEEDING` is set. Exposed via Super Admin (`Accounts#seed`) and `Internal::SeedAccountJob`.
- `lib/test_data/` — `TestData::Orchestrator.call` and helpers (`AccountCreator`, `InboxCreator`, `ContactBatchService`, `CleanupService`, `DisplayIdTracker`, `DatabaseOptimizer`, `Constants`) — bulk fixture generation for search/performance/load testing, driven by `rails search:setup_test_data` (per CLAUDE.md).

**Rake tasks**
- `lib/tasks/` — 25 `.rake` files covering DB/annotate maintenance, SLA application, asset cleanup, the assignment-v2 migration, bulk conversation ops, Captain assistant migration and chat REPL, feature defaults, IP lookup, MFA, orphan-conversation cleanup (`ops/cleanup_orphan_conversations.rake`), reporting-events rollup + timezone setup, Sidekiq, Swagger doc generation, and storage migrations (wraps `ActiveStorage::Migrator`). Not enumerated individually here — grep `lib/tasks/*.rake` for the specific task you need.

## How It Fits Together

- `ChatwootApp.enterprise?`/`extensions` gate the `prepend_mod_with`/`include_mod_with` pattern used throughout `enterprise/` — see [[models-services]] and [[controllers-jobs-listeners]] for the Enterprise-side half of that contract. `ChatwootHub` itself is extended the same way (`ChatwootHub.singleton_class.prepend_mod_with('ChatwootHub')`).
- `GlobalConfig`/`GlobalConfigService`/`ConfigLoader` back the account-level and installation-level feature-flag/config system that [[account-onboarding]] and the Super Admin config screens read from.
- `Redis::Alfred`/`RedisKeys`/`LockManager` are the low-level primitives that [[assignment]] (round-robin keys, in-flight assignment lock), [[jobs]] (Sidekiq-adjacent locking), and unread-conversation caching all build on.
- `Events::Base`/`Events::Types` define the event vocabulary consumed by [[events-listeners]]; `Webhooks::Trigger` is the delivery mechanism behind account/API-inbox/agent-bot webhooks described in [[webhook-routing]] and [[public-platform-api]].
- `Llm::Config`/`Llm::Models`/`Llm::FeatureRouter` plus `lib/captain/` are the model-selection and API-call layer underneath the Captain domain logic in [[captain-ai]]; `Captain::BaseTaskService` is the shared parent for all task services documented there.
- `SafeFetch` is what [[messages-services]] (attachment/avatar-from-URL fetching), [[widget-backend]], and `Webhooks::Trigger` route outbound HTTP through instead of a bare `Net::HTTP`/`HTTParty` call, to close SSRF holes.
- `ChatwootMarkdownRenderer`/`CustomMarkdownRenderer` render both chat messages ([[messages-services]]) and Help Center articles ([[help-center-models]], [[portal-survey-superadmin]]).
- `CustomExceptions::*` is the exception vocabulary [[api-v1-controllers]]'s shared error-handling concern rescues into consistent JSON error responses.
- `lib/current.rb`'s `Current` context is set per-request/per-job and read throughout `app/` for "who's the actor" without threading params everywhere — worth knowing about when tracing any authorization or audit-log code path ([[authorization-policies]]).
- `Seeders::AccountSeeder` and `TestData::*` are the two seeding paths documented at the top of this vault's CLAUDE.md (`db:seed`-adjacent quick seeding vs. bulk `search:setup_test_data` fixtures) — not something request-time code touches.
- Third-party bot/AI/API protocol adapters live in `lib/integrations/` (Slack, Dialogflow, OpenAI, etc.) — see [[lib-integrations]], intentionally excluded from this page.

## Product Behavior

Most of this directory is internal plumbing with no direct product-guide mapping. A few pieces do surface in product behavior:
- `GlobalConfig`/`ConfigLoader`/Super Admin config screens back the "Global config" and self-hosted "Enterprise Edition" licensing behavior (`ChatwootApp.self_hosted_enterprise?`, `INSTALLATION_PRICING_PLAN`) referenced in the user guide's "Other topics: Enterprise Edition."
- `ChatwootCaptcha` gates public-facing signup forms with hCaptcha when configured.
- `OnlineStatusTracker` is what powers the online/busy/offline presence indicators agents and contacts see.
- `Llm::FeatureRouter`'s `captain_integration_v2` branch is the mechanism behind Captain V2 assistant model selection referenced in the "Captain (AI agent)" product docs.
- `Webhooks::Trigger`'s HMAC signing (`X-Chatwoot-Signature`) is the mechanism customers verify against when consuming Chatwoot's outbound webhooks, per the "Apps and Integrations: webhooks" user guide.

## Notes for AI Agents

- `GlobalConfig` caches in Redis for 1 day; a stale value after an admin changes an `InstallationConfig` row is expected until `GlobalConfig.clear_cache` runs or the TTL expires — don't assume a DB write is instantly visible.
- `GlobalConfigService.load` has an ENV-fallback side effect: the *first* time it's called for a key with no `InstallationConfig` row, it writes the ENV value (or default) into the DB. This is an intentional one-way migration off env vars, not a bug, but it means the DB can silently pick up a value from whatever `ENV` happened to be set to on the machine that first ran the code path.
- `Captain::BaseTaskService.inherited` auto-`prepend_mod_with`s every subclass, including subclasses that override `perform`-style methods — this is deliberate so the Enterprise quota wrapper composes correctly regardless of method override order; don't "simplify" this away.
- `Webhooks::Trigger` retries **only** `:agent_bot_webhook` deliveries on HTTP 429/500 (via `RetryableError`, handled by the enqueuing job's Sidekiq retry). Account webhooks and API-inbox webhooks get zero retry — a single timeout/502/503 silently drops the delivery (matches the memory note `reference_account_webhook_silent_drop_no_retry`).
- `SafeFetch.allow_private_network?` (`SAFE_FETCH_ALLOW_PRIVATE_NETWORK` env var) intentionally disables the SSRF-safe path and routes through `SafeFetch::PrivateNetworkRequest`, which still validates scheme/redirects/CRLF but does *not* restrict to public IPs — only enable this for genuinely trusted internal fetch targets.
- `lib/regex_helper.rb`'s `MENTION_REGEX` looks redundant with CommonMarker-based rendering but the inline comment says it's still load-bearing for the Slack integration (`lib/integrations/slack/send_on_slack_service.rb`) — don't delete it as dead code.
- `BaseMarkdownRenderer`/`CustomMarkdownRenderer` both clamp `cw_image_width`/`cw_image_height` to `1..2000` px and validate the format as `\A\d+px\z` before ever interpolating into an HTML `style` attribute — this is a deliberate anti-injection guard tied to the rich-text editor's drag-resize feature, not incidental validation.
- `lib/seeders/account_seeder.rb` is destructive by design (`set_up_account` calls `destroy_all` on teams/conversations/labels/inboxes/contacts before reseeding) and raises unless `ENABLE_ACCOUNT_SEEDING` is set or the environment isn't production — never point it at a real account.
- `Redis::LockManager#lock` defaults to a 1-second timeout, deliberately short to avoid deadlocking on a crashed holder — callers needing a longer critical section must pass an explicit timeout.
- `ChatwootApp.otel_enabled?` and `OpentelemetryConfig` are hard-gated to the Langfuse provider specifically (`OTEL_PROVIDER == 'langfuse'`) — this is not a generic OpenTelemetry toggle despite the generic-sounding name.

## Related

- [[lib-integrations]] — third-party bot/AI/webhook protocol adapters under `lib/integrations/`, excluded from this page
- [[captain-ai]] — Captain domain services built on `lib/llm/` and `lib/captain/`
- [[events-listeners]] — dispatcher/listener system consuming `Events::Types`
- [[webhook-routing]] — outbound webhook delivery built on `Webhooks::Trigger`
- [[jobs]] — Sidekiq jobs that rely on `Redis::LockManager`/`Redis::Alfred` for coordination
- [[assignment]] — round-robin/assignment code using `Redis::RedisKeys` assignment keys
- [[authorization-policies]] — reads `Current` context for authorization decisions
- [[api-v1-controllers]] — consumes `CustomExceptions::*` for error responses
- [[data-import]] — uses `CustomExceptions::DataImport::FreshdeskTicketLimitError`
- [[whatsapp]] — consumes `RegexHelper`'s WhatsApp BSUID/WAMID patterns
- [[messages-services]] — uses `SafeFetch` and `ChatwootMarkdownRenderer`
- [[help-center-models]] — uses `CustomMarkdownRenderer` for article rendering
- [[models-services]] / [[controllers-jobs-listeners]] — Enterprise-side `prepend_mod_with` extension points for `ChatwootApp`-gated classes
