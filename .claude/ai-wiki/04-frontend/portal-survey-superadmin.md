---
title: "Help Center Portal, CSAT Survey App, Super Admin"
tags: [chatwoot, frontend, help-center, csat, super-admin, vue3]
generated: 2026-08-17
deepwiki_section: "Help Center and Knowledge Base"
---

# Help Center Portal, CSAT Survey App, Super Admin

## Purpose
This page covers three small, independent Vue entrypoints that live outside the main dashboard SPA — each server-rendered by Rails and hydrated with a thin Vue layer:

- `app/javascript/portal` — the public-facing Help Center ("portal") site. It is a server-rendered (Turbo + ERB) documentation site; Vue only mounts small interactive "islands" (search box, table of contents, theme toggle) into an otherwise static page.
- `app/javascript/survey` — a standalone one-page Vue SPA that renders the public CSAT (customer satisfaction) survey a contact lands on after clicking a rating link/email.
- `app/javascript/superadmin_pages` — Vue components mounted inside the Rails Administrate-based Super Admin panel (instance-operator admin), currently a stats dashboard and an apparently-orphaned "playground" chat UI.

None of these are part of the agent-facing dashboard SPA (`app/javascript/dashboard`); each is its own Vite entrypoint mounted into a different Rails-rendered page.

## Key Files & Classes

**Portal (Help Center)**
- `app/javascript/entrypoints/portal.js` — entrypoint; starts Rails UJS + Turbo and wires `InitializationHelpers.onLoad` on `turbo:load`.
- `app/javascript/portal/portalHelpers.js` — `InitializationHelpers` object: mounts the search widget, table-of-contents widget, and sidebar theme toggle as separate small Vue apps into specific DOM ids (`#search-wrap`, `#cw-hc-toc`, `#sidebar-theme-toggle`); also handles external-link `target=_blank` rewriting, RTL `dir` attribute detection via `getLanguageDirection`, and a "plain layout" mode (`isPlainLayoutEnabled`) used for embedding the portal inside an iframe/widget.
- `app/javascript/portal/portalThemeHelper.js` — light/dark/system theme switching (`switchTheme`, `initializeTheme`), persisted to `localStorage.theme`, plus dynamic hover-color calculation via `adjustColorForContrast` (from `shared/helpers/colorHelper.js`) so the portal's brand color stays readable against the resolved background.
- `app/javascript/portal/api/article.js` — `ArticlesAPI.searchArticles(portalSlug, locale, query)`, a thin axios wrapper hitting `/hc/:portalSlug/:locale/articles.json?query=...`.
- `app/javascript/portal/components/PublicArticleSearch.vue` — the search box: debounces input (1s), fetches results, supports Cmd/Ctrl+K focus and Escape-to-close, and can either show an inline dropdown (`SearchSuggestions.vue`) or submit to a full `/hc/:portal/:locale/search` results page.
- `app/javascript/portal/components/SearchSuggestions.vue`, `PublicSearchInput.vue`, `TableOfContents.vue`, `SidebarThemeToggle.vue` — supporting presentational/interactive pieces for the above.
- `app/views/layouts/_portal_scripts.html.erb` — the Rails side that seeds `window.portalConfig` (portal slug, color, custom domain, locale, i18n strings for search, plain-layout flag) that all of the above JS reads.
- `app/views/layouts/portal.html.erb`, `portal.html+documentation.erb`, `portal.html+plain.erb` — Rails layout variants; `+plain` is the iframe-embeddable stripped-down layout.
- `app/views/public/api/v1/portals/documentation_layout/*.erb` — the actual server-rendered HTML partials (hero, sidebar, article/category cards, breadcrumbs) that the portal JS enhances.

**CSAT Survey app**
- `app/javascript/entrypoints/survey.js` — entrypoint; mounts `survey/App.vue` at `#app` on `window.onload`, sets up `vue-i18n` (default locale `en`) and a Vuex store.
- `app/javascript/survey/App.vue` — trivial shell rendering `<Response />`.
- `app/javascript/survey/views/Response.vue` — the whole survey UI: fetches survey details on mount, shows emoji-rating or star-rating (`CSAT_DISPLAY_TYPES` from `shared/constants/messages`), a feedback textarea, and a success/error `Banner`. Uses `shared/components/Branding.vue`, `shared/components/StarRating.vue`, and `useMessageFormatter` from the shared composables (same formatter used in the dashboard message pipeline).
- `app/javascript/survey/api/survey.js` + `api/endPoints.js` — `getSurveyDetails`/`updateSurvey` hitting `/public/api/v1/csat_survey/:uuid` (the `:uuid` is the **conversation UUID**, read off the URL's last path segment in `Response.vue`, not a dedicated survey-response id).
- `app/javascript/survey/helpers/axios.js` — the `API` axios instance used by the above.
- `app/javascript/survey/store/index.js` — Vuex store with only the shared `globalConfig` module (installation name/branding config for `useBranding`/`Branding.vue`).
- `app/javascript/survey/i18n/` — full set of ~65 locale JSON files for survey-only strings.
- `app/controllers/public/api/v1/csat_survey_controller.rb` — backend: `set_conversation` (by `uuid`) → `set_message` (the conversation's `input_csat` message) → `show`/`update`. `update` is blocked with a 422 once the CSAT message is more than 14 days old (`check_csat_locked`). Permits `rating` and `feedback_message` under `submitted_values.csat_survey_response`.
- `app/views/public/api/v1/csat_survey/show.json.jbuilder` → `app/views/public/api/v1/models/_csat_survey.json.jbuilder` — serializes `inbox_avatar_url`, `inbox_name`, `display_type`, `content`, `locale`, and the nested `csat_survey_response`.

**Super Admin pages**
- `app/javascript/entrypoints/superadmin_pages.js` — generic Vue-component-by-name mounter: reads `#app`'s `data-component-name`/`data-props` attributes and renders the matching entry from a small `ComponentMapping` (`PlaygroundIndex`, `DashboardIndex`).
- `app/controllers/super_admin/application_controller.rb` — `render_vue_component(component_name, props)` helper that all Administrate-based Super Admin controllers can call to emit the `#app` mount div (this is the Rails-side counterpart of the mapping above).
- `app/javascript/superadmin_pages/views/dashboard/Index.vue` — the Super Admin home dashboard: fetches `window.location.pathname` as JSON (same URL, `Accept: application/json`) for instance-wide stats and renders them with `shared/components/charts/BarChart.vue`.
- `app/controllers/super_admin/dashboard_controller.rb` — backend for the above: `respond_to` html/json on `#index`; `dashboard_stats` is cached instance-wide for 30 minutes (`Rails.cache.fetch('super_admin:dashboard_stats', ...)`) and includes a `pg_class.reltuples` estimate for `conversationsCount` instead of an exact `COUNT(*)` (falls back to `Conversation.count` only if `reltuples` is negative, i.e. table never vacuumed).
- `app/javascript/superadmin_pages/views/playground/Index.vue` + `components/playground/{Header,UserMessage,BotMessage,TypingIndicator}.vue` — a chat-style "playground" UI that POSTs the typed message and prior turns to `window.location.href` and expects `{ message }` back. **No Super Admin controller in this repo currently renders `PlaygroundIndex`** (see Notes for AI Agents) — the header's hardcoded copy ("Robin AI playground", "Chat with the source ... and evaluate it's efficiency") suggests this predates the current Captain-branded assistant playground, which lives entirely in the account-level dashboard/enterprise stack instead.
- `app/javascript/entrypoints/superadmin.js` — a separate, non-Vue entrypoint (plain DOM JS) for the Super Admin account-suspension form; unrelated to `superadmin_pages` but loaded on the same Administrate views.

## How It Fits Together
- **Portal**: driven by `app/controllers/public/api/v1/portals_controller.rb` and related public controllers (article/category rendering), which set `@portal`, `@article`, `@locale`, `@theme_from_params` etc. consumed by the ERB layouts. The portal itself is a `Portal`/`HelpCenter` set of models (see [[models]]) with categories/articles; JS here never touches those models directly, only the rendered HTML + the `articles.json` search endpoint. `portalConfig.hostURL`/`customDomain` are used by `isSameHost` (from `@chatwoot/utils`) to decide whether a link should open in a new tab. If the portal's inbox has a web widget attached, `_portal_scripts.html.erb` also injects the [[widget-sdk]] loader script and sets `window.chatwootSettings.locale`.
- **CSAT Survey**: the `input_csat` message is created as part of the conversation resolution flow in the main Rails app (message/conversation services — see [[messages-services]] and [[conversations-services]]); this survey app is purely the public-facing rating page reached via the CSAT link in outbound notifications ([[notifications]]). Submitting a rating here is what account-side CSAT reports ([[reports]]) later aggregate — the `_csat_survey_response.json.jbuilder` partial and `Api::V1::Accounts::CsatSurveyResponses` controller (agent-facing) read the same underlying data this public endpoint writes.
- **Super Admin**: `superadmin_pages` mounts into the Rails **Administrate** admin panel used by Chatwoot instance operators (not account users) — see `app/controllers/super_admin/*` for the surrounding CRUD (accounts, users, agent bots, access tokens, installation configs, platform banners). This is entirely separate from the account-level [[authorization-policies]]/Pundit system; access is gated by Devise's `authenticate_super_admin!`.
- All three packs pull shared code from the main frontend tree despite being separate Vite entrypoints: `shared/helpers/HTMLSanitizer`, `shared/helpers/colorHelper`, `shared/components/{Branding,Spinner,StarRating,charts/BarChart}.vue`, `shared/composables/useMessageFormatter`, `shared/constants/messages`, and even `dashboard/composables/useKeyboardNavigableList` and `dashboard/components/widgets/conversation/advancedFilterItems/languages.js` — see [[shared-design-system]] and [[composables-mixins-helpers]].

## Product Behavior
- **Help Center setup** (official guide topic "Help Center"): admins configure portal slug, color/branding, custom domain + SSL, and locales from the agent-facing dashboard; the `portal/` JS here is what renders the resulting public site end-users see, including the search-as-you-type box and the light/dark/system appearance toggle. The "plain layout" mode (`isPlainLayoutEnabled`) corresponds to the "embedding help center articles in widget" How-To — a stripped page meant to be embedded, without the theme toggle/nav chrome.
- **CSAT surveys** (official guide topic "CSAT surveys" / "CSAT review notes"): this survey app is the customer-facing side of that feature — the emoji or star rating UI, the optional feedback message, and the 14-day edit lock described operationally as "you can't submit CSAT after 14 days." The `display_type` field returned by the API (emoji vs star) matches the CSAT display-type setting configurable per inbox/account.
- **Enterprise Edition super admin**: the Super Admin dashboard here is the instance-operator's landing page (accounts/users/inboxes/conversations counts, 30-day conversation chart) — this is the self-hosted/instance-admin surface referenced generically in the "Enterprise Edition" and "Enterprise" super-admin guide topics, distinct from any single account's settings.

## Notes for AI Agents
- The `superadmin_pages/views/playground/Index.vue` chat UI appears to be **orphaned**: grepping the whole repo (`app/`, `enterprise/`) for `PlaygroundIndex` and `render_vue_component('Playground...` finds no controller that renders it, unlike `DashboardIndex` which is wired from `app/views/super_admin/dashboard/index.html.erb`. Do not assume it is reachable in production without first confirming a route/controller was added elsewhere. The real, current AI-assistant playground feature lives in the account-level Captain stack (`enterprise/app/controllers/api/v1/accounts/captain/assistants_controller.rb#playground`), which is unrelated to this file despite the similar name.
- The `survey` app's "id" is the **conversation UUID**, not a CSAT-response-specific id — `Response.vue` parses it off the trailing URL segment, and the backend controller resolves it via `Conversation.find_by!(uuid: ...)` then grabs the conversation's `input_csat` message. Don't confuse this with `message.id` or a dedicated survey-token model.
- `portal/` is **not** a Vue Router SPA — it is server-rendered Turbo/ERB pages with several independently-mounted Vue "islands" per page (search, TOC, theme toggle each get their own `createApp(...).mount(...)` call in `portalHelpers.js`). Adding new interactive portal UI means adding another small mount point + `InitializationHelpers` entry, not a new route.
- `window.portalConfig` (set server-side in `_portal_scripts.html.erb`) is the single source of truth the portal JS reads for slug/locale/theme/i18n strings — if you add a new portal-JS feature that needs config, it goes through this global, matching the existing pattern (there's no Pinia/Vuex store in this pack).
- Theme handling in the portal is deliberately independent of the dashboard's theme system: it writes `dark`/`light` classes directly on `document.documentElement`, persists to `localStorage.theme` (or removes the key entirely for `'system'`), and recomputes a CSS custom property (`--dynamic-hover-color`) via `adjustColorForContrast` — don't assume the dashboard's theme composables apply here.
- `super_admin/dashboard_controller.rb`'s use of `pg_class.reltuples` instead of `Conversation.count` is intentional (comment: "Exact COUNT(*) scans the whole table; the planner estimate is instant") — an approximate count on a large `conversations` table. Don't replace it with an exact count without checking why it was avoided.
- The survey and portal packs each ship their own full i18n locale set independent of the dashboard's `app/javascript/dashboard/i18n` — when adding survey-specific strings, they go in `app/javascript/survey/i18n/locale/en.json` (and are then synced to other locales via Crowdin like everywhere else), not the dashboard's i18n files.

## Related
- [[widget-sdk]] — the web widget script the portal layout injects when the portal's inbox has a `channel_web_widget`.
- [[shared-design-system]] — shared components/composables (`Branding`, `StarRating`, `BarChart`, `useMessageFormatter`, `colorHelper`) reused by all three packs.
- [[messages-services]] / [[conversations-services]] — where the `input_csat` message that the survey app reads/writes is created.
- [[notifications]] — how the CSAT survey link reaches the end customer.
- [[reports]] — CSAT reporting on the agent-facing side, built from the same survey-response data.
- [[authorization-policies]] — contrasts with Super Admin's separate Devise-based `authenticate_super_admin!` gate.
- [[api-v1-controllers]] / [[public-platform-api]] — sibling controller layers (`Public::Api::V1::CsatSurveyController`, `Public::Api::V1::PortalsController`) that back these frontends.
