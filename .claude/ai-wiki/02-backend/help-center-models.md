---
title: "Help Center Data Models"
tags: [chatwoot, backend, help-center, models, portal]
generated: 2026-08-17
deepwiki_section: "Help Center and Knowledge Base"
---

# Help Center Data Models

## Purpose
This is the data layer for Chatwoot's Help Center (self-service knowledge base) feature: the `Portal` (a branded help site with one or more locales), its `Category`/`Folder` taxonomy, and the `Article` records that make up the actual content. These four models (plus the closely related `Folder`) define how a help center is structured, localized, positioned/ordered, and searched. They are pure ActiveRecord models — the dashboard CRUD UI, the public-facing portal rendering, and the search API all sit on top of them but live elsewhere.

## Key Files & Classes
- `app/models/portal.rb` — the help center site itself: locales, custom domain, SSL settings, branding (color/logo), analytics snippets (GA4/GTM/Hotjar/Plausible/Amplitude/Clarity/Meta Pixel), and "popular content" (recommended categories/articles per locale).
- `app/models/category.rb` — a topic grouping within a portal, locale-scoped, supports parent/sub-category nesting and cross-portal "related categories" and locale-linked "associated categories".
- `app/models/article.rb` — a single help article: title/description/content, draft vs published state, position within its category, view counter, full-text search, and cross-locale linking via `associated_article_id`.
- `app/models/folder.rb` — a lightweight sub-grouping of articles within a category (`belongs_to :category`, `has_many :articles`).
- `app/models/related_category.rb` — the join model backing `Category#related_categories` (a self-referential many-to-many on `Category`, used for "related topics" style cross-linking).
- `app/models/concerns/portal_config_schema.rb` — the `Portal#config` JSON-schema (`CONFIG_PARAMS_SCHEMA`) defining every allowed key: `allowed_locales`, `default_locale`, `draft_locales`, `layout`, `social_profiles`, `locale_translations`, `popular_content`, `analytics`. Enforced via `JsonSchemaValidator`.
- `app/models/concerns/llm_formattable.rb` — tiny concern (`to_llm_text`) that `Article` includes so it can be rendered as LLM-ready text (used by Captain).
- `enterprise/app/models/enterprise/concerns/article.rb` — Enterprise overlay on `Article` (via `Article.include_mod_with('Concerns::Article')`): adds `article_embeddings`, `vector_search`, and generates/stores embeddings on title/description/content change (gated by the `help_center_embedding_search` account feature flag).
- `enterprise/app/models/enterprise/concerns/portal.rb` — Enterprise overlay on `Portal`: on Chatwoot Cloud, enqueues `Enterprise::CloudflareVerificationJob` whenever `custom_domain` changes (drives the custom-domain SSL flow).
- `enterprise/app/models/article_embedding.rb` — pgvector-backed embedding row per search term, `belongs_to :article`, uses `has_neighbors` (neighbor gem) for cosine similarity search.

## How It Fits Together
- **Account scoping**: `Portal`, `Category`, and `Article` all `belongs_to :account` and are exposed from `Account` via `has_many :portals/:categories/:articles` (see `app/models/account.rb`). This vault's [[data-model]] and [[models]] pages cover the account-scoping convention generally.
- **Public rendering**: The public-facing portal site (`Public::Api::V1::Portals*` controllers, not covered here) and dashboard UI read/write these models. The Vue-side portal editor/CSAT-survey/super-admin frontend code is documented in [[portal-survey-superadmin]].
- **Search**: `Article` uses `PgSearch::Model` (`pg_search_scope :text_search`, weighted A/B/C across title/description/content, `tsearch` with prefix + normalization) for the OSS full-text search path. The Enterprise `vector_search` class method (in the `Concerns::Article` overlay) adds embedding-based semantic search on top, calling into `Captain::Llm::EmbeddingService` — see [[captain-ai]] for the Captain/LLM layer.
- **Attachments**: `Portal` uses `has_one_attached :logo` — see [[attachments-storage]] for the general Active Storage conventions this follows.
- **Enterprise overlay pattern**: both `Article` and `Portal` are extended via `include_mod_with('Concerns::Article' / 'Concerns::Portal')` rather than being forked — the canonical Chatwoot enterprise-extension pattern also described in [[models-services]].
- **Jobs**: article embedding indexing is dispatched via `Portal::ArticleIndexingJob.perform_later(self)` and embedding updates via `Captain::Llm::UpdateEmbeddingJob` — both are Sidekiq jobs, see [[jobs]].
- **Custom domain / SSL**: `Portal#custom_domain` changes trigger `Enterprise::CloudflareVerificationJob`, tying this model into Chatwoot Cloud's Cloudflare-backed custom-domain SSL provisioning (see Product Behavior below).

## Product Behavior
This directory backs several documented Help Center product features:
- **"How to set up a Help Center?"** — portal name/slug/branding/locales, category/article authoring, and the `layout` config (`classic` vs `documentation`, enforced by `PortalConfigSchema`) all map directly to fields on `Portal`.
- **Custom domain SSL for Help Center** — `Portal#custom_domain` + `ssl_settings` (jsonb) plus the Enterprise `enqueue_cloudflare_verification` callback implement the custom-domain-with-SSL flow described in the user guide.
- **Recommend categories and articles** — `Portal#popular_category_ids` / `popular_article_ids` (backed by `config['popular_content'][locale]`, capped at `POPULAR_CATEGORY_LIMIT = 3` and `POPULAR_ARTICLE_LIMIT = 6`) implement the "recommended categories and articles" feature, per locale.
- **Draft/publish workflow and locales**: `Article#status` enum (`draft`/`published`/`archived`), `draft_content`/`draft_title` columns, and `Portal#draft_locale_codes`/`draft_locale?` implement per-locale draft publishing (a locale can be fully in draft while others are public).
- **Multi-locale content**: `Category#locale` (uniqueness scoped to `slug` + `portal_id`) and `Article#locale` plus the `associated_category_id`/`associated_article_id` self-references implement "linked translations" — one canonical piece of content with per-locale variants pointing back to a root record via `find_root_article_id`.

## Notes for AI Agents
- **Position/ordering is manually rebalanced, not a gem**: `Article.update_positions` / `Category.update_positions` take a `positions_hash` from drag-and-drop reordering in the dashboard. `Article` additionally has `rebalance_positions`/`resequence_category` (private class methods) that re-space positions in increments of 10 after a move, to avoid float/decimal position drift. Don't assume `acts_as_list` or similar — this is hand-rolled.
- **Slug collisions are actively guarded**: `Article::RESERVED_SLUGS = %w[search articles categories]` — these are excluded via a model validation because they'd collide with public Help Center routes like `/hc/:slug/:locale/search`.
- **`account_id` is derived, not set directly**: both `Article#ensure_account_id` and `Category#ensure_account_id` set `account_id` from `portal&.account_id` in a `before_validation` — don't expect callers to pass `account_id` explicitly.
- **Locale is inherited from category when present**: `Article#ensure_locale_in_article` sets the article's locale from its category's locale if a category is assigned, otherwise from the article's own value or the portal default. Reassigning an article's category can silently change its locale.
- **`Portal#config` normalization runs on every save**: `normalize_config` (before_validation) merges the DB-persisted config with any new keys and always recomputes `allowed_locales`, `default_locale`, and `draft_locales` — so partial config updates (e.g. just updating `social_profiles`) won't accidentally drop other keys, but also means those three derived keys can't be "unset" independently of their computing logic.
- **`Portal#color` and `#display_title` have fallback logic in the reader, not the DB default alone**: `color` falls back to `DEFAULT_COLOR` (`#1f93ff`) when the column is blank; `display_title`/`localized_value` walk `config['locale_translations'][locale]` → the default locale's translation → the base column, in that order.
- **Two independent self-referential associations on `Category`**: `parent_category`/`sub_categories` (real hierarchy, one level deep in practice) is distinct from `root_category`/`associated_categories` (used for cross-locale linking, not hierarchy) and from `related_categories` (via the `RelatedCategory` join model, for "related topics" — not hierarchical at all). Don't conflate the three.
- **`RelatedCategory` has a bidirectional unique index** (`category_id, related_category_id` and its mirror) but the model itself does no auto-symmetric-insert — check calling code (e.g. `accepts_nested_attributes_for :related_categories` on `Category`) if you need both directions populated.
- **Enterprise embedding generation is feature-flag gated per account**: `add_article_embedding` (Enterprise `Article` concern) checks `account.feature_enabled?('help_center_embedding_search')` before enqueuing `Portal::ArticleIndexingJob` — OSS-only accounts never get embeddings even though the association/columns exist if the enterprise module is loaded.
- **`RESERVED_SLUGS` and category/article slug uniqueness constraints exist at both the model and DB level** (`index_articles_on_slug` unique, `index_categories_on_slug_and_locale_and_portal_id` unique) — don't add a second uniqueness check further downstream.

## Related
- [[portal-survey-superadmin]] — the dashboard/portal-editor and public portal rendering frontend that consumes these models
- [[data-model]] — general database schema/data-model conventions this subsystem follows
- [[models]] — sibling core Rails models overview
- [[models-services]] — Enterprise model/service overlay pattern (`include_mod_with`) used by `Article` and `Portal`
- [[captain-ai]] — Captain/LLM layer that Article's `LlmFormattable` concern and Enterprise embedding search feed into
- [[attachments-storage]] — Active Storage conventions behind `Portal#logo`
- [[jobs]] — background jobs (`Portal::ArticleIndexingJob`, `Captain::Llm::UpdateEmbeddingJob`) triggered by these models
