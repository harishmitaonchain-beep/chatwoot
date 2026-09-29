---
title: "Shared Code & Design System"
tags: [chatwoot, frontend, vue3, cross-app, design-tokens, i18n]
generated: 2026-08-17
deepwiki_section: "Frontend Application (build system, app structure, Vuex state, conversation list/view, composer/rich text, contacts UI, inbox mgmt UI, settings UI, reports UI)"
---

# Shared Code & Design System

## Purpose

`app/javascript/shared/` is the one JS/Vue package that every frontend bundle in the repo can import from — dashboard, widget, portal, survey, superadmin_pages, and v3 all resolve the `shared` and `helpers` Vite aliases to it. It holds cross-app primitives that don't belong to any single SPA: markdown/message formatting, the ActionCable base connector, HTML sanitizer config, fonts, a small emoji picker, a Fluent-icon renderer, phone/validator helpers, and a `globalConfig` Vuex module that reads `window.globalConfig` (the server-injected branding/feature payload).

`app/javascript/design-system/` is **not** a component library — it is almost empty (just logo images, a `histoire.scss`, and a stray `.DS_Store`). It exists solely to theme Histoire, the component-playground tool (`pnpm story:dev`), whose config (`histoire.config.ts`) points at these images/styles for its own branding. The actual component stories (`*.story.vue`) live inside `dashboard/components-next/` and `widget/components/`, not here — so this directory is effectively a legacy/vestigial location, not where the real design system lives today (see [[components-next]] for that).

`app/javascript/v3/` is a small standalone Vue app (its own entrypoint, router, and Vuex store) that serves the pre-login/auth surface: login, SSO/SAML login, signup, email confirmation, password reset/edit, and onboarding. It is built and mounted independently of the main dashboard SPA but still imports dashboard code directly (`dashboard/helper/URLHelper`, `dashboard/i18n`, etc.) via the `dashboard` Vite alias, so it isn't fully isolated from the dashboard package.

## Key Files & Classes

**`shared/` — cross-app primitives**
- `app/javascript/shared/helpers/MessageFormatter.js` — the markdown-it-based renderer used to turn message `content` into HTML across dashboard and widget; configures `markdown-it-link-attributes`, a custom mention plugin, an image-resize plugin driven by `cw_image_width`/`cw_image_height` query params, and Twitter `@mention`/`#hashtag` linkification for tweet messages. Also strips the Help Center editor's internal `<!--cw-colwidths:...-->` table-width marker before rendering.
- `app/javascript/shared/composables/useMessageFormatter.js` — Composition API wrapper around `MessageFormatter` (`formatMessage`, `getPlainText`, `truncateMessage`, `highlightContent`).
- `app/javascript/shared/helpers/BaseActionCableConnector.js` — base class wrapping `@rails/actioncable`'s `createConsumer`, subscribing to `RoomChannel` with a presence heartbeat (20s) and a 1s-interval reconnect watchdog; dashboard's real-time connector extends this.
- `app/javascript/shared/helpers/HTMLSanitizer.js` — `escapeHtml` plus the shared `domPurifyConfig` (forces `target="_blank"` on sanitized links via a DOMPurify hook); wired into `vue-dompurify-html` globally in the dashboard, widget, and survey entrypoints.
- `app/javascript/shared/store/globalConfig.js` — Vuex module reading `window.globalConfig` (installation name/logo, enterprise flag, feature toggles like `DISABLE_META_INBOX_CREATION`/`DISABLE_META_MESSAGE_SENDING`, `ACTIVE_PLATFORM_BANNERS`, upload size limits, etc.) into reactive state; exposes getters like `isOnChatwootCloud`, `isACustomBrandedInstance`, `isMetaInboxCreationDisabled`.
- `app/javascript/shared/composables/useBranding.js` — `replaceInstallationName(text)`, a case-insensitive regex replace of the literal word "Chatwoot" with `globalConfig.installationName`, for white-labeling user-facing strings (see CLAUDE.md's branding note).
- `app/javascript/shared/composables/useLocale.js` — resolves the active `vue-i18n` locale into a valid BCP 47 tag for `Intl` APIs (normalizes `pt_BR`→`pt-BR`, falls back specific→base→`en` using `Intl.NumberFormat.supportedLocalesOf`).
- `app/javascript/shared/composables/useNumberFormatter.js` — `formatCompactNumber` (999 → "999", 1500 → "1k+", 1.2M → "1.2M") and `formatFullNumber`, both built on `useLocale` + `Intl.NumberFormat`.
- `app/javascript/shared/composables/useExpandableContent.js` — generic "Read more/Read less" overflow-detection composable (line-height × maxLines vs `scrollHeight`), optionally reactive via `useResizeObserver` from `@vueuse/core`.
- `app/javascript/shared/composables/useFilter.js` — despite living in `shared/`, this one is dashboard-only in practice: it imports `dashboard/composables/store`, `dashboard/components/widgets/conversation/advancedFilterItems`, and `dashboard/routes/dashboard/contacts/contactFilterItems` to build the conversation/contact custom-attribute filter UI's attribute groups and operator types.
- `app/javascript/shared/mixins/inboxMixin.js` — the single source of truth (`INBOX_FEATURE_MAP`) for which inbox types support which conversation features (`replyTo`, `replyToOutgoing`), plus a large set of Options API computed properties (`isAWhatsAppChannel`, `isAFacebookInbox`, `isATwilioSMSChannel`, `inboxBadge`, etc.) reused by both dashboard and widget-facing inbox UI.
- `app/javascript/shared/components/FluentIcon/Icon.vue` + `Index.vue` + `DashboardIcon.vue` — the Fluent-icon SVG renderer; looks up `${icon}-${type}` path data from `icons.json` (widget-facing) or `dashboard-icons.json` (dashboard-facing). Registered globally as `<fluent-icon>` in both the `dashboard` and `v3app` entrypoints.
- `app/javascript/shared/helpers/colorHelper.js` — `isWidgetColorLighter` (brightness heuristic for widget theme color) and `adjustColorForContrast` (iteratively mixes toward black/white using `color2k` until a 3.1:1 contrast ratio is reached, max 20 iterations) — used to keep widget branding colors accessible.
- `app/javascript/shared/helpers/FileHelper.js` — file-size formatting/validation, `resolveMaximumFileUploadSize` (falls back to `DEFAULT_MAXIMUM_FILE_UPLOAD_SIZE = 40`), and `isFileTypeAllowedForChannel`, which special-cases Instagram DM conversation type and private notes when delegating to `getAllowedFileTypesByChannel` from the `@chatwoot/utils` package.
- `app/javascript/shared/helpers/Validators.js` — phone (E.164), password complexity, domain/slug/URL regex validators shared by dashboard settings forms, widget pre-chat forms, and v3 signup.
- `app/javascript/shared/helpers/CustomErrors.js` — `DuplicateContactException` and `ExceptionWithMessage`, thrown by contact-creation flows and caught for user-facing error messages.
- `app/javascript/shared/helpers/mitt.js` — a single shared `mitt()` event emitter instance re-exported for cross-component pub/sub (distinct from the Vuex-store-backed `busEvents.js` constants).
- `app/javascript/shared/helpers/MessageTypeHelper.js` — form-message detection helpers and `MESSAGE_MAX_LENGTH`, a per-channel character-limit table (Facebook 2000, Instagram 1000, WhatsApp Cloud 4096, Twilio SMS 320, etc., each cited to the provider's own docs) used by the composer to warn/block over-length sends.
- `app/javascript/shared/components/emoji/EmojiPicker.vue` + `pickerHelper.js` + `emojisGroup.json` — the shared emoji picker used in composer/canned-response UIs.
- `app/javascript/shared/components/ui/dropdown/*` and `ui/MultiselectDropdown*.vue` — legacy (non components-next) dropdown/multiselect primitives still used by several dashboard conversation-action components (`ConversationAction.vue`, `LabelBox.vue`, `ResolveAction.vue`, `CustomAttribute.vue`).
- `app/javascript/shared/components/PhoneInput/helper.js` — `getActiveDialCode`/`getActiveCountryCode`, deriving a default phone country from the browser's IANA timezone via `timezone-phone-codes` and `countries-and-timezones`.
- `app/javascript/shared/assets/fonts/` — the Inter and InterDisplay variable-font files plus SCSS partials (`inter.scss`, `widget_fonts.scss`) shared by every bundle's typography.

**`design-system/` — Histoire theming only**
- `app/javascript/design-system/histoire.scss`, `images/logo*.{png,svg}` — imported by `app/javascript/histoire.setup.ts` purely to brand the Histoire playground UI (`title: '@chatwoot/design'` in `histoire.config.ts`). No components live here.

**`v3/` — pre-login auth mini-app**
- `app/javascript/v3/App.vue` — root component: sets dark/light theme from `prefers-color-scheme`, sets `vue-i18n` locale from `window.chatwootConfig.selectedLocale`, mounts `<router-view>` and a `SnackbarContainer`.
- `app/javascript/v3/views/routes.js` — routes for `login`, `login/sso` (SAML, `meta.requireEnterprise`), `auth/signup` (`meta.requireSignupEnabled`), `auth/confirmation`, `auth/verify-email`, `auth/password/edit`, `auth/reset/password`; paths built with `dashboard/helper/URLHelper`'s `frontendURL`.
- `app/javascript/v3/api/apiClient.js` — a bare axios instance pointed at `window.chatwootConfig.apiHost`, separate from the dashboard's main API client.
- `app/javascript/v3/helpers/AuthHelper.js`, `RouteHelper.js`, `CommonHelper.js` — auth-flow and routing helpers specific to this app.
- `app/javascript/v3/components/GoogleOauth/Button.vue`, `SnackBar/Container.vue` + `Item.vue`, `Form/{Input,Select,CheckBox,WithLabel}.vue` — v3's own small form/notification component set (not shared with dashboard's form components).
- `app/javascript/entrypoints/v3app.js` — the entrypoint that wires `v3/App.vue` + `v3/views/index` router + `v3/store` together and globally registers `shared/components/FluentIcon/DashboardIcon.vue` as `<fluent-icon>`.

## How It Fits Together

- **Vite aliasing** (`vite.shared.ts`) is what makes `shared/` genuinely cross-app: `shared` and `helpers` resolve to `app/javascript/shared[/helpers]` for every bundle (`dashboard`, `widget`, `portal`, `survey`, `superadmin_pages`, `v3`, and `sdk`). A grep of `from 'shared/...'` imports confirms real usage in all of those (dashboard has by far the most, ~260 imports; widget ~40; shared imports itself ~19 times internally).
- `HTMLSanitizer.domPurifyConfig` is installed once per bundle at entrypoint time (`dashboard.js`, `widget.js`, `survey.js`) via `app.use(VueDOMPurifyHTML, domPurifyConfig)`, so any `v-dompurify-html` usage anywhere in those apps picks up the shared "open links in a new tab" hook.
- `shared/store/globalConfig.js` is registered as the `globalConfig` Vuex module in the dashboard store and is the read path for server-injected config (`window.globalConfig`, populated by the Rails view). `useBranding`'s `replaceInstallationName` and several `globalConfig` getters (`isACustomBrandedInstance`, `isOnChatwootCloud`) gate white-labeling and Cloud-only UI across dashboard settings screens.
- `MessageFormatter`/`useMessageFormatter` is the rendering path shared by conversation message bubbles (see [[components-next]] for the Vue components that call it) and any other place a message body needs to become HTML or plain text (search highlighting, notification previews).
- `inboxMixin.js`'s `INBOX_FEATURE_MAP` and channel-type computed properties are consumed throughout [[dashboard-routes-components]]'s conversation views to decide which composer/action affordances (reply-to, badges) a given inbox supports — see [[whatsapp]], [[facebook-instagram]], [[other-channels]] for the channel-specific behavior these flags gate.
- `MessageTypeHelper.MESSAGE_MAX_LENGTH` is the client-side mirror of each provider's real API limit; it does not enforce anything server-side — the backend channel senders (covered in [[whatsapp]], [[other-channels]]) are the actual source of truth if a provider changes its limit.
- v3's auth app talks to the same Rails session/Devise endpoints as the rest of the app but through its own `apiClient.js`/`AuthHelper.js`, not the dashboard's main `api-client` layer (see [[api-client]]); it reuses dashboard's `i18n` and `URLHelper` directly rather than duplicating them.
- Histoire (`pnpm story:dev`, config at repo root `histoire.config.ts`) loads `dashboard/store`, `dashboard/i18n`, and `widget/i18n` in `histoire.setup.ts` to render component stories that actually live in `dashboard/components-next/*.story.vue` and `widget/components/**/*.story.vue` — `design-system/` supplies only the playground's own branding assets, not the stories or components under test.

## Product Behavior

- `useBranding`'s `replaceInstallationName` is the mechanism behind white-labeled/self-hosted installs showing their own product name instead of "Chatwoot" in UI copy — CLAUDE.md's branding note directs new user-facing strings containing "Chatwoot" to use it instead of hardcoding brand copy.
- `colorHelper.adjustColorForContrast` and `isWidgetColorLighter` back the live-chat widget's branding color customization (design tokens topic) — ensuring an agent-chosen widget color still renders text at a readable contrast ratio.
- `MessageTypeHelper.MESSAGE_MAX_LENGTH` reflects per-channel composer limits agents encounter when writing replies (e.g. WhatsApp Cloud 4096 chars, Twilio SMS 320) — relevant background for the WhatsApp and other-channels setup guides' composer behavior, though the guides themselves don't document exact limits.
- The v3 app is what agents/admins actually see for login, SSO (SAML) login, signup, and password/email-confirmation flows — i.e., the "Setup account" user-guide category's entry points, separate from the dashboard SPA proper.

## Notes for AI Agents

- Don't confuse `app/javascript/design-system/` with "the design system." It's nearly empty (Histoire branding assets only) — the real, current component system is `dashboard/components-next/` (per CLAUDE.md: "Use components-next/ for message bubbles, the rest is being deprecated"), documented separately in [[components-next]]. If a task says "design system," check there first.
- `shared/composables/useFilter.js` is a misleading location: it is not app-agnostic despite living under `shared/` — it hard-imports dashboard-only modules (`dashboard/composables/store`, dashboard filter-item definitions). Don't assume everything under `shared/` is safe to use from widget/portal/survey; check each file's own imports.
- Two icon-lookup JSON files exist for Fluent icons — `icons.json` and `dashboard-icons.json` — selected by which `Icon.vue`/`DashboardIcon.vue`/`Index.vue` wrapper a bundle registers as `<fluent-icon>`. Adding a new icon usually means adding to the right JSON for the bundle that needs it, not both.
- `MessageFormatter` runs markdown-it with `html: false` (raw HTML is escaped, not rendered) — the Help Center editor's `<!--cw-colwidths:...-->` marker comment is stripped via regex specifically because `html:false` would otherwise turn it into visible escaped text; if you add another editor-internal marker convention, it needs the same strip-before-render treatment or it will leak into rendered output.
- `BaseActionCableConnector` is a base class other connectors extend, not something instantiated directly for the RoomChannel logic used dashboard-wide — check for a dashboard-level subclass before duplicating reconnect/presence logic.
- `globalConfig.js`'s getters like `isMetaInboxCreationDisabled`/`isMetaMessageSendingDisabled` are gated on both `deploymentEnv === 'cloud'` AND the corresponding env-sourced boolean — they are no-ops (`false`) on self-hosted installs regardless of the flag's raw value.
- I did not exhaustively read every file — `shared/constants/{countries,locales,messages,campaign,contentType,links}.js` and the remaining `shared/components/ui/dropdown/*` and `charts/BarChart.vue` files are plain data tables / small presentational components I sampled but skipped reading in full; nothing there looked architecturally significant beyond what's captured above.

## Related

- [[components-next]] — the actual current component/design system (message bubbles, stories) that supersedes anything `design-system/` once held.
- [[composables-mixins-helpers]] — the dashboard-only counterpart to this page's cross-app `shared/` code (composables/mixins/helpers/constants that live under `dashboard/` itself, not aliased app-wide).
- [[dashboard-store]] — where `shared/store/globalConfig.js` is registered as a Vuex module.
- [[dashboard-routes-components]] — the conversation UI that consumes `inboxMixin.js`, `MessageFormatter`, and `MESSAGE_MAX_LENGTH`.
- [[api-client]] — dashboard's main API client layer, distinct from v3's standalone `apiClient.js`.
- [[widget-sdk]] — the widget bundle that also aliases `shared/` and consumes `HTMLSanitizer`, `Validators`, and the Fluent icon set.
- [[whatsapp]] / [[facebook-instagram]] / [[other-channels]] — channel-specific behavior gated by `inboxMixin.js` computed properties and `MESSAGE_MAX_LENGTH`.
