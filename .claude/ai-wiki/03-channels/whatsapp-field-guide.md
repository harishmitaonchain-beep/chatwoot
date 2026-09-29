---
title: "WhatsApp/Meta Field Guide"
tags: [chatwoot, channels, whatsapp, meta, troubleshooting]
generated: 2026-08-17
deepwiki_section: null
---

# WhatsApp/Meta Field Guide

Companion to [[whatsapp]]: that page documents how the integration *works*; this one documents how it **fails in production** — distilled from **17 solved support cases** in `.claude/support-harness/cases/` (the platform's densest support area), the support skill's live runbook (`.claude/skills/solve-customer-issue/references/playbooks.md` § WhatsApp), and auto-memory. Cases are cited by filename; customer identifiers stay in the case store.

**Division of labor**: the playbook is the *runbook* (exact queries to run, in order, mid-investigation). This page is the *knowledge map* (taxonomies, discriminators, error codes, what's already been disproven). Update both when a new case teaches something durable.

## Setup-path taxonomy

Four ways a WhatsApp inbox comes to exist — each with its own failure signature. Misidentifying the path wastes an investigation (one case's customer self-reported "Embedded Signup"; logs proved manual API-key paste — always verify the path from `provider_config`, not the customer's memory).

| Path | Code entry | Token | Webhook setup | Characteristic failures |
|---|---|---|---|---|
| **Embedded Signup** (Meta OAuth popup) | `Whatsapp::EmbeddedSignupService` | ES-exchanged token, Chatwoot's Meta app | explicit `setup_webhooks` post-signup | Pre-FINISH failures never reach our backend (popup/on-device errors, **zero server traffic by design**); leftover connected-app blocks; portfolio verification |
| **Manual / BYOA** (customer's own Meta app or pasted creds) | `provider_config` direct + `after_commit setup_webhooks` | must be a **System User token** | auto, at create — **failures silently swallowed** | Inbox mute from wrong token type; `(#100)` override failures; normalizer-country silent drops |
| **360dialog** (legacy, `provider == 'default'`) | `Whatsapp360DialogService` | 360dialog API key | provider-managed | No BSUID/coexistence, no calling; rare in cases |
| **Twilio WhatsApp** | `Channel::TwilioSms` (whatsapp mode), [[other-channels]] | Twilio credentials | Twilio-managed | Templates go through **Twilio Content API** (`content_sid`), NOT Meta HSM — existing WABA templates don't carry over (case `2026-08-whatsapp-twilio-template-outside-24h-window`) |

## Token types (chronic confusion source)

| Token | Lifetime | What it's for | Failure when confused |
|---|---|---|---|
| Graph-Explorer **User token** | hours–days | debugging only | Pasted as manual `api_key` → webhook auto-setup 403s, inbox goes mute (case `2026-07-whatsapp-manual-byoa-user-token-socios-redherring`) |
| **System User token** | permanent | the correct manual-path `api_key` | — |
| **Business Management token** | long-lived | template sync only (Cloud + ES inboxes; saved with `validate: false`) | Not a message-send credential — see [[whatsapp]] |
| ES-exchanged token | managed | embedded-signup inboxes | — |

Also chronic: the Meta **"0 Socios/Partners" screen is expected and irrelevant** — Chatwoot is a Tech Provider, never a Business Partner. Repeatedly mistaken for the problem.

## Meta error codes seen in the wild

| Code | Meaning (as verified in cases) | Case receipt |
|---|---|---|
| `(#100)` "app must be subscribed" | Phone-level `override_callback_uri` rejected. Two flavors: transient (fresh subscribe not yet effective) and **persistent on `ownership_type: SELF` (self-service) WABAs** — the persistent flavor matches open GitHub issue chatwoot/chatwoot#13154; ownership-mismatch and propagation-lag were both **disproven live** — don't re-litigate | `...-selfservice-waba-override-100-persistent`, `...-manual-register-webhook-100-surfaced` |
| `#100/33` GraphMethodException ("cannot load Phone Number ID") in health | **Downstream symptom**, usually of a locked/dead WABA — not token expiry | `...-waba-locked-131031-inbound-stopped` |
| `(#200)` Permissions | `subscribed_apps` POST rejected — surfaced misleadingly by the Calling toggle as "not registered in Calling API" (frontend discards the real error) | `...-calling-enable-fails-subscribed-apps-200` |
| `131026` Message undeliverable | Meta-side **async** rejection after HTTP 200 + wamid; carries no richer reason in our logs — real cause only in Meta Business Manager; generic 131026 on cold first-contact = recipient reachability/opt-in, NOT sender cap (those are 131049/131048) | `...-131026-message-undeliverable-cold-first-contact` |
| `131031` Business account locked | Meta locked the WABA; webhooks stop entirely. **"Worked then stopped at one exact minute" is the discriminator** vs config issues | `...-waba-locked-131031-inbound-stopped` |
| `131044` calling eligibility/payment | Outbound call rejected; `error_user_msg` is an **empty string**, which Chatwoot's `\|\|` fallback masks into 422 `{"error":""}` — real reason in the `[WHATSAPP CALL] initiate_call failed` NR line | `...-outbound-call-422-empty-error-131044` |
| `131060` companion-device sync | Coexistence echo can't decrypt → placeholder `unsupported` message (by design, so the conversation isn't headless) — see [[whatsapp]] |
| `#1752206` "user cannot be added to the business" | ES blocked by a **leftover Chatwoot connected-app** on the Business Portfolio from a prior/half-completed attempt; removal + retry validated as the fix | `...-embedded-signup-user-cannot-be-added-to-business`, `...-es-1752206-mensor-second-number` |
| `2388001` register blocked | Phone's Cloud API identity dead after `PARTNER_APP_UNINSTALLED` + half-migration to a self-built WABA | `...-number-deregistered-register-2388001` |
| `wa.md.pair Code=16` (on-device) | Coexistence QR pairing fails on the Meta/device side, pre-FINISH; check prior Cloud-API registration of the number, ≥7d app activity | `...-coexistence-qr-pairing-code16` |
| Twilio `21619` empty body | Body was already empty at Chatwoot's HTTP ingress (lograge shows pre-processing params) — customer's own integration, not our dispatch | `2026-08-agent-bot-twilio-21619-empty-body-client-side` |

## Symptom → first check (the discriminator table)

| Symptom | Check FIRST (before anything else) | Why |
|---|---|---|
| Can send, can't receive (days) | `GET /{waba_id}/subscribed_apps` — empty `data` = Meta delivers nothing | Outbound proves the token; the stored callback override **displays correct regardless** (case `2026-05-...-can-send-cant-receive`) |
| Webhooks 200 in NR, zero conversations ever, token regen no effect | Compare payload `display_phone_number` digits vs stored `channel.phone_number`; normalizer coverage (`PhoneNumberNormalizationService::NORMALIZERS` — Brazil/Argentina/Mexico as of 2026-08) | Channel-finder nil → WARN-only drop **before any auth check**; "Inactive WhatsApp channel: **unknown**" = lookup returned nil. HTTP 200 ≠ processed (controller has a URL-param fallback the job lacks) |
| Worked fine, then stopped at one exact minute | Outbound status callbacks for `131031` around that minute | WABA lock — Meta-side, nothing to fix in Chatwoot |
| Test events arrive, real messages don't | — that's Meta sample-ids hitting the **app-level** callback | Not evidence the phone-level pipeline works |
| Duplicate conversations, one contact | `contact_inbox.source_id` per conversation: phone vs BSUID | Coexistence identity split (CW-7651 — the very bug this checkout's branch addresses), NOT normalization, NOT `lock_to_single_conversation` |
| Newest APPROVED template missing, sync button "does nothing" | NR `Template sync failed` + literal `account <id>`; **zero hits + real failure = the silent validate-on-save discard** | `sync_templates`' `.update()` re-fires `validate_provider_config`; transient failure discards the fetched list silently AND resets the 3h throttle (case `...-template-sync-silent-discard-and-403-permission`) |
| ES fails in the popup | NR count on `/api/v1/accounts/<id>/whatsapp` — **zero = Meta-side, stop looking in our logs** | Pre-FINISH errors never reach the backend; ES Session IDs are Meta-internal — route to Meta Direct Support |
| Provider says "empty body" on bot sends | Raw lograge ingress line for that POST | Params captured pre-processing; empty there = upstream of Chatwoot |
| Given a phone_number_id by anyone | **Verify its identity/history first** | The id handed over may have zero traffic history; `hello_world`-only templates = brand-new WABA (memory: phone-id identity check) |

## Engineering debt this area carries (feeds [[product-signals]] theme 3)

- Manual-path webhook registration failures **silently swallowed** at inbox creation (`setup_webhooks` rescue) — inbox looks created, never receives; nothing retries.
- Template-sync silent discard (above) — fix sketch exists in the case file (`validate: false` on that update).
- `131044`'s empty `error_user_msg` masked by a `||` fallback → customer sees `{"error":""}`.
- Calling toggle discards the server's real `(#200)` error for a generic i18n string.
- The persistent `(#100)` on SELF-ownership WABAs: open upstream (GH #13154), no accepted fix.

## Calls corner

WhatsApp voice lives on the voice feature branch (authoritative doc `docs/WHATSAPP_CALL_ARCHITECTURE.md` at commit `a3b4987584` — **not on this branch**; §12 lists the gotchas branch commits tend to violate: DTLS role, HelloVerify, `MEDIA_SERVER_PUBLIC_IP`). Field notes: match interactive call-permission replies by `interactive.context.id` → stored wamid, never by recency; the `field=calls` webhook payload includes the caller's `contacts[].profile.name` (undocumented — use for inbound-call contact naming); enterprise overlay per [[whatsapp]].

## Public docs for this area (from [[external-docs]])

User guide: WhatsApp setup (embedded/manual/Twilio), *Common WhatsApp issues*, Brazil/Argentina number inconsistencies, embedded→manual migration (`chwt.app/migrate-whatsapp`), template sync via Business Management token, WhatsApp templates article, WhatsApp CSAT templates, WhatsApp voice. Developer docs: `self-hosted/configuration/features/integrations/whatsapp-embedded-signup.mdx`.

## Related

- [[whatsapp]] — the mechanism page this guide assumes
- [[webhook-routing]], [[identity-validation]] — inbound entry + webhook-signature side
- [[product-signals]] — theme 3 (WhatsApp onboarding complexity) is this page in product terms
- [[feature-index]] — WhatsApp rows; [[plan-tiers-billing]] — channel gating
- Support runbook: `.claude/skills/solve-customer-issue/references/playbooks.md` § WhatsApp
