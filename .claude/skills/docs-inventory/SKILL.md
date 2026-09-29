---
name: docs-inventory
description: Read every live user-guide article and record what each covers, in Notion. Use to refresh the coverage inventory. User guide only, never the developer docs.
---

# Inventory the user guide

Output goes to Notion only. Read `.claude/docs-harness/notion.md` first for the destination and rules. The existing inventory is at `.claude/docs-harness/state/inventory.md` (read-only snapshot, 2026-09-16).

1. Get the current article list: `node .claude/docs-harness/bin/inventory-refresh.mjs`.
2. For each article, read it live and record in one or two lines what it covers and how (step-by-step, conceptual, reference, troubleshooting), plus any plan, hosting, or beta note it makes. Coverage only.
3. Write the result to a Notion page "Docs revamp: coverage inventory" under the parent, grouped by the guide's categories. Note what changed since the snapshot.
4. Note duplicates and deprecated articles you pass.

Rules: public sources only. No em dashes. Do not write files in the repo.
