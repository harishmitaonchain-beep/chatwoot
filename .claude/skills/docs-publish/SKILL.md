---
name: docs-publish
description: Final checks for a Notion page or area before hand-over. Use when drafts are answer-complete and ready to ship.
---

# Publish check

Read `.claude/docs-harness/notion.md`. For each page:
1. Fetch the page text to a temp file under /tmp.
2. `gap-report.mjs`: zero ⚠️ Confirm, zero `[Link: ...]` pointing at nothing, screenshots in place.
3. `label-check.mjs`: every flagged label resolved.
4. Confirm plan and access facts match the public pricing page, not the code. Note the repo commit you verified against (`git rev-parse --short HEAD`).
5. Delete the temp file. Remove the Review notes section from the Notion page.
6. Set status to published in the Notion page list, with the verified commit.

Rules: no em dashes. Public sources only. Do not write files in the repo.
