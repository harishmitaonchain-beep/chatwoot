---
name: demo-video
description: Make a narrated Chatwoot product video from a script: record the real local app, add website-style section cards and motion scenes, ElevenLabs narration, and render 1080p trials then a 4K final to the external SSD. Use for product tours, feature walkthroughs, and demo videos.
---

# Demo video

Script in, finished MP4 out. The product footage is the real local Chatwoot driven through Chrome; the look follows the 2026 chatwoot.com design (Haskoy headlines, Inter body, white page with pixel-mosaic edges, one accent colour per section). Built from Sojan's Codex `chatwoot-demo-video-creator` (frame capture, cursor, camera, ElevenLabs, QA) and this repo's `docs-screenshots` capture conventions. Sojan's folder is never modified.

Spec format: `reference/spec.md`. Visual system: `reference/style.md`.

## Where things live
- Skill (this folder): scripts, card templates, fonts, avatars, logo. Nothing generated is written here.
- Videos: `/Volumes/Extreme SSD/chatwoot-videos/<video>/` (quote the path, it has a space). One `spec.json`, `voice.json` (the chosen narrator), `speech-cache/`, optional `music.mp3`, and one folder per take: `v01/`, `v02/`, ... each with `capture/`, `speech/`, `render-1080/`, `render-2160/`, `cache/` and the finished MP4s.
- If the SSD is not mounted, stop and ask. Never fall back to the internal disk.
- Secrets: `ELEVENLABS_API_KEY` in `~/.config/chatwoot-video/env` (or the shell). Never in the spec, the skill, or a commit.
- Python: `~/.venvs/chatwoot-video/bin/python` (3.12 + Pillow). Node 22+ and Google Chrome.

## Flow
1. **Preflight**: `scripts/preflight.sh`. Fix every FAIL first.
2. **Shot list**: turn the script into `spec.json`: sections (card, accent) and beats (`say` line plus the screen actions that show it). Verify every UI path in the running app and every claim in the narration against the code before recording. Get the user's approval on the shot list (narration beside on-screen action, per beat) before any voice or recording. Flag lines the product cannot show truthfully.
3. **Demo data**: `bundle exec rails runner .claude/skills/demo-video/scripts/seed_paper_layer.rb` (from the repo root; `RESET=1` rebuilds it). It creates its own **Paper Layer** account (agents with avatars, 8 channels including a voice phone line, the hero conversation, a completed call with recording and transcript, assignment, automation, campaigns, Help Center) and writes the host login and account id to `~/.config/chatwoot-video/env`. Load that file before recording: `set -a; source ~/.config/chatwoot-video/env; set +a`. The account id changes on every reset, so specs use `{account}` and never a fixed id. Never record in an account other work depends on (account 1 is the docs-screenshots data). Extend the seed when a script needs new data; keep it outbound-call free.
4. **Narration**: `python scripts/voice.py <spec> --take vNN`. First run picks a random premade voice and saves it in `voice.json`; `--voice-name X` changes it; `--list-voices` shows options. Cached per line, so only changed lines cost credits.
5. **Record**: `node scripts/record.mjs <spec> --take vNN [--only section]`. A failed section leaves `capture/<section>.FAILED.png` showing what the browser saw.
   - **Reseed right before every run, dry runs included.** Takes change data (notes, attributes, folders), and SLA timers count from seed time, so a stale account shows overdue badges.
   - **Dry run first** (`--take dry`, no narration needed) and **look at the frames**, not just the log. A step can "succeed" on the wrong element (a name that also appears in the conversation list) and silently derail every later beat.
   - Every section starts from its own `setup` (a `ui` step pins Chatwoot's remembered panels, then a `goto`), so it records the same alone or mid-tour.
   - Prefer targets scoped with `within` or `regex` (tabs show counts: `^all \\d+$`). The recorder clears the browser's saved drafts at the start of each take.
   - The SSD is exFAT: macOS writes hidden `._*` files next to every image. Skip them in any glob.
6. **Render + assemble (1080p trial)**:
   `python scripts/render.py <spec> --take vNN --res 1080` then `python scripts/assemble.py <spec> --take vNN --res 1080`.
7. **QA**: `python scripts/qa.py <mp4> --res 1080`. Look at the contact sheet and at full-size frames of every focus move before showing the user. Fix blockers; explain or fix silence warnings.
8. **Review loop**: the user watches the trial. Each round of feedback is a new take (`v02`, ...) recorded fresh; never mix frames from different takes. Short style proofs (one section, `--only`) are fine for visual questions.
9. **Final**: after the user approves a 1080p take, render the same take at `--res 2160` and assemble. 4K only once, at the end.
10. **Cleanup**: offer to delete superseded take folders. Never delete without a yes.

Run scripts from the skill's `scripts/` folder (render.py imports its neighbours).

## Rules (from Sojan's production notes, kept short)
- **Honest screens.** Real Chatwoot UI with demo data. Never draw, paste or fake a product result that the visible action is supposed to produce. Scene beats (`templates/cards`) are illustrations in the website's style, and the next product beat must show the real thing they illustrate.
- **Staging** (only for what cannot run locally: Twilio calls, Meta channels, live AI): seed the record beforehand, or use a `mock`/`rails` step so the real UI renders it. Tell the user which beats are staged.
- **Narration follows the screen.** A line starts only once its screen is visible and never describes a state that is not on screen yet. When a line is longer than the action, the screen holds; footage is never sped up.
- **No narration over section cards.** Cards carry about 3 seconds of music only.
- **Settled screens only.** No spinners, skeletons, half-loaded routes, toasts from earlier steps, dev badges or `localhost` in view.
- **Light mode**, laptop viewport 1440x900 at 2x.
- **Real typing.** Text is typed into the field (every few characters captured), never pasted in one frame.
- **Focus moves** (`focus` + `zoom`) only on the control or result the line is about; one per beat at most.
- **Feature availability**: before naming a channel, feature or plan in narration, check it exists and is available as described (`config/features.yml`, `ChannelList.vue`, enterprise gates).
- No em dashes in on-screen text.
