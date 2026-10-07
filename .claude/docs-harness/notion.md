# Notion destination (fill this in once)

All docs pipeline output goes to Notion. Nothing new is saved in this folder.

Parent page for the docs revamp (paste the Notion page link):
NOTION_PARENT=https://app.notion.com/p/3eca5f274c928187b0ddf45ae0aeb363 (Doc Hub, harishmita@chatwoot.com workspace)

Everything the skills create lives under that parent:
- "Docs revamp: page list" : every new page planned, grouped by the 15 sections, with status (replaces a local INDEX/doc list)
- "Docs revamp: open questions" and "Docs revamp: team answers"
- one sub-page per area (WhatsApp, Pricing & Plans, Instagram, ...), each holding its pages

If NOTION_PARENT is empty, ask the user for the link before creating anything. Never create a page without a parent.

## Access scope (set by the user 2026-10-01)
- Only read or write Doc Hub and the pages under it. Never fetch, search, list, comment on, move or create anything elsewhere in the workspace.
- Searches must be scoped to Doc Hub (`page_url` = the NOTION_PARENT page). No workspace-wide search, recent/private/shared page listings, or user lookups.
- Ask the user before every Notion call, even inside Doc Hub.

## Rules for writing to Notion
- Do not create or edit files in this repo for docs output. The files in state/ are read-only reference (a snapshot as of 2026-09-29).
- To run label-check or gap-report on a Notion page, fetch the page text, write it to a temp file under /tmp (never inside the repo), run the script, then delete the temp file. Put the findings in the Notion page's Review notes.
- Before editing an existing Notion page, fetch it first so edits people made there are kept.
- No em dashes.
