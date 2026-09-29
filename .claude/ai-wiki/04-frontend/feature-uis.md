---
title: "Dashboard Feature UIs (Reports, Settings, Inbox Management)"
tags: [chatwoot, frontend, reports-ui, settings-ui]
generated: 2026-08-17
deepwiki_section: "Frontend Application"
---

# Dashboard Feature UIs (Reports, Settings, Inbox Management)

## Purpose

Focused treatment of three large feature UIs that [[dashboard-routes-components]] only covers in passing: the Reports UI, the Settings UI tree, and the Inbox management UI (channel-creation wizard + per-inbox settings). All three live under `app/javascript/dashboard/routes/dashboard/settings/`, even though Reports is mounted at `/accounts/:accountId/reports` — a historical quirk of the directory layout.

Sampling note: this page is grounded in the three `*.routes.js` files, the entry/index components (`reports/Index.vue`, `inbox/Index.vue`'s siblings, `ChannelList.vue`, `ChannelFactory.vue`, `InboxChannels.vue`, `FinishSetup.vue`), the shared layout components (`SettingsWrapper.vue`, `Wrapper.vue`, `SettingsLayout.vue`), and representative deep components (`ReportContainer.vue`, `SummaryReports.vue`, `useReportDrilldown.js`, `LiveReports.vue`, `SLAReports.vue`/`CsatResponses.vue`/`BotReports.vue` headers, `inbox/Settings.vue`, `channels/Whatsapp.vue`). The dozens of remaining per-section and per-channel Vue files were enumerated by directory listing only.

## Reports UI

Location: `app/javascript/dashboard/routes/dashboard/settings/reports/`. Routed by `reports.routes.js` under `frontendURL('accounts/:accountId/reports')`, with every child sharing `meta = { featureFlag: FEATURE_FLAGS.REPORTS, permissions: ['administrator', 'report_manage'] }` — the frontend mirror of the account-wide visibility rule (admin OR custom-role `report_manage`, see [[authorization-policies]]). All children render inside `components/ReportsWrapper.vue`, a trivial max-width scroll container around `<router-view />`.

### Route map

| Route name | Path | Component |
|---|---|---|
| `account_overview_reports` | `/overview` | `LiveReports.vue` |
| `conversation_reports` | `/conversation` | `Index.vue` |
| `agent_reports` / `inbox_reports` / `label_reports` / `team_reports` | `/agent`, `/inboxes`, `/label`, `/teams` | `AgentReports.vue` etc. (`oldReportRoutes` — legacy single-entity chart pages) |
| `agent_reports_index` / `agent_reports_show` (and inbox/team/label equivalents) | `/agents_overview`, `/agents/:id`, `/inboxes_overview`, `/inboxes/:id`, `/teams_overview`, `/teams/:id`, `/labels_overview`, `/labels/:id` | `*ReportsIndex.vue` / `*ReportsShow.vue` (`revisedReportRoutes`) |
| `sla_reports` | `/sla` | `SLAReports.vue` |
| `csat_reports` | `/csat` | `CsatResponses.vue` |
| `bot_reports` | `/bot` | `BotReports.vue` |

The bare `/reports` path redirects to `account_overview_reports`. Note the coexistence of `oldReportRoutes` and `revisedReportRoutes`: the revised flow is index-table → per-entity drilldown page, while the old flow is a single page with an entity dropdown; both are still registered.

### Building blocks

- **`components/ReportHeader.vue` + `components/ReportFilters.vue`** — every view starts with a `ReportHeader` (title + a slot usually holding a download `V4Button` from [[components-next]]) and a filter bar emitting `filter-change` with `{ from, to, groupBy, businessHours }`.
- **`ReportContainer.vue`** — the shared chart grid. Receives `reportKeys` (default: `conversations_count`, `incoming_messages_count`, `outgoing_messages_count`, `avg_first_response_time`, `avg_resolution_time`, `resolutions_count`, `reply_time`), reads `getAccountReports` from the store, formats x-axis labels per `GROUP_BY_FILTER` period (day/week/month/year, from `constants.js`), and renders one `ChartStats` + `BarChart` (from `shared/components/charts`) per metric using `METRIC_CHART` dataset configs. `BotReports.vue` reuses it with `bot_resolutions_count`/`bot_handoffs_count` keys.
- **Drilldown** — clicking a chart bar in `ReportContainer` builds a `drilldownRequest` (metric, bucket timestamp/label/value, from/to, type, id, groupBy, businessHours) and opens `components/ReportDrilldownDrawer.vue`, with prev/next bucket navigation that skips empty buckets (`findDrillableIndex`). Drilldown is admin-only at the UI level (`REPORT.DRILLDOWN.ADMIN_ONLY` alert for `report_manage`-only users). The data layer is `composables/useReportDrilldown.js`: a paging + AbortController state machine over `ReportsAPI.getDrilldown` ([[api-client]]) with request fingerprinting to dedupe identical opens; the fetcher is injectable so Captain's assistant drilldowns reuse the same machinery.
- **`components/SummaryReports.vue`** — the revised `*ReportsIndex` table. Fully key-driven: props `actionKey` (e.g. `summaryReports/fetchAgentSummaryReports`), `getterKey` (`agents/getAgents`), `summaryKey`, `fetchItemsKey`, `type`. Builds a `@tanstack/vue-table` with columns for conversations count, avg first-response/resolution/reply time, resolutions count; the name cell is a `SummaryReportLink` into the corresponding `*ReportsShow` route. `AgentReportsIndex.vue` is ~35 lines of wiring around it.
- **`*ReportsShow.vue`** — thin wrappers around `components/WootReports.vue` with `type`/getter/action keys and the entity resolved from `route.params.id`.
- **`LiveReports.vue`** (overview) — a stack of live/heatmap containers: `StatsLiveReportsContainer`, `ConversationHeatmapContainer` + `ResolutionHeatmapContainer` (`components/heatmaps/`), `AgentLiveReportContainer`, `TeamLiveReportContainer`.
- **CSAT / SLA** — `CsatResponses.vue` composes `CsatMetrics` + `CsatTable` + `Csat/CsatFilters` over the `csat` store module (`csat/getMetrics`, `csat/get`, `csat/downloadCSATReports`); the `components/Csat*` family includes rating distribution, expanded rows, and a `CsatReviewNotesPaywall.vue` (plan-gated, see [[plan-tiers-billing]]). `SLAReports.vue` composes `components/SLA/SLAMetrics|SLATable|SLAReportFilters` over the `slaReports` module with paged fetching.

### Download flow

Every view's download button follows the same pattern: `generateFileName({ type, to, businessHours })` from `dashboard/helper/downloadHelper`, then a store dispatch (`downloadConversationsSummaryReports`, `downloadAgentReports` / `downloadLabelReports` / `downloadInboxReports` / `downloadTeamReports`, `csat/downloadCSATReports`). The actions live in `app/javascript/dashboard/store/modules/reports.js` ([[dashboard-store]]) and end in `downloadCsvFile(fileName, response.data)` — the CSV is generated server-side by the reports backend ([[reports]]). `SummaryReports.vue` exposes `downloadReports()` via `defineExpose` so the index page's header button can trigger it through a template ref.

`helpers/reportFilterHelper.js` and `constants.js` (`GROUP_BY_FILTER`, `METRIC_CHART`) round out the directory; analytics events fire through `useTrack(REPORTS_EVENTS.*)`.

## Settings UI

Location: `app/javascript/dashboard/routes/dashboard/settings/`. `settings.routes.js` aggregates one `*.routes.js` module per section and defines `settings_home` (`/accounts/:accountId/settings`), which redirects admins (with no custom role) to `general_settings_index` and everyone else to `canned_list`.

### Sections (route module directories)

`account` (general settings), `agents`, `agentBots`, `assignmentPolicy`, `attributes` (custom attributes), `auditlogs`, `automation`, `billing`, `canned` (canned responses), `captain`, `conversationWorkflow`, `customRoles`, `data` (data imports: `settings_data_imports` list + `:dataImportId` show), `inbox` (see next section), `integrations`, `labels`, `macros`, `profile`, `reports` (mounted under `/reports`, above), `security`, `sla`, `teams`, `templates` (`settings_templates`). Several of these are plan/feature-gated Enterprise surfaces (billing, captain, customRoles, sla, auditlogs — see [[plan-tiers-billing]]); gating happens via `featureFlag` route meta and `isFeatureEnabledonAccount` checks, not separate route trees.

### Shared layout pattern

Four layout components at the directory root define the pattern every section follows:

- **`SettingsWrapper.vue`** — the standard list-page shell: scroll container, `max-w-5xl` centered, `<router-view>` inside `<keep-alive>` keyed by `route.fullPath`. Used as the parent `component` for simple sections.
- **`Wrapper.vue`** — the richer shell used by multi-page sections (e.g. inbox management): renders `SettingsHeader.vue` (icon, i18n'd `headerTitle`, optional back button) above the routed view; the parent route passes `props` per route name (see `inbox.routes.js` computing `showBackButton`/`fullWidth` from `params.name`).
- **`SettingsSubPageHeader.vue`** — page-level title header used inside flows (e.g. the inbox creation wizard).
- **`SettingsLayout.vue`** — slot-based body layout (`header`/`preBody`/`loading`/`body` slots) with built-in loading state (`woot-loading-state`) and a no-records message, used by section index pages.

The canonical simple section (sampled: `agents/agent.routes.js`) is: one route under `frontendURL('accounts/:accountId/settings/<section>')` with `SettingsWrapper` as parent, an empty-path redirect to the `<section>_list` named child, and `meta: { featureFlag, permissions: ['administrator'] }`. Section UIs increasingly pull form primitives from [[components-next]] (`SettingsToggleSection`, `SettingsFieldSection`, `SettingsAccordion`, `Button`, `Editor`, `ColorPicker`, `Select`).

## Inbox Management UI

Location: `app/javascript/dashboard/routes/dashboard/settings/inbox/`. `inbox.routes.js` registers two parallel trees under `/settings/inboxes`, both admin-only with `FEATURE_FLAGS.INBOX_MANAGEMENT`:

1. `SettingsWrapper` → `settings_inbox_list` (`Index.vue`) — the inbox list.
2. `Wrapper.vue` (`SettingsContent`) → the creation wizard (`/new/...`) and the per-inbox settings page (`:inboxId/:tab?` → `settings_inbox_show`, rendered `fullWidth`).

### Channel-creation wizard

`InboxChannels.vue` is the wizard frame: a four-step `woot-wizard` sidebar (CHANNEL → INBOX → AGENT → FINISH, mapped to routes `settings_inbox_new` → `settings_inboxes_page_channel` → `settings_inboxes_add_agents` → `settings_inbox_finish`), with step copy passed through `replaceInstallationName` from `useBranding` for white-labeling. Steps:

- **`ChannelList.vue`** (`settings_inbox_new`) — grid of `ChannelItem` cards. The list is computed: website, facebook, whatsapp, sms, email, api (title overridable via `globalConfig.apiChannelName`), telegram, line, instagram, plus conditional entries (TikTok requires `window.chatwootConfig.tiktokAppId`; account `features` gate others). Clicking navigates to `settings_inboxes_page_channel` with the channel key as `:sub_page`.
- **`ChannelFactory.vue`** (`settings_inboxes_page_channel`) — a render-function switch mapping `channelName` → component from `channels/`: `Facebook`, `Website`, `Twitter`, `Api`, `Email`, `Sms`, `Whatsapp`, `WhatsappCall`, `Line`, `Telegram`, `Instagram`, `Tiktok`, `Voice`. Unknown names render nothing. The `channels/` directory also holds provider sub-forms not in the factory map directly: `Twilio.vue`, `360DialogWhatsapp.vue`, `CloudWhatsapp.vue`, `WhatsappEmbeddedSignup.vue`, `BandwidthSms.vue`, `emailChannels/` (`Google.vue`, `Microsoft.vue`, `OAuthChannel.vue`, `ForwardToOption.vue`, `EmailInboxFinish.vue`), and per-channel `Reauthorize.vue` components under `google/`, `microsoft/`, `instagram/`, `tiktok/`, `whatsapp/`. Sampled in depth: `channels/Whatsapp.vue` is itself a provider selector (query-param `?provider=`) choosing between WhatsApp Cloud (embedded signup via `WhatsappEmbeddedSignup.vue` when `window.chatwootConfig.whatsappAppId` is set and the `WHATSAPP_EMBEDDED_SIGNUP_FLOW` cloud feature is enabled, else manual `CloudWhatsapp.vue`), `Twilio.vue`, and `360DialogWhatsapp.vue` — see [[whatsapp]]. Channel specifics for other types: [[email]], [[facebook-instagram]], [[other-channels]].
- **`AddAgents.vue`** (`settings_inboxes_add_agents`) — multi-select of agents for the new inbox; on save `router.replace`s to `settings_inbox_finish`.
- **`FinishSetup.vue`** (`settings_inbox_finish`) — channel-aware completion screen driven by `useInbox(route.params.inbox_id)` predicates: web-widget embed script (`woot-code`), callback webhook URL + verify token for manual WhatsApp Cloud (hidden for `provider_config.source === 'embedded_signup'`), webhook URLs for Twilio/LINE/SMS, `EmailInboxFinish` for provider-less email, a duplicate-Instagram-inbox banner, and QR codes (via the `qrcode` package) for WhatsApp (`wa.me`), Messenger (`m.me`), and Telegram (`t.me`). Exits to `settings_inbox_show` ("more settings") or `inbox_dashboard`.

### Per-inbox settings (`Settings.vue`)

`Settings.vue` (~1450 lines, Options API + `inboxMixin`) is the tabbed configuration page for an existing inbox; `:tab?` in the route selects the tab. The `tabs()` computed assembles: `inbox-settings` and `collaborators` always; `business-hours` and `csat`; `pre-chat-form` (web widget only); `configuration` (Twilio, LINE, API, provider-less email, WhatsApp Cloud, web widget); `bot-configuration` (behind `FEATURE_FLAGS.AGENT_BOTS`); `whatsapp-health` (WhatsApp Cloud); `voice-configuration` (Twilio SMS number + `CHANNEL_VOICE` flag). Tab bodies live in `settingsPage/`: `CollaboratorsPage.vue`, `ConfigurationPage.vue`, `CustomerSatisfactionPage.vue`, `VoiceConfigurationPage.vue`, `WhatsappCallingPage.vue`, `WhatsappBusinessManagementToken.vue`; supporting pieces in `components/` (`WeeklyAvailability`/`BusinessDay`, `BotConfiguration`, `AccountHealth`, `SenderNameExamplePreview`, `LockToSingleConversationPreview`, `WhatsappManualMigrationBanner`/`Dialog`, `InboxReconnectionRequired`) and `PreChatForm/Settings.vue`. It also mounts every channel's `Reauthorize` component (Facebook, Instagram, TikTok, Microsoft, Google, WhatsApp), the live widget preview (`modules/widget-preview`), and uses `InboxHealthAPI` plus [[components-next]] `Settings*` primitives throughout.

## How It Fits Together

- **Routing**: all three areas plug into the dashboard router described in [[dashboard-routes-components]]; route `meta.permissions` + `meta.featureFlag` are the enforcement points (checked by router guards), with backend authorization as the real boundary ([[authorization-policies]]).
- **Data**: Reports views dispatch into `reports`, `summaryReports`, `csat`, `slaReports` store modules ([[dashboard-store]]) which call `ReportsAPI` and friends ([[api-client]]); the numbers themselves come from the reporting backend ([[reports]]). Inbox management dispatches into the `inboxes` module and channel-specific create endpoints.
- **UI kit**: newer code (report headers/buttons, settings form sections, drilldown drawer) uses [[components-next]]; legacy pieces still use `woot-*` globals and `dashboard/components` widgets. Composables like `useInbox`, `useAccount`, `useMapGetter`, `useAlert`, `useTrack` are covered in [[composables-mixins-helpers]].
- **Gating**: embedded signup, TikTok, voice, CSAT paywall pieces, and several settings sections depend on cloud feature flags / plan tiers ([[plan-tiers-billing]]).

## Notes for AI Agents

- Reports live under `routes/dashboard/settings/reports/` but are mounted at `/reports`, not `/settings/reports` — don't infer URLs from the directory path.
- Two generations of entity reports coexist: `AgentReports.vue` (old, `/agent`) vs `AgentReportsIndex/Show.vue` (revised, `/agents_overview`, `/agents/:id`). Check which one a change should target before editing.
- `SummaryReports.vue` and `WootReports.vue` are key-driven generic components — behavior differences between agent/inbox/team/label reports come from the string keys passed in, not from per-entity components.
- Chart drilldown has a UI-level admin-only gate inside `ReportContainer.vue` even though the route allows `report_manage`; keep that in mind when reasoning about who sees what.
- Adding a channel to the wizard requires touching at least three places: `ChannelList.vue` (card), `ChannelFactory.vue` (map entry), and usually `FinishSetup.vue` (completion content); per-inbox tabs are added in `Settings.vue`'s `tabs()` computed plus a `settingsPage/` component.
- `Settings.vue` is a very large Options-API component with `inboxMixin`; new tab bodies should be self-contained `settingsPage/` components rather than more inline template branches.
- The empty-path redirects (`settings_home`, section roots, `/reports`) are route-name based; renaming a route name breaks them silently.

## Related

- [[dashboard-routes-components]] — overall dashboard routing and the general routes tour this page deep-dives from
- [[dashboard-store]] — store modules backing these views
- [[components-next]] — the design-system components newer settings/reports UIs use
- [[composables-mixins-helpers]] — `useInbox`, `useAccount`, `useAlert`, `useTrack`, `inboxMixin`
- [[api-client]] — `ReportsAPI`, `InboxHealthAPI`, and the endpoint wrappers
- [[reports]] — backend report generation and CSV endpoints
- [[whatsapp]], [[email]], [[facebook-instagram]], [[other-channels]] — channel backends behind the creation wizard
- [[plan-tiers-billing]] — feature/plan gating surfaced in these UIs
- [[authorization-policies]] — the real permission boundary behind route `meta.permissions`
