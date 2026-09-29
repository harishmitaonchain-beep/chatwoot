---
title: "Captain AI / LLM Formatter"
tags: [chatwoot, backend, captain, llm, ai-config]
generated: 2026-08-17
deepwiki_section: "AI and Automation"
---

# Captain AI / LLM Formatter

## Purpose

This page covers a narrow but foundational slice of Chatwoot's Captain AI system: the **`LlmFormatter` service objects** that serialize domain records (conversations, contacts, articles) into plain-text blocks suitable for an LLM prompt, plus the **static configuration** that drives model/feature selection across Captain (`config/llm.yml`), the vendored model registry consumed by the `ruby_llm` gem (`config/llm_models.json`), and the declarative registry of built-in Captain agent tools (`config/agents/tools.yml`).

The bulk of Captain's actual AI logic (assistants, copilot, FAQ generation, embeddings, prompts) lives under `enterprise/app/services/captain/` and is out of scope here except where it directly consumes these four paths — that logic belongs to the enterprise services page (see Related).

## Key Files & Classes

**LLM text formatters** (`app/services/llm_formatter/`, OSS, plain Ruby service objects — no ActiveJob/ActiveRecord):
- `app/services/llm_formatter/llm_text_formatter_service.rb` — entry point. Given any record, resolves `LlmFormatter::#{record.class.name}LlmFormatter` via `safe_constantize` and delegates `#format(config)` to it.
- `app/services/llm_formatter/default_llm_formatter.rb` — base class with a no-op `#format(*)`; `ConversationLlmFormatter` and `ContactLlmFormatter` subclass it.
- `app/services/llm_formatter/conversation_llm_formatter.rb` — renders conversation ID, channel name, ordered message history (skips `activity`/`template` messages, sender labeled `Support Agent`/`User`/`Bot`, `[Private Note]` prefix), optional contact details, and custom conversation attributes. Supports `config[:token_limit]` (actually a **character** budget, not a token count — see Notes) to select only the most recent messages that fit, and `config[:include_private_messages]` / `config[:include_contact_details]` toggles.
- `app/services/llm_formatter/contact_llm_formatter.rb` — renders contact ID, name/email/phone/location/country code, custom contact attributes, and all contact notes.
- `app/services/llm_formatter/article_llm_formatter.rb` — renders Help Center article title, ID, status, category, author, views, timestamps, and content. **Does not** inherit from `DefaultLlmFormatter` (the other two do) — a structural inconsistency, not a functional bug, since `LlmTextFormatterService` only calls `#format`.
- `app/models/concerns/llm_formattable.rb` — the `LlmFormattable` concern; `#to_llm_text(config = {})` is the public API mixed into models, delegating to `LlmTextFormatterService`. Included by `Article`, `Contact`, and `Conversation` (`app/models/article.rb`, `app/models/contact.rb`, `app/models/conversation.rb`).

**Model/feature configuration:**
- `config/llm.yml` — Chatwoot-owned YAML: `providers` (openai/anthropic/gemini display names), `models` (per-model `provider`, `display_name`, `credit_multiplier`, optional `coming_soon` flag), and `features` (one entry per Captain LLM feature — e.g. `assistant`, `copilot`, `editor`, `label_suggestion`, `document_faq_generation`, `conversation_faq_generation`, `conversation_faq_matching`, `pdf_faq_generation`, `help_center_article_generation`, `onboarding_content_generation`, `help_center_query_translation`, `audio_transcription`, `help_center_search`, plus an `internal: true` `conversation_completion` feature) — each listing its allowed `models` and a `default`.
- `lib/llm/models.rb` — `Llm::Models` loads and freezes `config/llm.yml` at class-load time (`YAML.load_file` into a `CONFIG` constant) and exposes typed accessors: `providers`, `models`, `features`, `feature_keys` (excludes internal features), `default_model_for`, `models_for`, `valid_model_for?`, `model_config`, `provider_for`, `feature_config`.
- `lib/llm/feature_router.rb` — `Llm::FeatureRouter.resolve(feature:, account:)` picks the actual model for a feature: account-level override (`account.captain_models[feature]`, skipped for internal features) → a hardcoded `CAPTAIN_V2_ASSISTANT_MODEL = 'gpt-5.2'` override when `feature == 'assistant'` and the account has the `captain_integration_v2` feature flag → `Llm::Models.default_model_for(feature)`. Raises `Llm::FeatureRouter::UnknownFeatureError` for a feature not present in `config/llm.yml`.
- `lib/llm/config.rb` — `Llm::Config.initialize!` configures the `ruby_llm` gem once per process: system-wide OpenAI key/endpoint from `InstallationConfig` (`CAPTAIN_OPEN_AI_API_KEY` / `CAPTAIN_OPEN_AI_ENDPOINT`), and points `config.model_registry_file` at `config/llm_models.json`. `.with_api_key` yields a scoped `RubyLLM.context` for BYO-key calls.
- `config/llm_models.json` — a ~1.4MB, 1253-entry JSON array vendored from `models.dev` via the `ruby_llm` gem's model registry (pricing, context window, modalities, capabilities per model across many providers, not just the three Chatwoot exposes). Not hand-edited.
- `lib/tasks/ruby_llm.rake` (`ruby_llm:refresh_models`) — regenerates `config/llm_models.json` by calling `RubyLLM.models.refresh!` / `save_to_json`; the task comment says to run it when new models are released and commit the file.

**Agent tools registry:**
- `config/agents/tools.yml` — declarative list of Captain agent tools (`add_contact_note`, `add_private_note`, `update_priority`, `add_label_to_conversation`, `faq_lookup`, `resolve_conversation`, `handoff`), each with `id`, `title`, `description`, `icon` for frontend display.
- `enterprise/app/models/concerns/captain_tools_helpers.rb` (`Concerns::CaptainToolsHelpers`) — `built_in_agent_tools` loads and caches `config/agents/tools.yml`, resolving each `id` to a `Captain::Tools::#{id.classify}Tool` class via `resolve_tool_class`; entries that don't resolve to a real class are dropped with a `Rails.logger.warn`, not raised.

## How It Fits Together

- **Models → formatters → prompts**: `Conversation`, `Contact`, and `Article` include `LlmFormattable`, so any caller can do `record.to_llm_text(config)`. The formatted text becomes the literal prompt content fed to `ruby_llm` chat calls. Confirmed call sites: `enterprise/app/services/captain/llm/contact_notes_service.rb` and `contact_attributes_service.rb` build `"#Contact\n\n#{contact.to_llm_text}\n\n#Conversation\n\n#{conversation.to_llm_text}"`; the Copilot tool services under `enterprise/app/services/captain/tools/copilot/` (`get_conversation_service.rb`, `get_contact_service.rb`, `get_article_service.rb`, `search_*_service.rb`) call `.to_llm_text` on the record(s) they return to the agent, e.g. `conversation.to_llm_text(include_private_messages: true)`.
- **`Message#content_for_llm`** (`app/models/message.rb`) is what `ConversationLlmFormatter#format_message` calls per message — it falls back to `"[Voice Message] <transcription>"` for audio attachments (reading `attachment.meta['transcribed_text']`) or `'[Attachment]'` when there's no text content. This is the seam between the [[messages-services]] world and Captain prompt-building.
- **`config/llm.yml` → `Llm::Models` → `Llm::FeatureRouter` → `CaptainFeaturable`**: `app/models/concerns/captain_featurable.rb` dynamically defines `captain_<feature>_enabled?` / `captain_<feature>_model` methods for every `Llm::Models.feature_keys` entry, and validates that any account-level `captain_models` override (`account.captain_models[feature] = model`) names a real feature/model pair from `config/llm.yml`. This concern is what backs the per-account model-override UI (`ModelDropdown.vue`, `dashboard/store/captain/preferences.js`) and the `credit_multiplier` shown there, and is consumed by `Api::V1::Accounts::Captain::PreferencesController`.
- **`enterprise/app/fields/captain_model_overrides_field.rb`** and `enterprise/app/services/captain/assistant/session_capture_service.rb` also read `Llm::Models`/`Llm::FeatureRouter`, tying the feature/model config into assistant sessions and super-admin-style field definitions.
- **`enterprise/app/services/llm/base_ai_service.rb`** (`Llm::BaseAiService`) is the base class most `Captain::Llm::*Service` objects (notes, attributes, FAQ generation, article writing, translation, embeddings) inherit from — it's the thing that actually calls `Llm::Config` / `Llm::FeatureRouter` / `ruby_llm` to run a chat completion, with `to_llm_text` output as the prompt body.
- **Tools registry**: `config/agents/tools.yml` is the source of truth for which built-in tools a Captain assistant/agent can be configured to use; `Concerns::CaptainToolsHelpers` resolves it against the real `Captain::Tools::*Tool` classes under `enterprise/app/services/captain/tools/`, and the tool metadata (title/description/icon) is what the assistant configuration UI shows.
- **AI credits**: `credit_multiplier` in `config/llm.yml` is the per-model cost weight surfaced to the frontend for the account's AI credit balance/usage — this file doesn't compute or debit credits itself, it only advertises the multiplier.

## Product Behavior

This module underpins several Captain features documented in the official user guide's **Captain** section:
- **Assistants / Copilot**: the `assistant` and `copilot` features in `config/llm.yml`, and the Copilot tool services that call `.to_llm_text` to hand an agent conversation/contact/article context to the LLM, are the backend for the Copilot side panel and Captain assistant chat described in the Copilot and assistants guide topics.
- **Memories / notes**: `Captain::Llm::ContactNotesService` and `contact_attributes_service.rb` (which build prompts from `contact.to_llm_text` + `conversation.to_llm_text`) back the auto-generated contact notes/memories feature.
- **FAQs / Documents**: `document_faq_generation`, `conversation_faq_generation`, `conversation_faq_matching`, and `pdf_faq_generation` features in `config/llm.yml`, feeding `enterprise/app/services/captain/llm/*faq*` and `pdf_processing_service.rb`, back the Documents and FAQs guide topics.
- **AI credits**: the per-model `credit_multiplier` values in `config/llm.yml` are what the AI credits guide topic's cost-per-model framing corresponds to on the backend.
- **Custom tools**: `config/agents/tools.yml` lists Chatwoot's *built-in* tools; the custom tools guide topic (account-defined tools) is a separate mechanism not covered by this file — this page only covers the built-in registry.

## Notes for AI Agents

- **`FormatterNotFoundError` is never defined anywhere in the codebase.** `LlmTextFormatterService#find_formatter` raises `FormatterNotFoundError` (bare constant, no namespace) if `safe_constantize` fails, but no class/module named `FormatterNotFoundError` exists under `app/` or `enterprise/`. Calling `.to_llm_text` on a model with no matching `LlmFormatter::<Class>LlmFormatter` will raise a plain `NameError: uninitialized constant LlmFormatter::LlmTextFormatterService::FormatterNotFoundError` instead of the intended custom exception — don't assume this error class exists if you're about to `rescue` it.
- **`config[:token_limit]` in `ConversationLlmFormatter` is a character count, not a token count.** `build_limited_messages` compares `character_count + formatted.length > config[:token_limit]` — no tokenizer is involved. Naming this an actual token budget elsewhere in the codebase would overestimate how many messages fit.
- **`ArticleLlmFormatter` doesn't subclass `DefaultLlmFormatter`** the way `ConversationLlmFormatter`/`ContactLlmFormatter` do — harmless today since `LlmTextFormatterService` only needs `#format`, but don't assume a shared base-class contract if you add behavior there.
- **`config/llm_models.json` is a generated/vendored file** (`ruby_llm:refresh_models` rake task, sourced from `models.dev`) — don't hand-edit it; it's ~1.4MB and covers far more providers/models than Chatwoot actually exposes. The models Chatwoot actually offers per feature live in `config/llm.yml`, not this file.
- **Two separate model catalogs exist and must stay in sync manually**: `config/llm.yml` (Chatwoot's curated, feature-gated model list with credit multipliers) vs `config/llm_models.json` (the full `ruby_llm` registry used for pricing/capability lookups). A model can appear in one without the other; `Llm::Models` only ever reads `config/llm.yml`.
- **`Llm::FeatureRouter.resolve` has a specific precedence order** for the `assistant` feature: the account's own `captain_models['assistant']` override wins first if set and valid; only if there's no override does the hardcoded `CAPTAIN_V2_ASSISTANT_MODEL = 'gpt-5.2'` kick in (gated on the `captain_integration_v2` account feature flag); the `config/llm.yml` `default` is the final fallback. Don't assume `gpt-5.2` always applies for v2 accounts — a user-set override still beats it.
- **`Concerns::CaptainToolsHelpers.load_agent_tools` silently drops unresolvable tools** — if a `config/agents/tools.yml` entry's `id` doesn't map to a real `Captain::Tools::<Id>Tool` class (typo, class not yet written, wrong `classify` casing), it's filtered out with only a `Rails.logger.warn`, no exception. A tool can be listed in the YAML and simply never show up anywhere with no hard failure to signal why.
- **`LlmFormattable` is only mixed into `Article`, `Contact`, and `Conversation`** — no other model currently has `.to_llm_text`. Adding a new formatter requires both a `LlmFormatter::<ModelName>LlmFormatter` class and `include LlmFormattable` on the model.

## Related

- [[models-services]] — enterprise `Captain::Llm::*Service`, `Captain::Tools::*`, `Captain::Copilot::*` objects that actually consume `to_llm_text` output and `Llm::FeatureRouter`/`Llm::Config`.
- [[conversations-services]] — `Conversation` model and services that `ConversationLlmFormatter` reads from.
- [[messages-services]] — `Message#content_for_llm`, the per-message text/transcription/attachment fallback consumed by `ConversationLlmFormatter`.
- [[contacts-services]] — `Contact` model, notes, and custom attributes rendered by `ContactLlmFormatter`.
- [[controllers-jobs-listeners]] — enterprise controllers/fields (e.g. `captain_model_overrides_field.rb`) that expose this config to the API/UI.
- [[api-v1-controllers]] — `Api::V1::Accounts::Captain::PreferencesController`, which surfaces `Llm::Models`-driven feature/model preferences.
- [[integrations]] — OpenAI integration and other third-party AI/LLM touchpoints.
