# Investigating without production logs

This harness has **no log track**. Nobody running it has New Relic, server logs, a Rails console, or database access. The evidence available is: the Chatwoot API through an **agent-role** token, the Meta Graph API (when a token is supplied), the codebase, the case store, and whatever the customer can see and screenshot.

Most of the case store was written when a log track existed, so old cases say things like "check NR first". This page is the translation layer: what logs used to prove, what proves it now, and — when nothing does — how to hand the question to engineering without losing it.

Three rules hold the whole page together:

1. **Absence is not evidence until you prove the read could have seen it.** An agent token sees only inboxes its user is a member of, and admin endpoints answer 401. Before any "there is no X", show that X would have been visible: `cwapi profile` (role), `cwapi inboxes` (membership), `cwapi account` (`features.api_and_webhooks`).
2. **The customer is now an evidence source, not just a reporter.** They can read WhatsApp Manager, the Twilio console, their own webhook receiver, and their own phone. Ask precise questions and ask for screenshots — a verbatim error string with a code is often stronger than a log line ever was.
3. **Never invent a log observation.** If a claim would need a server log to be true, it is a hypothesis or an escalation ask. Label it as one.

## Translation table

| The log question | What answers it now |
|---|---|
| **"Did inbound webhooks stop, and when?"** | The **last inbound message timestamp** on that inbox is the log-free equivalent of "traffic stopped at T". `cwapi conversations --inbox-id <id> --sort-by last_activity_at_desc` → newest conversation → `cwapi messages <display_id>` → newest `message_type: 0` (incoming) `created_at`. Compare against the customer's claim of when they last received something. A clean break with outbound still working is the classic can-send/can't-receive fingerprint. |
| **"Are webhooks arriving at all?"** (WhatsApp) | Meta's side, not ours: `metaapi subscribed-apps <waba_id>` — an empty `data[]` means Meta delivers nothing to anyone, regardless of what Chatwoot's health page says. This is a *better* answer than the log count ever was, because it names the cause instead of the symptom. |
| **"Is Chatwoot's stored phone number the one Meta is sending to?"** (the 100%-inbound-drop typo class) | `metaapi webhook <phone_number_id>` decodes the `override_callback_uri` Chatwoot itself registered — the trailing path segment IS `channel.phone_number` as stored. Compare character-by-character against `display_phone_number`. Fully replaces the old `Inactive WhatsApp channel: unknown - +X` log check, with no logs and no DB. |
| **"Did the outbound message fail, and why?"** | The message record carries it: `cwapi messages <display_id>` → `status` and `content_attributes.external_error` (the provider's own error code and text). This was always the better source; the log line was a copy. |
| **"When did this account's behaviour change?"** | Data timestamps: conversation `created_at` / `last_activity_at` across the window, contact `last_activity_at`, and the gap between the last good and first bad record. `cwapi conversation-filter` with a `created_at` `is_greater_than` clause enumerates per-day volume without the admin-only reports API. |
| **"Which deploy broke it?"** | Code track only: `git log --since=... -- <paths>`, `git log -S '<symbol>'`, `git blame` on the guard. Cloud tracks `develop`. Pin the window from customer report + data timestamps, then match the commit's behaviour change against the observed fingerprint — never by date alone. |
| **"Who changed this setting, and when?"** (audit logs are admin-only) | For anything conversation-scoped, **activity messages are a visible audit trail**: `cwapi messages <display_id> --all` includes `message_type: 2` activity entries for status changes, assignment, labels, and team moves, with timestamps and actor names. For account/inbox settings changes there is no substitute — escalate, or ask the customer's admin to check Settings → Audit logs themselves. |
| **"Did the automation rule fire?"** | Rules are admin-only (`AutomationRulePolicy` is administrator-only across the board), so you cannot read the rule. Work from the effect instead: activity messages on an affected conversation show whether the action happened; ask the customer's admin to screenshot the rule's conditions and `active` state. Then the code track decides whether those conditions could have matched the stored values. |
| **"Did the outgoing webhook / integration deliver?"** | `cwapi webhooks` is admin-only. The receiving end is the customer's: ask them for their endpoint's own access log for the window. Chatwoot-side delivery failure evidence is log-only — escalate it. |
| **"Was there an error burst / job failure?"** | Not observable. Escalate. Do not substitute a guess: say "this needs server logs" and put it in the packet. |
| **"Did the Embedded Signup attempt reach our backend?"** | Log-only. Substitute: ask the customer for the on-screen error text, the error code, and the ES trace/session id, then match against the taxonomy in `playbooks.md` § "Embedded Signup fails". Meta-internal session ids route to Meta Direct Support regardless. |
| **"When exactly did the customer attempt Embedded Signup, and how many times?"** | The **ES Session ID printed at the bottom of Meta's dialog is a UUIDv7** — its first 48 bits are a millisecond Unix timestamp. Harvest the ids from the customer's screenshots (`cwapi messages <display_id>` → attachment `data_url` → curl → Read) and decode: `python3 -c "import datetime;print(datetime.datetime.utcfromtimestamp(int('01a07c38d0e4',16)/1000))"`. That reconstructs each attempt to the second, which is what the old NR page-load query on `/app/accounts/<id>/settings/inboxes/new/whatsapp` was for. Distinct ids = distinct attempts; one id on two different error screenshots = one run failing on two branches of the dialog. **An error that changes between runs rules out static causes** (a stale credit line cannot transition; a half-established relationship can) — decode first, then rank hypotheses. (Case `2026-09-whatsapp-coexistence-2655093-not-eligible-china-tao`.) |
| **"Is this account rate-limited?"** | `cwapi` surfaces HTTP 429 directly with the limit that was hit — no log needed. |
| **"How long did first response / resolution take?"** | `cwapi conversation-events <display_id>` (enterprise) returns that conversation's reporting events oldest-first. It is a conversation member action, so an agent token with inbox access can read it — unlike the account-wide `reporting-events` index, which is admin-only. |

## What the agent-role token can and cannot see

Verified against the policies in this repo (`app/policies/`, `app/views/api/v1/models/_inbox.json.jbuilder`).

**Readable:** `profile`, `account` (features hash + plan `custom_attributes`), `limits`, contacts (`contact`, `contact-search`, `contact-filter`, `contact-conversations`, `contactable-inboxes`, `source-lookup` — contacts are account-wide, not inbox-scoped), conversations and messages **within the token user's inboxes**, `conversation-events`, `inboxes` / `inbox` **for member inboxes only** (no `provider_config`), `agents`, `teams`, `labels`, `custom-attributes`, `canned`, `macros` (global + own), `agent-bots`, `search` (scoped to member inboxes for conversations/messages; contacts unscoped).

**401 for this token:** `automation-rules`, `webhooks`, `audit-logs`, `report` / `report-summary` / `reporting-events`, `csat`, `applied-slas`, campaigns, and every `--show-secrets` field (`provider_config`, IMAP/SMTP credentials, HMAC tokens, Twilio `auth_token`).

**The membership trap.** `user.assigned_inboxes` (`app/models/user.rb:138`) returns all account inboxes for an administrator but only `inbox_members` inboxes for an agent. `ConversationFinder` and `SearchService` both scope to it, and the API returns an empty 200 — no error, no warning. So: **run `cwapi inboxes` first, every time.** If the inbox under investigation is not listed, every emptiness that follows is an artifact of access, and the fix is to have an account admin add the token's user as a collaborator on that inbox (Settings → Inboxes → Collaborators).

**The plan gate.** `features.api_and_webhooks` false (below Startups) makes the entire account API return 403 for any token, admin included. With no log track, that leaves only the code track and the customer's own screenshots — say so up front and plan the investigation around it.

## Asking the customer well

Every question costs a round trip, so batch them and make each one answerable in one look. The high-yield ones:

- "Please send a screenshot of the exact error, including any code or reference number."
- WhatsApp: "In WhatsApp Manager → Account tools → Phone numbers, what is the status and quality rating of the number?" / "Under Business settings → Partners, is Chatwoot still listed?"
- "What is the last message you *did* receive in Chatwoot, and at what time?" (pins the break precisely, and cross-checks against the message record)
- "Does it fail every time, or sometimes?" (total vs partial changes the hypothesis class entirely — apparent partial failures are usually bounded total outages)
- "What changed around then — plan, number, integration, team, a setting?"
- For a WABA-side check: "Can you generate a system-user token with `whatsapp_business_management` and share the WABA id and phone number id?"

## Escalation packet format

Use this whenever evidence exists but is out of reach. One self-contained block — an engineer should be able to act on it without reading the thread or asking a follow-up.

```
ESCALATION — <one-line symptom>

Account:      <id> (<plan>)   Inbox: <id> (<channel type>)
Identifiers:  conversation <display_id>, contact <id>, phone <E164>, wamid <...>
Window (UTC): <start> → <end>
Customer impact: <who is affected, how badly, since when>

What we established (with evidence):
  1. <claim> — <cwapi command / metaapi check / file:line> → <result>
  2. ...

Hypothesis: <the strongest surviving explanation>

What we need and cannot get:
  - <the exact evidence: which log line or admin endpoint or DB field, in which window>
    → if present, it confirms <X>; if absent, it kills the hypothesis and points at <Y>.

Ruled out (don't redo): <dead ends + what refuted each>
Case file: .claude/support-harness/cases/<file>.md
```

Two things make a packet useful rather than a forward: naming the *specific* evidence needed instead of "please check the logs", and stating what each outcome would prove — that is what lets the engineer stop early.
