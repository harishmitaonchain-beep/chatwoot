---
title: "Dashboard Routes & Legacy Components"
tags: [chatwoot, frontend, vue-router, dashboard, legacy-ui]
generated: 2026-08-17
deepwiki_section: "Frontend Application"
---

# Dashboard Routes & Legacy Components

## Purpose
This module covers the agent-facing dashboard's Vue Router route tree (`app/javascript/dashboard/routes`) and the older, pre-`components-next` component library (`app/javascript/dashboard/components`), plus a handful of feature-scoped "modules" (`app/javascript/dashboard/modules`) that don't fit cleanly under `routes/` or `components/`. Together these define every URL an agent/admin can hit inside `/app/accounts/:accountId/...`, the permission gate that decides whether they can hit it, and most of the conversation view, reply composer, and settings-page UI that isn't yet migrated to `components-next`.

## Key Files & Classes

**Router bootstrap**
- `app/javascript/dashboard/routes/index.js` — creates the Vue Router instance, and owns `validateAuthenticateRoutePermission` (the global `beforeEach` guard): redirects unauthenticated users to `/app/login`, routes users with no accounts to `no-accounts`, force-redirects admins mid-onboarding (`onboarding_step` in `account_details`/`enrichment`/`inbox_setup`) to the onboarding flow, and otherwise calls `validateLoggedInRoutes`.
- `app/javascript/dashboard/routes/dashboard/dashboard.routes.js` — the route tree root. Mounts `Dashboard.vue` (`AppContainer`) at `accounts/:accountId` and nests conversation, settings, inbox, contacts, companies, calls, search, help center, campaigns and Captain route modules as children; also declares the standalone `onboarding_account_details`, `onboarding_inbox_setup`, `account_suspended`, and `no_accounts` routes.
- `app/javascript/dashboard/routes/dashboard/Dashboard.vue` — the shell rendered for every `accounts/:accountId/*` route: renders `NextSidebar` (from `components-next`), the `<router-view>` for the active page, `UpgradePage` (paywall overlay), `CommandBar`, `CopilotLauncher`/`CopilotContainer`, `FloatingCallWidget`, and modals (add-account, keyboard shortcuts). This is the actual layout root of the whole dashboard, not `App.vue`.
- `app/javascript/dashboard/helper/routeHelpers.js` — permission/redirect logic used by the guard: `routeIsAccessibleFor` checks a route's `meta.permissions` against the user's permissions; `defaultRedirectPage` picks a fallback landing page by permission tier (conversations → contacts → reports → portal); `validateActiveAccountRoutes`/`validateLoggedInRoutes` enforce the account-active/suspended state machine; `isAConversationRoute`, `getConversationDashboardRoute`, `isAInboxViewRoute`, `isUpgradePageBypassRoute` are route-name classifiers used elsewhere in the app (sidebar highlighting, upgrade-page bypass list: `billing_settings_index`, `settings_inbox_list`, `general_settings_index`, `agent_list`).

**Conversation routes**
- `app/javascript/dashboard/routes/dashboard/conversation/conversation.routes.js` — defines ~16 route names (`home`, `inbox_conversation`, `inbox_dashboard`, `conversation_through_inbox`, `label_conversations`, `team_conversations`, `folder_conversations`, `conversation_mentions`, `conversation_unattended`, `conversation_participating`, and their `_through_*` per-conversation variants) that all mount the **same** `ConversationView.vue` component, just with different `props()` functions (e.g. `{ inboxId }`, `{ label }`, `{ teamId }`, `{ foldersId }`, `{ conversationType: 'mention' }`). Custom-view (folder) routes have a `beforeEnter` guard (`redirectFolderListIfUnavailable` / `redirectFolderConversationIfUnavailable`) that lazily fetches `customViews/get` from the store and redirects to `home`/`inbox_conversation` if the folder id doesn't exist.
- `app/javascript/dashboard/routes/dashboard/conversation/ConversationView.vue` — the actual two/three-pane conversation screen (list + thread + contact panel), composed from `ChatList.vue`, `components/widgets/conversation/*`, and the `ContactPanel.vue` in the same directory.
- `app/javascript/dashboard/components/ChatList.vue` (1001 lines) — the conversation list pane: filtering, sorting, infinite scroll, bulk-select. One of the largest files in this module.
- `app/javascript/dashboard/components/widgets/conversation/ReplyBox.vue` (1604 lines) — the reply composer shell (channel-aware controls, attachments, canned responses, private notes vs. reply mode). The single largest file under these three directories.
- `app/javascript/dashboard/components/widgets/WootWriter/Editor.vue` (1218 lines) / `FullEditor.vue` (571 lines) — the rich-text editor used inside `ReplyBox`, plus supporting pieces (`SlashCommandMenu.vue`, `AudioRecorder.vue`, `CopilotEditor.vue`, `utils/webmOpusToOgg.js` for voice-note transcoding).
- `app/javascript/dashboard/components/widgets/conversation/MessagesView.vue` — renders the message thread itself; also renders the CTWA ad-referral card (`ReferralBubble` from `components-next/Conversation/`) at the top of the thread when `conversation.additional_attributes.referral` is set.
- `app/javascript/dashboard/components/widgets/conversation/WhatsappTemplates/`, `ContentTemplates/`, `linear/`, `copilot/` — channel- and feature-specific sub-widgets inside the conversation composer/sidebar (WhatsApp template picker, Linear issue linking, Copilot suggestions panel).

**Settings routes**
- `app/javascript/dashboard/routes/dashboard/settings/settings.routes.js` — aggregates ~20 per-feature route modules (account, agents, assignmentPolicy, agentBots, attributes, automation, auditlogs, billing, canned, inbox, templates, integrations, data, labels, macros, reports, sla, teams, customRoles, profile, security, conversationWorkflow, captain). `settings_home` redirects administrators to `general_settings_index` and everyone else to `canned_list`.
- `app/javascript/dashboard/routes/dashboard/settings/Wrapper.vue` and `SettingsWrapper.vue` — two shared layout shells reused across settings sub-routes: `Wrapper.vue` renders an optional `SettingsHeader` (title/icon/back-button) plus a `keep-alive`-wrapped `<router-view>`; `SettingsWrapper.vue` is a simpler centered-column variant without the header. Most settings feature route files (e.g. `inbox/inbox.routes.js`) nest their child pages under one of these two as the route `component`.
- `app/javascript/dashboard/routes/dashboard/settings/inbox/` (69 files) — the largest settings sub-area: `Settings.vue` (1450 lines, the inbox configuration tab host), `channels/` (one component per channel type — `Whatsapp.vue`, `CloudWhatsapp.vue`, `360DialogWhatsapp.vue`, `WhatsappEmbeddedSignup.vue`, `Facebook.vue`, `Instagram.vue`, `Twilio.vue`, `Sms.vue`, `BandwidthSms.vue`, `Telegram.vue`, `Line.vue`, `Tiktok.vue`, `Api.vue`, `Voice.vue`, `WhatsappCall.vue`, plus `google/`, `microsoft/`, `emailChannels/` subfolders — this is the channel-creation wizard's per-channel step), `settingsPage/` (post-creation config tabs like `CustomerSatisfactionPage.vue`, `CollaboratorsPage.vue`, `ConfigurationPage.vue`), `components/AccountHealth.vue` and `components/WhatsappManualMigrationDialog.vue`. The `whatsapp/` subfolder here holds `Reauthorize.vue`, relevant to the embedded-signup/coexistence work tracked elsewhere in this repo.
- `app/javascript/dashboard/routes/dashboard/settings/automation/constants.js` (832 lines) and `.../conversation/` `advancedFilterItems/languages.js` (751 lines) — large static config/data files (automation condition/action definitions, filter language lists), not logic-heavy but big.
- `app/javascript/dashboard/routes/dashboard/captain/` — Captain (AI agent) settings UI: `assistants/` (Index, `guardrails/`, `guidelines/`, `inboxes/`, `overview/`, `playground/`, `scenarios/`, `settings/` with `useAssistantSettings.js` composable), `documents/Index.vue` (449 lines), `responses/` (`FaqSuggestions.vue`, `Index.vue`), `tools/Index.vue`.
- `app/javascript/dashboard/routes/dashboard/contacts/` — `pages/ContactsIndex.vue` (580 lines, contacts list/table), `pages/ContactManageView.vue`, `components/ContactsBulkActionBar.vue`, `contactFilterItems/index.js`.

**Legacy component library**
- `app/javascript/dashboard/components/index.js` — explicitly commented `[NOTE][DEPRECATED] ... please do not add new components to this file`. Registers a `WootUIKit` global-component bundle (`wootCode`, `wootModal`, `wootInput`, `wootTabs`, etc.) via `Vue.component`. New UI work should go through `components-next/`, not this file.
- `app/javascript/dashboard/components/policy.vue` — a `<Policy as="div" :permissions="[...]" feature-flag="..." :installation-types="[...]">` wrapper component built on the `usePolicy` composable; conditionally renders its slot based on permissions/feature-flag/installation-type. Used for inline template-level gating (distinct from route-level `meta.permissions` gating).
- `app/javascript/dashboard/components/ConversationItem.vue` / `ConversationList.vue` — list-row rendering for conversations, consumed by `ChatList.vue` and by other list surfaces (e.g. search results, contact conversation history).
- `app/javascript/dashboard/components/Modal.vue`, `ModalHeader.vue`, `SnackbarContainer.vue`, `Snackbar.vue`, `NetworkNotification.vue` — app-wide chrome primitives still on the legacy path.
- `app/javascript/dashboard/components/app/` — global banners (`UpdateBanner.vue`, `PaymentPendingBanner.vue`, `PendingEmailVerificationBanner.vue`, `LowBackupCodesBanner.vue`, `StatusBanner.vue`) and `AddAccountModal.vue`.
- `app/javascript/dashboard/components/ui/` — a small design-system layer (`Tabs/`, `Dropdown/`, `DatePicker/` (455 lines), `DateRangePicker.vue`, `DateTimePicker.vue`, `ContextMenu.vue`, `Banner.vue`, `Wizard.vue`) — this is the predecessor to whatever equivalent primitives live in `components-next`.

**Modules**
- `app/javascript/dashboard/modules/search/` — the command-bar/global search feature: `search.routes.js`, `SearchView.vue` (531 lines), plus per-result-type components (`SearchResultConversationItem.vue`, `SearchResultContactItem.vue`, `SearchResultArticleItem.vue`, `SearchResultMessageItem.vue`), filters (`SearchFilters.vue`, `SearchDateRangeSelector.vue`, `SearchInboxSelector.vue`), and `helpers/searchHelper.js`.
- `app/javascript/dashboard/modules/contact/` — `ContactMergeModal.vue`, `ContactDeleteModal.vue`, and `components/MergeContact.vue`/`MergeContactSummary.vue` (contact-merge UI, distinct from the main `routes/dashboard/contacts/` route pages).
- `app/javascript/dashboard/modules/conversations/components/` — `MessageContextMenu.vue`, `ReportCaptainMessageDialog.vue` (small, feature-specific, pulled out of the conversation widget tree).
- `app/javascript/dashboard/modules/widget-preview/components/` — `Widget.vue`, `WidgetHead.vue`, `WidgetBody.vue`, `WidgetFooter.vue`: renders a live preview of the website widget inside inbox settings.

## How It Fits Together
- **Router guard → permissions**: every navigation runs through `validateAuthenticateRoutePermission` (`routes/index.js`), which checks `store.getters.isLoggedIn`/`getCurrentUser` from [[dashboard-store]], then defers to `validateLoggedInRoutes` (`helper/routeHelpers.js`) which reads each route's `meta.permissions` array (defined per-route in the `*.routes.js` files) and the account's active/suspended status. This is the single enforcement point for "can this agent see this page" — it mirrors backend Pundit policy gating conceptually but is purely client-side UX (the real authorization for data still happens via [[api-v1-controllers]] and [[authorization-policies]]).
- **ConversationView is a single component reused across ~16 route names** — filtering context (inbox, label, team, custom-view folder, mentions, unattended, participating) is passed entirely through route `props()` functions rather than separate components per view. Any change to `ConversationView.vue` or `ChatList.vue` affects every one of those routes simultaneously.
- **Conversation UI touches the Vuex/Pinia store** ([[dashboard-store]]) for conversation lists, messages, and typing state, and calls into the API client layer ([[api-client]]) for fetches/sends. Sent messages, assignment changes, and label/status changes here surface backend behavior documented in [[conversations-services]], [[messages-services]], and [[assignment]].
- **Custom-view (folder) routes** call `store.dispatch('customViews/get', 'conversation')` directly inside a route guard (`conversation.routes.js`), an unusual pattern of doing a store fetch inside routing logic rather than in a component lifecycle hook.
- **Settings routes → backend resources**: `settings/inbox/*` (channel creation wizard) drives inbox/channel creation APIs covered in [[whatsapp]], [[email]], [[facebook-instagram]], [[other-channels]]; `settings/automation/*` drives [[automation-rules]]; `settings/macros/*` drives [[macros]]; `settings/reports/*` drives [[reports]]; `settings/captain/*` and `routes/dashboard/captain/*` drive [[captain-ai]]; `settings/teams`/`settings/agents`/`settings/customRoles` map to account/role models in [[models]] and [[authorization-policies]].
- **`Dashboard.vue` is the actual app shell** for the authenticated area — it pulls in `NextSidebar`, `CopilotLauncher/Container`, and `FloatingCallWidget` from `components-next` ([[components-next]]), meaning this "legacy" routes module already depends on and is progressively being wrapped by the newer component system rather than being fully separate from it.
- **`components/index.js` (WootUIKit)** is a global-registration escape hatch that predates `<script setup>`/composition-API conventions elsewhere in the codebase; it's still imported by legacy templates that reference `<woot-modal>`, `<woot-input>`, etc. instead of importing components directly.
- **Search module** integrates with the command bar (`commands/commandbar.vue`, rendered from `Dashboard.vue`) and queries conversations/contacts/articles/messages — overlapping with [[public-platform-api]] search endpoints on the backend.

## Product Behavior
- The dashboard shell (`Dashboard.vue` + sidebar + `router-view`) is what the official user guide's "Dashboard Basics" lesson and "Application Structure and Navigation" article describe: the persistent sidebar, the conversation list/thread/contact-details three-pane layout, and command-bar (keyboard shortcut) access — all implemented here.
- The many conversation route variants (`home`, `label_conversations`, `team_conversations`, `folder_conversations`, `conversation_mentions`, `conversation_unattended`, `conversation_participating`) correspond directly to the sidebar's conversation-filtering entry points (all conversations, per-inbox, per-label, per-team, saved custom-view "folders", @-mentions, unattended, and participating-in) covered generically under "Chatwoot 101" / navigation basics.
- `routes/dashboard/settings/inbox/channels/*` is the implementation of the various channel setup guides under "Other channels" (WhatsApp embedded/manual/360Dialog/Twilio, Facebook, Instagram, SMS, Telegram, Line, TikTok, API channel, email) — each `.vue` file here is one channel's creation wizard step.
- `routes/dashboard/captain/` implements the Captain AI-agent configuration surface (assistants, guardrails, guidelines, documents, FAQ responses, tools, playground) described under the "Captain" guide category.
- The onboarding routes (`onboarding_account_details`, `onboarding_inbox_setup`) and the `needsOnboarding` redirect logic in `routes/index.js` implement the guided first-run flow referenced in "Setup account" guide topics.

## Notes for AI Agents
- **`components/index.js` is explicitly deprecated in-code** ("please do not add new components to this file") — do not add new entries there; new shared UI belongs in `components-next/` ([[components-next]]), matching the CLAUDE.md guidance to prefer `components-next/` for new work.
- **Route-level gating vs. template-level gating are two different mechanisms**: `meta.permissions` on a route object (checked once, in the router guard) vs. `<Policy :permissions="...">` (`components/policy.vue`, checked per-render via `usePolicy`). Don't assume one implies the other is unnecessary — sub-sections of a permitted page can still be individually gated with `<Policy>`.
- **`ConversationView.vue` is shared across ~16 routes** — when debugging "conversation view is broken on X filter but not Y," the bug is almost always in how `props()` is computed in `conversation.routes.js` or in a `computed` inside `ConversationView.vue`/`ChatList.vue` that branches on `inboxId`/`label`/`teamId`/`foldersId`/`conversationType`, not in a separate per-filter component.
- **Custom-view (folder) routes fetch data inside a route guard**, not a component — `isFolderAvailable`/`redirectFolderListIfUnavailable` in `conversation.routes.js` dispatch `customViews/get` directly. If custom views ever fail to load, the symptom is a silent redirect to `home`, not a visible error.
- **Two different settings layout wrappers exist** (`settings/Wrapper.vue` vs `settings/SettingsWrapper.vue`) with different props/behavior (header+back-button vs. plain centered column) — check which one a given `*.routes.js` file imports before assuming a settings page inherits a header.
- **`settings/inbox/` is genuinely large (69 files)** — this pass sampled the largest/most central files (`Settings.vue`, the `channels/` wizard steps, `settingsPage/` tabs, `components/AccountHealth.vue`) rather than reading every channel component; channel-specific quirks (e.g. WhatsApp coexistence/embedded-signup reauth flows referenced elsewhere in this repo's memory) live under `settings/inbox/channels/whatsapp/`.
- **This investigation sampled rather than exhaustively read** `app/javascript/dashboard/components/widgets/conversation/` (29 files + 9 subfolders) and `app/javascript/dashboard/routes/dashboard/settings/` (25 route modules) — file names and sizes were surveyed for all of them, but only the largest/most central files were opened in full.

## Related
- [[dashboard-store]]
- [[components-next]]
- [[api-client]]
- [[conversations-services]]
- [[messages-services]]
- [[whatsapp]]
- [[automation-rules]]
- [[macros]]
- [[assignment]]
- [[reports]]
- [[captain-ai]]
- [[authorization-policies]]
- [[composables-mixins-helpers]]
- [[routing-config]]
