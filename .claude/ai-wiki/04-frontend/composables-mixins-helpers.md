---
title: "Composables, Mixins, Helpers, Constants"
tags: [chatwoot, frontend, vue3, feature-flags, whatsapp, permissions]
generated: 2026-08-17
deepwiki_section: "Configuration and Feature Management (global config, feature flags/premium, user prefs)"
---

# Composables, Mixins, Helpers, Constants

## Purpose

This is the dashboard's shared logic layer — everything reusable that isn't a Vuex/Pinia store, a route, or a UI component. It covers four distinct kinds of code, all living under `app/javascript/dashboard/`:

- **`composables/`** — Vue 3 Composition API functions (`useXxx`), the modern way to share reactive logic. This is where almost all new shared logic goes now.
- **`mixins/`** — the old Options API sharing mechanism. Only one file remains (`fileUploadMixin.js`), confirming the codebase has almost fully migrated off mixins in favor of composables.
- **`helper/`** — plain (non-reactive) utility modules: pure functions, ActionCable wiring, API client factories, analytics, audio notifications, IndexedDB caching, date parsing, etc. Not Vue-specific.
- **`constants/`** and **`featureFlags.js`** — static lookup tables and enums used across the dashboard (permissions, feature-flag names, billing currencies, installation types, UI events).

Together these form the substrate that almost every dashboard route/component in [[dashboard-routes-components]] and [[components-next]] is built on top of.

## Key Files & Classes

**Composables — cross-cutting/foundational**
- `app/javascript/dashboard/composables/store.js` — `useStore`, `useStoreGetters`, `useMapGetter`, `useFunctionGetter`: the Composition-API bridge into the legacy Vuex store (`vm.proxy.$store`), used by nearly every other composable instead of `mapGetters`.
- `app/javascript/dashboard/composables/index.js` — barrel exporting `useTrack` (wraps `AnalyticsHelper`, swallows errors since tracking is non-critical) and `useAlert` (emits a global `newToastMessage` event via `shared/helpers/mitt`).
- `app/javascript/dashboard/composables/useAccount.js` — `useAccount()`: current `accountId` (from the route), `currentAccount`, `accountScopedUrl`/`accountScopedRoute` helpers, `isCloudFeatureEnabled`, `updateAccount`, `finishOnboarding`.
- `app/javascript/dashboard/composables/useAdmin.js` — `isAdmin` computed from `getCurrentRole`.
- `app/javascript/dashboard/composables/usePolicy.js` — the central **feature-flag / permission / premium-paywall gate**: `shouldShow(featureFlag, permissions, installationTypes)` and `shouldShowPaywall(featureFlag)`. Encodes different rules per install type (custom-branded, Cloud, Enterprise, Community) — see Notes below.
- `app/javascript/dashboard/composables/useConfig.js` — thin reader over `window.chatwootConfig` (host URL, VAPID key, `isEnterprise`, `enterprisePlanName`, `inboxEventsEnabled`).
- `app/javascript/dashboard/composables/useAbortableRequest.js` — `run`/`abort`/`isPending`: keeps only the latest in-flight request alive by aborting the previous one via `AbortController`, auto-cleans up on scope dispose.
- `app/javascript/dashboard/composables/useUISettings.js` — reads/writes the per-user `ui_settings` blob (`updateUISettings` Vuex action): conversation/contact sidebar item ordering (with defaults + migration for new items), per-channel signature/quoted-reply flags, editor hotkey preference (`enter`/`cmd_enter`).
- `app/javascript/dashboard/composables/useImpersonation.js` — `isImpersonating`, backed by `SessionStorage` (`SESSION_STORAGE_KEYS.IMPERSONATION_USER`); consulted by `actionCable.js` to suppress presence updates while a super-admin impersonates a user.
- `app/javascript/dashboard/composables/useLiveRefresh.js` — generic `setTimeout`-recursive polling helper (`startRefetching`/`stopRefetching`) used by report/dashboard pages.
- `app/javascript/dashboard/composables/emitter.js` — `useEmitter(eventName, callback)`, auto-registers/unregisters on the global `mitt` emitter across the component lifecycle.

**Composables — feature-specific**
- `useWhatsappEmbeddedSignup.js` — drives Meta's WhatsApp Embedded Signup popup: loads the Facebook JS SDK, calls `FB.login`, and races a `postMessage` listener for the WABA business data (`waba_id`, `phone_number_id`) since the auth `code` and business data arrive independently and out of order; resolves both together, distinguishes `FINISH` vs `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` (coexistence) events, treats `Login cancelled` as a cancel rather than an error.
- `useCallSession.js` / `useWhatsappCallSession.js` — voice-call session state for the in-dashboard WhatsApp/Twilio calling UI; `useCallSession.js` uses module-level globals (`globalsAttachedCount`, a shared `Timer`, a shared `globalIsJoining` lock) so that multiple components mounting the composable (call bubble + call widget) don't duplicate `beforeunload`/`pagehide` listeners or timers.
- `useMacroExecution.js` — runs a macro against a conversation; if the macro resolves the conversation (`resolve_conversation`, or `change_status` with a resolved param) and the conversation is missing required custom attributes, execution is held back so the caller can prompt for them first (via `useConversationRequiredAttributes`).
- `useConversationRequiredAttributes.js` — gates the "required attributes before resolve" workflow behind `FEATURE_FLAGS.CONVERSATION_REQUIRED_ATTRIBUTES` and account settings (`conversation_required_attributes`).
- `useSlaStatus.js` — periodically (60s) recomputes SLA breach/threshold state via `dashboard/helper/slaHelper`, only rescheduling the timer when `shouldRefreshSLAStatus` says a future recompute is needed.
- `useCaptain.js`, `captain/constants.js` — Captain AI assistant composable + its error/failure-reason enums (`CAPTAIN_ERROR_TYPES`, `CAPTAIN_GENERATION_FAILURE_REASONS`).
- `useAutomation.js` / `useAutomationValues.js` / `useEditableAutomation.js` — automation-rule editing state, paired with `helper/automationHelper.js`.
- `useMacros.js` / `useOrderedMacros.js` — macro list retrieval/ordering used by the macro command palette.
- `useAgentsList.js`, `useConversationLabels.js`, `useInbox.js`, `useFacebookPageConnect.js`, `useIntegrationHook.js`, `useFileUpload.js`, `useFontSize.js`, `useImageZoom.js`, `useCopilotReply.js`, `useLabelSuggestions.js`, `useTranslations.js`, `useReportMetrics.js` — narrower, single-purpose composables for their respective domains.
- `composables/commands/*` — `useConversationHotKeys`, `useInboxHotKeys`, `useBulkActionsHotKeys`, `useAppearanceHotKeys`, `useGoToCommandHotKeys`, `useMacroHotKeys`: build the command-palette (⌘K) action lists (assign agent/team, set priority, add/remove label, snooze/resolve, AI-assist actions), wired to `helper/commandbar/{actions,events,icons}.js`.
- `composables/chatlist/useBulkActions.js`, `useChatListKeyboardEvents.js` — conversation-list bulk selection and `j/k`-style keyboard navigation.
- `useKeyboardEvents.js`, `useKeyboardNavigableList.js`, `useDetectKeyboardLayout.js`, `utils/useKbd.js` — lower-level keyboard-shortcut plumbing shared by the command composables above.

**Mixins**
- `mixins/fileUploadMixin.js` — the one remaining Options-API mixin. Computes per-channel max upload size (`maxSizeFor`, using `getMaxUploadSizeByChannel` from `@chatwoot/utils`, capped by the installation-wide `globalConfig.maximumFileUploadSize`), and does direct (ActiveStorage `DirectUpload`) or indirect file upload depending on `globalConfig.directUploadsEnabled`.

**Helpers**
- `helper/actionCable.js` — `ActionCableConnector` (extends `shared/helpers/BaseActionCableConnector`): the single dispatch table for every dashboard WebSocket event (`message.created`, `conversation.status_changed`, `presence.update`, `notification.*`, `voice_call.*`, `account.cache_invalidated`, etc.), each mapped to a Vuex dispatch. Also owns unread-count refetch throttling/retry-with-jitter logic gated by `FEATURE_FLAGS.CONVERSATION_UNREAD_COUNTS` / `UNREAD_COUNT_FOR_FILTERS`, and WhatsApp voice-call signaling (delegates to `useWhatsappCallSession.js` and the Pinia `useCallsStore`).
- `helper/APIHelper.js` — builds the shared axios instance (`wootApi`), attaches auth headers from `Auth.getAuthData()` when a session cookie exists.
- `helper/permissionsHelper.js` — `hasPermissions`, `getUserPermissions`, `getUserRole`, `getCurrentAccount`, `filterItemsByPermission`: the permission primitives that `usePolicy` and `routeHelpers` build on.
- `helper/routeHelpers.js` — `routeIsAccessibleFor` (checks `route.meta.permissions`), `defaultRedirectPage` (first matching permission tier: dashboard → contacts → reports → portals), `validateActiveAccountRoutes`.
- `helper/featureHelper.js` — `FEATURE_HELP_URLS` map + `getHelpUrlForFeature`, used for "learn more" links next to gated/paywalled features.
- `helper/flag.js` — `getCountryFlag(countryCode)`, converts an ISO country code to its emoji flag via Unicode regional-indicator offset.
- `helper/automationHelper.js` — custom-attribute-to-operator-type mapping (`getOperatorTypes`, `getCustomAttributeInputType`) and automation condition/action helpers, paired with `helper/filterQueryGenerator.js` / `helper/actionQueryGenerator.js` and `constants/automation.js`.
- `helper/states.js` — a tiny legacy Vuex store (`authenticated`, `currentChat`) separate from the main store module tree.
- `helper/CacheHelper/DataManager.js` — wraps `idb` (IndexedDB) to cache `inbox`/`label`/`team`/`canned_response` collections client-side, keyed by account, with a `cache-keys` store for revalidation (consumed by `account.cache_invalidated` in `actionCable.js`).
- `helper/AudioAlerts/*` — `AudioMessageHelper`, `AudioNotificationStore`, `DashboardAudioNotificationHelper`, `WindowVisibilityHelper`, `faviconHelper`: new-message sound + favicon badge notifications, muted based on tab visibility.
- `helper/AnalyticsHelper/{index,events}.js` — the analytics-tracking client (`analyticsHelper.track`) and the catalogue of tracked event names (e.g. `CONVERSATION_EVENTS.EXECUTED_A_MACRO`).
- `helper/snoozeDateParser/*` — natural-language snooze date parsing (`parser.js`, `localization.js`, `suggestions.js`, `tokenMaps.js`) backing "snooze until…" free-text input.
- `helper/validations.js`, `helper/DOMHelpers.js`, `helper/URLHelper.js`, `helper/downloadHelper.js`, `helper/uploadHelper.js`, `helper/directUploadsHelper.js`, `helper/editorHelper.js`, `helper/emailQuoteExtractor.js`, `helper/quotedEmailHelper.js`, `helper/markdownEmbeds.js`, `helper/articleDiffHelper.js`, `helper/portalHelper.js`, `helper/themeHelper.js`, `helper/Timer.js`, `helper/ReconnectService.js`, `helper/slaHelper.js`, `helper/labelColor.js`, `helper/sidebarSort.js`, `helper/customViewsHelper.js`, `helper/facebookScopes.js`, `helper/preChat.js`, `helper/pushHelper.js`, `helper/scriptHelpers.js`, `helper/auditlogHelper.js`, `helper/voice.js` — single-purpose utilities each scoped to their namesake domain (not individually detailed here; sampled but not all read in full).

**Constants & feature flags**
- `featureFlags.js` — `FEATURE_FLAGS` (the full catalogue of gate-able feature names, e.g. `WHATSAPP_EMBEDDED_SIGNUP_FLOW`, `ASSIGNMENT_V2`, `CONVERSATION_REQUIRED_ATTRIBUTES`) and `PREMIUM_FEATURES` (the subset — `SLA`, `CAPTAIN`, `CAPTAIN_CUSTOM_TOOLS`, `CUSTOM_ROLES`, `AUDIT_LOGS`, `HELP_CENTER`, `SAML`, `CONVERSATION_REQUIRED_ATTRIBUTES`, `ADVANCED_ASSIGNMENT` — treated as paywalled on Cloud/Enterprise even when the account-level flag is off).
- `constants/permissions.js` — `AVAILABLE_CUSTOM_ROLE_PERMISSIONS`, `ROLES`, `CONVERSATION_PERMISSIONS`, per-conversation-tab permission sets (`ASSIGNEE_TYPE_TAB_PERMISSIONS`).
- `constants/globals.js` — grab-bag default export (`ASSIGNEE_TYPE`, `STATUS_TYPE`, `CONVERSATION_TYPE`, `SORT_BY_TYPE`, `SNOOZE_OPTIONS`, `SLA_MISS_TYPES`, screen breakpoints, docs URLs) plus named exports `DEFAULT_REDIRECT_URL`, `META_RESTRICTION_STATUS_URL`.
- `constants/installationTypes.js` — `INSTALLATION_TYPES = { CLOUD, ENTERPRISE, COMMUNITY }`, consumed directly by `usePolicy`'s `checkInstallationType`.
- `constants/billing.js` — multi-currency billing config: `SUPPORTED_BILLING_CURRENCIES` (`usd`, `brl`), `BILLING_CURRENCY_CONFIG`, `formatCurrencyAmount` (wraps `Intl.NumberFormat`).
- `constants/automation.js`, `constants/editor.js`, `constants/appEvents.js` (`CHATWOOT_SET_USER`, `CHATWOOT_RESET`, `ANALYTICS_IDENTITY`, `ANALYTICS_RESET`), `constants/localStorage.js`, `constants/sessionStorage.js` — smaller domain-scoped enum/key tables.

Not individually read: most of `helper/specs/*` and `composables/spec/*` (test files mirroring the modules above — their presence confirms nearly every composable/helper here has unit test coverage), and several single-purpose helpers listed but not opened in full (`helper/validations.js`, `helper/voice.js`, `helper/editorHelper.js`, etc.) — sampled by name/imports rather than read line-by-line.

## How It Fits Together

- **Vuex bridge**: `composables/store.js` is the seam between the Composition API and the legacy Vuex store described in [[dashboard-store]]. Nearly every composable in this module calls `useStore`/`useMapGetter` rather than talking to Vuex directly, and `useUISettings`/`useAccount`/`usePolicy` all dispatch Vuex actions (`updateUISettings`, `accounts/update`, `accounts/finishOnboarding`).
- **Feature gating end-to-end**: `featureFlags.js` (flag names) → `usePolicy.js` (`shouldShow`/`shouldShowPaywall`, the decision logic) → consumed throughout [[dashboard-routes-components]] and [[components-next]] to hide nav items, show paywalls, or gate settings pages. The same flag names are checked account-side by Vuex getters (`accounts/isFeatureEnabledonAccount`, `globalConfig/isOnChatwootCloud`) whose backend counterpart is the account `feature_flags` bitfield — see [[account-onboarding]] and [[authorization-policies]].
- **Real-time events**: `helper/actionCable.js` is the single consumer of every WebSocket broadcast the Rails backend emits (via [[events-listeners]]/Sidekiq broadcast jobs) — `message.created`, `conversation.*`, `notification.*`, `voice_call.*`, `account.cache_invalidated` — and fans them out into Vuex dispatches, the Pinia `useCallsStore` (WhatsApp/Twilio calling), and `DashboardAudioNotificationHelper`. On `account.cache_invalidated` it also drives `CacheHelper/DataManager`'s IndexedDB revalidation.
- **WhatsApp embedded signup**: `useWhatsappEmbeddedSignup.js` is the frontend half of the flow whose backend side is `inboxes/createWhatsAppEmbeddedSignup` — see [[whatsapp]] for the full channel setup/webhook path, and the memory notes on WhatsApp coexistence signup flows for the FINISH vs FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING distinction this composable encodes.
- **Macro execution**: `useMacroExecution.js` dispatches `macros/execute` (Vuex → backend macro service, see [[macros]]) and coordinates with `useConversationRequiredAttributes.js` so a macro that resolves a conversation doesn't skip required-attribute validation — the same validation the backend enforces via [[conversations-services]].
- **File uploads**: `mixins/fileUploadMixin.js` and `helper/directUploadsHelper.js` talk to the Rails ActiveStorage direct-upload endpoint under `/api/v1/accounts/:id/conversations/:id/direct_uploads`, feeding into [[messages-services]].
- **Command palette / hotkeys**: `composables/commands/*` build the ⌘K action list consumed by the command-bar UI in [[components-next]], reading from `useAgentsList`, `useConversationLabels`, `useCaptain` to populate dynamic options (assignable agents, labels, AI actions).
- **Permissions**: `helper/permissionsHelper.js` + `constants/permissions.js` mirror the backend's role/`custom_role` permission model exposed by [[authorization-policies]] (Pundit) — the frontend re-derives allowed UI surface from the same permission strings the backend returns on the user's account membership.

## Product Behavior

- `usePolicy.js`'s `shouldShow`/`shouldShowPaywall` implement the behavior described in the "Enterprise Edition" and feature-flag/premium-features areas of the user guide: on Chatwoot Cloud, a feature not enabled on the account but listed in `PREMIUM_FEATURES` (SLA, Captain, Custom Roles, Audit Logs, Help Center, SAML, Conversation Required Attributes, Advanced Assignment) is still shown so the component can render its own paywall/upsell, rather than being hidden outright. On self-hosted Enterprise, the same premium set is shown as an upsell unless the installation has a genuine (non-"community") enterprise plan.
- `useWhatsappEmbeddedSignup.js` and `FEATURE_FLAGS.WHATSAPP_EMBEDDED_SIGNUP_FLOW` / `WHATSAPP_MANUAL_TRANSFER` / `WHATSAPP_RECONFIGURE` back the "Other channels: WhatsApp (embedded signup, manual flow)" setup guide — the embedded-signup-vs-manual-flow distinction and the "embedded-signup-to-manual migration" guide topic both hook through this composable and its coexistence (`is_coexistence`) flag.
- `constants/billing.js`'s multi-currency support (`usd`/`brl`) is the frontend half of the account billing/plan surface referenced generically under "Other topics: free trial limits" and billing settings — no user-guide article was inspected in detail for this, described generically per instructions.
- `helper/AudioAlerts/*` implements the notification-sound/favicon-badge behavior referenced by the "Other topics: notification troubleshooting" guide topic.

## Notes for AI Agents

- **Composables over mixins**: only one mixin (`fileUploadMixin.js`) remains. New shared logic should be a composable under `composables/`, not a new mixin — the codebase has deliberately moved away from the Options-API mixin pattern.
- **`usePolicy.shouldShow` has installation-type-dependent branches that are easy to get backwards.** Custom-branded instances only ever consult the raw feature flag (no premium-upsell path). Cloud shows a feature if the flag is on *or* it's a premium feature (to render a paywall). Enterprise shows it if the flag is on *or* (it's premium *and* the instance lacks a premium plan) — i.e. once an Enterprise instance is on a paid plan, the premium-upsell branch stops firing and the flag alone governs. Read the comments in `usePolicy.js` closely before modifying this function; the ordering of the `isOnChatwootCloud`/`isEnterprise` checks encodes real product behavior, not just a fallback chain.
- **`useAccount.accountId` is read from the *route*, not from the Vuex `getCurrentAccountId` getter** (`Number(route.params.accountId)`) — code in components without a live route context (or during route transitions) should be aware of this source.
- **`useAbortableRequest`'s `run` cancels the previous in-flight call whenever a new one starts** — if a composable/component needs multiple concurrent requests in flight, this is the wrong primitive (it's "keep only latest," not a general request pool).
- **`useCallSession.js` deliberately uses module-level (not per-instance) globals** (`globalsAttachedCount`, a shared `Timer`, `globalIsJoining`) so that multiple components mounting the same composable share one timer/listener set — don't "fix" this into per-instance state without understanding why (see the file's own comments: duplicate `beforeunload`/timers across a bubble + widget instance was the bug being avoided).
- **`useWhatsappEmbeddedSignup`'s two Meta postMessage events resolve independently and out of order** — `authCode` (from `FB.login`) and `businessData` (from the popup's `postMessage`) are held in closure variables and only resolved once both are present; `FINISH` vs `FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING` is how coexistence signups are distinguished from fresh ones. See the memory note on WhatsApp coexistence duplicate-conversation issues for downstream consequences of getting this flag wrong.
- **No enterprise overlay exists for this module** — `enterprise/` has no `dashboard/composables`, `dashboard/mixins`, or `dashboard/helper` equivalents (confirmed via search). Enterprise-only *behavior* here is expressed through data (feature flags, `INSTALLATION_TYPES.ENTERPRISE` checks in `usePolicy`), not code overrides — unlike the Ruby backend's `prepend_mod_with` pattern.
- **`helper/actionCable.js` is a single large dispatch table** — when adding a new real-time event, add it to the `this.events` map in the constructor and an `onXxx` handler method; most handlers are one or two Vuex dispatches. The WhatsApp voice-call handlers carry non-obvious ordering/locality comments (e.g. `onVoiceCallEnded` must await `handleWhatsappRemoteEnd` *before* `removeCall` so the recorder isn't torn down before its chunks upload) — read the inline comments before touching call-signaling handlers.
- **`CacheHelper/DataManager.js`'s `modelsToSync` allowlist** (`inbox`, `label`, `team`, `canned_response`) is hardcoded and validated via `validateModel` — adding a new IndexedDB-cached model means updating both this array and the `upgrade()` callback's `createStore` calls, and bumping `DATA_VERSION` in `version.js`.
- Most files here have a matching spec in a sibling `spec/`/`specs/` directory — check for one before assuming a change is untested.
