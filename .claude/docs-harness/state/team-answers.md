# Team answers (dated)

## 2026-09-22
- The public pricing page is the sole source of truth for plans.
- The free plan is called Hacker.
- Hacker plan and free trial accounts can connect WhatsApp.
- Cloud: WhatsApp campaigns are a beta for Business and above, turned on via support. Calling is Business and above.
- Never describe usage as a hard limit.

## 2026-09-24
- Self-hosted calling: paid self-hosted plan with Enterprise Edition, from v4.15.0. The EE build alone is not enough.
- Self-hosted campaigns: not premium. The installation's super admin enables it per account (Super Admin, Accounts, select account, Edit). Community Edition admins can set the whatsapp_campaign flag through Rails, kept out of customer docs. Needs a WhatsApp Cloud inbox and approved templates.
- Calling with manual setup: supported on WhatsApp Cloud inboxes connected either way. The product's "Quick setup only" wording is wrong.
- Messages stop arriving: contact support first, do not re-register as the first step. Coexistence has a different recovery path. Never delete the number or recreate the inbox.
- Business profile fields: read-only in Chatwoot, changed in Meta's tools.
- Multiple numbers under one Meta app: one inbox per number, the guided setup handles webhook routing.
- Manual setup recommended banner: appears for Embedded Signup Cloud inboxes when the manual-transfer flag is on, health data shows no Coexistence, and there is no authorization error. Support decides eligibility.
- Template parts: header, body, footer, buttons. Headers: text, image, video, document. Buttons: quick reply, URL, phone number, copy code. Media limits: images JPEG/PNG 5 MB, video MP4/3GPP 16 MB (H.264/AAC), documents PDF only 100 MB. Word, Excel, PowerPoint and text files are ordinary messages, not template headers.

## 2026-09-29
- Hacker plan accounts can use Request access for Quick setup.
- Re-registering a number: the customer does it in Meta, after support checks the inbox.
- Screenshots: the docs owner will add them.
