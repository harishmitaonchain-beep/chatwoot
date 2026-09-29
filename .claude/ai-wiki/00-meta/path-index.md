---
title: "Path Index"
tags: [chatwoot, meta]
generated: 2026-08-17
---

# Path Index

Deterministic reverse map from a repo path to the vault page that documents it. Generated directly from the module map used to build this vault (not hand-maintained) — if a path here has moved, trust the code and treat this row as stale.

Use this when you already know which file/directory you are about to touch and want the relevant page fast, instead of browsing [[README|the map of content]].

| Repo path | Vault page |
|---|---|
| `app/actions` | [[conversations-services|Conversation Services & Actions]] |
| `app/builders` | [[backend-support-objects|Backend Support Objects (Builders, Finders, Helpers, Admin Fields)]] |
| `app/channels` | [[realtime-actioncable|Real-time Layer (ActionCable)]] |
| `app/controllers/api/v1` | [[api-v1-controllers|Application API (Agent-facing Controllers)]] |
| `app/controllers/api/v1/widget` | [[widget-backend|Widget Backend]] |
| `app/controllers/api/v2` | [[public-platform-api|Public & Platform APIs]] |
| `app/controllers/platform` | [[public-platform-api|Public & Platform APIs]] |
| `app/controllers/public` | [[public-platform-api|Public & Platform APIs]] |
| `app/controllers/webhooks` | [[webhook-routing|Webhook Routing Across Channels]] |
| `app/controllers/concerns/hmac_concern.rb` | [[identity-validation|Identity Validation & HMAC Trust Boundaries]] |
| `app/controllers/concerns/meta_token_verify_concern.rb` | [[identity-validation|Identity Validation & HMAC Trust Boundaries]] |
| `app/dashboards` | [[backend-support-objects|Backend Support Objects (Builders, Finders, Helpers, Admin Fields)]] |
| `app/dispatchers` | [[events-listeners|Event Dispatcher & Listeners]] |
| `app/drops` | [[backend-support-objects|Backend Support Objects (Builders, Finders, Helpers, Admin Fields)]] |
| `app/fields` | [[backend-support-objects|Backend Support Objects (Builders, Finders, Helpers, Admin Fields)]] |
| `app/finders` | [[backend-support-objects|Backend Support Objects (Builders, Finders, Helpers, Admin Fields)]] |
| `app/helpers` | [[backend-support-objects|Backend Support Objects (Builders, Finders, Helpers, Admin Fields)]] |
| `app/helpers/billing_helper.rb` | [[plan-tiers-billing|Cloud Plan Tiers & Billing]] |
| `app/javascript/dashboard/api` | [[api-client|Dashboard API Client Layer]] |
| `app/javascript/dashboard/components` | [[dashboard-routes-components|Dashboard Routes & Legacy Components]] |
| `app/javascript/dashboard/components-next` | [[components-next|components-next (current UI system)]] |
| `app/javascript/dashboard/composables` | [[composables-mixins-helpers|Composables, Mixins, Helpers, Constants]] |
| `app/javascript/dashboard/constants` | [[composables-mixins-helpers|Composables, Mixins, Helpers, Constants]] |
| `app/javascript/dashboard/featureFlags.js` | [[composables-mixins-helpers|Composables, Mixins, Helpers, Constants]] |
| `app/javascript/dashboard/helper` | [[composables-mixins-helpers|Composables, Mixins, Helpers, Constants]] |
| `app/javascript/dashboard/mixins` | [[composables-mixins-helpers|Composables, Mixins, Helpers, Constants]] |
| `app/javascript/dashboard/modules` | [[dashboard-routes-components|Dashboard Routes & Legacy Components]] |
| `app/javascript/dashboard/routes` | [[dashboard-routes-components|Dashboard Routes & Legacy Components]] |
| `app/javascript/dashboard/routes/dashboard/settings` | [[feature-uis|Dashboard Feature UIs (Reports, Settings, Inbox Management)]] |
| `app/javascript/dashboard/services` | [[api-client|Dashboard API Client Layer]] |
| `app/javascript/dashboard/store` | [[dashboard-store|Dashboard State Management (Vuex/Pinia)]] |
| `app/javascript/dashboard/stores` | [[dashboard-store|Dashboard State Management (Vuex/Pinia)]] |
| `app/javascript/design-system` | [[shared-design-system|Shared Code & Design System]] |
| `app/javascript/entrypoints` | [[widget-sdk|Website Widget & Client SDK]] |
| `app/javascript/portal` | [[portal-survey-superadmin|Help Center Portal, CSAT Survey App, Super Admin]] |
| `app/javascript/sdk` | [[widget-sdk|Website Widget & Client SDK]] |
| `app/javascript/shared` | [[shared-design-system|Shared Code & Design System]] |
| `app/javascript/superadmin_pages` | [[portal-survey-superadmin|Help Center Portal, CSAT Survey App, Super Admin]] |
| `app/javascript/survey` | [[portal-survey-superadmin|Help Center Portal, CSAT Survey App, Super Admin]] |
| `app/javascript/v3` | [[shared-design-system|Shared Code & Design System]] |
| `app/javascript/widget` | [[widget-sdk|Website Widget & Client SDK]] |
| `app/jobs` | [[jobs|Background Jobs (Sidekiq)]] |
| `app/listeners` | [[events-listeners|Event Dispatcher & Listeners]] |
| `app/mailboxes` | [[email|Email Channel & Mailboxes]] |
| `app/mailers` | [[notifications|Notifications & Mailers]] |
| `app/models` | [[models|Data Models]] |
| `app/models/article.rb` | [[help-center-models|Help Center Data Models]] |
| `app/models/attachment.rb` | [[attachments-storage|Attachments & Active Storage]] |
| `app/models/category.rb` | [[help-center-models|Help Center Data Models]] |
| `app/models/notification_setting.rb` | [[user-preferences|User Preferences & UI Settings]] |
| `app/models/portal.rb` | [[help-center-models|Help Center Data Models]] |
| `app/models/related_category.rb` | [[help-center-models|Help Center Data Models]] |
| `app/policies` | [[authorization-policies|Authorization (Pundit Policies)]] |
| `app/presenters` | [[presenters|Presenters]] |
| `app/services/account` | [[account-onboarding|Account, Onboarding, MFA, Sessions]] |
| `app/services/account_deletion_service.rb` | [[account-onboarding|Account, Onboarding, MFA, Sessions]] |
| `app/services/action_service.rb` | [[assignment|Assignment & Round Robin]] |
| `app/services/auto_assignment` | [[assignment|Assignment & Round Robin]] |
| `app/services/automation_rules` | [[automation-rules|Automation Rules Engine]] |
| `app/services/contacts` | [[contacts-services|Contact Services]] |
| `app/services/conversations` | [[conversations-services|Conversation Services & Actions]] |
| `app/services/crm` | [[integrations|CRM & Third-party Integrations]] |
| `app/services/data_import` | [[data-import|Data Import / Export & Migrations]] |
| `app/services/data_imports` | [[data-import|Data Import / Export & Migrations]] |
| `app/services/email` | [[email|Email Channel & Mailboxes]] |
| `app/services/email_templates` | [[email|Email Channel & Mailboxes]] |
| `app/services/facebook` | [[facebook-instagram|Facebook & Instagram Channels]] |
| `app/services/filter_service.rb` | [[conversations-services|Conversation Services & Actions]] |
| `app/services/filters` | [[conversations-services|Conversation Services & Actions]] |
| `app/services/geocoder` | [[integrations|CRM & Third-party Integrations]] |
| `app/services/google` | [[integrations|CRM & Third-party Integrations]] |
| `app/services/imap` | [[email|Email Channel & Mailboxes]] |
| `app/services/instagram` | [[facebook-instagram|Facebook & Instagram Channels]] |
| `app/services/ip_lookup_service.rb` | [[integrations|CRM & Third-party Integrations]] |
| `app/services/line` | [[other-channels|SMS, Telegram, Line, TikTok, Twitter, Twilio Voice]] |
| `app/services/linear` | [[integrations|CRM & Third-party Integrations]] |
| `app/services/llm_formatter` | [[captain-ai|Captain AI / LLM Formatter]] |
| `app/services/macros` | [[macros|Macros]] |
| `app/services/messages` | [[messages-services|Message Services]] |
| `app/services/mfa` | [[account-onboarding|Account, Onboarding, MFA, Sessions]] |
| `app/services/microsoft` | [[integrations|CRM & Third-party Integrations]] |
| `app/services/notification` | [[notifications|Notifications & Mailers]] |
| `app/services/onboarding` | [[account-onboarding|Account, Onboarding, MFA, Sessions]] |
| `app/services/reporting_events` | [[reports|Reports & Analytics Backend]] |
| `app/services/reports` | [[reports|Reports & Analytics Backend]] |
| `app/services/sms` | [[other-channels|SMS, Telegram, Line, TikTok, Twitter, Twilio Voice]] |
| `app/services/telegram` | [[other-channels|SMS, Telegram, Line, TikTok, Twitter, Twilio Voice]] |
| `app/services/tiktok` | [[other-channels|SMS, Telegram, Line, TikTok, Twitter, Twilio Voice]] |
| `app/services/twilio` | [[other-channels|SMS, Telegram, Line, TikTok, Twitter, Twilio Voice]] |
| `app/services/twitter` | [[other-channels|SMS, Telegram, Line, TikTok, Twitter, Twilio Voice]] |
| `app/services/user_session_tracking_service.rb` | [[account-onboarding|Account, Onboarding, MFA, Sessions]] |
| `app/services/whatsapp` | [[whatsapp|WhatsApp Channel]] |
| `app/services/widget` | [[widget-backend|Widget Backend]] |
| `app/views/api/v1` | [[api-v1-controllers|Application API (Agent-facing Controllers)]] |
| `config/agents` | [[captain-ai|Captain AI / LLM Formatter]] |
| `config/application.rb` | [[routing-config|Routing & App-wide Configuration]] |
| `config/features.yml` | [[routing-config|Routing & App-wide Configuration]] |
| `config/initializers` | [[routing-config|Routing & App-wide Configuration]] |
| `config/llm_models.json` | [[captain-ai|Captain AI / LLM Formatter]] |
| `config/initializers/rack_attack.rb` | [[rate-limiting|Rate Limiting (Rack::Attack)]] |
| `config/llm.yml` | [[captain-ai|Captain AI / LLM Formatter]] |
| `config/routes.rb` | [[routing-config|Routing & App-wide Configuration]] |
| `config/schedule.yml` | [[routing-config|Routing & App-wide Configuration]] |
| `config/storage.yml` | [[attachments-storage|Attachments & Active Storage]] |
| `config/vite.json` | [[build-system|Frontend Build System (Vite)]] |
| `db/migrate` | [[data-model|Database Schema & Data Model Overview]] |
| `db/schema.rb` | [[data-model|Database Schema & Data Model Overview]] |
| `enterprise/app/builders` | [[builders-views|Enterprise Builders & Views]] |
| `enterprise/app/controllers` | [[controllers-jobs-listeners|Enterprise Controllers, Jobs, Listeners, Fields]] |
| `enterprise/app/dispatchers` | [[controllers-jobs-listeners|Enterprise Controllers, Jobs, Listeners, Fields]] |
| `enterprise/app/fields` | [[controllers-jobs-listeners|Enterprise Controllers, Jobs, Listeners, Fields]] |
| `enterprise/app/finders` | [[controllers-jobs-listeners|Enterprise Controllers, Jobs, Listeners, Fields]] |
| `enterprise/app/jobs` | [[controllers-jobs-listeners|Enterprise Controllers, Jobs, Listeners, Fields]] |
| `enterprise/app/listeners` | [[controllers-jobs-listeners|Enterprise Controllers, Jobs, Listeners, Fields]] |
| `enterprise/app/models` | [[models-services|Enterprise Models & Services]] |
| `enterprise/app/models/enterprise/account.rb` | [[plan-tiers-billing|Cloud Plan Tiers & Billing]] |
| `enterprise/app/models/enterprise/account/plan_usage_and_limits.rb` | [[plan-tiers-billing|Cloud Plan Tiers & Billing]] |
| `enterprise/app/services` | [[models-services|Enterprise Models & Services]] |
| `enterprise/app/services/enterprise/billing` | [[plan-tiers-billing|Cloud Plan Tiers & Billing]] |
| `enterprise/app/services/internal/accounts/internal_attributes_service.rb` | [[plan-tiers-billing|Cloud Plan Tiers & Billing]] |
| `enterprise/app/validators` | [[controllers-jobs-listeners|Enterprise Controllers, Jobs, Listeners, Fields]] |
| `enterprise/app/views` | [[builders-views|Enterprise Builders & Views]] |
| `enterprise/config` | [[controllers-jobs-listeners|Enterprise Controllers, Jobs, Listeners, Fields]] |
| `enterprise/lib` | [[controllers-jobs-listeners|Enterprise Controllers, Jobs, Listeners, Fields]] |
| `lib` | [[lib-core-infrastructure|Core Library Infrastructure (lib/)]] |
| `lib/integrations` | [[lib-integrations|Third-party Bot & AI Integration Protocols (lib/integrations)]] |
| `package.json` | [[build-system|Frontend Build System (Vite)]] |
| `vite.config.ts` | [[build-system|Frontend Build System (Vite)]] |
| `vite.shared.ts` | [[build-system|Frontend Build System (Vite)]] |

129 mapped paths across 50 pages. Paths not listed here (e.g. `app/assets`, `app/views`, most of `config/`) are either out of scope or covered only incidentally inside a broader page — check [[README]] or [[00-meta/deepwiki-crosscheck|the DeepWiki cross-check]] for known gaps. Some paths intentionally map to more than one page (e.g. a file under `enterprise/app/services/enterprise/billing/` matches both the broad `enterprise/app/services` row and the more specific billing row) — both are relevant.
