---
title: "Dashboard API Client Layer"
tags: [chatwoot, frontend, api, whatsapp, axios]
generated: 2026-08-17
deepwiki_section: "API Layer"
---

# Dashboard API Client Layer

## Purpose
This module is the frontend's HTTP boundary: every REST call the Vue dashboard makes to the Rails backend is routed through a resource class in `app/javascript/dashboard/api/`. Each file wraps one backend resource (conversations, contacts, inboxes, WhatsApp channels, Captain assistants, etc.) as a small class with `get`/`show`/`create`/`update`/`delete` plus resource-specific methods, all built on axios. `app/javascript/dashboard/services/` (much smaller, only 5 files) is unrelated request plumbing — it's pure client-side normalization logic for WhatsApp/Twilio template messages, not an API-calling layer.

## Key Files & Classes
- `app/javascript/dashboard/api/ApiClient.js` — base class. Builds the resource URL (`/api/v1/<resource>` or, with `accountScoped: true`, `/api/v1/accounts/:accountId/<resource>`; with `enterprise: true`, prefixed `/enterprise`), reading the account id straight from `window.location.pathname` (not from the store). Provides default `get/show/create/update/delete`.
- `app/javascript/dashboard/api/CacheEnabledApiClient.js` — extends `ApiClient` with an IndexedDB-backed read cache (via `../helper/CacheHelper/DataManager`). `get(cache=true)` checks a per-model `cache_keys` endpoint, serves from IndexedDB if the key matches, and falls back to network on any IDB failure (e.g. Firefox private mode) or empty cache. Subclasses must implement `cacheModelName`. Used by `inboxes.js`, `labels.js`, `teams.js`, `cannedResponse.js`.
- `app/javascript/dashboard/api/endPoints.js` — a lookup table of hand-built URLs (mostly Devise-token-auth/profile endpoints: password reset, login validity, profile update, avatar). Used only by `auth.js` and `channels.js`, which predate/bypass the `ApiClient` class pattern.
- `app/javascript/dashboard/api/auth.js` — plain object (not `ApiClient`-based) for auth/session/profile calls: `validityCheck`, `logout` (also clears cookies/IndexedDB via `../store/utils/api`), `hasAuthCookie`/`getAuthData` (reads the `cw_d_session_info` cookie), `profileUpdate`, session listing/revocation.
- `app/javascript/dashboard/api/conversations.js` and `api/inbox/conversation.js` — two *separate* classes, both named `ConversationApi`, both wrapping the `conversations` resource with `accountScoped: true`. The top-level one only adds `getLabels`/`updateLabels`/`getUnreadCounts`; the `inbox/` one is the much larger surface (`filter`, `search`, `toggleStatus`, `togglePriority`, `assignAgent`, `assignTeam`, `toggleTyping`, `mute`/`unmute`, `meta`, `sendEmailTranscript`, `updateCustomAttributes`, participants, attachments, `getInboxAssistant`).
- `app/javascript/dashboard/api/inbox/message.js` — message CRUD/retry/translate. `buildCreatePayload` (exported, unit-tested) switches between a `FormData` payload (when `files` are attached) and a plain JSON object, and stuffs `content_attributes`/`template_params` in either shape.
- `app/javascript/dashboard/api/channel/whatsappChannel.js` — `createEmbeddedSignup`/`reauthorizeWhatsApp`, both posting to `whatsapp/authorization` under the account scope; backs the embedded-signup and reauth flows referenced in recent branch commits (`fix/whatsapp-coexistence-embedded-signup`).
- `app/javascript/dashboard/api/channel/whatsapp/whatsappCallsAPI.js`, `api/channel/voice/*` — WhatsApp/Twilio voice-calling specific clients, separate from the general `whatsappChannel.js`.
- `app/javascript/dashboard/api/inboxes.js` — `CacheEnabledApiClient` subclass with a long tail of inbox-settings endpoints: campaigns, avatar, agent bot, `syncTemplates`/`getMessageTemplates`, WhatsApp business-management token, CSAT template create/status/analyze, `resetSecret`, and WhatsApp-calling enable/disable/`setInboundCalls`.
- `app/javascript/dashboard/api/enterprise/account.js` — example of the `enterprise: true` option: constructs with resource `''` so `this.url` is just the enterprise account base, then appends `checkout`, `subscription`, `select_billing_currency`, `limits`, `toggle_deletion`, `topup_checkout`/`topup_options` — this is the client side of the billing work described in project memory (`project_brl_pricing.md`).
- `app/javascript/dashboard/api/captain/*.js` — one file per Captain sub-resource (`assistant.js`, `document.js`, `faqSuggestions.js`, `copilotMessages.js`, `copilotThreads.js`, `customTools.js`, `tasks.js`, `scenarios.js`, `tools.js`, `agentSessions.js`, `messageReports.js`, `preferences.js`, `bulkActions.js`, `response.js`, `inboxes.js`). `assistant.js` shows the pattern for report-style endpoints (`getMetrics`, `getFaqStats`, `getSummary`, `getDrilldown`), each computing a `timezone_offset` client-side to match the reports API convention, and threading an optional `AbortSignal` through to axios for cancellable requests.
- `app/javascript/dashboard/api/helpCenter/*.js`, `api/integrations/*.js` (`dyte.js`, `linear.js`, `shopify.js`) — same `ApiClient` pattern applied to Help Center and third-party integration resources.
- `app/javascript/dashboard/services/TemplateNormalizer.js` + `TemplateTypeDetector.js` + `TemplateConstants.js` — pure functions (no axios, no network) that normalize WhatsApp Cloud API and Twilio Content API template payloads (as returned by `inboxes.js#getMessageTemplates`) into one unified shape (`normalize(template, platform)`), and classify a template's rendering type (text/media/interactive/copy-code, etc.) for the composer UI to pick a preview component.
- `app/javascript/dashboard/helper/APIHelper.js` (outside the investigated paths but the thing that makes all of this work) — `createAxios(axios)` builds the actual `window.axios` instance used via the `/* global axios */` convention throughout `api/*`: sets `baseURL` from `window.chatwootConfig.apiHost`, copies Devise-token-auth headers (`access-token`, `token-type`, `client`, `expiry`, `uid`) from the `cw_d_session_info` cookie via `Auth.hasAuthCookie()`/`getAuthData()`, and installs a response interceptor. Instantiated once in `app/javascript/entrypoints/dashboard.js` (`window.axios = createAxios(axios)`).

## How It Fits Together
- Every resource class here is a **singleton instance** (`export default new XyzAPI()`), imported directly by Vuex store actions under `app/javascript/dashboard/store/modules/**` (confirmed: `conversations/actions.js`, `messageReadActions.js`, `messageTranslateActions.js`, `conversationWatchers.js`, `conversationLabels.js`, `conversationStats.js`, `contactConversations.js`, `conversationTypingStatus.js`, and many more). This is the layer [[dashboard-store]] calls into for every network round-trip; API modules never touch Vuex state themselves — they only return axios promises.
- All calls rely on the module-global `axios` set up by `APIHelper.js`/`entrypoints/dashboard.js`, referenced via the `/* global axios */` ESLint pragma rather than an explicit import in most files.
- Auth state (`auth.js`) is cookie-based (devise_token_auth style), separate from the resource classes' `ApiClient`/`CacheEnabledApiClient` inheritance — it's the one place besides `channels.js` still using the older `endPoints.js` lookup table.
- `CacheEnabledApiClient` depends on `app/javascript/dashboard/helper/CacheHelper/DataManager.js` (IndexedDB wrapper) and a backend `cache_keys` endpoint (`GET /api/v1/accounts/:id/cache_keys`) to validate cache freshness per model name — this is a frontend-only offline/perf optimization, not something [[jobs]] or [[events-listeners]] push into.
- Endpoints under `accountScoped: true` map onto [[api-v1-controllers]] (`Api::V1::Accounts::*`); `enterprise: true` endpoints map onto Enterprise-overlay controllers described in [[controllers-jobs-listeners]] and [[models-services]].
- `channel/whatsappChannel.js`'s `createEmbeddedSignup`/`reauthorizeWhatsApp` are the client side of the WhatsApp embedded-signup/reauth flow discussed in [[whatsapp]] and in this session's own branch history (`fix/whatsapp-coexistence-embedded-signup`).
- `inboxes.js`'s WhatsApp-calling and CSAT-template methods are consumed by inbox-settings pages under [[dashboard-routes-components]] / [[components-next]].
- `services/TemplateNormalizer.js` output feeds the message composer's template-preview components (also in [[components-next]] / [[dashboard-routes-components]]), turning the raw `getMessageTemplates` API response into a shape the UI can render regardless of whether the inbox is WhatsApp Cloud or Twilio-backed WhatsApp.

## Product Behavior
- The real-time side of the dashboard (conversation updates, typing indicators, presence) is delivered over ActionCable/WebSocket, not through this REST client layer — per the official guide's "WebSocket connection" advanced-feature article, the two transports are complementary: REST here for user-initiated reads/writes (fetching conversations, sending messages, updating labels/assignments), WebSocket for server-pushed live updates. This module only covers the REST half.
- `channel/whatsappChannel.js` backs both the "embedded signup" and "manual"/reauthorization flows described in the WhatsApp channel setup guide; `inboxes.js#getMessageTemplates`/`syncTemplates` back the "WhatsApp template sync via Business Management token" guide article, and `createCSATTemplate`/`getCSATTemplateStatus`/`analyzeCSATTemplateUtility` back the "WhatsApp CSAT templates" feature article.
- `enterprise/account.js`'s `topup_checkout`/`topup_options`/`select_billing_currency` map to the multi-currency billing/credits flows referenced in project memory (`project_brl_pricing.md`), not to a public user-guide article observed directly in code.

## Notes for AI Agents
- Do not confuse `app/javascript/dashboard/api/conversations.js` with `app/javascript/dashboard/api/inbox/conversation.js` — both classes are literally named `ConversationApi` and both wrap the same `conversations` resource; the `inbox/` one is the one with almost all the conversation-action methods. When searching for a conversation-related API method, check `inbox/conversation.js` first.
- `ApiClient#accountIdFromRoute` reads the account id from `window.location.pathname` at call time, not from the Vuex store — a resource singleton constructed before routing settles (or used outside an account-scoped URL) will silently resolve to an empty account segment. `CacheEnabledApiClient`'s comment explicitly documents this: its `dataManager` getter re-resolves per access rather than caching the account id in the constructor, specifically because these API instances are module-level singletons that can live across account switches.
- New cached resources must implement `cacheModelName` (throws in the base class if omitted) and rely on a backend `cache_keys` endpoint keyed by that same model name existing on the Rails side.
- Most files use the `/* global axios */` ESLint pragma instead of importing axios — this is intentional and matches the rest of the codebase's convention, not an oversight to "fix" by adding an import.
- `buildCreatePayload` in `inbox/message.js` branches its entire payload shape (FormData vs plain object) on whether `files` is non-empty — any new message-create field needs to be added to *both* branches or it will silently be dropped for attachment-bearing sends.
- `services/TemplateNormalizer.js`/`TemplateTypeDetector.js` have zero network code — despite living next to `api/`, they're pure data-shape transforms and should not be treated as, or extended with, HTTP calls.
- Two API-shaped classes exist per resource area in captain (`api/captain/*`) mirroring the backend's `captain/` namespace — check for an existing captain file before adding a new one, the pattern is one file per sub-resource, not one big captain client.

## Related
- [[dashboard-store]]
- [[api-v1-controllers]]
- [[public-platform-api]]
- [[whatsapp]]
- [[components-next]]
- [[dashboard-routes-components]]
- [[captain-ai]]
- [[authorization-policies]]
