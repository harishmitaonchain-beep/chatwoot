# screenshots (capture script): plan and stub

Goal: a Playwright script drives a local Chatwoot with demo data and captures
each screen named to match the `📸` flags in the drafts, so screenshots can be
refreshed on every release. Meta and Twilio screens stay manual. No internal
access needed: run open-source Chatwoot locally or use an ordinary Cloud account.

Pilot: page 8 (WhatsApp campaigns), about 3 to 5 hours. Full plan is the project
doc `screenshot-pilot-plan.md`.

## Stub outline (build as screenshots.mjs)

1. Read the shot list (screen id, route, viewport, any pre-state).
2. Launch Playwright (chromium in this env: executablePath '/opt/pw-browsers/chromium').
3. Log in to the target Chatwoot, seed or select demo data.
4. For each shot: navigate to the route, wait for the key selector, screenshot to
   `assets/<page>/<shot-id>.png`.
5. Write a manifest mapping shot id to file, so drafts can be checked for missing shots.

Keep credentials and base URL in env vars, never in the script.
