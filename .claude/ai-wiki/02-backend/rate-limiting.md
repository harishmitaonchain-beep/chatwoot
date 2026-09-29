---
title: "Rate Limiting (Rack::Attack)"
tags: [chatwoot, backend, security, rate-limiting]
generated: 2026-08-17
deepwiki_section: "Security"
---

# Rate Limiting (Rack::Attack)

## Purpose
All HTTP-level rate limiting in Chatwoot lives in a single file: `config/initializers/rack_attack.rb`. It defines one global per-IP throttle plus targeted throttles for authentication endpoints (login, super admin login, password reset, confirmation resend, MFA, signup), the unauthenticated widget API, and a handful of expensive authenticated APIs (transcripts, uploads, contact search, reports, conversations meta, agent/conversation mutation). There are **no blocklist rules** and no `track` rules — only throttles and two safelists. This page is the rule-by-rule dissection; the public operator doc at <https://developers.chatwoot.com/self-hosted/monitoring/rate-limiting> (source: `self-hosted/monitoring/rate-limiting.mdx`, see [[external-docs]]) is the complementary tuning guide.

## Key Files & Classes
- `config/initializers/rack_attack.rb` — the entire rule set, the custom `Rack::Attack::Request` subclass, the throttle-event log subscriber, and the master enable switch (last line of the file).
- `config/initializers/01_redis.rb` — defines `$velma`, a `ConnectionPool` (size `REDIS_VELMA_SIZE`, default 10) of `Redis::Namespace.new('velma', ...)` clients used **only** by Rack::Attack ("Velma: Determined protector"). In test env it wraps `MockRedis`.
- `Gemfile` — `gem 'rack-attack', '>= 6.7.0'` (always loaded); `gem 'rack-timeout'` is in `group :production` only.
- `config/initializers/rack_timeout.rb` — not rate limiting: it only sets `Rack::Timeout::Logger.level = Logger::ERROR` to silence INFO-level state=ready/completed noise. No timeout values are configured in-repo; the gem's own env vars (e.g. `RACK_TIMEOUT_SERVICE_TIMEOUT`) would apply, and the gem is production-only.
- `app/controllers/auth/resend_confirmations_controller.rb` — the one app-code file that references Rack::Attack, in a comment noting the endpoint is rate-limited here and gated by hCaptcha.
- No enterprise overrides and no specs: `rg "Rack::Attack"` across `enterprise/` and `spec/` finds nothing — the rules are OSS-only and untested-by-spec (they never run in test env anyway, see gating below).

### Enablement gating and cache store
- **Enabled only in production**: the last line is `Rack::Attack.enabled = Rails.env.production? ? cast(ENV.fetch('ENABLE_RACK_ATTACK', true)) : false`. So dev/test **never** run Rack::Attack regardless of env vars, and production can opt out with `ENABLE_RACK_ATTACK=false`.
- **Cache store**: `Rack::Attack.cache.store = ActiveSupport::Cache::RedisCacheStore.new(redis: $velma, pool: false)`. `pool: false` is a deliberate workaround — Rails 7.1 would otherwise wrap the already-pooled `$velma` in a second `ConnectionPool` and Redis calls would explode (comment cites rack-attack issue #102). Throttle counters therefore live in Redis under the `velma` namespace.

### The custom Request subclass
`Rack::Attack::Request` (defined inside the initializer) adds:
- `remote_ip` — prefers `env['action_dispatch.remote_ip']` over raw `ip` (load-balancer aware).
- `allowed_ip?` — true for `127.0.0.1`, `::1`, plus any IP in comma-separated `RACK_ATTACK_ALLOWED_IPS`.
- `path_without_extensions` — strips extensions and trailing slashes so `/auth`, `/auth.json`, `/auth/` share one throttle bucket. Most rules match on this; a few older ones (`upload`, `transcript`, `contacts/search`, `reports` account/user-level, `conversations/meta`) match raw `req.path` with an **unanchored** regex.

### Safelists
- `safelist('trusted IPs', &:allowed_ip?)` — bypasses everything for localhost + `RACK_ATTACK_ALLOWED_IPS`.
- `safelist('health check')` — `/health` never touches Redis, keeping ALB liveness checks dependency-free.

### How 429s are rendered
There is **no custom `throttled_responder`** anywhere in the repo, so the rack-attack gem default applies: HTTP **429** with a `Retry-After` header (the rule's period) and plain-text body `Retry later\n`. Separately, every throttle event fires the `throttle.rack_attack` ActiveSupport notification, which the initializer subscribes to and logs at WARN as `[Rack::Attack][Blocked] remote_ip: ..., path: ..., user_identifier: ..., account_id: ..., method: ..., user_agent: ...` — with the `api_access_token` masked to its first 5 chars. This log line is the production-observability hook (searchable in New Relic).

## The Rules
All limits below are the code defaults; "env override" lists the exact `ENV` key when one exists — rules without one are hardcoded.

### Global & auth throttles (always on when Rack::Attack is enabled)

| Rule name | Scope / key | Limit | Period | Endpoints protected | Env override |
|---|---|---|---|---|---|
| `req/ip` | IP (`req.ip`) | 3000 | 1 min | every request (post-safelist) | `RACK_ATTACK_LIMIT` |
| `super_admin_login/ip` | IP | 5 | 5 min | `POST /super_admin/sign_in` | — |
| `super_admin_login/email` | normalized `email` param | 5 | 15 min | `POST /super_admin/sign_in` | — |
| `login/ip` | IP | 5 | 5 min | `POST /auth/sign_in` **without** `mfa_token` | — |
| `login/email` | normalized `email` param | 10 | 15 min | `POST /auth/sign_in` without `mfa_token` | — |
| `reset_password/ip` | IP | 5 | 30 min | `POST /auth/password` | — |
| `reset_password/email` | normalized `email` param | 5 | 1 hour | `POST /auth/password` | — |
| `resend_confirmation/ip` | IP | 5 | 30 min | `POST /resend_confirmation` (unauthenticated) | — |
| `resend_confirmation/email` | normalized `email` param | 5 | 1 hour | `POST /resend_confirmation` | — |
| `resend_confirmation_auth/ip` | IP | 5 | 30 min | `POST /api/v1/profile/resend_confirmation` | — |
| `mfa_verification/ip` | IP | 5 | 1 min | `DELETE /api/v1/profile/mfa` (disable) and `POST /api/v1/profile/mfa/verify\|backup_codes` | — |
| `mfa_login/ip` | IP | 10 | 1 min | `POST /auth/sign_in` **with** `mfa_token` | — |
| `mfa_login/token` | the `mfa_token` value itself (no IP) | 10 | 1 min | `POST /auth/sign_in` with `mfa_token` — global per-token, defeats distributed brute force on one token | — |
| `accounts/ip` | IP | 5 | 30 min | `POST /api/v1/accounts` (signup — see [[account-onboarding]]) | — |

Email keys are normalized `downcase.gsub(/\s+/, '')`; the email is read via `req.params` with an `ActionDispatch::Request` fallback, guarded inside the path check because parsing bodies on arbitrary paths used to raise `invalid byte sequence in UTF-8` on the SendGrid inbound-email route (rack-attack issue #399).

### Widget API throttles (see [[widget-backend]])
The whole block is wrapped in `if cast(ENV.fetch('ENABLE_RACK_ATTACK_WIDGET_API', true))` — a blanket kill switch (comment marks it TODO-deprecate) for e.g. iframe embeds behind shared NAT. Each rule additionally has its own `ENABLE_*` boolean and `RATE_LIMIT_*` limit override.

| Rule name | Scope / key | Limit | Period | Endpoints protected | Env override (enable / limit) |
|---|---|---|---|---|---|
| `api/v1/widget/conversations` | `"#{ip}:#{website_token}"` | 30 | 1 min | `POST /api/v1/widget/conversations` | `ENABLE_RACK_ATTACK_WIDGET_CONVERSATIONS` / `RATE_LIMIT_WIDGET_CONVERSATIONS` |
| `api/v1/widget/messages` | `"#{ip}:#{website_token}"` | 60 | 1 min | `POST /api/v1/widget/messages` | `ENABLE_RACK_ATTACK_WIDGET_MESSAGES` / `RATE_LIMIT_WIDGET_MESSAGES` |
| `api/v1/widget/contact` | IP | 60 | 1 hour | `PATCH/PUT /api/v1/widget/contact` | `ENABLE_RACK_ATTACK_WIDGET_CONTACTS` / `RATE_LIMIT_WIDGET_CONTACTS` |
| `widget?website_token={website_token}&cw_conversation={x-auth-token}` (literal rule name) | IP | 200 | 1 hour | `/widget` loads where `cw_conversation` param is blank (fresh, tokenless widget loads → conversation-bombing guard) | `ENABLE_RACK_ATTACK_WIDGET_LOAD` / `RATE_LIMIT_WIDGET_LOAD` |
| `api/v1/widget/conversations/transcript` | IP | 5 | 1 hour | `POST /api/v1/widget/conversations/transcript` | `ENABLE_RACK_ATTACK_WIDGET_TRANSCRIPT` / `RATE_LIMIT_WIDGET_TRANSCRIPT` |

The `ip:website_token` composite key (conversations/messages) means widgets behind a shared NAT get separate buckets per website. The token is read via `ActionDispatch::Request` so query-param precedence matches the controller — a body token can't fork the bucket. No token → no key → request not throttled by that rule.

### Authenticated application API throttles (see [[api-v1-controllers]])

| Rule name | Scope / key | Limit | Period | Endpoints protected | Env override |
|---|---|---|---|---|---|
| `/api/v1/accounts/:account_id/conversations/:conversation_id/transcript` | account_id | 1000 | 1 hour | agent-facing conversation transcript (any method — unanchored path match) | `RATE_LIMIT_CONVERSATION_TRANSCRIPT` |
| `/api/v1/accounts/:account_id/conversations/:id DELETE` | account_id | 60 | 1 min | `DELETE /api/v1/accounts/:id/conversations/:id` (anchored) | `RATE_LIMIT_CONVERSATION_DELETE` |
| `/api/v1/accounts/:account_id/agents POST` | account_id | 100 | 1 day | `POST .../agents` and `POST .../agents/bulk_create` (one shared bucket) | `RATE_LIMIT_AGENT_CREATE` |
| `/api/v1/accounts/:account_id/agents/:id DELETE` | account_id | 50 | 1 day | `DELETE .../agents/:id` | `RATE_LIMIT_AGENT_DELETE` |
| `/api/v1/accounts/:account_id/upload` | account_id | 60 | 1 hour | attachment upload API | — (hardcoded) |
| `/api/v1/accounts/:account_id/contacts/search` | account_id | 100 | 1 min | contact search | `RATE_LIMIT_CONTACT_SEARCH` |
| `/api/v2/accounts/:account_id/reports/drilldown/user` | `"#{uid-or-token}:#{account_id}"` | max(user-level/10, 1) → **10** | 1 min | `GET /api/v2/accounts/:id/reports/drilldown` (anchored, GET-only) | `RATE_LIMIT_REPORTS_DRILLDOWN_API_USER_LEVEL` |
| `/api/v2/accounts/:account_id/reports/user` | `"#{uid-or-token}:#{account_id}"` | 100 | 1 min | anything under `/api/v2/accounts/:id/reports` (unanchored) | `RATE_LIMIT_REPORTS_API_USER_LEVEL` |
| `/api/v2/accounts/:account_id/reports` | account_id | 1000 | 1 min | anything under `/api/v2/accounts/:id/reports` (unanchored) | `RATE_LIMIT_REPORTS_API_ACCOUNT_LEVEL` |
| `/api/v1/accounts/:account_id/conversations/meta/user` | `"#{uid-or-token}:#{account_id}"` | 30 | 1 min | `GET .../conversations/meta` | `RATE_LIMIT_CONVERSATIONS_META` |

The per-user report/meta rules identify the caller from the `uid` request header (web session) falling back to `api_access_token` (token API — see [[public-platform-api]]); no identifier → not throttled by that rule (the account-level and global rules still apply).

## How It Fits Together
- **Middleware position**: Rack::Attack runs as Rack middleware, before Rails routing (see [[routing-config]]) and before any controller auth — so it throttles on raw request shape (path/method/params/headers), never on an authenticated `Current.user`. That's why "who is calling" is inferred from the `uid`/`api_access_token` headers rather than a session.
- **State**: all counters are Redis (`velma` namespace, keys shaped `rack::attack:{epoch/period}:{rule}:{discriminator}`). Flushing that namespace resets every window. This is separate from `$alfred` (round-robin/presence — see [[lib-core-infrastructure]]) and from application-level rate limits like `account.within_email_rate_limit?`, which are enforced in controllers/services, not here.
- **Layering on one request**: rules stack. A widget `POST /api/v1/widget/conversations` is subject to `req/ip` *and* the widget-conversations rule; a drilldown report GET counts against the drilldown user rule, the general `/reports/user` rule (its unanchored regex also matches `/reports/drilldown`), *and* the account-level `/reports` rule. First exhausted bucket wins and returns 429.
- **429 consumers**: dashboards and API clients just receive the gem-default plain-text 429; there is no per-rule JSON error contract. Note the inverse relationship too: Chatwoot's own outbound webhook delivery treats a downstream 429 as retryable only for agent-bot webhooks (`Webhooks::Trigger`, see [[lib-core-infrastructure]]) — unrelated machinery, same status code.
- **Operator tuning**: the public doc (see [[external-docs]]) documents the env-var surface for self-hosted installs; this page is the ground truth for which rules those vars actually touch and which limits are hardcoded.

## Product Behavior
- Login brute-force protection is what end users actually hit: 5 wrong passwords per IP per 5 minutes (or 10 per email per 15 minutes) locks `/auth/sign_in` with a 429; MFA-stage attempts are carved out into their own more generous 10/min buckets so entering a TOTP code doesn't consume login attempts.
- Widget visitors can create at most 30 conversations and 60 messages per minute per (IP, website token), email themselves a transcript 5 times an hour per IP, and cold-load the widget (no `cw_conversation` token) 200 times an hour per IP.
- Signup (`POST /api/v1/accounts`) is capped at 5 per IP per 30 minutes.
- Agent CRUD is capped per **account per day** (100 creates incl. bulk_create, 50 deletes) — relevant when a customer scripts agent provisioning.

## Notes for AI Agents
- **Dev/test never throttle.** `Rack::Attack.enabled` is hard-false outside production — you cannot reproduce a 429 locally by default, and there are no specs for these rules. To exercise them you'd need `RAILS_ENV=production` or a temporary edit.
- **"Customer getting 429s" triage**: search production logs for `[Rack::Attack][Blocked]` — the WARN line carries `remote_ip`, `path`, `user_identifier` (uid or masked token prefix), `account_id`, method, and user agent. The rule can be inferred from the path.
- **Many limits are not tunable.** Every auth/MFA/signup rule and the upload rule are hardcoded; only the global limit, widget rules, and the application-API rules in the last table have env overrides. Don't tell an operator to "raise the login limit via env" — there's no such var.
- **Key-shape gotchas**: `mfa_login/token` is keyed on the token alone (global across IPs); widget conversation/message rules silently skip requests missing `website_token`; per-user report rules skip requests missing both `uid` and `api_access_token` headers. A crafted request omitting those falls through to coarser rules only.
- **Regex anchoring is inconsistent**: newer rules anchor with `\A...\z` on `path_without_extensions`; older ones (`upload`, transcript, contact search, reports account/user, conversations/meta) use unanchored matches on raw `req.path` and no method check (except where noted) — so e.g. the account-level reports rule also counts report-related subpaths and non-GET methods.
- **Trusted-IP bypass** (`RACK_ATTACK_ALLOWED_IPS`) skips *all* throttles including auth brute-force protection — relevant when reviewing infra configs that put a proxy IP there.
- `rack_timeout.rb` is a red herring for rate limiting: it only quiets rack-timeout's logger; the gem itself is production-only and unconfigured in-repo.

## Related
- [[widget-backend]] — the controllers behind every `api/v1/widget/*` throttle.
- [[api-v1-controllers]] — the authenticated API surface the application-API rules protect.
- [[public-platform-api]] — `api_access_token`-authenticated callers that the per-user report/meta rules key on.
- [[account-onboarding]] — the signup flow behind `accounts/ip`.
- [[routing-config]] — where these paths are actually routed once past the middleware.
- [[lib-core-infrastructure]] — Redis key map (`$alfred` vs `$velma`) and `Webhooks::Trigger`'s own 429 handling.
- [[external-docs]] — maps `self-hosted/monitoring/rate-limiting.mdx` to the public tuning guide that complements this page.
- [[webhook-routing]] — inbound webhook endpoints, which notably have **no** dedicated throttle beyond the global `req/ip` rule.
