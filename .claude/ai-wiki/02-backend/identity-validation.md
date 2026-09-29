---
title: "Identity Validation & HMAC Trust Boundaries"
tags: [chatwoot, backend, security, hmac, identity]
generated: 2026-08-17
deepwiki_section: "Security"
---

# Identity Validation & HMAC Trust Boundaries

## Purpose

Chatwoot uses HMAC-SHA256 in two completely different trust roles, and conflating them causes real security misdiagnoses:

1. **Contact-identity HMAC** — "is this end-user really who the client claims?" A customer's *server* signs the contact's `identifier` with a per-channel secret (`hmac_token`); the untrusted client (browser widget, mobile app) presents `identifier_hash` alongside the identifier. Passing marks the `contact_inboxes.hmac_verified` flag, which widens what that session may see.
2. **Webhook-source verification** — "did this inbound HTTP payload really come from the provider (Meta, Shopify, TikTok…)?" The provider signs the raw request body; Chatwoot recomputes and compares before enqueuing processing jobs. This says nothing about any contact's identity.

This page maps both boundaries across channels: which channels support identity validation (Web Widget and API only), what `hmac_verified` actually gates, the mandatory-vs-optional modes, and where the *separate* webhook-signature layer lives.

## Key Files & Classes

### Contact-identity HMAC (visitor identity)

| File | Role |
|---|---|
| `app/models/channel/web_widget.rb` | `hmac_token` (via `has_secure_token`, unique index) + `hmac_mandatory` boolean; both in `EDITABLE_ATTRS` |
| `app/models/channel/api.rb` | Same pair for the API channel: `hmac_token` (`has_secure_token`, unique index) + `hmac_mandatory` (default `false`). Also has a separate `identifier` secure token — that is the channel's *public* lookup handle for the public inbox API, not a secret |
| `app/models/contact_inbox.rb` | `hmac_verified :boolean, default: FALSE` — the durable per-(contact, inbox) record of a passed identity check |
| `app/controllers/api/v1/widget/contacts_controller.rb` | Widget-side verification: `valid_hmac?` (HMAC-SHA256 of `params[:identifier]` with `@web_widget.hmac_token`, `secure_compare`), `should_verify_hmac?`, `set_user` sets `hmac_verified: true`. `update` requires HMAC only when an `identifier` is supplied (anonymous prechat updates stay open on mandatory inboxes) |
| `app/controllers/api/v1/widget/base_controller.rb` + `app/controllers/concerns/website_token_helper.rb` | Widget session identity: `X-Auth-Token` JWT (`Widget::TokenService`) → `source_id` → `@contact_inbox`; `conversations` widens scope to all of the contact's *hmac_verified* contact_inboxes on that inbox when the current one is verified |
| `app/controllers/public/api/v1/inboxes_controller.rb` | API-channel public base: resolves `Channel::Api` by `identifier`, contact_inbox by `source_id`; conversation lookup scope depends on `hmac_verified?` |
| `app/controllers/public/api/v1/inboxes/contacts_controller.rb` | API-channel verification: `process_hmac` before_action (raises on bad hash, sets `hmac_verified: true`), `valid_hmac?` mirrors the widget's implementation using `@inbox_channel.hmac_token` |
| `app/controllers/public/api/v1/inboxes/conversations_controller.rb` | `index`/`set_conversation` scope by `hmac_verified?` |
| `app/controllers/concerns/hmac_concern.rb` | Trivial 5-line concern: `hmac_verified?` just casts `params[:hmac_verified]` to boolean — **no cryptography**. For authenticated agent/admin APIs where the caller is already trusted |
| `app/controllers/api/v1/accounts/contacts/contact_inboxes_controller.rb` | Includes `HmacConcern`; `create` passes `hmac_verified: hmac_verified?` into `ContactInboxBuilder` |
| `app/controllers/api/v1/accounts/conversations_controller.rb` | Includes `HmacConcern`; `build_contact_inbox` (used when creating a conversation with `contact_id` + `inbox_id`) passes the same flag |
| `app/builders/contact_inbox_builder.rb`, `app/builders/contact_inbox_with_contact_builder.rb` | Accept `hmac_verified:` (default false) and persist it on `first_or_create!` |

### Webhook-source signature verification (provider authenticity)

| File | Role |
|---|---|
| `app/controllers/concerns/meta_token_verify_concern.rb` | Two distinct Meta mechanisms: (a) `verify` — GET subscription handshake echoing `hub.challenge` if `hub.verify_token` matches (delegates to `valid_token?`); (b) `verify_meta_signature!` — validates `X-Hub-Signature-256: sha256=…` HMAC of the raw body against candidate app secrets (`app_secret`, `provider_config` keys `app_secret/app_secret_key/client_secret/api_secret`) |
| `app/controllers/webhooks/whatsapp_controller.rb` | Includes the concern; `meta_signature_verification_required?` is conditional — always for unknown channels and `embedded_signup` cloud channels or when channel app secrets exist; skipped for non-`whatsapp_cloud` providers. Falls back to global `WHATSAPP_APP_SECRET` |
| `app/controllers/webhooks/instagram_controller.rb` | Includes the concern; `verify_meta_signature!` on `events` |
| `app/controllers/webhooks/shopify_controller.rb` | `verify_hmac!`: Base64 HMAC of raw body with `SHOPIFY_CLIENT_SECRET` vs `X-Shopify-Hmac-SHA256`, `secure_compare`, 401 on mismatch or missing secret |
| `app/controllers/webhooks/tiktok_controller.rb` | `verify_signature!`: parses `Tiktok-Signature` header (`t=…,s=…`), HMAC of `"#{timestamp}.#{body}"` with the client secret |
| `app/controllers/webhooks/line_controller.rb` | Passes `x-line-signature` + raw body through to `Webhooks::LineEventsJob` (verification happens downstream, not in the controller) |

## How It Fits Together

### Boundary 1: contact-identity HMAC (Web Widget & API channels only)

The flow is identical in shape on both channels that support it:

1. **Setup**: the channel record carries an auto-generated secret `hmac_token`. The customer copies it to their backend; it must never ship to the client.
2. **Claim**: the client sends `identifier` (the customer's stable user ID) plus `identifier_hash` — `OpenSSL::HMAC.hexdigest('sha256', hmac_token, identifier)` computed server-side by the customer.
3. **Check**: Chatwoot recomputes the digest and `secure_compare`s (with a bytesize pre-check to avoid raising). Widget path: `Api::V1::Widget::ContactsController#valid_hmac?` on `set_user` (and on `update` when an identifier is present). API-channel path: `Public::Api::V1::Inboxes::ContactsController#process_hmac` runs as a before_action on *every* public contact endpoint.
4. **Persist**: success flips `contact_inboxes.hmac_verified` to `true`. The flag lives on the contact↔inbox join row, not on the contact — verification is per inbox.
5. **Consequence — session widening**: an *unverified* session is confined to its own `contact_inbox`'s conversations (effectively "this browser's cookie"). A *verified* session is trusted as the real person, so lookups widen to the whole contact: `@contact_inbox.contact.conversations` (public API `index`/`set_conversation`; `Public::Api::V1::InboxesController#set_conversation`), and the widget's `conversations` helper unions all `hmac_verified: true` contact_inboxes of the contact on that inbox. `ActionCableListener#contact_token_rooms` mirrors this: verified rows broadcast to every verified pubsub token of the contact, unverified ones only to their own token.
6. **Surfacing**: `hmac_verified` is exposed to agents (`_conversation.json.jbuilder`, `Conversations::EventDataPresenter`, the "verified" indicator in `ConversationHeader.vue`) and consumed by enterprise Captain (audience filter `hmac_verified`, `X-Chatwoot-Contact-Inbox-Verified` header in custom HTTP tools).

**`hmac_mandatory` vs optional.** Both `Channel::WebWidget` and `Channel::Api` have `hmac_mandatory` (default `false`). The check logic is "verify if a hash was provided OR the channel mandates it":

- *Optional mode* (`hmac_mandatory: false`): requests without `identifier_hash` skip verification entirely (`process_hmac` returns early; widget `should_verify_hmac?` is false). A client can still call `set_user` with a bare `identifier` — the contact is identified but `hmac_verified` stays `false`, meaning **in optional mode the `identifier` is client-asserted and spoofable**; only the `hmac_verified` badge distinguishes trusted bindings.
- *Mandatory mode* (`hmac_mandatory: true`): a missing or wrong hash is rejected — widget returns 401 `HMAC failed: Invalid Identifier Hash Provided`; the public API raises `StandardError` with the same message. Widget exception: `update` without an `identifier` (anonymous prechat name/email/custom-attribute edits) deliberately bypasses HMAC even on mandatory inboxes; only the identity-*binding* path is gated. `should_verify_hmac?` also skips when `custom_attributes` are present without an `identifier`.

**The `HmacConcern` misnomer.** Despite the name, `HmacConcern` does no HMAC. It lets an already-authenticated agent/admin (agent-facing `Api::V1::Accounts::*`, behind Pundit) assert `hmac_verified: true` when creating a contact_inbox — e.g. dashboard-created conversations for API inboxes. The trust boundary here is Chatwoot's own session auth, not cryptography: an account user is allowed to vouch for an identity binding. Both includers (`Contacts::ContactInboxesController#create`, `ConversationsController#build_contact_inbox`) feed the flag straight into `ContactInboxBuilder`.

**Other channels**: WhatsApp, email, SMS, social channels have *no* identity-HMAC concept — identity there is the channel-native address (phone number, email, PSID), assigned by `ContactInboxBuilder#generate_source_id`, and trusted because it arrives via provider webhooks (boundary 2). Their contact_inboxes simply keep `hmac_verified: false`.

### Boundary 2: webhook-source verification (provider → Chatwoot)

Entirely separate machinery answering "is this payload authentic?", always over the **raw request body** before parsing/enqueueing:

- **Meta (WhatsApp/Instagram)**: `MetaTokenVerifyConcern` handles both the one-time GET `hub.verify_token` handshake (`verify`, per-channel `valid_token?` overrides — WhatsApp checks `provider_config['webhook_verify_token']`) and per-request `X-Hub-Signature-256` HMAC against a *list* of candidate app secrets. WhatsApp's `meta_signature_verification_required?` is nuanced: required for unknown/unmatched channels, embedded-signup cloud channels, and channels with configured secrets; skipped for non-cloud providers (e.g. 360dialog) that don't sign this way.
- **Shopify**: strict — 401 if `SHOPIFY_CLIENT_SECRET` is unset, header missing, or digest mismatch (guards GDPR `shop/redact`).
- **TikTok**: timestamped signature (`t.s` header format, HMAC over `timestamp.body`) — replay-resistant by construction.
- **LINE**: controller forwards signature + raw body to the job; validation is deferred, not skipped.

Neither webhook verification nor its failure ever touches `hmac_verified` — a Meta-signed WhatsApp payload proves *Meta sent it*, not that a contact identity was validated.

## Product Behavior

- The user-guide article on **enabling identity validation** corresponds to: toggling `hmac_mandatory` per Web Widget / API inbox (an `EDITABLE_ATTRS` member, editable from inbox settings), copying the inbox's `hmac_token` into the customer's backend, and computing `identifier_hash = HMAC_SHA256(hmac_token, identifier)` server-side, passed to the widget SDK's `setUser` / the public API's contact endpoints.
- The **contact-identity** article's "verified" concept maps to `contact_inboxes.hmac_verified`: agents see a verification indicator on conversations (`ConversationHeader.vue` reads `hmac_verified` from conversation metadata), signalling the contact's claimed identity was cryptographically vouched for.
- Product consequence of *not* enforcing it: on optional-mode inboxes, anyone who knows (or guesses) another user's `identifier` can call `setUser` and get a contact_inbox bound to that contact — but it stays unverified, so their session cannot read the victim's other (verified) conversations. Mandatory mode closes the spoofed-binding hole entirely.
- Conversation continuity across devices: a returning verified user gets their full conversation history (contact-wide scope); unverified sessions only see conversations started from that same browser token.
- Enterprise Captain can target assistants by `hmac_verified` audience filters, and custom HTTP tools forward the flag as `X-Chatwoot-Contact-Inbox-Verified` so customer endpoints can decide how much to reveal.

## Notes for AI Agents

- **Never conflate the two boundaries.** "HMAC" in a widget/API-inbox context = contact identity (`hmac_token`/`identifier_hash`/`hmac_verified`). "HMAC/signature" in a `webhooks/*` controller = payload-source verification. Different secrets, different headers, different failure modes.
- `HmacConcern` is a booby trap for greps: it validates nothing cryptographic — it's a params-boolean reader gated only by agent authentication. Don't cite it as evidence of signature checking.
- `hmac_verified` is on **contact_inboxes**, defaults `false`, and is effectively one-way in the app code (only ever set to `true`; nothing resets it). One contact can have both verified and unverified rows on the same inbox.
- The two `valid_hmac?` implementations (widget contacts controller, public inbox contacts controller) are duplicated, not shared — a change to one does not propagate. Both HMAC only the `identifier` string, not the full payload: other contact attributes (email, name) in the same request are *not* covered by the signature.
- Widget vs public-API error style differs: widget renders a 401 JSON; the public API `raise StandardError, 'HMAC failed: …'` (surfaces via the app's generic exception handling). Expect different observed status codes for the same failure.
- `Channel::Api#identifier` (inbox URL handle) vs contact `identifier` (customer's user ID) are unrelated despite the shared name.
- When debugging "user can't see old conversations in widget": check `hmac_verified` on the involved contact_inbox rows first — the conversation-scoping fork in `Api::V1::Widget::BaseController#conversations` and `Public::Api::V1::Inboxes::ConversationsController#index` is the usual cause.
- WhatsApp signature enforcement is conditional (`meta_signature_verification_required?`); absence of a 401 does not prove a valid signature for non-embedded-signup/non-cloud channels.

## Related

- [[widget-backend]] — full widget request lifecycle, token service, and widget HMAC detail
- [[widget-sdk]] — client-side `setUser`/`identifier_hash` entry points
- [[public-platform-api]] — the `Public::Api::V1::Inboxes::*` surface this page's API-channel identity checks guard
- [[api-v1-controllers]] — agent-facing controllers including the `HmacConcern` includers
- [[webhook-routing]] — how inbound webhooks are routed after signature verification passes
- [[facebook-instagram]] — Meta channel specifics behind `MetaTokenVerifyConcern`
- [[other-channels]] — channels with no identity-HMAC concept (channel-native source IDs)
- [[models]] — `ContactInbox`, `Channel::Api`, `Channel::WebWidget` schemas
- [[contacts-services]] — `ContactIdentifyAction` and contact merge/dedup invoked after identity is accepted
- [[glossary]] — terminology (contact_inbox, source_id, identifier)
