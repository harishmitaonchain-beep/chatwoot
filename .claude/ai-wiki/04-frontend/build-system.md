---
title: "Frontend Build System (Vite)"
tags: [chatwoot, infra, frontend, vite, build-tooling]
generated: 2026-08-17
deepwiki_section: "Frontend Application (build system)"
---

# Frontend Build System (Vite)

## Purpose

Chatwoot's frontend (dashboard, widget, portal, survey app, superadmin pages) is bundled by Vite, wired into the Rails asset pipeline via the `vite_rails` gem (`vite_ruby` + `vite-plugin-ruby`). This subsystem is the config layer that turns `app/javascript/**` into the JS/CSS bundles Rails serves — it owns entrypoint resolution, import aliases, dev-server wiring, and one special-cased library build for the embeddable widget SDK. It is pure build tooling: there is no runtime/product behavior here, only how source becomes bundles and how those bundles get into Rails views.

## Key Files & Classes

- `vite.config.ts` — the main Vite config used for the app build and `bin/vite dev`. Registers `vite-plugin-ruby` (reads `config/vite.json` and auto-discovers entrypoints), `@vitejs/plugin-vue`, and `@rollup/plugin-yaml` (lets `.yml`/`.yaml` files be imported as modules, used for i18n locale files). Sets Sass to `api: 'modern-compiler'`.
- `vite.shared.ts` — shared config reused by both `vite.config.ts` and `vite.lib.config.ts`: exports `aliases` (the import-path aliases below) and `vueOptions` (registers `ninja-keys` as a custom element so Vue's compiler doesn't warn on the command-bar web component).
- `vite.lib.config.ts` — a **separate**, second Vite config used only for `pnpm run build:sdk` (`vite build --config vite.lib.config.ts`). It builds `app/javascript/entrypoints/sdk.js` as a single IIFE (`inlineDynamicImports: true`) into `public/packs/js/sdk.js`. This is split out because `vite-plugin-ruby` pulls in every entrypoint as build input, which is incompatible with a single inlined-IIFE output — the SDK needs to ship as one file, so it gets its own pipeline outside the plugin's multi-entrypoint build.
- `config/vite.json` — `vite_ruby`'s own config (not a Vite plugin option file). Sets `sourceCodeDir: app/javascript`, and per-environment `publicOutputDir`/`port` (`vite-dev` on port 3036 for development, `vite-test` on port 3037 for test).
- `package.json` — pins `vite: 6.4.2` and `vite-plugin-ruby: ^5.2.1` as devDependencies, with a pnpm `overrides` entry re-pinning `vite` to the same exact version (dependency-conflict guard). Also defines the `build:sdk` script and the `size-limit` budgets that apply to Vite's output (`public/vite/assets/widget-*.js` capped at 300 KB, `public/packs/js/sdk.js` capped at 40 KB).
- `app/javascript/entrypoints/` — the actual entrypoint files vite-plugin-ruby discovers: `dashboard.js`, `v3app.js`, `widget.js`, `portal.js`, `survey.js`, `superadmin.js`, `superadmin_pages.js`, `sdk.js`. Each boots its own Vue app instance (`createApp`) against a different root component/store.
- `bin/vite` — Bundler-generated binstub that runs the `vite_ruby` CLI (`bin/vite dev`, `bin/vite build`) inside the Rails app's bundle context.
- `lib/tasks/build.rake` — hooks `assets:precompile`: before Rails precompiles assets it shells out to `pnpm install` then `pnpm run build:sdk`, so the SDK's separate IIFE build always runs ahead of (and independently from) the main Vite asset build that `assets:precompile` itself triggers via `vite_rails`.
- `app/controllers/dashboard_controller.rb#set_application_pack` — picks which entrypoint the Rails view requests: `v3app` for `/auth` or `/login` paths, `dashboard` otherwise. This is the one place Ruby code decides *which* Vite entrypoint gets loaded for a given request.
- `app/views/layouts/vueapp.html.erb`, `_portal_head.html.erb`, `super_admin/application.html.erb` — the ERB layouts that call vite_rails' Rails helpers: `vite_client_tag` (injects the Vite HMR client in dev) and `vite_javascript_tag @application_pack` / `'portal'` / `'superadmin'` to emit the `<script>` tag pointing at the right built (or dev-served) entrypoint bundle.

## How It Fits Together

- The `aliases` map in `vite.shared.ts` (`dashboard`, `v3`, `shared`, `widget`, `survey`, `next` → `components-next`, `components`, `helpers`, `assets`) is the resolution mechanism behind every `import ... from 'dashboard/...'` or `import ... from 'next/...'` seen throughout [[dashboard-routes-components]], [[components-next]], [[dashboard-store]], and [[widget-sdk]] — this file is where those short import paths are defined, not just used.
- `vite.lib.config.ts` builds exactly the code documented in [[widget-sdk]] (the embeddable `sdk.js` script sites load) — the "why a separate config" reasoning in that file's header comment is the authoritative explanation for the IIFE/single-file constraint.
- The i18n YAML-import plugin (`@rollup/plugin-yaml`) is what lets the locale-loading code described alongside [[dashboard-store]]/i18n setup `import` `.yml` files directly rather than fetching them at runtime.
- `set_application_pack` in `dashboard_controller.rb` is the Rails-side counterpart to [[routing-config]] — it decides between the `v3app` and `dashboard` Vue entrypoints per request path, independent of Vue Router's own client-side routing.
- The `ninja-keys` custom-element allowance in `vueOptions` exists because the command bar (documented under [[composables-mixins-helpers]] / dashboard UI) is a web component, not a Vue SFC, and would otherwise trigger a Vue compiler warning.
- `lib/tasks/build.rake` ties this whole subsystem into the Rails asset pipeline: `assets:precompile` (invoked during deploys) is enhanced to run the pnpm/SDK build first, so this directory's config is exercised on every production asset build, not just local dev.

## Product Behavior

Not applicable — this is internal build tooling with no direct product-guide mapping. Nothing here is user-facing; it only determines how the already-documented frontend apps (dashboard, widget, portal, survey, superadmin) get compiled and served.

## Notes for AI Agents

- There are **two separate Vite configs** for the frontend: `vite.config.ts` (the main multi-entrypoint app build, driven by `vite-plugin-ruby`) and `vite.lib.config.ts` (the single-purpose SDK IIFE build). If you're chasing a Vite config question, check which pipeline is actually relevant — `vite-plugin-ruby`'s entrypoint auto-discovery does not apply to the SDK build at all.
- `config/vite.json` is `vite_ruby`'s config format (env-keyed: `all`/`development`/`test`), **not** a Vite `defineConfig` file — don't confuse it with `vite.config.ts`. There's no `production` key in it; production presumably falls back to `vite_ruby` defaults since only `development` and `test` are overridden here.
- `sourceCodeDir` is `app/javascript`, and entrypoints are auto-discovered from `app/javascript/entrypoints/*.js` by `vite-plugin-ruby` — adding a new top-level Vue app means dropping a new file in that directory, not editing `vite.config.ts`.
- The dashboard vs. v3app entrypoint choice (`set_application_pack`) is decided by a simple path substring check (`/auth`, `/login`) in Ruby — it is not something Vite or the frontend router controls.
- Vite's build output for the SDK is capped by `size-limit` at 40 KB (`public/packs/js/sdk.js`) and the widget bundle at 300 KB (`public/vite/assets/widget-*.js`) — these are enforced via `pnpm run size`, not part of the Vite build itself failing on overflow.
- `pnpm run build:sdk` is invoked automatically by `lib/tasks/build.rake` before every `assets:precompile`, so in production/CI the SDK bundle is always rebuilt fresh — it is not committed or cached from a prior step.

## Related

- [[widget-sdk]] — the widget/client SDK code that `vite.lib.config.ts` packages into `sdk.js`
- [[dashboard-routes-components]] — consumer of the `dashboard`/`v3`/`components` aliases
- [[components-next]] — consumer of the `next` alias
- [[dashboard-store]] — dashboard app bootstrapped via the `dashboard.js` entrypoint
- [[routing-config]] — Rails-side routing that determines which layout/entrypoint a request hits
- [[shared-design-system]] — code under the `shared`/`helpers`/`assets` aliases
- [[portal-survey-superadmin]] — the `portal`, `survey`, `superadmin`, `superadmin_pages` entrypoints
