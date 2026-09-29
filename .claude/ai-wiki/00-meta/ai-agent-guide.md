---
title: AI Agent Guide
tags: [chatwoot, index]
generated: 2026-08-17
---

# AI Agent Guide

Practical notes for using this vault while working a task in the Chatwoot repo. Start from [[README|the map of content]] if you're not sure which page you need — this page is about *how* to use the vault, not a substitute for it.

## Where to start, by task

- **Touching a channel integration** (WhatsApp, email, Facebook/Instagram, SMS/Telegram/Line/TikTok/Twitter, Twilio Voice, or a CRM sync) → read the matching page under `03-channels/` first (e.g. [[03-channels/whatsapp|whatsapp.md]], [[03-channels/email|email.md]]).
- **Debugging a WhatsApp/Meta problem** (setup failures, silent drops, Meta error codes, template sync, coexistence) → [[03-channels/whatsapp-field-guide|whatsapp-field-guide.md]] FIRST — it carries the discriminator table and the hypotheses already disproven, so you don't re-investigate settled ground.
- **Touching conversation/message/contact business logic in Rails** → [[02-backend/conversations-services|conversations-services.md]], [[02-backend/messages-services|messages-services.md]], or [[02-backend/contacts-services|contacts-services.md]], plus [[02-backend/models|models.md]] for the underlying ActiveRecord shape.
- **Touching automation rules or macros** → [[02-backend/automation-rules|automation-rules.md]] and [[02-backend/macros|macros.md]] — they share an ActionService base, so check both.
- **Touching auto-assignment or round robin** → [[02-backend/assignment|assignment.md]] — note there are two parallel systems (legacy V1, policy-driven V2); confirm which one the code path you're editing belongs to before changing shared pieces.
- **Touching a Rails controller/API endpoint** → [[02-backend/api-v1-controllers|api-v1-controllers.md]] for the dashboard-facing API, [[02-backend/public-platform-api|public-platform-api.md]] for api/v2, the public contact API, or the platform API, [[02-backend/widget-backend|widget-backend.md]] for the widget API.
- **Touching who-can-do-what** → [[02-backend/authorization-policies|authorization-policies.md]] for Pundit policies; check for an Enterprise custom-role override before editing an OSS policy directly.
- **Touching a background job or anything scheduled** → [[02-backend/jobs|jobs.md]] for the Sidekiq job catalog and cron wiring.
- **Touching event-driven side effects** (webhooks, notifications firing off a conversation/message change) → [[02-backend/events-listeners|events-listeners.md]] to find the Wisper listener before assuming you need to add a new call site.
- **Touching reports/analytics** → [[02-backend/reports|reports.md]] — the write path (raw events → rollups) and read path are separate; know which one you're in.
- **Touching notifications or transactional email** → [[02-backend/notifications|notifications.md]].
- **Touching data import/migration from another helpdesk** → [[02-backend/data-import|data-import.md]] — check it actually covers the provider (Zendesk/Front do not, despite the user guide).
- **Touching Captain AI or LLM model selection** → [[02-backend/captain-ai|captain-ai.md]] for OSS-side formatting/config, [[05-enterprise/models-services|05-enterprise/models-services.md]] for the actual Captain subsystem (it's Enterprise).
- **Touching signup, onboarding, MFA, or sessions** → [[02-backend/account-onboarding|account-onboarding.md]].
- **Touching frontend state** (Vuex/Pinia stores, conversation list state) → [[04-frontend/dashboard-store|dashboard-store.md]].
- **Touching dashboard routes or older UI components** → [[04-frontend/dashboard-routes-components|dashboard-routes-components.md]].
- **Touching current-generation UI** (message bubbles, Captain UI, Contacts/Companies/HelpCenter pages) → [[04-frontend/components-next|components-next.md]] — this is where new UI work should generally land, not the legacy `components/` tree.
- **Touching a composable, mixin, JS helper, or feature-flag constant** → [[04-frontend/composables-mixins-helpers|composables-mixins-helpers.md]].
- **Touching how the dashboard calls the Rails API** → [[04-frontend/api-client|api-client.md]].
- **Touching the embeddable website widget or its SDK** → [[04-frontend/widget-sdk|widget-sdk.md]].
- **Touching cross-app shared code** (message formatting, sanitizer, branding, icons) → [[04-frontend/shared-design-system|shared-design-system.md]].
- **Touching the Help Center portal, CSAT survey page, or Super Admin UI** → [[04-frontend/portal-survey-superadmin|portal-survey-superadmin.md]].
- **Touching anything under `enterprise/`** → [[05-enterprise/models-services|05-enterprise/models-services.md]] and [[05-enterprise/controllers-jobs-listeners|05-enterprise/controllers-jobs-listeners.md]] — also check the matching OSS page, since Enterprise code overlays OSS via `prepend_mod_with`/`include_mod_with` rather than replacing it.
- **Unsure where a table or model fits** → [[01-architecture/data-model|01-architecture/data-model.md]] for the schema-level view, [[02-backend/models|02-backend/models.md]] for the ActiveRecord layer.
- **Touching routes, feature flags, or app-wide initializers** → [[01-architecture/routing-config|01-architecture/routing-config.md]].

## General approach

1. Read the relevant page(s) above before opening source files — they name the key classes/services and how they connect, so you spend less time re-deriving structure by grepping.
2. Cross-check OSS and Enterprise pages together whenever a feature might be extended (billing, SLAs, custom roles, capacity-based assignment, Captain, calling) — Enterprise rarely forks OSS files; it prepends/includes modules into them.
3. For coding conventions, build/test/lint commands, and workflow rules, use the repo's own `CLAUDE.md`, not this vault.

## This vault goes stale — trust the code

These pages are a snapshot, not a live view. Code moves faster than documentation. If something in this vault contradicts what you find in the actual source:

- **Trust the code.** Never assume the vault is right just because it's written down.
- If the discrepancy is small (a renamed method, a moved file), just proceed with the code as ground truth.
- If the discrepancy is structural (a whole flow changed, a service was replaced), consider updating the relevant page so the next agent doesn't hit the same gap — but don't let doc upkeep block the actual task.
