---
name: docs-screenshots
description: Capture the screenshots a Notion docs page asks for (its 📸 self note) from the local Chatwoot, frame them in the house style with the page address, and place each one under its step in Notion. Use after docs-page-write, or when a page's screenshots need a refresh.
---

# Docs screenshots

Separate pipeline from the writing skills. Input: one Notion page with a `📸 Add screenshots (self note):` line. Output: images placed in that page. The user reviews in Notion and leaves comments on images that need changes.

Read `.claude/docs-harness/notion.md` first. Spec format and step vocabulary: `reference/shot-spec.md`.

## Handbook rules (source of truth)
From [Guidelines: Taking Product Screenshots/Screencasts](https://www.chatwoot.com/hc/handbook/articles/guidelines-taking-product-screenshots-screencasts-21). Where the house style below disagrees, the handbook wins.
- **Ask first:** channel (here: the help center), audience (existing customers looking for a fix), intent (instructional, step by step), format (screenshot, or a short GIF when the step is a motion such as drag and drop).
- **Show the problem being solved.** Avoid whole windows unless the reader needs to know where they are in the app. Zoom in (crop) or lightly blur to direct attention.
- **Marks:** high-contrast annotations and arrows pointing at what the step names. Annotation red `#FE2500` (the script default); brand blue `#46A7F6` only for a second, secondary mark.
- **Real-world examples, never placeholder text.** No PII or production data; staging or local demo data only.
- **Size:** landscape at least 1000 px wide; portrait at least 500 px on the wide edge. The script prints `WARN` for any shot below this; re-capture with more padding or a larger crop.
- **Screencasts (GIF):** under 5 seconds, zoomed into the detail, deliberate cursor movement, sped up to 150%. This pipeline captures PNGs only; flag in Review notes when a step needs a GIF.

## House style (agreed 2026-09-30, updated to the handbook 2026-10-01)
- Dark mode, laptop viewport (1440 wide, 2x).
- **Cropped shots** (the default): crop to the area the step is about, a dialog, panel, form or the relevant part of the page (`crop` with a target and padding). Plain black rounded frame, no address bar.
- **Full-window shots** (only when the step is about finding the place in the app, such as the first navigation step of a flow): framed as a macOS Safari window, with the real route in the address field. Adjust the viewport height to avoid empty space.
- Address: Cloud shots show `app.chatwoot.com`. Self-hosted shots: set `displayHost` to `chat.paperlayer.com`.
- The account ID in the address is always the fake `318452`. Other local IDs get fixed fake IDs through `urlRewrites` (Captain assistant: `/captain/2917/`).
- Demo data only (PaperLayer), realistic names and content, no "test" or lorem text.
- Marks: a red `box` around the control the step names, or an `arrow` when a box would cover content. One mark per shot unless the step names two things. The user's SVG cursors (`svg` annotation type) replace these when supplied.

## Flow
1. **Read the page** (fetch it fresh) and plan **one screenshot per step** (agreed 2026-10-01): every numbered step, and every option bullet that is its own screen, gets the screen as it looks at that step. The 📸 note is the minimum, not the whole list. When a step's action changes state (clicking **Create**), show the real result the product gives, even if the doc implies something else, and flag the difference.
   Place each image as an indented child of its list item (`1. Step text` then a tab-indented `<image ...>`), after any sub-bullets. That keeps it under its step without restarting the numbering.
2. **Check the app**: local Chatwoot on :3000, demo data seeded (`scripts/seed-demo-data.rb` if not), logged-in profile or `CW_PASSWORD` set.
3. **Write the spec** in `/Volumes/Extreme SSD/chatwoot-docs-screenshots/<area>/<page-slug>/spec.json` (external drive; quote the path, it has a space) and run
   `node .claude/skills/docs-screenshots/scripts/capture.mjs <spec.json> [--only id]`.
   Look at every PNG before uploading, and fix any `WARN` size line. A failed shot leaves `<id>.FAILED.png` showing what the browser saw.
4. **Screens that cannot run locally** (Meta, Twilio, live AI replies): stage them (option c). Use a `mock` step to answer the API call with demo data, and a `rails` step to push a backend event, so the real UI renders. Say in Review notes which shots are staged.
5. **Upload**: for each image call Notion `create-file-upload`, then
   `curl -s -X POST <upload_url> -H "authorization: <header>" -F "file=@<png>;type=image/png"`.
6. **Place**: one `update_content` call on the page. Insert `<image src="file-upload://<id>"></image>` after each anchor line, and remove each placed shot from the 📸 note (drop the line when none remain). Fetch the page again to confirm.
7. **Review notes**: one line with the date, the commit captured from, what is staged, and any label mismatch seen while capturing as a `⚠️ Confirm:`. Never change the doc text itself.
8. **Comments round**: when the user asks, read the page comments, re-capture the affected shots, and swap the images in place.
   Existing images cannot be matched by `update_content` (their download links change on every fetch). To swap an image, rewrite the page with `replace_content`, using the freshly fetched text verbatim and `<image src="file-upload://...">` for each new image. Check for comments first (`include_discussions`), because a rewrite drops block-level comments; if there are any, tell the user before rewriting.

## Rules
- Honest screens: real UI, demo data. A staged response is fine; a mocked-up screen is not.
- Capture what the doc says. If the product differs from the doc, capture the real product and flag the difference.
- No files in the repo. Screenshots and specs live on the external drive (`/Volumes/Extreme SSD/chatwoot-docs-screenshots`); Notion is the destination. If the drive is not mounted, stop and ask.
- No em dashes.
