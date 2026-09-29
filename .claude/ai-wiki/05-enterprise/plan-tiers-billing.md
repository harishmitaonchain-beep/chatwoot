---
title: "Cloud Plan Tiers & Billing"
tags: [chatwoot, enterprise, billing, feature-flags, cloud]
generated: 2026-08-17
deepwiki_section: "Configuration and Feature Management"
---

# Cloud Plan Tiers & Billing

## Purpose

This page answers "is feature X available on plan Y?" and "why does this account not have feature X even though it looks like it should?" — the business-tier segmentation of Chatwoot Cloud, grounded in the actual gating code, cross-checked against the public pricing page and `config/features.yml`. It is Cloud-specific: self-hosted installs use a **different, binary** licensing concept (see below) that this page also disambiguates, because the two are easy to conflate.

**Two separate licensing concepts — do not conflate them:**
1. **Self-hosted Enterprise Edition license** — a binary, per-agent-per-month license (starting at $19/agent/month per `docs/self-hosted/enterprise-edition.mdx`) that unlocks the entire `enterprise/` code overlay on a self-hosted install. Gated by `ChatwootApp.enterprise?` / `ChatwootApp.self_hosted_enterprise?`. All-or-nothing — see [[models-services]] for what `enterprise/` contains.
2. **Chatwoot Cloud plan tiers** (this page) — four graduated subscription tiers (Hacker → Startups → Business → Enterprise) that individually toggle specific feature flags on a Cloud-hosted account via Stripe billing. Gated by `ChatwootApp.chatwoot_cloud?` plus `account.custom_attributes['plan_name']`. A self-hosted Enterprise Edition licensee is not "on the Enterprise Cloud plan" — it's a different axis entirely.

## The Cloud plan hierarchy

Source of truth: `Enterprise::Billing::ReconcilePlanFeaturesService` (`enterprise/app/services/enterprise/billing/reconcile_plan_features_service.rb`). Comment in the file states it explicitly: **"Plan hierarchy: Hacker (default) → Startups → Business → Enterprise. Each higher tier includes all features from the lower tiers."** — cumulative, not tiers with disjoint feature sets.

```ruby
STARTUP_PLAN_FEATURES = %w[
  inbound_emails help_center campaigns team_management
  channel_facebook channel_email channel_instagram channel_tiktok
  captain_integration captain_document_auto_sync
  advanced_search_indexing advanced_search linear_integration
  channel_voice api_and_webhooks data_import
]

BUSINESS_PLAN_FEATURES = %w[
  sla custom_roles csat_review_notes conversation_required_attributes
  advanced_assignment custom_tools companies
]

ENTERPRISE_PLAN_FEATURES = %w[audit_logs disable_branding saml]

PREMIUM_PLAN_FEATURES = STARTUP + BUSINESS + ENTERPRISE   # the full union
```

`perform` disables the entire `PREMIUM_PLAN_FEATURES` union first, then re-enables only the tier's own cumulative slice based on `account.custom_attributes['plan_name']` (`'Startups'` → `STARTUP_PLAN_FEATURES`; `'Business'` → `STARTUP + BUSINESS`; `'Enterprise'` → the full union; anything else, including blank, → none — the Hacker/default tier gets zero premium features). This method runs on every `customer.subscription.updated` Stripe webhook (see below) — it is not a one-time seed.

## The critical gotcha: `enabled: true` in `features.yml` is the self-hosted default, not the Cloud reality

`config/features.yml` marks `channel_email`, `channel_facebook`, `channel_instagram`, `channel_tiktok`, `inbound_emails`, `help_center`, `campaigns`, and `team_management` all as `enabled: true` — meaning a fresh **self-hosted** account gets them for free. But every one of those names also appears in `STARTUP_PLAN_FEATURES` above. On **Cloud**, `ReconcilePlanFeaturesService#perform` unconditionally disables the whole `PREMIUM_PLAN_FEATURES` union for a Hacker-tier account regardless of the YAML default — so a Cloud Hacker-plan account has **no channels except the website widget**, no Help Center, no campaigns, no team management. This exactly matches the public pricing page (Hacker: "Website Live Chat" only; Startups+: "All channels"). Don't reason from `features.yml`'s `enabled:` value alone when the question is about a Cloud account — check the plan tier.

## Two sources of truth for plan→feature mapping — don't confuse them

1. **`ReconcilePlanFeaturesService`'s hardcoded Ruby arrays** (above) — the ones that actually flip the account's feature-flag bits. This is what governs real behavior.
2. **`InstallationConfig.find_by(name: 'CHATWOOT_CLOUD_PLAN_FEATURES')`** — a separate, DB-seeded config read by `Enterprise::Account::PlanUsageAndLimits#subscribed_features` (`enterprise/app/models/enterprise/account/plan_usage_and_limits.rb`), used for *display* purposes (e.g. "here's what your plan includes" in billing UI). This is Cloud-infrastructure-seeded data, not visible anywhere in this repo — there is no guarantee the two lists stay in sync, since one is code and the other is runtime config. If a display value and actual gated behavior disagree, trust the Ruby arrays.

## Where the plan name actually lives, and how it gets there

- `account.custom_attributes['plan_name']` — a plain string (`'Startups'`, `'Business'`, `'Enterprise'`, or blank/default-plan-name for Hacker). Not an enum, not a separate table.
- Set by `Enterprise::Billing::HandleStripeEventService` (`enterprise/app/services/enterprise/billing/handle_stripe_event_service.rb`) on `customer.subscription.updated`/`customer.subscription.deleted` Stripe webhooks — resolves the Stripe product to a plan via `InstallationConfig.find_by(name: 'CHATWOOT_CLOUD_PLANS')` (a DB-seeded list of `{name, product_id, ...}` records, `.first` being the default/Hacker plan), writes `plan_name`/`stripe_customer_id`/`stripe_price_id`/`stripe_product_id`/`subscribed_quantity`/`subscription_status`/`subscription_ends_on` onto `custom_attributes`, then calls `ReconcilePlanFeaturesService.new(account: account).perform` immediately.
- `default_plan?` (used by both `ReconcilePlanFeaturesService` and `BillingHelper`) treats a blank `plan_name` **or** a `plan_name` matching the first `CHATWOOT_CLOUD_PLANS` entry's name as "on the default (Hacker) plan" — so "Hacker" as a literal string may never actually be written to `plan_name` for organically-free accounts; it's inferred by absence/match against the seeded default.

## The `manually_managed_features` escape hatch

`Internal::Accounts::InternalAttributesService#manually_managed_features` (`account.internal_attributes['manually_managed_features']`, an array) lets Chatwoot staff grant a specific feature to a specific account **outside** its plan tier — `ReconcilePlanFeaturesService#perform` always re-enables these on top of whatever the tier grants. `valid_feature_list` restricts this to `BUSINESS_PLAN_FEATURES + ENTERPRISE_PLAN_FEATURES + %w[inbound_emails api_and_webhooks]` — notably **not** `STARTUP_PLAN_FEATURES` (other than those two carve-outs), so most Startup-tier features can't be manually granted this way. Exposed via `enterprise/app/fields/manually_managed_features_field.rb` in the Super Admin panel.

## Usage limits (agents, inboxes, Captain credits, email rate limits)

`Enterprise::Account::PlanUsageAndLimits` (mixed into `Enterprise::Account`) computes numeric caps — but **the actual numbers are not in this repo**. They come from DB-seeded `InstallationConfig` records read at runtime:
- `CAPTAIN_CLOUD_PLAN_LIMITS` — Captain document/response credits per plan. The public pricing page states these as Startups 300, Business 500, Enterprise 800 credits/month, but that's marketing copy, not a value you'll find in code — see [[captain-ai]] for the credit-consumption side (`increment_response_usage`/`reset_response_usage`), and the known captain-credits-stuck-at-0 bug in project memory for how a broken delta or stale `plan_name` after a `subscription.deleted` zeroing can corrupt this.
- `ACCOUNT_EMAILS_PLAN_LIMITS` — a JSON blob keyed by `plan_name.downcase`, read by `plan_email_limit`; free-plan accounts get the base limit flat, paid plans multiply it by `agent_limits`.
- `CHATWOOT_CLOUD_PLANS` — also supplies `agents`/`inboxes` limits per plan (consumed by `usage_limits`).

Since none of these numeric configs live in the repo, this page cannot (and should not attempt to) state exact current limits — only the mechanism. Verify current numbers via Super Admin/Rails console on the actual environment, not by grepping this codebase.

## `api_and_webhooks` — a concrete, previously-diagnosed instance of this gate

`account.api_and_webhooks_enabled?` (`enterprise/app/models/enterprise/account.rb`) is `true` unconditionally for self-hosted (`return true unless ChatwootApp.chatwoot_cloud?`), but on Cloud defers to `feature_enabled?('api_and_webhooks')` — which per the tier table above is only granted from **Startups** upward. `app/listeners/webhook_listener.rb`'s `deliver_account_webhooks` checks this **before any HTTP attempt**, so a Hacker-tier Cloud account's account-level webhooks and token-authenticated API calls silently never fire — no error, no log line. The dashboard's webhook CRUD endpoint has no matching check for session-authenticated requests, so a free-plan customer can save a webhook through the UI with zero error and it will simply never deliver; `WebhookPaywall.vue` blocks *future* visits to the settings page but doesn't retroactively warn about an already-saved webhook. This shipped in PR #14973. When diagnosing "webhook never fires, URL confirmed reachable, zero deliveries ever (not intermittent)" on a Cloud account, check this gate before assuming a delivery-layer failure — it's a one-field confirmation (plan/`feature_enabled?('api_and_webhooks')`), cheaper than pulling logs, and NR log-absence is a null test here since the gate produces no log line at all.

## `advanced_assignment` auto-syncs with `assignment_v2`, independently of the tier reconciliation above

`Enterprise::Account#sync_assignment_features` — triggered whenever `selected_feature_flags=` is called (i.e., whenever feature flags are bulk-updated, including by `ReconcilePlanFeaturesService` itself) — force-enables `advanced_assignment` if `assignment_v2` is on **and** `plan_name` is `'Business'` or `'Enterprise'` (a literal string match, not tier-inclusive: `'Enterprise'` matches directly, it does not fall through from a lower-tier check), and force-disables `advanced_assignment` whenever `assignment_v2` is off — regardless of plan. So `advanced_assignment`'s actual state depends on both the plan tier *and* the independent `assignment_v2` rollout flag; granting `advanced_assignment` via `manually_managed_features` on an account with `assignment_v2` off will not stick, because the next feature-flag write flips it back off. See [[assignment]] for the V1/V2 assignment systems this feature flag controls.

## Product Behavior

Cross-checked directly against chatwoot.com/pricing (fetched 2026-08-17):

| Tier | Price | Headline differentiators over the tier below |
|---|---|---|
| **Hacker** | $0/agent/mo, up to 2 agents | Website widget only; 500 conversations/mo; 30-day retention |
| **Startups** | $19/agent/mo (annual) | All channels (Email/FB/IG/TikTok/WhatsApp/SMS/Telegram/LINE/API), Help Center, Captain AI, unlimited conversations, 1-year retention |
| **Business** | $39/agent/mo (annual), "Most popular" | + Voice channel, Automation rules, Custom Attributes, Campaigns (WhatsApp/SMS), SLA, CSAT Review Notes, Required Conversation Attributes, 2-year retention |
| **Enterprise** | $99/agent/mo (annual) | + Agent Capacity, SSO/SAML, Audit Logs, Remove Branding, dedicated account manager (20+ agents), 3-year retention |

The marketing names above map to internal feature-flag names imperfectly (marketing bundles several flags under one bullet, e.g. "All Reports" ≈ several `*_reports` capabilities that aren't individually feature-flagged at all — reporting itself is gated by the always-on `reports`/`report_rollup` flags, not by plan). Treat the marketing page as the customer-facing story and the Ruby arrays above as the enforced mechanism; they mostly but not perfectly correspond.

## Notes for AI Agents

- **Never infer Cloud plan access from `features.yml`'s `enabled:` field alone.** It's the self-hosted/community default. Cloud accounts get their feature set entirely rewritten by `ReconcilePlanFeaturesService` based on `plan_name`.
- **`premium: true` in `features.yml` is a UI-visibility marker (hidden from self-hosted feature-toggle UI), not a plan-gating mechanism by itself.** Some `premium: true` flags (e.g. `help_center_embedding_search`, `captain_v1_action_classifier`) appear in **none** of the three `PLAN_FEATURES` arrays — they're never granted by any Cloud plan tier automatically; they're rollout/internal flags, manual-only.
- **`captain_integration_v2` is deliberately excluded from all plan-tier arrays** and handled via a separate eligibility check (`captain_v2_default_eligible?`, keyed off `internal_attributes['captain_v2_default_eligible']`) — don't assume it's plan-gated like its sibling `captain_integration`.
- **This reconciliation runs on every subscription webhook, not once at signup.** A downgrade takes effect the moment the webhook lands (via `process_subscription_updated` → `ReconcilePlanFeaturesService#perform`), not at the next billing cycle boundary — except where `sync_subscription_credits`/`handle_plan_change_credits` explicitly defer credit changes to renewal.
- **Self-hosted "Enterprise Edition" and Cloud "Enterprise" plan are unrelated axes** — don't assume a self-hosted licensee has every `ENTERPRISE_PLAN_FEATURES` flag enabled; self-hosted licensing is `ChatwootApp.enterprise?`, entirely separate from `custom_attributes['plan_name']`, which is Cloud-only.

## Related

- [[models-services]] — the `enterprise/` overlay this billing logic lives in, and the self-hosted Enterprise Edition license gate (`ChatwootApp.enterprise?`)
- [[routing-config]] — the `Featurable` concern / `FlagShihTzu` bitset mechanics underlying every feature flag, and `config/features.yml` itself
- [[captain-ai]] — Captain credit consumption that `CAPTAIN_CLOUD_PLAN_LIMITS` caps
- [[assignment]] — the V1/V2 assignment systems `advanced_assignment` and `assignment_v2` control
- [[glossary]] — `Featurable`/feature flags entry, `include_mod_with`/`prepend_mod_with`
- [[public-platform-api]], [[api-v1-controllers]] — `WebhookListener`/webhook delivery paths gated by `api_and_webhooks_enabled?`
