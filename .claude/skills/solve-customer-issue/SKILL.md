---
name: solve-customer-issue
description: End-to-end harness for debugging a Chatwoot Cloud customer issue from the support desk. Recalls similar past cases, then loops a parallel investigation across live account data (Chatwoot API + Meta Graph) and the codebase until the strongest supported explanation — then produces a customer reply draft, an engineering escalation packet, and a saved case. Use for any customer thread, support escalation, or "account X reports Y" debugging.
---

# Solve a Chatwoot customer issue

You are orchestrating the support harness rooted at `.claude/support-harness/` (repo: /Users/sharma/Downloads/workspace/chatwoot).

**Who you are working for.** Harishmita is a **customer support executive**, not an engineer. She owns the customer thread and the reply that goes out; she does not ship code, run migrations, or touch production. Every output of this harness is therefore one of three things: something she can tell the customer, something she can check or change herself in the dashboard, or a precise ask she can hand to engineering. Code references (`file:line`) belong in the escalation packet, never in the customer reply.

**What access actually exists.** Read this before planning any investigation:

| Have | Don't have |
|---|---|
| A Chatwoot **agent-role** API token on the customer's account (Harishmita supplies it) | Admin-role token, Super Admin, Rails console, database |
| The codebase, read-only, in this repo | **Production logs — there is no log track in this harness.** No New Relic, no server logs, no Sidekiq dashboard |
| Meta Graph reads via `bin/metaapi`, *if* someone supplies a Meta token + WABA/phone ids | Automatic Meta credentials (they live in `provider_config`, which is admin-only) |
| The case store — 60+ solved investigations | Anything requiring a write to production |

Two specialist agents (`cw-data-inspector`, `cw-code-detective`) gather evidence in parallel via the `customer-issue-sweep` workflow; you own intake, recall, the iteration loop, verification, the deliverable, and the case-memory write-back.

## 0. Intake

Extract from the thread/user: **account_id**, symptom in one sentence, channel/product area, concrete identifiers (conversation display_id, contact id/phone/email, wamid, inbox id, message ids), when it started / a UTC time window, and what the customer expected vs got. Note the customer's timezone if visible — convert everything to UTC.

Also capture, because they replace evidence you can no longer collect from logs:
- **Screenshots and error text the customer already sent** — verbatim error strings and codes are now first-class evidence, often the only record of a failure. Attachments are reachable: `cwapi messages <display_id>` → attachment `data_url` → curl → Read.
- **What the customer sees on the provider's side** (Meta WhatsApp Manager, Twilio console, their own webhook receiver). They can read dashboards you cannot.
- **Whether it ever worked**, and what changed around the break.

Credentials for the data track. Harishmita supplies an agent-role token for the account. Write it to a file in your scratchpad directory (the absolute path listed in your system prompt — there is no `$SCRATCHPAD` env var):

```bash
cat > "<scratchpad>/cw_creds.env" <<'EOF'
export CHATWOOT_BASE_URL="https://app.chatwoot.com"
export CHATWOOT_API_TOKEN="<token>"
export CHATWOOT_ACCOUNT_ID="<account_id>"
EOF
chmod 600 "<scratchpad>/cw_creds.env"
```

Never echo the token into the conversation or reports; only the file path travels (in prompts, args, and outputs).

Prefer the per-account convention `.claude/support-harness/creds/<account_id>.env` (`creds/setup_creds.sh <id>` writes it): `cwapi --account <id> <cmd>` then loads that file's token and base url itself, which is how you move between accounts in a multi-account investigation without re-sourcing.

**Invoke `cwapi` so the allow rule matches** (otherwise Harishmita gets a permission prompt every session): always as the literal path `.claude/support-harness/bin/cwapi ...` from the repo root, one call per Bash command. Never store the path in a shell variable (`bin=...; $bin/cwapi`), never `cd` first, and never chain it with `;`/`&&` after other commands. A variable can't be checked before it runs, so Claude Code always prompts on one. Piping into `head`/`tail`/`grep` is fine.

**WhatsApp issues**: the Meta-side half needs a Graph token, and an agent-role token cannot read the inbox's `provider_config.api_key` (admin-gated in `app/views/api/v1/models/_inbox.json.jbuilder:146`). So `metaapi diagnose --from-inbox` is unavailable. Instead run `metaapi diagnose --waba <waba_id> --phone <phone_number_id>` with a token from one of: the customer (their own system-user token — they own the WABA and can generate one), or an engineer/admin. Ask for the WABA id and phone_number_id in the same batch — the customer can read both off WhatsApp Manager. If no Meta token is forthcoming, say so and lean on the customer's own screenshots of WhatsApp Manager. See `references/meta-graph-cookbook.md`.

**Missing inputs never stall the harness**: run what you can, and batch everything you need into ONE ask (token + missing ids + Meta credentials + the two or three questions for the customer, together — not five separate messages).

## 1. Recall before you investigate

1. Read `.claude/support-harness/cases/INDEX.md`, then `rg -il '<symptom keywords>' .claude/support-harness/cases/` — read every matching case file. A matching case gives you validated hypotheses, exact commands that worked, and known dead ends. Say so in the report when a past case shaped the investigation.
   **Translating old cases**: cases written before this harness lost its log track cite New Relic and NRQL heavily. Their *conclusions* remain valid; their *methods* are half-unavailable. When a case says "check NR for X", look X up in `references/no-logs-playbook.md` for the substitute check — and never re-suggest a New Relic query.
2. Check auto-memory (MEMORY.md is already in context) for related entries and read the relevant ones.
3. Skim `references/playbooks.md` for the area playbook — it lists the decisive checks that resolve common symptom classes quickly.
4. Skim `references/no-logs-playbook.md` — it maps each thing production logs used to prove to what now proves it, and holds the escalation-packet format.

## 2. Triage

Classify the area (whatsapp / email / social / automation / billing / assignment / reports / captain / other), form 2–4 initial hypotheses (recalled cases first), and write per-track questions each hypothesis implies. Prefer decisive checks from the playbook over open-ended exploration.

**First, classify incident vs process request.** Roughly half of WhatsApp threads are not incidents at all — they are embedded-signup/coexistence enablement, plan gating, or vetting (measured: 131 of 327 resolved WhatsApp threads are enablement-only). Those are handled by the process in `references/playbooks.md` § WhatsApp, not by a sweep. Opening an investigation on one wastes the whole loop.

**Then pre-flight the access gates**, before hypotheses — each one silently kills the data track:

- `cwapi profile` → does the token's user actually belong to this account, and with what role? A missing account here means the token is useless before anything else matters.
- **Inbox membership.** This is the harness's number-one trap now. An agent-role token sees only inboxes its user is a member of (`user.assigned_inboxes`, `app/models/user.rb:138`), and the API answers with an empty 200, not an error. `cwapi inboxes` — if the inbox in question is not in that list, then `conversations`, `search`, and `messages` for it will all come back empty and that emptiness means **nothing**. Get Harishmita added to the inbox (an account admin can do it in Settings → Inboxes → Collaborators) before reading any absence as evidence.
- `cwapi account` → `features.api_and_webhooks` false (below the Startups plan) means the *entire* data track is 403 for this account: say so immediately, because with no log track that leaves only the code track plus what the customer can show you.
- Plan tier: several past root causes were "this feature is gated off on this plan", not a defect. `cwapi account` custom_attributes carries `plan_name`.
- Admin-only reads are 401 for this token: automation rules, webhooks, audit logs, reports/reporting events, CSAT, campaigns, applied SLAs, and inbox `provider_config`. If a hypothesis can only be settled by one of those, it is an escalation ask — plan for it now rather than discovering it in iteration 3.

## 3. Investigation loop (max 4 iterations)

Each iteration, invoke the sweep. Invoke by **scriptPath** (`.claude/workflows/customer-issue-sweep.js`) — the named registry only picks up workflows present at session start. The runtime may deliver `args` to the script as a JSON string; the script parses both forms, so pass the object normally. Same session-start snapshot applies to the **agent registry**: if the `cw-*` agents were created or edited in the current session, pass `role_prompts: {data, code}` in args (each = that agent's `.md` body without frontmatter) so the script inlines the roles instead of using `agentType`:

```
Workflow({ scriptPath: ".claude/workflows/customer-issue-sweep.js", args: {
  issue, account_id, base_url, time_window, identifiers,
  creds_file: "<path to cw_creds.env>",        // omit → data track reports blocked
  questions: { data: [...], code: [...] },
  skip: { data: false, code: false },
  context: "<established findings + dead ends so far, compact>"
}})
```

After each sweep, read `synthesis`:
- `done: true` → go to verification.
- Otherwise feed `next_iteration` questions into the next sweep, carrying forward `context` (established findings AND dead ends, so tracks don't re-derive or resurrect them). Skip a track with no questions.
- `blocked_on_user` non-empty → batch those asks to Harishmita (and through her, to the customer); keep iterating on the unblocked track while waiting.
- `escalation_asks` accumulate across iterations — carry them forward, they become §5 of the deliverable.
- If two consecutive iterations add nothing, stop looping. With no log track, "we cannot see it from here" is a legitimate and common ending: report the strongest hypothesis honestly as unconfirmed and name exactly what evidence would settle it.

## 4. Verification (mandatory before claiming a root cause)

- **The rule of two**: a cause is confirmed only by ≥ 2 independent evidence sources *of different kinds* — a Chatwoot data state, a Meta-side `metaapi` check, a code path, a customer-supplied artifact (screenshot, provider dashboard, error string). Two readings of the same record are one source.
- **A null result is never one of the two.** An empty result only counts once you have shown the read could have seen the record: check inbox membership, role, pagination, and the `api_and_webhooks` gate first. The case store has repeatedly mistaken "we cannot see it" for "it did not happen".
- Spawn one adversarial skeptic (general-purpose agent): give it the claimed cause + full evidence, instruct it to REFUTE — alternative explanations for every piece of evidence, unexplained timeline gaps, and specifically whether any "absence" in the evidence is really an access limit. If it lands a real objection, loop once more.
- The cause must explain the WHOLE symptom, including why it started when it did.
- Be honest about the ceiling: with confirmation available only from data + code + customer artifacts, many cases top out at **likely**. Say "likely" and escalate; do not inflate it to confirmed, and do not hedge a genuinely confirmed one either.

## 5. Deliverable

Final report to Harishmita, in this order:

1. **TLDR** — the explanation in 2–3 sentences, confidence stated plainly (confirmed / likely / unconfirmed).
2. **Timeline** — UTC, the key events.
3. **Evidence chain** — each link: claim → evidence (cwapi command + field value / metaapi check / file:line / customer artifact). Include decisive dead ends.
4. **What Harishmita can do now** — split into: (a) what she can verify or change herself in the dashboard, (b) what to ask the customer to check or do, (c) what needs someone with admin/engineering access.
5. **Escalation packet** — only if anything is out of reach. One block an engineer can act on without reading the thread: account id, inbox id, UTC window, concrete identifiers, the hypothesis, the exact evidence needed (which log line, which admin endpoint, which DB field), and what each answer would prove or kill. Format in `references/no-logs-playbook.md`. If the investigation is complete and self-contained, say "no escalation needed" rather than padding one.
6. **Customer reply draft** — short, plain-language, no internal jargon, no code references, no blame. State what is happening, what happens next, and what you need from them, in that order. DRAFT ONLY: never post to the customer thread, Linear, or GitHub yourself — Harishmita sends it.

## 6. Write the case back (always — solved or not)

1. Copy `.claude/support-harness/cases/_TEMPLATE.md` → `cases/YYYY-MM-<area>-<slug>.md`, fill every section. The **Reusable lessons** and **Commands that worked** sections are the whole point — future investigations start from them. Unsolved cases record status `open` (or `escalated`) with the strongest hypothesis and what would settle it.
2. Prepend one line to `INDEX.md` (newest first): `- [title](file.md) — area | symptom hook | root-cause hook`.
3. If the investigation produced a durable *general* lesson (an API quirk, a diagnostic trick, a new substitute for a check that used to need logs — not case-specific facts), also update auto-memory and the relevant reference file under `references/`. A new "logs used to answer this; here's how to answer it now" entry belongs in `references/no-logs-playbook.md`.

## Standing rules

- Both tracks are **read-only** against production; remediation is always a recommendation, never an action. `cwapi` and `metaapi` enforce this — never work around them.
- Never write to the customer thread, Linear, or GitHub. Every customer-facing artifact is a draft for Harishmita to send.
- Case files contain customer data and live only under `.claude/` (gitignored) — never under `docs/` or `scripts/`, which are committable.
- Include only PII the investigation needs, even in case files. Never print an API token, not even partially.
- Never invent log evidence. If the sentence you are about to write would need a server log to be true, it is a hypothesis or an escalation ask — label it as one.
