---
title: "CRM & Third-party Integrations"
tags: [chatwoot, backend, integrations, crm, oauth, geolocation]
generated: 2026-08-17
deepwiki_section: "Integrations (Slack, Linear, Dialogflow, OpenAI)"
---

# CRM & Third-party Integrations

## Purpose

This is a grab-bag module covering the backend plumbing for several unrelated third-party integrations that don't fit under a channel or Captain:

- **CRM sync** (`app/services/crm`) — pushes contact/conversation data into an external CRM. Currently only **LeadSquared** is implemented; the base class is written to support more.
- **Linear issue tracking** (`app/services/linear`, plus the actual engine in `lib/integrations/linear`) — lets agents create/link Linear issues from a conversation and auto-links Linear URLs pasted into private notes.
- **OAuth token refresh for Google/Microsoft** (`app/services/google`, `app/services/microsoft`) — not a CRM at all; this is shared OAuth-refresh plumbing that backs the Gmail/Outlook **email channel's** IMAP polling (Google Translate and other Google/Microsoft product integrations are elsewhere).
- **IP-based geolocation** (`app/services/geocoder`, `app/services/ip_lookup_service.rb`) — resolves a contact's or user session's IP to city/country using a local MaxMind GeoLite2 database, gated behind an `IP_LOOKUP_API_KEY`.

## Key Files & Classes

**CRM (LeadSquared)**
- `app/services/crm/base_processor_service.rb` — `Crm::BaseProcessorService`: abstract base with a `process_event(event_name, event_data)` dispatcher, `crm_name`, and shared helpers (`identifiable_contact?`, `get_external_id`/`store_external_id`/`clear_external_id`, `store_conversation_metadata`) that stash CRM linkage under `contact.additional_attributes['external']["#{crm_name}_id"]`.
- `app/services/crm/leadsquared/processor_service.rb` — `Crm::Leadsquared::ProcessorService < Crm::BaseProcessorService`: creates/updates LeadSquared leads on contact changes, posts "conversation created" / "transcript" activities, with a `with_stale_lead_recovery` retry when LeadSquared reports the cached lead id no longer exists (`MXInvalidEntityReferenceException`).
- `app/services/crm/leadsquared/lead_finder_service.rb` — `Crm::Leadsquared::LeadFinderService#find_or_create`: looks up a stored id, then by email, then by phone, else creates a new lead.
- `app/services/crm/leadsquared/setup_service.rb` — `Crm::Leadsquared::SetupService`: one-time provisioning run when a LeadSquared hook is created — resolves the account's actual API endpoint host and creates the two custom LeadSquared "Activity Types" (conversation started / transcript) the processor posts against.
- `app/services/crm/leadsquared/api/base_client.rb`, `lead_client.rb`, `activity_client.rb` — thin `HTTParty`-based REST clients; `BaseClient::ApiError` wraps non-2xx and `Status: Error` responses.
- `app/services/crm/leadsquared/mappers/contact_mapper.rb` — maps a Chatwoot `Contact` to LeadSquared lead attributes; formats phone as `+<country_code>-<national_number>` (undocumented format found by trial and error, per code comment).
- `app/services/crm/leadsquared/mappers/conversation_mapper.rb` — builds the LeadSquared activity note text (conversation-created note, or a length-capped transcript built from `conversation.messages.chat.select(&:conversation_transcriptable?)`, capped at `ACTIVITY_NOTE_MAX_SIZE = 1800` chars).
- `app/jobs/crm/setup_job.rb` — `Crm::SetupJob`, dispatches to `Crm::Leadsquared::SetupService` by `hook.app_id` (commented-out placeholders show where `hubspot`/`zoho` would be added).

**Linear**
- `app/services/linear/activity_message_service.rb` — `Linear::ActivityMessageService`: posts an `:activity` message into the conversation (issue created/linked/unlinked) via `Conversations::ActivityMessageJob`.
- `lib/integrations/linear/processor_service.rb` — `Integrations::Linear::ProcessorService`: the actual account-level Linear API facade (teams, team entities, create/link/unlink/search issue, linked issues) — **lives under `lib/`, not `app/services/linear/`**.
- `lib/integrations/linear/auto_link_service.rb` — `Integrations::Linear::AutoLinkService`: scans a newly-created **private** message for a `linear.app/.../issue/XXX-123` URL and auto-links it to the conversation if not already linked.
- `lib/integrations/linear/access_token_service.rb` — token handling for the Linear OAuth app.
- `lib/linear.rb` — top-level `Linear` class: hand-rolled GraphQL client (`teams`, `create_issue`, `link_issue`, `revoke_token`, etc.) that the above services and `Api::V1::Accounts::Integrations::LinearController#revoke_linear_token` call directly.
- `app/helpers/linear/integration_helper.rb` — `Linear::IntegrationHelper`: signs/verifies a short-lived JWT (`generate_linear_token`/`verify_linear_token`) carried in the OAuth `state` param, since Linear's callback has no other way to recover the Chatwoot `account_id`.
- `app/controllers/linear/callbacks_controller.rb` — OAuth callback; exchanges `code` for tokens and upserts an `Integrations::Hook` (`app_id: 'linear'`).
- `app/controllers/api/v1/accounts/integrations/linear_controller.rb` — agent-facing endpoints (teams, create/link/unlink issue, search) used by the composer's Linear panel; each mutating action also fires `Linear::ActivityMessageService`.

**OAuth token refresh**
- `app/services/base_refresh_oauth_token_service.rb` — `BaseRefreshOauthTokenService`: shared refresh-if-expired logic (5-minute expiry buffer) operating on `channel.provider_config`; subclasses only implement `build_oauth_strategy`.
- `app/services/google/refresh_oauth_token_service.rb`, `app/services/microsoft/refresh_oauth_token_service.rb` — subclasses used by `Imap::GoogleFetchEmailService` / `Imap::MicrosoftFetchEmailService` (see [[email]]) to keep Gmail/Outlook IMAP channels authenticated. `Instagram::RefreshOauthTokenService` follows the same pattern but lives under `app/services/instagram/`.

**Geolocation**
- `app/services/geocoder/setup_service.rb` — `Geocoder::SetupService#perform`: downloads and extracts the MaxMind GeoLite2-City `.mmdb` (skipped if `IP_LOOKUP_API_KEY` is blank or the DB already exists); invoked from `lib/tasks/ip_lookup.rake`, not on every boot.
- `app/services/ip_lookup_service.rb` — `IpLookupService#perform(ip_address)`: thin wrapper around `Geocoder.search`, guarded by `File.exist?(GeocoderConfiguration::LOOK_UP_DB)`; swallows `Errno::ETIMEDOUT` only.
- `config/initializers/geocoder.rb` — defines `GeocoderConfiguration::LOOK_UP_DB` and configures `Geocoder.configure(ip_lookup: :geoip2, ...)` only `if ENV['IP_LOOKUP_API_KEY'].present?`.
- Consumers: `app/jobs/contact_ip_lookup_job.rb` (fills `contact.additional_attributes['city'/'country'/'country_code']` from `created_at_ip`/`updated_at_ip`), `app/jobs/user_session_ip_lookup_job.rb` (fills `city`/`country`/`country_code` columns on a session), and `enterprise/app/controllers/enterprise/widgets_controller.rb`.

## How It Fits Together

- **Integration hooks** are all backed by one polymorphic model, `Integrations::Hook` (`app/models/integrations/hook.rb`) — `account`-scoped or `inbox`-scoped, `app_id` identifies which integration (`slack`, `dialogflow`, `google_translate`, `leadsquared`, `linear`, `openai`, `dyte`, `notion`, ...). `after_create :trigger_setup_if_crm` enqueues `Crm::SetupJob` only when `app_id` is in `crm_integration?` (currently just `leadsquared`).
- Events flow: domain events (`message.created`, `contact.updated`, `conversation.created`, `conversation.resolved`, ...) are dispatched by `app/listeners/hook_listener.rb` (`HookListener`), which iterates the account's hooks, filters by a hardcoded `supported_events_map`, and enqueues `HookJob` (`app/jobs/hook_job.rb`) per matching hook.
- `HookJob::INTEGRATION_PROCESSORS` maps `app_id` to a private handler method. For `leadsquared` it wraps the call in a Redis mutex (`Redis::Alfred::CRM_PROCESS_MUTEX`, keyed by hook id) — the code comment explains why: `contact.created` → `contact.updated` → `conversation.created` fire within milliseconds of each other and, without the lock, could each try to create a LeadSquared lead and race into duplicates. For `linear`, only `message.created` reaches `Integrations::Linear::AutoLinkService`.
- The actual LeadSquared processor is invoked directly (`processor.handle_contact`, `handle_conversation_created`, `handle_conversation_resolved`) rather than through `Crm::BaseProcessorService#process_event` — see **Notes for AI Agents**.
- Both CRM and Linear activity postings touch `Conversations::ActivityMessageJob` / conversation `additional_attributes`, so they surface in the conversation timeline the same way other activity messages do — see [[conversations-services]] and [[messages-services]].
- `Google::RefreshOauthTokenService` / `Microsoft::RefreshOauthTokenService` are consumed by the email channel's IMAP fetch services (`Imap::GoogleFetchEmailService`, `Imap::MicrosoftFetchEmailService`), not by anything CRM-specific — cross-reference [[email]] and [[jobs]] for the scheduled fetch job that calls them.
- `IpLookupService` is called from two background jobs ([[jobs]]) that update `Contact`/`ActiveRecord::SessionStore` records, plus synchronously from the enterprise widget controller — see [[models]] for the `Contact` model and [[controllers-jobs-listeners]] for enterprise call sites.
- Settings for each hook (API keys, activity codes, endpoint URLs, timezone) live in `Integrations::Hook#settings` (jsonb), validated against a per-app JSON schema (`validate_settings_json_schema`, using `app.params[:settings_json_schema]` from `config/integration/apps.yml`).

## Product Behavior

- The **Apps and Integrations** section of the user guide documents **Linear** as an agent-facing feature: connecting a workspace via OAuth, then creating or linking a Linear issue from a conversation (matches `Api::V1::Accounts::Integrations::LinearController`'s `create_issue`/`link_issue`/`unlink_issue` actions and the `components/widgets/conversation/linear/*` Vue components). The auto-link-on-paste behavior (`Integrations::Linear::AutoLinkService`) is an implementation detail not necessarily called out explicitly in the guide topic.
- LeadSquared (and any future CRM under `Crm::`) is not one of the integrations named in the condensed guide list provided for this module; behavior described here is inferred from code only — treat CRM sync as a Cloud/self-hosted setup-level integration rather than a documented "Apps and Integrations" guide entry in the list given.
- IP geolocation (city/country enrichment on contacts and login sessions) is an internal enrichment feature, not a user-configurable "integration" surfaced in the Apps and Integrations guide; it's controlled entirely by the `IP_LOOKUP_API_KEY` environment variable at the infra/self-host level.

## Notes for AI Agents

- **`Integrations::Linear::*` classes live under `lib/integrations/linear/`, not `app/services/linear/`.** `app/services/linear/` only holds `ActivityMessageService` (the conversation-timeline note poster). Searching only `app/services/linear` will make you think the Linear integration is far smaller than it is — check `lib/integrations/linear/` and `lib/linear.rb` too.
- **`Crm::BaseProcessorService#process_event` and its abstract `handle_contact_created`/`handle_contact_updated` are effectively dead on the real call path.** `HookJob#process_leadsquared_integration` calls `processor.handle_contact`, `handle_conversation_created`, `handle_conversation_resolved` directly by event name — it never calls `process_event`. `Crm::Leadsquared::ProcessorService` doesn't even define `handle_contact_created`/`handle_contact_updated` (only `handle_contact`, singular). If you add a new CRM processor, follow the pattern HookJob actually uses (explicit method per event), not the `process_event` dispatcher — or you'll ship code that's never invoked.
- **LeadSquared writes are mutex-guarded per hook** (`Redis::Alfred::CRM_PROCESS_MUTEX`) specifically to avoid duplicate-lead races from near-simultaneous `contact.updated`/`conversation.created` events. Any new code path that can create a LeadSquared lead outside `HookJob`'s locked path would reintroduce that race.
- **Stale external-id recovery is a documented, deliberate one-shot retry**: `with_stale_lead_recovery` in `Crm::Leadsquared::ProcessorService` clears the stored `leadsquared_id` and re-resolves via `LeadFinderService` exactly once when the API returns `MXInvalidEntityReferenceException`; it re-raises if the freshly-found id is blank or identical to the stale one (avoids infinite loop).
- **Adding a new CRM** means: add its `app_id` to `Integrations::Hook#crm_integration?`, add a `when` branch in `Crm::SetupJob#create_setup_service` (there are commented-out `hubspot`/`zoho` placeholders already there), add it to `HookJob::INTEGRATION_PROCESSORS` and `HookListener#supported_events_map`, and give it its own namespace under `Crm::` following the LeadSquared layout (`Api::`, `Mappers::`, `ProcessorService`, `SetupService`).
- **`GlobalConfig.get('BRAND_NAME')`** (not a hardcoded "Chatwoot" string) is used for both the LeadSquared lead `Source` field and the activity-note branding — self-hosted white-labeled installs will send their configured brand name to LeadSquared. This matches the branding note in project conventions.
- **Geolocation is inert unless `IP_LOOKUP_API_KEY` is set**: the initializer only configures Geocoder's `geoip2` lookup when the key is present, `Geocoder::SetupService` no-ops without it, and `IpLookupService` checks `File.exist?` on the `.mmdb` before calling `Geocoder.search`. On installs without the key, `ContactIpLookupJob`/`UserSessionIpLookupJob` run and silently return `nil` — this is expected, not a bug.
- **Linear OAuth state param carries the account id via a signed JWT** (`Linear::IntegrationHelper#generate_linear_token`/`verify_linear_token`, `HS256` with `LINEAR_CLIENT_SECRET`) because Linear's OAuth callback has no other channel to recover which Chatwoot account initiated the flow — don't assume `state` is a CSRF-only nonce here.
- The LeadSquared phone-number format (`+<country_code>-<national_number>`) in `ContactMapper#formatted_phone_number` is explicitly called out in the code comment as reverse-engineered/undocumented by LeadSquared — treat any changes to it as fragile and worth re-verifying against the live API.

## Related

- [[conversations-services]] — activity messages fired by CRM/Linear integrations land here.
- [[messages-services]] — transcript building consumes `message.conversation_transcriptable?` and attachment metadata.
- [[jobs]] — `Crm::SetupJob`, `ContactIpLookupJob`, `UserSessionIpLookupJob`, `Conversations::ActivityMessageJob`.
- [[events-listeners]] — `HookListener` is the entry point that turns domain events into `HookJob` runs.
- [[email]] — Gmail/Outlook IMAP channels that actually consume `Google::RefreshOauthTokenService`/`Microsoft::RefreshOauthTokenService`.
- [[models]] — `Integrations::Hook`, `Contact#additional_attributes`.
- [[captain-ai]] — `Captain::Tools::Copilot::SearchLinearIssuesService` (enterprise) reuses `Integrations::Linear::ProcessorService`.
- [[controllers-jobs-listeners]] — enterprise call site for `IpLookupService` (`Enterprise::WidgetsController`).
