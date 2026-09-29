---
name: new-feature
description: Build a Chatwoot feature end-to-end following the repo's taught conventions — the vault's Feature Development Playbook (data layer → feature flag → plan tier → backend → frontend → i18n → enterprise → specs → review sweep). Use for "add a feature", "build X", "implement Y the right way".
---

# Build a feature the Chatwoot way

You are building a feature in /Users/sharma/Downloads/workspace/chatwoot using the harness as your guide. The authority chain: the user's ask > `CLAUDE.md` > `.claude/ai-wiki/00-meta/feature-development-playbook.md` (the anatomy, in build order) > the owning vault pages' "Notes for AI Agents".

## 1. Orient (before any code)
- Read `feature-development-playbook.md` in full — it is the spine of this skill; don't paraphrase it from memory.
- Find the closest adjacent feature in `.claude/ai-wiki/00-meta/feature-index.md` and open its listed entry points — pattern-match its shape.
- Read the owning subsystem page(s) via `00-meta/path-index.md`.
- Check `.claude/ai-wiki/00-meta/product-signals.md` — if the feature touches a documented friction theme (especially the silent-failure family), design against it explicitly (visible error states, typed errors, no swallowed failures).
- Settle the gating story NOW: feature flag (features.yml `feature_flags_ext_1`, append-only), Cloud plan tier (ReconcilePlanFeaturesService array), enterprise-only? State it in your plan.

## 2. Plan
Produce a short plan mapped to the playbook's numbered anatomy steps (skip steps that genuinely don't apply — say which and why). Name real files to create/modify per step. For anything user-decidable (tier placement, flag default, UI location), ask once, batched.

## 3. Build
Work the anatomy in order. At each step, the playbook's conventions are binding — highlights that get flagged every review: `prepend_mod_with` hooks on anything EE might extend; typed errors + `rescue_from`, never in-action rescues or bare 500s; jbuilder partials as the response contract; `with_lock`+`next` for check-then-write; components-next not legacy; Tailwind only; i18n on every user-facing string (en.yml/en.json only); no specs unless asked — when asked, request specs with `let`, ~10–12 examples max.

## 4. Sweep & close the loop
- Run the playbook §13 pre-commit sweep (comments, constants, naming, no rubocop-disables; Conventional Commit single-line subject, no co-author trailer, no force-push).
- Lint what you touched (`bundle exec rubocop -a` / `pnpm eslint`).
- Close the harness loop (playbook §14): update the owning vault page's Key Files, add the feature-index row, path-index row if a new directory appeared, external-docs row if you added a help_url. The vault documents `develop` — note in the page if the feature is branch-only pending merge.
