---
title: "External Docs Map"
tags: [chatwoot, meta, docs]
generated: 2026-08-17
---

# External Docs Map

The vault documents *the code*; three public documentation properties document *the product and its operation*. This page maps all three to vault pages and to their canonical URLs — including the doc links the **codebase itself embeds**, which are the strongest code↔documentation joints available (the code declares them, so they're maintained by whoever ships the feature).

## The documentation properties

| Property | Public root | Local source | What it covers |
|---|---|---|---|
| **User guide** (help center) | <https://chatwoot.help/hc/user-guide/en> (`www.chatwoot.com/hc/user-guide` redirects here) | [[user-guide-index]] — full article catalog (140 articles, live-fetched 2026-08-17) mapped to capability nodes; machine-readable at `tools/user-guide.json` | Product behavior, feature setup, agent workflows |
| **Developer docs** | <https://developers.chatwoot.com> | `/Users/tanmay-chatwoot/workspace/docs` (separate git repo, `github.com/chatwoot/docs`, Mintlify) | Self-hosted deployment/config, contributing, environment variables, APIs, CLI |
| **Pricing** | <https://www.chatwoot.com/pricing> | — | Cloud plan tiers — cross-checked into [[plan-tiers-billing]] 2026-08-17 |
| DeepWiki (third-party) | <https://deepwiki.com/chatwoot/chatwoot> | — | AI-generated wiki used only as a coverage checklist — see [[deepwiki-crosscheck]] |

**URL scheme for developer docs**: `developers.chatwoot.com/<repo path without .mdx>` — e.g. `self-hosted/monitoring/rate-limiting.mdx` → <https://developers.chatwoot.com/self-hosted/monitoring/rate-limiting> (verified live 2026-08-17). So any row below gives you both the local file to read and the public link to cite.

**`chwt.app` short links** are Chatwoot-maintained stable redirects into the help center. Prefer them over full article permalinks when citing — the permalink slugs can change; the short links are the codebase's own convention.

## Codebase-embedded doc links (the canonical code↔docs joints)

Two places in the repo declare, per feature, which help article documents it. When you need "the official doc for feature X," start here — don't guess a help-center URL.

### `config/features.yml` → `help_url` (backend, per feature flag)

| Feature flag | Help link | Vault page |
|---|---|---|
| `channel_email` | <https://chwt.app/hc/email> | [[email]] |
| `channel_facebook` | <https://chwt.app/hc/fb> | [[facebook-instagram]] |
| `help_center` | <https://chwt.app/hc/help-center> | [[help-center-models]], [[portal-survey-superadmin]] |
| `agent_bots` | <https://chwt.app/hc/agent-bots> | [[lib-integrations]] |
| `team_management` | <https://chwt.app/hc/teams> | [[models]] |
| `labels` | <https://chwt.app/hc/labels> | [[models]] |
| `custom_attributes` | <https://chwt.app/hc/custom-attributes> | [[models]] |
| `canned_responses` | <https://chwt.app/hc/canned> | [[models]] |
| `integrations` | <https://chwt.app/hc/integrations> | [[integrations]], [[lib-integrations]] |
| `campaigns` | <https://chwt.app/hc/campaigns> | [[conversations-services]] (campaign jobs: [[jobs]]) |
| `reports` | <https://chwt.app/hc/reports> | [[reports]] |
| `sla` | <https://chwt.app/hc/sla> | [[models-services]] |

### `app/javascript/dashboard/helper/featureHelper.js` → `FEATURE_HELP_URLS` (frontend paywall/help buttons)

Superset of the backend list; additional entries: `agents` (<https://chwt.app/hc/agents>), `audit_logs` (<https://chwt.app/hc/audit-logs>), `dashboard_apps` (<https://chwt.app/hc/dashboard-apps>), `inboxes` (<https://chwt.app/hc/inboxes>), `macros` (<https://chwt.app/hc/macros>), `webhook` (<https://chwt.app/hc/webhooks>), `billing` (<https://chwt.app/pricing>), `saml` (<https://chwt.app/hc/saml>), `captain` (<https://chwt.app/captain-docs>), `captain_billing` (<https://chwt.app/hc/captain_billing>). The two lists are **maintained independently** — features.yml is what the settings UI reads per-flag; featureHelper.js is what paywall/help buttons read — so a link present in one may be missing from the other.

### Other notable in-code links

- **WhatsApp embedded→manual migration**: `WhatsappManualMigrationBanner.vue` / `WhatsappManualMigrationDialog.vue` link <https://chwt.app/migrate-whatsapp> — the migration guide referenced in [[whatsapp]].
- **WhatsApp templates**: `settings/templates/Index.vue` links the full article <https://www.chatwoot.com/hc/user-guide/articles/1754940076-whatsapp-templates>.
- **Captain onboarding**: `chwt.app/captain-{assistant,docs,document,faq}` and `chwt.app/hc/captain-tools` appear in Captain UI — [[captain-ai]], [[models-services]].

## Developer docs ↔ vault pages (curated, high-value rows)

Local paths are relative to `/Users/tanmay-chatwoot/workspace/docs`. This is deliberately not all ~90 pages — deployment-provider guides (AWS/GCP/Heroku/...) have no vault counterpart and never will; rows below are where the docs and the vault genuinely describe the same subsystem from two sides.

| Developer doc | Public URL | Vault page |
|---|---|---|
| `self-hosted/monitoring/rate-limiting.mdx` | <https://developers.chatwoot.com/self-hosted/monitoring/rate-limiting> | Closes the Rack::Attack doc gap *by reference* — the initializer itself is in [[routing-config]] |
| `self-hosted/configuration/environment-variables.mdx` | <https://developers.chatwoot.com/self-hosted/configuration/environment-variables> | [[routing-config]] (env-var reference the vault deliberately doesn't duplicate) |
| `contributing-guide/environment-variables.mdx` | <https://developers.chatwoot.com/contributing-guide/environment-variables> | dev-setup counterpart of the above |
| `self-hosted/configuration/features/email-channel/` (9 pages) | <https://developers.chatwoot.com/self-hosted/configuration/features/email-channel/introduction> | [[email]] — ingress providers, SES, SendGrid continuity, Google/Azure OAuth setup |
| `self-hosted/configuration/features/integrations/` (8 pages: facebook, instagram ×2, whatsapp-embedded-signup, tiktok, slack, linear, shopify) | <https://developers.chatwoot.com/self-hosted/configuration/features/integrations/whatsapp-embedded-signup> (etc.) | [[facebook-instagram]], [[whatsapp]], [[other-channels]], [[lib-integrations]], [[integrations]] — the *self-hosted operator* setup view of each channel |
| `self-hosted/deployment/storage/` (S3/GCS/providers) | <https://developers.chatwoot.com/self-hosted/deployment/storage/supported-providers> | [[attachments-storage]] |
| `self-hosted/message-statuses.mdx` | <https://developers.chatwoot.com/self-hosted/message-statuses> | [[messages-services]] (delivery-status transitions) |
| `self-hosted/monitoring/super-admin-sidekiq.mdx` | <https://developers.chatwoot.com/self-hosted/monitoring/super-admin-sidekiq> | [[jobs]] |
| `self-hosted/configuration/help-center.mdx` | <https://developers.chatwoot.com/self-hosted/configuration/help-center> | [[help-center-models]], [[portal-survey-superadmin]] |
| `self-hosted/configuration/multi-factor-authentication.mdx` | <https://developers.chatwoot.com/self-hosted/configuration/multi-factor-authentication> | [[account-onboarding]] |
| `contributing-guide/chatwoot-apis.mdx`, `chatwoot-platform-apis.mdx`, `api-reference/` | <https://developers.chatwoot.com/contributing-guide/chatwoot-apis> | [[api-v1-controllers]], [[public-platform-api]] |
| `self-hosted/enterprise-edition.mdx` | <https://developers.chatwoot.com/self-hosted/enterprise-edition> | [[plan-tiers-billing]] (the self-hosted EE licensing side) |
| `contributing-guide/{line,telegram}-channel-setup.mdx` | <https://developers.chatwoot.com/contributing-guide/line-channel-setup> | [[other-channels]] |
| `self-hosted/runbooks/` (email notifications, IP logging, DB migration, v4 upgrade) | <https://developers.chatwoot.com/self-hosted/runbooks/upgrade-to-chatwoot-v4> | operational runbooks — no vault counterpart by design |
| `self-hosted/deployment/` + `contributing-guide/environment-setup/` | <https://developers.chatwoot.com/self-hosted> | Closes the Installation & Deployment gap *by reference* — canonical source, vault won't duplicate |

## Maintenance

- The docs repo is a **separate git checkout** — `check-sync.sh` does not watch it. `git -C /Users/tanmay-chatwoot/workspace/docs pull` occasionally; if its structure shifts substantially, refresh this page's rows (spot-verify one public URL after any refresh — the URL scheme note above is the contract).
- When a new feature flag lands in `features.yml` with a `help_url`, add a row here if a vault page covers it.
- "Closes by reference" rows are honest closures: the vault links the canonical source instead of duplicating content that would drift. Never copy developer-doc content into a vault page — link it.

## Related

- [[harness]] — where this page fits in the overall harness
- [[deepwiki-crosscheck]] — the gap list several rows above close by reference
- [[plan-tiers-billing]] — the deepest existing example of code + pricing page + developer docs triangulated
- [[ai-agent-guide]] — task routing into the vault itself
