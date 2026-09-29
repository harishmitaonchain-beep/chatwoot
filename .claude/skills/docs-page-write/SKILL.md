---
name: docs-page-write
description: Write one user-guide page to the four-stage pattern, directly in Notion. Use for each page in a planned journey, or a supporting-layer page.
---

# Write one page

Read `.claude/docs-harness/notion.md` and `decisions.md`. Verify every claim with the `docs-verifier` agent before writing it down. Write the page in Notion under its area's sub-page.

Structure a feature or channel page as four stages:
1. Discover: one-line verdict; Plan & access (plan, role, beta, inbox type); link to Pricing & Plans; how to check you have it.
2. Set up & try: prerequisites before step 1; steps in the product's exact UI labels (bold); a Test it step.
3. Get value: good practice; what to expect; where to see results.
4. Troubleshoot: symptom, likely cause, what to do; silent failures; when to contact support and what to send.

Conventions: `[Link: X]` for a page that does not exist yet; `📸 Add screenshots (self note):` with the exact screens; `⚠️ Confirm:` for anything unverified; a Review notes section at the end.

Before finishing: fetch the page text to a temp file under /tmp, run `node .claude/docs-harness/bin/label-check.mjs <tmpfile>` and `node .claude/docs-harness/bin/gap-report.mjs <tmpfile>`, put the findings in Review notes, delete the temp file. Update the page's status in the Notion page list.

Rules: pricing page wins over code on plans; never describe usage as a hard limit; shared topics linked not repeated; no em dashes; public sources only; do not write files in the repo.
