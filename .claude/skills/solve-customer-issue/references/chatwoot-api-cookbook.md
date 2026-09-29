# Chatwoot API cookbook — for the data-inspector track

Verified against the codebase 2026-09-04 (controllers/finders/policies read, not public docs). Tool: `.claude/support-harness/bin/cwapi` (run `cwapi help` for syntax). All endpoints take header `api_access_token`.

## Auth & error semantics (memorize these)

- Token owners: User or AgentBot (AgentBot tokens are locked to a small conversation/message endpoint set — everything else 401s). Platform-app tokens do NOT work on `/api/v1/accounts/*`.
- A user token only works on accounts where the user has an AccountUser row; role (agent/administrator) is **per account**.
- **401** = invalid token OR not a member OR Pundit policy denial (Chatwoot uses 401, not 403, for permissions).
- **403** = Cloud feature gate: the account lacks the `api_and_webhooks` feature flag → "API access is not enabled for this account". This is an account feature, fixable by enabling the flag.
- **404** = missing record, or account id doesn't exist. Exception: `automation-rules <bad-id>` raises HTTP **500** (nil-partial render, not rescued) — treat a 500 there as "no such rule" and use the index to enumerate instead of probing ids.
- First call on any new token: `cwapi profile` — validates the token, shows the owning user + accounts + roles (its `access_token` field is auto-redacted).
- **This harness uses an AGENT-role token.** See the capability matrix below — with an agent token, 401 on an admin endpoint is the expected answer, not a bug.
- Admin-only reads: automation-rules, webhooks, audit-logs, inbox agent_bot, reporting-events, applied-slas, csat, campaigns, and the secret/`provider_config` fields on inboxes. Reports need admin OR custom role `report_manage`.
- Rate limits (prod): contacts/search 100/min/account, conversations/meta 30/min/user, reports 100/min/user, global 3000/min/IP.

## Agent-role capability matrix (the #1 trap now)

`user.assigned_inboxes` (`app/models/user.rb:138`) is `Current.account.inboxes` for an administrator but only `inbox_members` inboxes for an agent. `ConversationFinder#set_inboxes` and `SearchService#accessable_inbox_ids` both scope to it, and the API answers **empty 200 — no error**. So an agent token that is not a collaborator on the inbox sees zero conversations, zero search hits, and zero messages, and none of those zeros mean anything.

**Run `cwapi profile` then `cwapi inboxes` before any other query.** If the inbox under investigation is absent, stop and get the token's user added as a collaborator (Settings → Inboxes → Collaborators) — an account admin can do it in seconds.

| Endpoint group | Agent token |
|---|---|
| profile, account, limits | ✅ full (`account` carries the features hash + plan `custom_attributes`) |
| contacts: show/search/filter/conversations/contactable-inboxes/source-lookup | ✅ account-wide (contacts are NOT inbox-scoped) — but `contact-conversations` silently drops conversations outside member inboxes |
| conversations, messages, conversation-filter, conversation-meta, conversation-events, search | ✅ **scoped to member inboxes only** |
| inboxes, inbox | ✅ member inboxes only, **without** `provider_config` / IMAP / SMTP / HMAC / Twilio secrets (`_inbox.json.jbuilder:146` and siblings gate them on `Current.account_user&.administrator?` — the fields are *absent*, so `--show-secrets` changes nothing) |
| agents, teams, labels, custom-attributes, canned, macros, agent-bots | ✅ (macros: global + own only) |
| automation-rules, webhooks, audit-logs, report, report-summary, reporting-events, csat, applied-slas, campaigns | ❌ 401 — escalate, don't retry |

## ID semantics (the #1 trap in routing)

- **Conversations: `:id` in every route is the DISPLAY id** (`find_by!(display_id:)`), and conversation JSON serializes display_id AS `id`. Contacts/inboxes/teams/labels/messages use primary keys.
- Message pagination cursors (`before`/`after`) reference `messages.id` — the **global primary key**, not per-conversation numbering.

## Pagination cheat-sheet (inconsistent per endpoint)

| Endpoint | Scheme |
|---|---|
| contacts index / filter | `page`, 15/page, `meta.count` = real total |
| contacts search | `page`, 15/page, `meta.has_more` — `meta.count` is page size, NOT total |
| conversations index/filter | `page`, 25/page (ENV), total in `meta.all_count` (computed before assignee_type filtering) — page only to enumerate |
| conversation messages | cursor: `before` → 20 older, `after` → up to 100 newer, both → range up to 1000 |
| contact conversations | fixed latest-20 by activity, NO paging, permission-filtered silently |
| csat | `page`, 25/page, bare array, no meta |
| audit-logs / reporting-events / applied-slas | `page`, 25/page, has total_entries |
| agents/teams/labels/inboxes/webhooks/automation-rules/macros/canned | no pagination, full list |

Date ranges are epoch-second STRINGS (`since`/`until`); cwapi converts ISO dates for you. csat/applied-slas/reporting-events need BOTH since and until or the range is ignored.

## Filter payloads (contact-filter / conversation-filter)

`[{"attribute_key":"email","filter_operator":"contains","values":["foo"],"query_operator":"AND"}]` — `query_operator` on every item EXCEPT the last; `values` always an array. Operators: equal_to, not_equal_to, contains, does_not_contain, is_present, is_not_present, is_greater_than, is_less_than, days_before (+ starts_with for contact name). Conversation keys: status, assignee_id, inbox_id, team_id, contact_id, priority, display_id, campaign_id, labels, created_at, last_activity_at, browser_language, conversation_language, referer, mail_subject. Contact keys: name, phone_number, email, identifier, country_code, city, company_name, labels, created_at, last_activity_at, blocked. Custom attributes need `"custom_attribute_type"` added. 422 = bad key/operator.

## Endpoint quirks worth knowing

- `account` — includes the **full enabled-features hash** and `custom_attributes` (plan_name, subscription_status, marked_for_deletion_at): the quickest feature-flag/plan check.
- `conversations --q text` — message-content ILIKE, but **silently SKIPS the status filter** when q is present. On huge accounts (e.g. account 1) it TIMES OUT (422 "took too long"); multi-word `search` 500s and single-token `search` matches contacts/identifiers, NOT message bodies. There is no working full-text message search on account 1 — instead: `conversation-filter` by label (POST path, reliable) to shortlist, then `messages <id> --all` per candidate and grep locally. Also grep `canned` early — recurring fixes usually have a canned response naming the symptom.
- `conversations` cwapi default is `--status all` (the raw API defaults to `open` — cwapi overrides for support use).
- `search <q>` (`/search/...`) — matches conversation display_id-as-text + contact name/email/phone/identifier: fastest "find the conversation for +55…".
- `source-lookup <inbox_id> <source_id>` — which contact owns a (inbox, source_id) pair; decisive for WhatsApp identity questions (phone vs BSUID).
- `inbox <id>` — an agent token gets `phone_number`, `provider`, `message_templates`, `reauthorization_required`, working hours, `enable_auto_assignment`, channel type. It does **not** get `provider_config` (WABA id, phone_number_id, api_key), IMAP/SMTP credentials, HMAC tokens, or Twilio `auth_token` — those are administrator-gated in the serializer, so they are missing rather than redacted, and `--show-secrets` cannot recover them. Needing a WABA id means asking the customer or an admin.
- `contact-conversations` silently drops conversations the token's user can't access — a "missing" conversation may be a permissions artifact; cross-check with an admin token or `conversation <display_id>` directly.
- `conversation-events <display_id>` (enterprise) — first_response/resolution/reply_time reporting events, created_at asc: the SLA/latency debugging timeline.
- `audit-logs` — admin-only (401 here). Even with admin it needs the account feature `audit_logs`, otherwise it returns EMPTY 200, not an error. **Agent-token substitute at conversation scope:** `messages <display_id> --all` includes `message_type: 2` activity entries recording status changes, assignment, labels and team moves with timestamps and actor names.
- `conversation-events <display_id>` is a conversation *member* action (`Enterprise::…::ConversationsController#reporting_events`), authorized by `ConversationPolicy#show` — so an agent token CAN read it, unlike the account-wide `reporting-events` index. It is the agent-readable first-response/resolution timeline.
- `report` with an invalid metric returns `{}` with 200 (logged server-side, no 4xx) — a blank report is not proof of no data.
- `limits` (Cloud) — plan usage vs allowed (agents, captain credits) via `/enterprise/api/v1/accounts/:id/limits`.
- Custom filters (`raw GET /api/v1/accounts/<id>/custom_filters` — no dedicated subcommand) are scoped to the token's user — you cannot read another agent's saved filters.

## Recipes

- **Map a WhatsApp number to its contact + conversations**: `search <last-digits>` → contact id → `contact-conversations <id>`; or `source-lookup <inbox_id> <wa_id>`.
- **Duplicate-conversation check**: pull both conversations (`conversation <display_id>`), compare `.contact_inbox.source_id` (phone vs BSUID).
- **Message delivery failure**: `messages <display_id>` → failed message → `status`, `content_attributes.external_error`, `source_id`, `created_at`.
- **"Automation didn't fire"** (rules are admin-only → 401): work from the effect. `messages <display_id> --all` activity entries show whether the action landed; then ask the customer's admin to screenshot the rule's conditions and `active` state, and let the code track judge whether those conditions could match the stored values.
- **"Webhook not delivering"** (`webhooks` is admin-only → 401): ask the customer for their receiving endpoint's own access log for the window, and their admin for a screenshot of Settings → Integrations → Webhooks. Chatwoot-side delivery failures are log-only — escalate.
- **"When did inbound stop?"**: `conversations --inbox-id <id> --sort-by last_activity_at_desc` → newest conversation → `messages <display_id>` → newest incoming (`message_type: 0`) `created_at`. That timestamp is this harness's substitute for "webhook traffic stopped at T".
- **Token capability probe**: `profile` → accounts[].role, then `inboxes` for membership. Once role is known, a 401 on an admin endpoint is a permission fact, not a bug — record it as an escalation ask and move on.

## The three public API surfaces (answering "which endpoint do I call?" threads)

Support threads about integrations go in circles when the answer describes a different surface than the customer
is using. The identifiers are **not** interchangeable — establish the surface in the first reply.

| Surface | Path prefix | Auth | Identifies a person by | Identifies a conversation by |
|---|---|---|---|---|
| **Client API** (end-user / in-app) | `/public/api/v1/inboxes/{inbox_identifier}/...` | none (the inbox_identifier is the key) | `customer_identifier` → `source_id` | conversation id under that contact |
| **Application API** (server-to-server) | `/api/v1/accounts/{account_id}/...` | `api_access_token: <token>` header | `contact_id` (+ numeric `inbox_id`) | `display_id` |
| **Platform API** (provisioning) | `/platform/api/v1/...` | platform app token | — | — |

Application-API create flow, verified at develop@8314676d1:

1. `POST /api/v1/accounts/{account_id}/contacts` — body `name, identifier, email, phone_number, additional_attributes, custom_attributes` (contacts_controller.rb:173) **plus `inbox_id`**. Response: `payload.contact.id`, and `payload.contact_inbox.source_id` / `payload.contact.contact_inboxes[]` — but the contact_inbox is built **only when `inbox_id` is passed** (contacts_controller.rb:162-171). Omit it and `contact_inboxes` is `[]`; that is the usual reason a customer reports "the response has no source_id".
2. `POST /api/v1/accounts/{account_id}/conversations` — `inbox_id` + `contact_id` is sufficient; `ContactInboxBuilder` mints the source_id itself (`SecureRandom.uuid` for `Channel::Api` and `Channel::WebWidget`, contact_inbox_builder.rb:25). Optional nested `message: {content}` creates the first message in the same call (conversations_controller.rb:42). If the inbox has `lock_to_single_conversation`, this **returns the existing conversation** instead of creating one (conversation_builder.rb:11-15).
3. `POST /api/v1/accounts/{account_id}/conversations/{display_id}/messages` — body `content`, `message_type` (**defaults to `outgoing`**, message_builder.rb:14 — a ticket filed on behalf of the end user needs an explicit `incoming`), `private`, `content_type`, `attachments`.

Gotchas that generate the follow-up tickets:

- Auth header is literally **`api_access_token: <token>`**, not `Authorization: Bearer` (access_token_auth_helper.rb:10). Unexplained 401s on a valid token are usually this.
- Every `/conversations/{id}/...` sub-route resolves `{id}` as **`display_id`** (conversations/base_controller.rb:7), and the create response's `id` field is already display_id (_conversation.json.jbuilder:30) — so chaining works, but an id taken from a DB dump or a webhook's `conversation.id` will 404.
- `source_id` auto-generation is channel-specific: non-API/widget channels derive it from the contact's phone/email and **raise `ActionController::ParameterMissing`** when that field is blank (contact_inbox_builder.rb:30-46). "400 contact phone number" on conversation-create against a WhatsApp/SMS/email inbox means the contact lacks a phone, not that source_id is missing.
- `email`, `phone_number` and `identifier` are unique per account (contact.rb:51-55) — re-creating the same contact 422s. Reuse the stored `contact_id`, or look it up via `GET /contacts/search?q=`.
- Read `custom_attributes.installation_type` on the support-desk conversation before naming a host: self-hosted customers must not be handed `app.chatwoot.com` URLs. The website widget records it automatically.
