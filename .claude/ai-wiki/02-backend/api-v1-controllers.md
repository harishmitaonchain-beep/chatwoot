---
title: "Application API (Agent-facing Controllers)"
tags: [chatwoot, backend, api, controllers, authorization]
generated: 2026-08-17
deepwiki_section: "API Layer (Application API)"
---

# Application API (Agent-facing Controllers)

## Purpose

This is the JSON API the Vue dashboard (and any script authenticated with a user's `api_access_token` or an agent bot token) talks to for everything an agent does day-to-day: reading/replying to conversations, managing contacts, running automations, configuring inboxes, etc. It lives under `app/controllers/api/v1`, is namespaced almost entirely under `Api::V1::Accounts::*` (i.e. scoped to one `account_id` in the URL), and is distinct from:
- the **Platform API** (`app/controllers/platform`) — super-admin/agency-level, cross-account,
- the **Public API** (`app/controllers/public`) — help center portal, no session,
- the **Widget API** (`app/controllers/api/v1/widget/*`) — the website chat widget's own contact-token auth, covered separately (see [[widget-backend]]).

This page covers the agent-facing surface: `app/controllers/api/v1/*.rb` (top-level: accounts signup/show, profile, notification subscriptions, Twitter webhook shim) and everything under `app/controllers/api/v1/accounts/**` (~80 controllers). I read the base classes, the concerns, and a representative sample of the largest/most-central controllers (conversations, messages, contacts, inboxes, accounts, search); I did not read every one of the ~80 `accounts/*` controllers individually — most follow the same thin-controller/service-object shape described below, so I sampled rather than exhaustively reading each.

## Key Files & Classes

**Auth/base chain** (every request passes through this):
- `app/controllers/application_controller.rb` — root controller; sets `Current.user`, includes `RequestExceptionHandler`, `Pundit::Authorization`; ends with `ApplicationController.include_mod_with('Concerns::ApplicationControllerConcern')` (enterprise extension point).
- `app/controllers/api/base_controller.rb` (`Api::BaseController`) — decides `authenticate_by_access_token?` (presence of `api_access_token` header) and branches between `authenticate_access_token!` (bot/user token via `AccessTokenAuthHelper`) and Devise's `authenticate_user!`.
- `app/controllers/api/v1/accounts/base_controller.rb` (`Api::V1::Accounts::BaseController`) — resolves `Current.account` via `EnsureCurrentAccountHelper#current_account`, enforces `Current.account.api_and_webhooks_enabled?` when authenticated by access token, wraps the request in `switch_locale_using_account_locale`. Nearly every `accounts/*` controller inherits from this.
- `app/controllers/concerns/ensure_current_account_helper.rb` — loads `Account.find(params[:account_id])`, checks `account.active?`, and for a `User` looks up `AccountUser` (`Current.account_user`); for an `AgentBot` checks `agent_bot_inboxes` membership instead.
- `app/controllers/concerns/access_token_auth_helper.rb` — `AccessTokenAuthHelper::BOT_ACCESSIBLE_ENDPOINTS` is a hardcoded allowlist of `controller#action` pairs bots may hit (conversations show/toggle_status/create/update, messages#create, assignments#create, labels#index/create) — anything else 401s a bot even with a valid token.
- `app/controllers/concerns/request_exception_handler.rb` — the `around_action :handle_with_exception` that turns `RecordNotFound`→404, `Pundit::NotAuthorizedError`→401, `ParameterMissing`→422, `QueryCanceled`→422 with a friendly "statement timeout" message, and always runs `Current.reset` in an `ensure` (thread-variable leak guard for Puma/Thin).

**Central resource controllers** (representative, not exhaustive):
- `app/controllers/api/v1/accounts/conversations_controller.rb` — index/meta/search (delegate to `ConversationFinder`), `create` (delegates to `ConversationBuilder` + `Messages::MessageBuilder`, wrapped in a DB transaction), `filter` (delegates to `Conversations::FilterService`), `toggle_status`/`bot_handoff?` (agent-bot-only pending→open handoff), `toggle_priority`, `update_last_seen` (throttled to hourly writes unless there are unread messages, then fires `Conversations::UnreadCounts::Notifier` / `FilteredCountInvalidator`), `destroy` → `Conversations::DeleteService`. Ends with `prepend_mod_with('Api::V1::Accounts::ConversationsController')`.
- `app/controllers/api/v1/accounts/conversations/base_controller.rb` and `.../conversations/messages_controller.rb` — nested under a conversation; `messages_controller#create` builds via `Messages::MessageBuilder`, `#update` (status/external_error) is gated to API-channel inboxes only (`ensure_api_inbox`) and delegates to `Messages::StatusUpdateService`, `#retry` re-enqueues `SendReplyJob` after an optimistic-locked `claim_message_retry`, `#translate` calls `Integrations::GoogleTranslate::ProcessorService` and caches results in `message.translations`.
- `app/controllers/api/v1/accounts/contacts_controller.rb` — index/search/filter (via `Contacts::FilterService`)/active, `import` (enqueues via `DataImport`), `export` (`Account::ContactsExportJob`), `create`/`update` merge `custom_attributes`/`additional_attributes` rather than overwrite, `destroy` blocked if the contact is currently online (`OnlineStatusTracker`), avatar-from-URL handled async via `Avatar::AvatarFromUrlJob`. Uses the `Sift` gem (`procore-sift`) for declarative `sort_on` (email/name/phone/last_activity/created_at/company/city/country).
- `app/controllers/api/v1/accounts/inboxes_controller.rb` — includes `Api::V1::InboxesHelper` and `Api::V1::Accounts::Concerns::WhatsappHealthManagement`; `create`/`update` build/mutate a `channel` polymorphically and wrap channel + working-hours + CSAT-config updates in one transaction.
- `app/controllers/api/v1/accounts_controller.rb` (top-level, not under `accounts/`) — account signup (`create`, unauthenticated, gated by `GlobalConfigService.account_signup_enabled?` + hCaptcha), `show`/`update`/`cache_keys`. Notably swaps `pundit_user` to use `@account`/`@current_account_user` instead of `Current.*` because signup runs before `Current.account` exists.
- `app/controllers/api/v1/accounts/search_controller.rb` — thin wrapper around `SearchService` (conversations/contacts/messages/articles/`all`).
- `app/controllers/api/v1/webhooks_controller.rb` — the odd one out: skips user auth entirely, handles Twitter CRC challenge + event consumption (`Webhooks::Twitter`); channel webhooks otherwise live under `app/controllers/webhooks/*`, not this namespace.
- `app/controllers/api/v1/profile/mfa_controller.rb`, `.../profile/sessions_controller.rb` — per-user (not per-account) profile actions; MFA gated by `Chatwoot.mfa_enabled?`, delegates to `Mfa::ManagementService` / `Mfa::AuthenticationService`.
- `app/controllers/api/v1/accounts/concerns/whatsapp_health_management.rb` — inbox-controller concern for WhatsApp channel health checks (see [[whatsapp]]).
- Nested-resource controllers follow a consistent pattern of a small `base_controller.rb` that resolves and authorizes the parent (e.g. `contacts/base_controller.rb`, `conversations/base_controller.rb`, `companies/base_controller.rb` in enterprise) — sampled several, all identical in shape to the conversations one shown above.
- `config/routes.rb` (lines ~43–300+) — the full route map for this namespace; large `resources :conversations do ... end` and `resources :contacts do ... end` blocks show the nested-controller structure, and several resources are gated with `if ChatwootApp.enterprise?` (e.g. `reporting_events`, `calls`, `whatsapp_calls`, per-inbox `conference`/whatsapp-calling toggles).

**Views**: responses are rendered via Jbuilder templates under `app/views/api/v1/accounts/**` (one directory per controller, e.g. `app/views/api/v1/accounts/conversations/`), not serializers — confirmed by directory listing.

## How It Fits Together

- **Authorization**: every action either calls `authorize(model)` (Pundit, via `check_authorization` or ad hoc in a `before_action`) or `policy_scope(...)` for index actions (e.g. `InboxesController#index` uses `policy_scope(Current.account.inboxes)`). See [[authorization-policies]] for the policy classes themselves.
- **Models**: controllers here are thin — they mutate `Current.account.conversations`, `.contacts`, `.inboxes`, etc. directly, or delegate the real work to service objects (`ConversationBuilder`, `Messages::MessageBuilder`, `Conversations::FilterService`, `Contacts::FilterService`, `Conversations::DeleteService`, `Messages::StatusUpdateService`). See [[models]], [[conversations-services]], [[contacts-services]], [[messages-services]].
- **Jobs enqueued from here**: `Account::ContactsExportJob`, `Avatar::AvatarFromUrlJob`, `SendReplyJob` (message retry), `Account::BrandingEnrichmentJob` (on signup) — see [[jobs]].
- **Events**: `ConversationsController` includes `Events::Types` and fires notifier/invalidator calls (`Conversations::UnreadCounts::Notifier`, `FilteredCountInvalidator`) rather than raw `Rails.configuration.dispatcher` events directly in the controller — the actual dispatch/listener wiring lives in the models/services it calls into; see [[events-listeners]].
- **Automation/Macros/Assignment**: `automation_rules_controller.rb`, `macros_controller.rb` (with a `execute` member action), and `assignable_agents_controller.rb` / `conversations/assignments_controller.rb` are thin CRUD/trigger wrappers around the engines documented in [[automation-rules]], [[macros]], [[assignment]].
- **Reports**: `csat_survey_responses_controller.rb`, `applied_slas` routes, and (enterprise) `reporting_events_controller.rb` feed into [[reports]].
- **Enterprise overlay**: two distinct override mechanisms observed:
  1. Controllers with no OSS counterpart live directly at `enterprise/app/controllers/api/v1/accounts/*` (e.g. `sla_policies_controller.rb`, `custom_roles_controller.rb`, `agent_capacity_policies_controller.rb`, `companies_controller.rb`, `calls_controller.rb`, `whatsapp_calls_controller.rb`, `conference_controller.rb`, `saml_settings_controller.rb`, `audit_logs_controller.rb`) — these are picked up purely by Rails' autoload path merging; the corresponding routes in `config/routes.rb` are guarded with `if ChatwootApp.enterprise?`.
  2. OSS controllers that need enterprise behavior end with `SomeController.prepend_mod_with('Api::V1::Accounts::SomeController')`, and the matching module lives at `enterprise/app/controllers/enterprise/api/v1/accounts/some_controller.rb` (confirmed for `AccountsController`/`AccountsSettings`, `AgentsController`, `ArticlesController::BulkActions`, `ContactsController`, `ConversationsController`, `CsatSurveyResponsesController`, `InboxesController`). This is the `prepend_mod_with` pattern noted in CLAUDE.md's Enterprise Edition guidance.
- **Widget vs Application API**: `Api::V1::Widget::BaseController` (`app/controllers/api/v1/widget/base_controller.rb`) is a sibling namespace with completely separate auth (`WebsiteTokenHelper`, contact/HMAC-based, no `Current.user`/Devise) — do not confuse it with the agent-facing controllers on this page; it is documented under [[widget-backend]].

## Product Behavior

- The `Api::V1::AccountsController#create` signup flow (hCaptcha-gated, `GlobalConfigService.account_signup_enabled?`) and its API-only-server branching (`CW_API_ONLY_SERVER` / legacy `ENABLE_ACCOUNT_SIGNUP=api_only`) backs the account/workspace creation step described in the **Setup account** guide category — self-hosted installs can disable open signup or run headless (API-only) deployments where the dashboard frontend isn't mounted at all.
- `ConversationsController#toggle_status` / `#bot_handoff?` implements the pending→open "handoff to human agent" behavior referenced in the **Chatwoot 101 → automation & routing** and **Agent bots** guide topics: an `AgentBot`-authenticated request can only move a conversation from `pending` to `open`, and a human opening the conversation clears `assignee_agent_bot`.
- `ConversationsController#transcript` (email a transcript, rate-limited via `account.within_email_rate_limit?` and gated by `email_transcript_enabled?`) and `#mute`/`#unmute` map to the conversation-detail actions covered under **Chatwoot 101** and **Features explained**.
- `MessagesController#update`'s `ensure_api_inbox` restriction (message status updates only allowed for API-channel inboxes) is specific to the **API channel** setup guide — other channels' delivery status is driven by webhook callbacks (see [[whatsapp]], [[other-channels]]), not this endpoint.
- `MfaController` backs the account security / MFA setup flow under **Setup account**; gated by `Chatwoot.mfa_enabled?` (an installation-level flag, not per-account).
- Enterprise-only routes (`sla_policies`, `agent_capacity_policies`, `custom_roles`, `saml_settings`, `audit_logs`, `calls`/`whatsapp_calls`/`conference`) map to the **Advanced features** and **Voice Channels** guide topics (SLAs, advanced assignment policies, role-based permissions, SAML auth, WhatsApp voice calling) and are simply absent/404 on OSS installs since both the routes and controllers are enterprise-gated.

## Notes for AI Agents

- **Controllers are intentionally thin.** Business logic almost always lives in a service object (`*Builder`, `*Service`) or directly on the model. If you're adding behavior, check `app/services/` for an existing service class matching the resource before writing controller logic — the existing controllers consistently delegate rather than inline logic (see `ConversationsController#create`, `#filter`, `#destroy` above).
- **`Current.account` / `Current.user` / `Current.account_user`** are set by `EnsureCurrentAccountHelper` before every `accounts/*` action; don't re-derive the account from `params[:account_id]` inside an action — use `Current.account`.
- **Bot access is allowlisted, not policy-driven**, for a small set of endpoints (`AccessTokenAuthHelper::BOT_ACCESSIBLE_ENDPOINTS`). If you add a new action that agent bots should be able to hit via `api_access_token`, you must add the `controller#action` pair to that hash — Pundit authorization alone will not let a bot through if `validate_bot_access_token!` rejects it first.
- **`prepend_mod_with` naming is easy to get backwards**: OSS calls `prepend_mod_with('Api::V1::Accounts::Foo')` (note: *no* leading `Enterprise::`), but the actual enterprise file/module lives under `enterprise/app/controllers/enterprise/api/v1/accounts/foo_controller.rb` inside an `Enterprise::` namespace convention — check an existing pair (e.g. `ConversationsController`) before assuming file location from the string alone.
- **Enterprise-exclusive controllers have zero OSS stub.** `SlaPoliciesController`, `CustomRolesController`, `CompaniesController`, etc. exist only under `enterprise/app/controllers/api/v1/accounts/`. On OSS-only checkouts these routes literally don't exist (guarded by `if ChatwootApp.enterprise?` in `routes.rb`), not just policy-denied.
- **`pundit_user` differs between controllers.** `ApplicationController#pundit_user` uses `Current.user/account/account_user`; `Api::V1::AccountsController` (top-level, pre-`Current.account` signup context) overrides it to use `@account`/`current_user`/`@current_account_user` instead — copy the right pattern depending on whether `Current.account` is guaranteed to be set yet in your controller.
- **`update_last_seen` throttling**: don't assume every "mark as seen" call writes to the DB — `ConversationsController#should_update_last_seen?` intentionally skips writes if the relevant timestamp is under an hour old and there are no unread messages, to reduce DB load on high-traffic accounts. Keep this in mind if debugging "last seen" staleness — it may be working as designed.
- **Views are Jbuilder, not serializers** — response shape changes belong in `app/views/api/v1/accounts/<resource>/*.json.jbuilder`, not in the controller.
- I sampled roughly a dozen of the ~80 `accounts/*` controllers plus all shared base/concern files; I did not individually verify every controller (e.g. most of `integrations/*`, `captain/*`, `assignment_policies/*`, the OAuth `authorizations_controller.rb` family for Google/Microsoft/Instagram/Twitter/TikTok/Notion/WhatsApp) — treat claims about those specific files as unverified beyond what's visible in the file listing and routes.

## Related

- [[models]] — the ActiveRecord models these controllers read/write.
- [[conversations-services]], [[contacts-services]], [[messages-services]] — the service objects most controller actions delegate to.
- [[automation-rules]], [[macros]], [[assignment]] — engines fronted by their own thin controllers here.
- [[reports]] — CSAT/SLA/reporting-event endpoints.
- [[authorization-policies]] — the Pundit policy classes backing `authorize`/`policy_scope` calls throughout.
- [[public-platform-api]] — the sibling non-agent API surfaces (Public API, Platform API).
- [[widget-backend]] — `Api::V1::Widget::*`, a separate contact-token-authenticated namespace under the same `app/controllers/api/v1/` tree.
- [[whatsapp]] — `WhatsappHealthManagement` concern and inbox health-check endpoints.
- [[jobs]] — background jobs enqueued from these controllers (export, avatar, send-reply-retry, branding enrichment).
- [[controllers-jobs-listeners]] — the enterprise overlay's controllers, jobs, and listeners more broadly.
- [[account-onboarding]] — signup (`AccountsController#create`), onboarding (`OnboardingsController`), MFA/sessions.
