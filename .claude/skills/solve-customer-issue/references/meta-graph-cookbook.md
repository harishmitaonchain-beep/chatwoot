# Meta Graph cookbook — for the `metaapi` track

`cwapi` answers *what does Chatwoot think?*; `metaapi` answers *what does Meta think?*. WhatsApp is the densest
support area in the case store, and a large share of those cases were only settled by Meta-side facts that used to
be gathered by hand — or worse, round-tripped through the customer over days.

CLI: `.claude/support-harness/bin/metaapi` (repo root `/Users/sharma/Downloads/workspace/chatwoot`). Run
`metaapi help` first. **Read-only by construction: the file only ever issues HTTP GET.**

## Getting a token

The inbox's own credential (`provider_config.api_key`) is the natural probe token — but **this harness's Chatwoot
token is agent-role, and `provider_config` is administrator-gated in the serializer**
(`app/views/api/v1/models/_inbox.json.jbuilder:146`). The field is absent, not redacted, so
`cwapi inbox <id> --show-secrets` cannot recover it and `metaapi diagnose --from-inbox` is unavailable here.

Get a token one of these ways, in order of preference:

1. **From the customer.** They own the WABA and can mint a System User token with `whatsapp_business_management`
   (Business Settings → Users → System users → Generate token). Ask for the **WABA id** and **phone number id** in
   the same message — both are on WhatsApp Manager → Account tools → Phone numbers.
2. **From an admin/engineer** with an admin token on the account, who can read `provider_config.api_key`.

Store it with `./creds/setup_creds.sh meta` (writes `creds/meta.env`, 0600), then `source` it.
`META_APP_ID`/`META_APP_SECRET` are optional and only needed for `debug-token`'s reliable form and for
`app-subscriptions`.

**Never print the token.** Only paths travel.

## The one command to run first

```bash
source .claude/support-harness/creds/meta.env
metaapi diagnose --waba <waba_id> --phone <phone_number_id> [--expect-phone +E164]
```

Pulls `debug_token` + WABA node + `/phone_numbers` + `/subscribed_apps` + the phone node, and returns an ordered
checklist with a verdict. The first `FAIL` is usually the whole story. Add `--raw` to also dump the payloads.

`metaapi diagnose --from-inbox <file>` does the same from a `cwapi inbox --show-secrets` dump — only usable when
someone with an admin token produced that file for you.

## What each check is really testing

| Check | Fails when | The case it comes from |
|---|---|---|
| `token.permanent` | token expires — i.e. a Graph-Explorer **User** token where a **System User** token is required | `2026-07-whatsapp-manual-byoa-user-token-socios-redherring` |
| `token.app_is_chatwoot` (WARN) | the token belongs to Chatwoot's own Meta app ⇒ embedded-signup inbox, the customer **cannot** fix subscriptions themselves | thread 89159 |
| `waba.subscribed_apps` | `data: []` ⇒ Meta delivers **nothing**, while the stored callback still displays fine | `2026-05-whatsapp-can-send-cant-receive` |
| `waba.token_app_subscribed` | the token's app isn't among the subscribed apps ⇒ webhooks go to someone else's app | thread 88363 |
| `waba.owns_phone` | the configured `phone_number_id` isn't on the configured WABA | `2026-07-whatsapp-number-deregistered-register-2388001` |
| `waba.ownership_type` (WARN) | `SELF` — correlates with the persistent `(#100)` override failure | `...-selfservice-waba-override-100-persistent` |
| `phone.verified` | not `VERIFIED`. **`EXPIRED` is the sneaky one**: Chatwoot health still shows "Connected / Live" | thread 88363 |
| `phone.account_mode` | `SANDBOX` ⇒ every send to a non-allow-listed number fails `(#131030)` | thread, acct 180034 |
| `phone.callback_override` | absent, a literal `{phone_number}`/`%7B` placeholder, or pointing somewhere that isn't us | thread 88224 |
| `phone.stored_number_matches_meta` | **the 100%-inbound-drop detector** — see below | `2026-08-whatsapp-stored-phone-typo-100pct-webhook-drop` |
| `phone.coexistence` (WARN) | `is_on_biz_app` ⇒ expect BSUID source_id splits and `smb_message_echoes` | `2026-07-whatsapp-coexistence-duplicate-conversations` |

## Reading Chatwoot's stored `phone_number` without DB access

Chatwoot registers the callback as `<FRONTEND_URL>/webhooks/whatsapp/<channel.phone_number>`
(`app/services/whatsapp/webhook_setup_service.rb#build_callback_url`). So the `override_callback_uri` Meta stores
**echoes the value Chatwoot had at registration time**:

```bash
metaapi webhook <phone_number_id>     # → chatwoot_stored_phone_number
```

If that differs from Meta's `display_phone_number`, `WebhookChannelFinderService` resolves nil and **every** inbound
event is dropped with a WARN-only "Inactive WhatsApp channel" — the typo / missing-normalizer class of failure. This
replaces the `hub.challenge` trick invented for the typo case, and it is one call.

Caveat: it reflects the value at *registration* time, not necessarily now. Treat a match as strong evidence and a
mismatch as a lead to confirm against the inbox record.

## Templates — the `(#132000)` conversation

```bash
metaapi template-check <waba_id> <template_name>
```

Returns each language variant's status/rejection plus the **real** expected parameter count per component.
Customers count body variables only; `HEADER` and `BUTTON` (URL) parameters count too — that is almost always the
gap when someone insists their parameter count is correct.

## App-level vs phone-level webhooks

```bash
metaapi app-subscriptions <app_id>    # needs META_APP_ID + META_APP_SECRET
```

Meta allows **one webhook per app**, covering every number under it. Chatwoot instead writes a **phone-level
override**. Two consequences worth remembering:

- Meta's "test event" payloads go to the **app-level** callback — which is exactly how "test events arrive but real
  messages never do" happens. Never accept a successful test event as proof the phone-level pipeline works.
- When the phone-level override is permanently stuck on `(#100)`, pointing the **app-level** callback at Chatwoot
  (keeping the leading `+` in the phone path) unblocks the inbox. Verified twice (threads 88363, 90542). Register
  Webhook can then be ignored; the inbox should not be deleted or recreated.

## Other one-liners

```bash
metaapi ownership <waba_id> <phone_number_id>   # "does this token/app actually own this number?" in one verdict
metaapi subscribed-apps <waba_id>               # the single decisive can-send/can't-receive check
metaapi phone <phone_number_id>                 # exactly the fields Whatsapp::HealthService reads
metaapi waba <waba_id>                          # ownership_type, review + verification status
metaapi templates <waba_id> --status REJECTED   # rejected_reason per template
metaapi calling <phone_number_id>               # WhatsApp voice enablement state
metaapi raw /v22.0/<id> fields=name             # escape hatch, any GET
```

## Error-code hints are built in

Every non-2xx response is rendered with `code`, `error_subcode`, `error_user_msg` (preserved verbatim — Meta sends
`""` for `131044`, which is the bug that produces `422 {"error":""}` in Chatwoot), `fbtrace_id`, and a hint drawn
from the case store. The hint table lives at the top of the CLI; add to it whenever a new code is pinned down, and
mirror durable ones into `.claude/ai-wiki/03-channels/whatsapp-field-guide.md`.

## Limits — what metaapi cannot tell you

- Anything about a **different** app's hold on a number (the `(#133010)` / "already registered elsewhere" class):
  the Graph only answers for apps your token can see.
- Embedded Signup failures **before** FINISH: they never reach any API you can query — Meta-side, by design.
- Coexistence eligibility criteria (`#3441045`, `#2655095`): Meta-internal.
- Chatwoot's own uniqueness collisions ("Phone number has already been taken", orphaned `channel_whatsapp` rows
  from deleted accounts) are a *Chatwoot*-side problem — Meta looks perfectly healthy. Needs super-admin/console,
  not this CLI.
