---
name: docs-restructure
description: Maintain the target shape of the user guide and the page list, in Notion. Use to build or update the list of new pages and where each old article goes.
---

# Restructure and page list

Read `.claude/docs-harness/notion.md` (destination, rules), then the reference files in `.claude/docs-harness/state/`: restructure.md (target shape), inventory.md (140 articles), decisions.md (method), doc-map.md (WhatsApp mapping).

1. Build or update the Notion page "Docs revamp: page list" under the parent: every new page grouped by the 15 sections, with title, type (journey page or supporting-layer page), the current articles it absorbs, and status (todo, draft, verified, published).
2. Every one of the 140 articles must land on a page or on the retire/merge list. List any that don't fit.
3. Channel journeys own their channel-specific pages: WhatsApp campaigns and Templates live in the WhatsApp journey; Outreach and Shared building blocks link to them.
4. Shared topics live once and are linked, never repeated.

Rules: pricing page wins over code on plans. No em dashes. Public sources only. Do not write files in the repo.
