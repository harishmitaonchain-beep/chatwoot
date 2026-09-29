---
name: docs-questions
description: Collect open questions from Notion drafts and apply team answers everywhere. Use after writing pages, and whenever the team sends answers.
---

# Manage open questions

Read `.claude/docs-harness/notion.md`. Existing answers and questions are in `state/team-answers.md` and `state/open-questions.md` (read-only snapshot); the live versions are the Notion pages "Docs revamp: team answers" and "Docs revamp: open questions" under the parent (create them from the snapshot the first time).

1. Collect every ⚠️ Confirm from the area's Notion pages into "Docs revamp: open questions", marked blocking (customer-facing text) or not.
2. Batch blocking questions to the team in one ask. Do not guess.
3. Apply answers: add them dated to "Docs revamp: team answers", then update every affected Notion page and remove the matching ⚠️ Confirm. Fetch each page before editing.
4. Move answered items out of the open questions page.

Rules: no em dashes. Public sources only. Do not write files in the repo.
