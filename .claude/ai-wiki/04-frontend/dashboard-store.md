---
title: "Dashboard State Management (Vuex/Pinia)"
tags: [chatwoot, frontend, vuex, pinia, state-management]
generated: 2026-08-17
deepwiki_section: "Frontend Application (Vuex state)"
---

# Dashboard State Management (Vuex/Pinia)

## Purpose

This is the client-side data layer for the agent dashboard (`app/javascript/dashboard`). It owns everything the Vue app needs beyond a single component's local state: conversations, contacts, inboxes, labels, macros, reports, Captain (AI) data, calls, companies, and the current user/account session. The codebase is mid-migration from Vuex (the original store, `store/`) to Pinia (`stores/`, plural) — both run side by side in the same app, wired up through the same entrypoint, and a shared factory (`storeFactory.js`) lets a single module definition target either.

## Key Files & Classes

- `app/javascript/dashboard/store/index.js` — the root Vuex store; imports and registers ~50 Vuex modules (one per domain: conversations, contacts, inboxes, labels, macros, reports, Captain sub-modules, etc.) plus `globalConfig` from `shared/store/globalConfig`.
- `app/javascript/dashboard/store/storeFactory.js` — `createStore({ name, API, type, getters, actions, mutations, state })`: generates a full CRUD module (list/show/create/update/delete + `uiFlags` + `meta`) for either Vuex (`type: 'vuex'`, the default) or Pinia (`type: 'pinia'`). Also exports `generateMutationTypes`, `createInitialState`, `createGetters`, `createMutations`, `createCrudActions` as building blocks used directly by some Vuex modules.
- `app/javascript/dashboard/store/storeFactoryHelper.js` — the actual CRUD implementations: Vuex thunk-style action creators (`getRecords`, `showRecord`, `createRecord`, `updateRecord`, `deleteRecord`) and their Pinia equivalents (`piniaGetRecords`, `piniaShowRecord`, `piniaCreateRecord`, `piniaUpdateRecord`, `piniaDeleteRecord`). Every one of these sets a `uiFlags` loading flag before the call and clears it in a `finally`, and routes API errors through `throwErrorMessage`.
- `app/javascript/dashboard/store/utils/api.js` — shared utilities used across (almost) every module: `throwErrorMessage`/`parseAPIErrorResponse` (normalizes Rails error shapes), `setAuthCredentials`/`clearCookiesOnLogout` (session cookie + `emitter` events on login/logout, e.g. `CHATWOOT_SET_USER`, `CHATWOOT_RESET`, `ANALYTICS_IDENTITY`/`RESET`), and `deleteIndexedDBOnLogout`.
- `app/javascript/shared/helpers/vuex/mutationHelpers.js` — generic list-mutation helpers (`set`, `create`, `update`, `updateAttributes`, `setSingleRecord`/upsert, `destroy`, presence helpers) reused by many Vuex modules' mutations, not just the factory-generated ones.
- `app/javascript/dashboard/store/mutation-types.js` — the single flat namespace of Vuex mutation-type string constants used across (mostly) hand-written modules.
- `app/javascript/dashboard/store/modules/conversations/` — the largest and most central Vuex module (`index.js` 383 lines, `actions.js` 556 lines, plus `getters.js`, `helpers.js`, `helpers/actionHelpers.js`, `helpers/filterHelpers.js`, `actions/messageReadActions.js`, `actions/messageTranslateActions.js`). Owns `allConversations`, `selectedChatId`, `attachments`, filters (`appliedFilters`, `conversationFilters`), and dispatches into other modules on mutation (e.g. `contacts/SET_CONTACT_ITEM`, `conversationMetadata/SET_CONVERSATION_METADATA`).
- `app/javascript/dashboard/store/modules/contacts/` — split-file Vuex module (`actions.js`/`getters.js`/`mutations.js`/`index.js`), the pattern also used by `teams/`, `helpCenterArticles/`, `helpCenterCategories/`, `helpCenterPortals/`.
- `app/javascript/dashboard/store/modules/auth.js` — current user/account session: `currentUser`, per-account role/availability/`custom_role_id` derived via `getCurrentAccountId` (read from `rootState.route.params.accountId`, i.e. Vue Router state synced into Vuex — see below).
- `app/javascript/dashboard/store/captain/*.js` — ~13 Vuex modules for Captain (AI agent) data: assistants, documents, responses, FAQ suggestions, inboxes, bulk actions, copilot threads/messages, scenarios, tools, custom tools, agent sessions.
- `app/javascript/dashboard/stores/` (Pinia, plural directory) — newer stores, some via the factory (`companies.js` → `useCompaniesStore`), some hand-rolled directly with `defineStore` (`calls.js` → `useCallsStore`, `callHistory.js` → `useCallHistoryStore`).
- `app/javascript/dashboard/stores/companies.js` — example of a factory-based Pinia store with heavy custom logic layered on top: request-token guards (`companyContactsRequestToken`, etc.) to discard stale async responses when the active company changes mid-flight, `camelcaseKeys`/`snakecaseKeys` conversion at the API boundary, and FormData building for avatar uploads.
- `app/javascript/dashboard/stores/calls.js` — hand-rolled Pinia store for in-progress voice calls (Twilio + WhatsApp), not CRUD-shaped; tracks `calls[]` with `isActive`/`callSid`, has provider-specific teardown (`cleanupWhatsappSession` vs `TwilioVoiceClient.endClientCall`) and inline comments explaining race conditions with WhatsApp's async recording upload.
- `app/javascript/dashboard/composables/store.js` — the bridge between Options-API-era Vuex and Composition API components: `useStore()` (grabs `vm.proxy.$store`), `useStoreGetters()`, `useMapGetter(key)`, `useFunctionGetter(key, ...args)`. Widely used across `composables/*` (agents, macros, automation, inbox, admin, policy, etc.) instead of `mapGetters`.
- `app/javascript/shared/store/globalConfig.js` — a Vuex module registered into the same root store (installation-wide config like feature toggles, not account-specific).
- `app/javascript/entrypoints/dashboard.js` — where both stores get installed on the Vue app: `app.use(store)` (Vuex) and `app.use(pinia)` (via `createPinia()`), plus `sync(store, router)` from `vuex-router-sync` which is why Vuex getters can read `rootState.route.params`.

## How It Fits Together

- **API client layer**: every module calls into `dashboard/api/*` clients (e.g. `ConversationApi`, `MessageApi`, `CompanyAPI`) — see [[api-client]]. The store never talks to Rails directly; it always goes through these API wrapper classes.
- **Conversations module ↔ other modules**: `conversations/actions.js` commits into other Vuex modules by namespaced mutation string, e.g. `commit('contacts/${types.SET_CONTACT_ITEM}', ...)` when a conversation is fetched, and `commit('conversationMetadata/${types.SET_CONVERSATION_METADATA}', ...)` when paging in older messages. This cross-module commit-by-string-path pattern (rather than importing the other module) is how Vuex modules interoperate here.
- **ActionCable / websockets**: conversation mutations like `UPDATE_ASSIGNEE`, `ADD_MESSAGE`, `UPDATE_CONVERSATION`, `CHANGE_CONVERSATION_STATUS`, `UPDATE_MESSAGE_CALL_STATUS` are the landing points for realtime events pushed over the websocket (see `helper/voice` for `handleVoiceCallCreated`/`handleVoiceCallUpdated` wired into `conversations/actions.js`). `mutt`/`emitter` (`shared/helpers/mitt`) is used alongside Vuex to fan out UI-only signals like `BUS_EVENTS.SCROLL_TO_MESSAGE` that don't belong in state.
- **Auth/session**: `auth.js`'s `getCurrentAccountId` getter reads `rootState.route.params.accountId` — this only works because `vuex-router-sync` keeps a `route` module in sync with Vue Router, so per-account scoping flows from the URL, not from a separately-tracked "current account" field.
- **Backend counterparts**: conversations/messages/contacts modules mirror [[models]] and are populated by controllers documented in [[api-v1-controllers]]; Captain store modules correspond to [[captain-ai]]; macros/automation modules correspond to [[macros]] and [[automation-rules]]; reports modules correspond to [[reports]].
- **Pinia migration boundary**: `storeFactory.js` is the explicit bridge — new domains (companies, calls, call history) are being added as Pinia stores, some still going through the shared CRUD factory (`companies.js`) and some bypassing it entirely for non-CRUD-shaped state (`calls.js`, `callHistory.js`). Components can mix both: Options API components use `mapGetters`/`this.$store`, Composition API components use `composables/store.js` for Vuex and `useXStore()` composables directly for Pinia.
- **Consumed by**: [[dashboard-routes-components]] and [[components-next]] are the primary consumers (views and message-bubble components read from these stores); [[composables-mixins-helpers]] wraps a lot of store access behind composables like `useInbox`, `useAdmin`, `useCaptain`.

## Product Behavior

This module is the client-side reflection of most "Chatwoot 101" and "Features explained" concepts: conversation status/filters map to the conversation list and filters described in the core dashboard basics guide; the Captain store modules back the Captain (AI agent) product surface (assistants, documents, FAQs, Memories, Copilot) described in the Captain guide category; the `calls`/`callHistory` Pinia stores back the Voice Channels guide (Twilio voice, WhatsApp voice calling) — `calls.js` explicitly special-cases WhatsApp vs Twilio call teardown. The `companies` Pinia store backs company/contact-organization features referenced in the Contacts feature guide.

## Notes for AI Agents

- Two state-management systems coexist by design, not by accident — don't "fix" this by trying to consolidate everything into one. New CRUD-shaped domains generally go into `stores/` (Pinia) via `createStore({ type: 'pinia', ... })`; legacy/large interconnected domains (conversations, contacts, auth) remain Vuex in `store/modules/`.
- The factory (`storeFactory.js`/`storeFactoryHelper.js`) assumes a conventional API client shape: `API.get(params)`, `API.show(id)`, `API.create(obj)`, `API.update(id, obj)`, `API.delete(id)`, each returning `response.data.payload`/`response.data`. If a domain's API client doesn't follow this shape, don't force it through the factory — `calls.js`/`callHistory.js` show the accepted escape hatch of a hand-rolled `defineStore`.
- Factory-generated Pinia `get`/`show`/`update` actions in `storeFactoryHelper.js` do **not** guard against out-of-order responses (no request-token check) — `companies.js` layers its own `*RequestToken` counters around `show`, `getCompanyContacts`, `getCompanyNotes`, `getCompanyConversations`, and `searchCompanyContactCandidates` for exactly this reason. If you add async record-detail loading to a Pinia store, check whether you need the same guard.
- Vuex modules cross-call each other by namespaced mutation-type string (`commit('otherModule/${types.SOME_TYPE}', payload)`) rather than importing the module — this is easy to miss when grepping for a mutation type by name only, since the type constant is often shared across modules in `mutation-types.js`.
- `conversations/index.js`'s `UPDATE_CONVERSATION` mutation deliberately drops out-of-order websocket updates by comparing `conversation.updated_at < selectedConversation.updated_at`, and its `SET_ALL_CONVERSATION` mutation preserves in-flight message/attachment state (`messages`, `attachments`, `dataFetched`, `allMessagesLoaded`) when the incoming conversation is the currently-selected chat — don't naively overwrite the whole record in a new mutation without checking this existing merge logic first.
- `getCurrentAccountId` (in `auth.js`) derives the active account from the router's `accountId` param via `vuex-router-sync`, not from a stored field — code that needs "the current account" should generally go through this getter rather than tracking its own copy.
- `mutationHelpers.js`'s `set`/`create`/`update`/`destroy`/`setSingleRecord` operate on `state.records` by convention (array of objects with `id`) — this is the same convention `storeFactory.js`'s `createMutations` wires up, so hand-written Vuex modules that reuse these helpers are implicitly compatible with the factory's mutation-type naming (`SET_x`, `ADD_x`, `EDIT_x`, `DELETE_x`, `UPSERT_x`).
- Spec layout mirrors module layout closely: `store/modules/specs/<module>/{actions,getters,mutations}.spec.js` (+ `fixtures.js`), and `stores/specs/<name>.spec.js` for Pinia — follow the existing sibling pattern rather than inventing a new spec structure for a new module.
- No enterprise override point was found specifically for this store layer (no `prepend_mod_with`-style module patching under `store/`/`stores/`) — enterprise dashboard behavior appears to live in `enterprise/app/javascript` as separate components/composables rather than store patches; verify before assuming otherwise for a specific module.
- This investigation sampled the largest/most-central files (conversations, auth, contacts, companies, calls) and the shared factory/helpers; the ~50 other Vuex modules under `store/modules/` and the Captain modules under `store/captain/` were not individually read — they follow the same factory/hand-written-CRUD patterns observed here, based on file size and naming.

## Related

- [[api-client]] — the API client classes every store action calls into.
- [[conversations-services]] — backend counterpart for conversation actions dispatched from this store.
- [[contacts-services]] — backend counterpart for the contacts module.
- [[messages-services]] — backend counterpart for message actions (`messageReadActions.js`, `messageTranslateActions.js`).
- [[captain-ai]] — backend for the Captain store modules.
- [[macros]] and [[automation-rules]] — backend for the corresponding store modules.
- [[reports]] — backend for `reports.js`, `summaryReports.js`, `SLAReports.js`.
- [[dashboard-routes-components]] — primary consumer of this store layer (views).
- [[components-next]] — newer components consuming Pinia stores and composables.
- [[composables-mixins-helpers]] — composables (`useInbox`, `useAdmin`, `useCaptain`, etc.) that wrap store access.
- [[api-v1-controllers]] — backend controllers that fulfill the API calls made from these store actions.
