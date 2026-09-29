---
title: "User Guide Index"
tags: [chatwoot, meta, docs, user-guide]
generated: 2026-08-17
---

# User Guide Index

The complete public user guide (chatwoot.help), fetched live 2026-08-17 and mapped into the context layer: **140 articles across 15 categories, 115 mapped to capability nodes** in [[feature-index]] (the rest are marketing/account-admin content with no code counterpart — listed anyway for completeness). Permalinks spot-verified live (HTTP 200). This is the third documentation property fully indexed — capability cards in the Codex now carry their 📖 guide links directly (180 links attached via `tools/user-guide.json` → `build-codex-data.mjs`).

**Regenerating**: re-run the user-guide-index workflow pattern (per-category WebFetch of https://chatwoot.help/hc/user-guide/en, extract title+href, map to capability names) → `tools/user-guide.json` → `build-codex-data.mjs`. Articles drift as Chatwoot ships; refresh when product-signals or support work references guide content that seems missing here.

## Reports

| Article | Capability node(s) |
|---|---|
| [How to read Overview Reports (realtime)?](https://chatwoot.help/hc/user-guide/articles/1677693459-how-to-read-overview-reports-realtime) | `Reports: overview live metrics` |
| [How to read CSAT Reports?](https://chatwoot.help/hc/user-guide/articles/1677693868-how-to-read-csat-reports) | `CSAT report` |
| [How to read Conversations Reports?](https://chatwoot.help/hc/user-guide/articles/1724140319-how-to-read-conversations-report) | `Reports: conversation timeseries & summary (read path)` |
| [How to read Bot Reports?](https://chatwoot.help/hc/user-guide/articles/1724141456-how-to-read-the-bot-reports) | `Reports: bot reports` |
| [How to read SLA Reports?](https://chatwoot.help/hc/user-guide/articles/1724145182-how-to-read-sla-reports) | `SLA report`, `SLA` |
| [Reading Conversations, Agents, Labels, Inbox, and Team Reports.](https://chatwoot.help/hc/user-guide/articles/1677694691-reading-conversations-agents-labels-inbox-and-team-reports) | `Reports: agent/inbox/label/team/channel summaries`, `Reports: conversation timeseries & summary (read path)`, `Reports: CSV downloads` |
| [How to read the SLA Reports](https://chatwoot.help/hc/user-guide/articles/1713170964-how-to-read-the-sla-reports) | `SLA report`, `SLA` |

## Voice Channels

| Article | Capability node(s) |
|---|---|
| [Voice Calling in Chatwoot](https://chatwoot.help/hc/user-guide/articles/1779863425-voice-calling-in-chatwoot) | `Voice: call lifecycle & status (shared Call model)`, `Voice: recording & transcription`, `Voice: call history & visibility` |
| [Connecting Twilio voice channel](https://chatwoot.help/hc/user-guide/articles/1779871614-connecting-twilio-voice-channel) | `Voice: Twilio channel setup & provisioning` |
| [Connecting WhatsApp voice channel](https://chatwoot.help/hc/user-guide/articles/1779871708-connecting-whats_app-voice-channel) | `Voice: WhatsApp calling (Meta Calling API)`, `Voice: WhatsApp call permissions` |

## Setup account

| Article | Capability node(s) |
|---|---|
| [Creating a Chatwoot Account](https://chatwoot.help/hc/user-guide/articles/1677242820-create-your-chatwoot-account) | — |
| [Customizing your personal profile](https://chatwoot.help/hc/user-guide/articles/1677477447-customizing-your-personal-profile) | — |
| [Setting up notifications](https://chatwoot.help/hc/user-guide/articles/1731478912-setting-up-notifications) | — |
| [Updating your Account settings](https://chatwoot.help/hc/user-guide/articles/1677480617-customizing-your-general-settings) | — |
| [How to invite agents and manage your support team?](https://chatwoot.help/hc/user-guide/articles/1677482414-adding-agents) | `Agents & roles (admin/agent)`, `Custom roles` |
| [What is a channel? What is an inbox?](https://chatwoot.help/hc/user-guide/articles/1677492191-adding-inboxes) | — |
| [A complete guide to teams in Chatwoot](https://chatwoot.help/hc/user-guide/articles/1677492970-adding-teams) | `Teams`, `Conversation assignment (agent/team)` |

## Other channels

| Article | Capability node(s) |
|---|---|
| [How to setup a Facebook channel?](https://chatwoot.help/hc/user-guide/articles/1677778588-how-to-setup-a-facebook-channel) | `Facebook & Instagram: Facebook Page connect & inbox setup` |
| [How to setup an Instagram channel (via Facebook login)?](https://chatwoot.help/hc/user-guide/articles/1677829420-how-to-setup-an-instagram-channel) | `Facebook & Instagram: Instagram via Facebook Page messaging`, `Facebook & Instagram: Facebook Page connect & inbox setup` |
| [How to setup a Twitter channel?](https://chatwoot.help/hc/user-guide/articles/1677831888-how-to-setup-a-twitter-channel) | `Twitter: tweets & DMs (legacy)` |
| [How to setup a WhatsApp channel?](https://chatwoot.help/hc/user-guide/articles/1677832735-how-to-setup-a-whats_app-channel) | `WhatsApp (channel umbrella)`, `WhatsApp: registration & webhook setup` |
| [How to setup an SMS channel?](https://chatwoot.help/hc/user-guide/articles/1677846958-how-to-setup-an-sms-channel) | `SMS: inbound & outbound messaging (Bandwidth)`, `Twilio: SMS & WhatsApp-via-Twilio messaging` |
| [How to setup an Email channel?](https://chatwoot.help/hc/user-guide/articles/1677843043-how-to-setup-an-email-channel) | `Email: channel setup (forwarding & IMAP/SMTP config)`, `Email: mailbox OAuth (Google/Microsoft)` |
| [How to setup a Telegram channel?](https://chatwoot.help/hc/user-guide/articles/1677838569-how-to-setup-a-telegram-channel) | `Telegram: bot & Business messaging` |
| [How to setup a Line channel?](https://chatwoot.help/hc/user-guide/articles/1677838977-how-to-setup-a-line-channel) | `Line: messaging` |
| [How to create an API channel inbox?](https://chatwoot.help/hc/user-guide/articles/1677839703-how-to-create-an-api-channel-inbox) | `API channel: custom-channel conversations & email continuity` |
| [How to Set Up a WhatsApp Channel with Twilio?](https://chatwoot.help/hc/user-guide/articles/1742910590-how-to-set-up-a-whats_app-channel-with-twilio) | `Twilio: SMS & WhatsApp-via-Twilio messaging`, `WhatsApp (channel umbrella)` |
| [How to setup an Instagram channel?](https://chatwoot.help/hc/user-guide/articles/1744361165-how-to-setup-an-instagram-channel-via-instagram-login) | `Facebook & Instagram: Instagram direct login connection`, `Facebook & Instagram: Instagram direct-login messaging` |
| [How to setup a WhatsApp channel (Embedded signup)](https://chatwoot.help/hc/user-guide/articles/1752129193-how-to-use-whatsapp-embedded-signup) | `WhatsApp: embedded signup`, `WhatsApp (channel umbrella)`, `WhatsApp: registration & webhook setup` |
| [How to setup a WhatsApp channel (Manual flow)?](https://chatwoot.help/hc/user-guide/articles/1756799850-how-to-setup-a-whats_app-channel-manual-flow) | `WhatsApp: registration & webhook setup`, `WhatsApp (channel umbrella)` |
| [How to setup a TikTok channel?](https://chatwoot.help/hc/user-guide/articles/1769595702-how-to-setup-a-tik_tok-channel) | `TikTok: OAuth & token lifecycle`, `TikTok: messaging, capabilities & read receipts` |
| [Synchronize WhatsApp templates using a Business Management token](https://chatwoot.help/hc/user-guide/articles/1785260890-whatsapp-business-token) | `WhatsApp: templates & business token` |

## Advanced features explained

| Article | Capability node(s) |
|---|---|
| [How to use Conversation Filters?](https://chatwoot.help/hc/user-guide/articles/1677688192-how-to-use-conversation-filters) | `Conversation filters & custom views` |
| [How to use pre-chat forms?](https://chatwoot.help/hc/user-guide/articles/1677688647-how-to-use-pre_chat-forms) | `Pre-chat forms` |
| [How to use Campaigns?](https://chatwoot.help/hc/user-guide/articles/1677738682-how-to-use-campaigns) | `Live-chat (ongoing) campaigns`, `One-off WhatsApp / SMS campaigns`, `Website live chat: campaigns on widget` |
| [How to create interactive messages?](https://chatwoot.help/hc/user-guide/articles/1677689344-how-to-use-interactive-messages) | `Website live chat: conversations & messaging`, `API channel: custom-channel conversations & email continuity` |
| [How to use Automation?](https://chatwoot.help/hc/user-guide/articles/1677689800-how-to-use-automation) | `Automation rules: rule engine (events, conditions, actions)` |
| [How to setup a WebSocket connection?](https://chatwoot.help/hc/user-guide/articles/1677691027-how-to-setup-a-web_socket-connection) | — |
| [How to use template variables?](https://chatwoot.help/hc/user-guide/articles/1679579699-template-variables) | `Canned responses` |
| [How to use Macros?](https://chatwoot.help/hc/user-guide/articles/1679978392-how-to-use-macros) | `Macros` |
| [How to use Audit Logs?](https://chatwoot.help/hc/user-guide/articles/1692251809-how-to-use-audit-logs) | `Audit logs` |
| [Wildcard URL support in website live-chat campaigns](https://chatwoot.help/hc/user-guide/articles/1712785075-wildcard-url-support-in-website-live_chat-campaigns) | `Live-chat (ongoing) campaigns`, `Website live chat: campaigns on widget` |
| [Service Level Agreements](https://chatwoot.help/hc/user-guide/articles/1713167310-service-level-agreemtns) | `SLA`, `SLA report` |
| [How does sorting work?](https://chatwoot.help/hc/user-guide/articles/1740546374-how-does-sorting-work) | `Conversation filters & custom views` |
| [Setting per-agent conversation caps with Agent Capacity Policies](https://chatwoot.help/hc/user-guide/articles/1741998212-agent-capacity) | `Agent capacity limits`, `Auto-assignment: policy-driven bulk (V2)` |
| [What is Human Agent tag in Instagram/Messenger channel](https://chatwoot.help/hc/user-guide/articles/1745225158-what-is-human-agent-tag-in-instagram-messenger-channel) | `Facebook & Instagram: Human Agent tag (24h window extension)` |
| [Whatsapp templates](https://chatwoot.help/hc/user-guide/articles/1754940076-whatsapp-templates) | `WhatsApp: templates & business token`, `WhatsApp: outbound sending` |
| [Twilio content templates](https://chatwoot.help/hc/user-guide/articles/1756195741-twilio-content-templates) | `Twilio: content templates & CSAT provisioning`, `Twilio: SMS & WhatsApp-via-Twilio messaging` |
| [Setting up SAML Authentication](https://chatwoot.help/hc/user-guide/articles/1758635327-setting-up-saml) | — |
| [Common WhatsApp issues and how to fix them](https://chatwoot.help/hc/user-guide/articles/1768986869-common-whats_app-issues-and-how-to-fix-them) | `WhatsApp (channel umbrella)`, `WhatsApp: health monitoring`, `WhatsApp: registration & webhook setup` |
| [Required Conversation Attributes](https://chatwoot.help/hc/user-guide/articles/1769161760-required-conversation-attributes) | `Custom attributes (contact & conversation)`, `Statuses, resolve & snooze` |
| [Advanced Assignment Policies](https://chatwoot.help/hc/user-guide/articles/1763978164-chatwoot-assignment-v2) | `Auto-assignment: policy-driven bulk (V2)`, `Auto-assignment: round-robin rotation queue`, `Agent capacity limits` |

## Help Center

| Article | Capability node(s) |
|---|---|
| [How to set up a Help Center?](https://chatwoot.help/hc/user-guide/articles/1677861202-how-to-setup-a-help-center) | `Help Center: portal management & branding`, `Help Center: category & folder taxonomy`, `Help Center: article authoring & publishing` |
| [How to setup an SSL certificate for your Help Center's custom domain?](https://chatwoot.help/hc/user-guide/articles/1677855950-generate-ssl-certificate) | `Help Center: custom domain & SSL` |
| [Embedding videos in Help Center](https://chatwoot.help/hc/user-guide/articles/1748419710-embedding-videos-in-help-center) | `Help Center: article authoring & publishing`, `Help Center: public portal rendering` |
| [Connect analytics to your help center](https://chatwoot.help/hc/user-guide/articles/1786121846-connect-analytics-to-your-help-center) | `Help Center: portal management & branding`, `Help Center: public portal rendering` |
| [Recommend categories and articles](https://chatwoot.help/hc/user-guide/articles/1786122758-recommend-categories-and-articles) | `Help Center: portal management & branding`, `Help Center: public portal rendering` |

## Apps and Integrations

| Article | Capability node(s) |
|---|---|
| [How to bring your Dialogflow chatbot to Chatwoot?](https://chatwoot.help/hc/user-guide/articles/1677743452-how-to-integrate-your-dialogflow-chatbot-with-chatwoot) | `Dialogflow`, `Agent bots` |
| [How to use webhooks?](https://chatwoot.help/hc/user-guide/articles/1677693021-how-to-use-webhooks) | `Webhooks (account)` |
| [How to answer conversations from Slack?](https://chatwoot.help/hc/user-guide/articles/1677774874-how-to-answer-conversations-from-slack) | `Slack` |
| [How to use Dashboard Apps?](https://chatwoot.help/hc/user-guide/articles/1677691702-how-to-use-dashboard-apps) | `Dashboard apps` |
| [How to enable video calls with Dyte integration?](https://chatwoot.help/hc/user-guide/articles/1679928145-how-to-enable-video-calls-with-dyte-integration) | `Video calls (Dyte)` |
| [How to translate messages with Google Translate?](https://chatwoot.help/hc/user-guide/articles/1679916448-how-to-translate-your-messages-with-google-translate) | `Google Translate` |
| [How to enhance conversations with OpenAI integration?](https://chatwoot.help/hc/user-guide/articles/1683707349-openai) | `Captain: agent task assists (summarize/reply/rewrite/label)` |
| [How to track Issues and Features with Linear Integration?](https://chatwoot.help/hc/user-guide/articles/1739949089-how-to-track-issues-and-features-with-linear-integration) | `Linear` |
| [How to enable video calls with Cloudflare RealtimeKit?](https://chatwoot.help/hc/user-guide/articles/1781766180-how-to-enable-video-calls-with-cloudflare-realtime_kit) | `Video calls (Dyte)` |

## Captain

| Article | Capability node(s) |
|---|---|
| [Introduction to Captain](https://chatwoot.help/hc/user-guide/articles/1738101283-captain-_-introduction) | `Captain: assistants (bot reply pipeline)`, `Copilot (agent sidebar)`, `Captain: documents & knowledge sync` |
| [Creating an assistant with Captain](https://chatwoot.help/hc/user-guide/articles/1738101547-creating-an-assistant-with-captain) | `Captain: assistants (bot reply pipeline)`, `Captain: documents & knowledge sync` |
| [Creating a document in Captain](https://chatwoot.help/hc/user-guide/articles/1738104411-creating-a-document-in-captain) | `Captain: documents & knowledge sync` |
| [Creating an FAQ with Captain](https://chatwoot.help/hc/user-guide/articles/1738101609-creating-an-faq-with-captain) | `Captain: documents & knowledge sync` |
| [How to use Captain Memories?](https://chatwoot.help/hc/user-guide/articles/1738101691-how-to-use-captain-memories) | `Memories (contact facts)` |
| [How to use Captain Copilot?](https://chatwoot.help/hc/user-guide/articles/1738110272-how-to-use-captain-copilot) | `Copilot (agent sidebar)` |
| [How to enable Captain on self-hosted installations?](https://chatwoot.help/hc/user-guide/articles/1755284287-how-to-enable-captain-on-self_hosted-installations) | `Captain: assistants (bot reply pipeline)` |
| [How AI Credits work in Captain?](https://chatwoot.help/hc/user-guide/articles/1765223602-how-ai-credits-work-in-captain) | `Captain: AI credits & usage limits` |
| [Updating robots.txt to Allow Chatwoot Assistant to Crawl Your Website](https://chatwoot.help/hc/user-guide/articles/1765224466-updating-robots-txt-to-allow-chatwoot-assistant-to-crawl-your-website) | `Captain: documents & knowledge sync` |
| [How to Set Up Custom Tools for Captain?](https://chatwoot.help/hc/user-guide/articles/1775045339-v2-_-how-to-set-up-custom-tools-for-captain) | `Captain: custom tools` |
| [Control who Captain replies to and when](https://chatwoot.help/hc/user-guide/articles/1786119055-control-who-captain-replies-to-and-when-audience-schedule) | `Captain: reply control & auto-resolution` |

## Chatwoot 101

| Article | Capability node(s) |
|---|---|
| [Chatwoot Glossary](https://chatwoot.help/hc/user-guide/articles/1677141565-chatwoot-glossary) | — |
| [Getting Started with Chatwoot](https://chatwoot.help/hc/user-guide/articles/1673260810-getting-started-chatwoot-101) | — |
| [Lesson 1: Your first Chatwoot conversation](https://chatwoot.help/hc/user-guide/articles/1677229173-lesson-1-your-first-chatwoot-conversation) | `Website live chat: SDK embed & public JS API`, `Website live chat: conversations & messaging`, `Statuses, resolve & snooze` |
| [Lesson 2: Dashboard Basics](https://chatwoot.help/hc/user-guide/articles/1677231493-lesson-2-dashboard-basics) | `Conversation filters & custom views`, `Statuses, resolve & snooze`, `Labels` |
| [Lesson 3 (a): Mastering core features](https://chatwoot.help/hc/user-guide/articles/1677235281-lesson-3-a-mastering-core-features) | `Private notes & @mentions`, `Canned responses`, `Macros` |
| [Lesson 3 (b): Working with Customer Context](https://chatwoot.help/hc/user-guide/articles/1677237449-lesson-3-b-mastering-core-features) | `Contact management`, `Custom attributes (contact & conversation)`, `Conversations: bulk actions` |
| [Lesson 4: Automation and Routing](https://chatwoot.help/hc/user-guide/articles/1677238266-lesson-4-complete-your-customer-engagement-suite) | `Automation rules: rule engine (events, conditions, actions)`, `SLA`, `Business hours` |
| [Lesson 5: AI Actions](https://chatwoot.help/hc/user-guide/articles/1777328078-lesson-5-ai-actions) | `Captain: assistants (bot reply pipeline)`, `Copilot (agent sidebar)`, `Captain: documents & knowledge sync` |
| [Lesson 6: Reports and Metrics](https://chatwoot.help/hc/user-guide/articles/1777328138-lesson-6-reports-and-metrics) | `Reports: overview live metrics`, `Reports: agent/inbox/label/team/channel summaries`, `CSAT report` |

## Best practices

| Article | Capability node(s) |
|---|---|
| [Assigning conversations in a round-robin fashion](https://chatwoot.help/hc/user-guide/articles/1677696868-assigning-conversations-in-a-round_robin-fashion) | `Auto-assignment: round-robin rotation queue`, `Auto-assignment: legacy per-conversation (V1)`, `Conversation assignment (agent/team)` |
| [Working with command bar](https://chatwoot.help/hc/user-guide/articles/1677697180-working-with-command-bar) | — |
| [Working with keyboard shortcuts](https://chatwoot.help/hc/user-guide/articles/1677698168-working-with-keyboard-shortcuts) | — |
| [Group your contacts into custom segments](https://chatwoot.help/hc/user-guide/articles/1677748953-group-your-contacts-using-filters-and-save-them-as-custom-segments) | `Segments (saved contact filters)`, `Contact management` |
| [Group chats with filters, save as folders](https://chatwoot.help/hc/user-guide/articles/1677698771-group-chats-with-filters-save-as-folders) | `Conversation filters & custom views` |

## Other topics

| Article | Capability node(s) |
|---|---|
| [Which cookies are used by Chatwoot?](https://chatwoot.help/hc/user-guide/articles/1677778232-which-cookies-are-used-by-chatwoot) | `Website live chat: visitor session & auth token` |
| [Mobile app for Android](https://chatwoot.help/hc/user-guide/articles/1677777866-mobile-app-for-android) | — |
| [Mobile app for iOS](https://chatwoot.help/hc/user-guide/articles/1677776959-mobile-app-for-i_os) | — |
| [Enterprise Edition](https://chatwoot.help/hc/user-guide/articles/1677776492-enterprise-edition) | — |
| [Languages supported in Chatwoot](https://chatwoot.help/hc/user-guide/articles/1677695546-languages-supported-in-chatwoot) | — |
| [What we don't cover in Chatwoot Free Trial](https://chatwoot.help/hc/user-guide/articles/1699010044-what-we-don-t-cover-in) | — |
| [How to enable push notifications in your browser](https://chatwoot.help/hc/user-guide/articles/1731484809-how-to-enable-push-notifications-in-your-browser) | — |
| [How to hard-reload on most browsers](https://chatwoot.help/hc/user-guide/articles/1742879613-how-to-hard_reload-on-most-browsers) | — |
| [How to Use Your Coupon Code on Chatwoot?](https://chatwoot.help/hc/user-guide/articles/1744047690-how-to-apply-your-coupon-code-inside-chatwoot) | — |
| [Inconsistencies for WhatsApp Numbers in Brazil and Argentina](https://chatwoot.help/hc/user-guide/articles/1758697086-inconsistencies-for-whats_app-numbers-in-brazil-mexico-and-argentina) | `WhatsApp: phone normalization`, `WhatsApp (channel umbrella)` |
| [Troubleshooting: Why am I not receiving notifications?](https://chatwoot.help/hc/user-guide/articles/1772103052-troubleshooting-why-am-i-not-receiving-notifications) | — |
| [Migrate a WhatsApp Embedded Signup inbox to manual setup](https://chatwoot.help/hc/user-guide/articles/1783938358-migrate-a-whats_app-embedded-signup-inbox-to-manual-setup) | `WhatsApp: embedded signup`, `WhatsApp: registration & webhook setup`, `WhatsApp: reauthorization & credential transfer` |

## Website live chat

| Article | Capability node(s) |
|---|---|
| [Website live chat settings explained](https://chatwoot.help/hc/user-guide/articles/1677580558-website-live-chat-settings-explained) | `Website live chat: SDK embed & public JS API`, `Website live chat: dark mode & appearance`, `Pre-chat forms` |
| [How to install live chat using Google Tag Manager?](https://chatwoot.help/hc/user-guide/articles/1677588225-how-to-install-live-chat-using-google-tag-manager) | `Website live chat: SDK embed & public JS API` |
| [How to install live chat on a Docusaurus website?](https://chatwoot.help/hc/user-guide/articles/1677669621-how-to-install-live-chat-on-a-docusaurus-website) | `Website live chat: SDK embed & public JS API` |
| [How to install live chat on a Webflow website?](https://chatwoot.help/hc/user-guide/articles/1677671793-how-to-install-live-chat-on-a-webflow-website) | `Website live chat: SDK embed & public JS API` |
| [How to install live chat on a Gatsby website?](https://chatwoot.help/hc/user-guide/articles/1677671443-how-to-install-live-chat-on-a-gatsby-website) | `Website live chat: SDK embed & public JS API` |
| [How to install live chat on a WordPress website?](https://chatwoot.help/hc/user-guide/articles/1677669989-how-to-install-live-chat-on-a-word_press-website) | `Website live chat: SDK embed & public JS API` |
| [How to install live-chat on a React Native app?](https://chatwoot.help/hc/user-guide/articles/1677672686-how-to-install-live_chat-on-a-react-native-app) | `Website live chat: SDK embed & public JS API` |
| [How to install live-chat on a Next.js app?](https://chatwoot.help/hc/user-guide/articles/1677676986-how-to-install-live_chat-on-a-next-js-app) | `Website live chat: SDK embed & public JS API` |
| [How to install live-chat on a Vue.js app?](https://chatwoot.help/hc/user-guide/articles/1677677232-how-to-install-live_chat-on-a-vue-js-app) | `Website live chat: SDK embed & public JS API` |
| [How to send additional user information to Chatwoot using SDK?](https://chatwoot.help/hc/user-guide/articles/1677587234-how-to-send-additional-user-information-to-chatwoot-using-sdk) | `Website live chat: SDK embed & public JS API`, `Contacts: identity & dedupe (widget identify)`, `Custom attributes (contact & conversation)` |
| [How to continue conversations through email?](https://chatwoot.help/hc/user-guide/articles/1677587761-how-to-continue-conversations-through-email) | `Website live chat: continuity via email`, `Email: conversation continuity (widget/API → email)` |
| [How to enable identity validation in Chatwoot?](https://chatwoot.help/hc/user-guide/articles/1677587479-how-to-enable-identity-validation-in-chatwoot) | `Identity validation (HMAC)`, `Contacts: identity & dedupe (widget identify)`, `Website live chat: SDK embed & public JS API` |
| [How to enable dark mode on live-chat widget?](https://chatwoot.help/hc/user-guide/articles/1677587636-how-to-enable-dark-mode-on-live_chat-widget) | `Website live chat: dark mode & appearance`, `Website live chat: SDK embed & public JS API` |
| [Understanding Contact Identity and Identity Validation in Chatwoot](https://chatwoot.help/hc/user-guide/articles/1782283175-understanding-contact-identity-and-identity-validation-in-chatwoot) | `Contacts: identity & dedupe (widget identify)`, `Identity validation (HMAC)`, `Website live chat: visitor session & auth token` |

## Migrations

| Article | Capability node(s) |
|---|---|
| [How to migrate from Intercom to Chatwoot?](https://chatwoot.help/hc/user-guide/articles/1696162098-how-to-migrate-from-intercom-to-chatwoot) | `Data import (contact CSV import)`, `Website live chat: SDK embed & public JS API` |
| [How to migrate from Front to Chatwoot?](https://chatwoot.help/hc/user-guide/articles/1696163019-how-to-migrate-from-front-to-chatwoot) | `Data import (contact CSV import)`, `Website live chat: SDK embed & public JS API` |
| [How to migrate from Freshdesk to Chatwoot?](https://chatwoot.help/hc/user-guide/articles/1696159781-how-to-migrate-from-freshdesk-to-chatwoot) | `Data import (contact CSV import)`, `Website live chat: SDK embed & public JS API` |
| [How to migrate from Zendesk to Chatwoot?](https://chatwoot.help/hc/user-guide/articles/1696162432-how-to-migrate-from-zendesk-to-chatwoot) | `Data import (contact CSV import)`, `Website live chat: SDK embed & public JS API` |

## How To

| Article | Capability node(s) |
|---|---|
| [Purchasing a Paid Self-Hosted Chatwoot License: A Step-by-Step Guide](https://chatwoot.help/hc/user-guide/articles/1750735898-purchasing-a-paid-self_hosted-chatwoot-license-a-step_by_step-guide) | — |
| [How to Find Your Personal Access Token in Chatwoot](https://chatwoot.help/hc/user-guide/articles/1757445004-how-to-find-your-personal-access-token-in-chatwoot) | — |
| [How to Embed Your Help Center Articles in the Live Chat Widget](https://chatwoot.help/hc/user-guide/articles/1757446321-how-to-embed-your-help-center-articles-in-the-live-chat-widget) | `Help Center: widget/iframe embedding (plain layout)`, `Website live chat: SDK embed & public JS API` |
| [How to Change Your Email Address in Chatwoot](https://chatwoot.help/hc/user-guide/articles/1757447973-how-to-change-your-email-address-in-chatwoot) | — |
| [How to Remove the Free Usage Limit Exceeded Message in Chatwoot](https://chatwoot.help/hc/user-guide/articles/1757451305-how-to-remove-the-free-usage-limit-exceeded-message-in-chatwoot) | — |
| [How to Segment Contacts in Chatwoot?](https://chatwoot.help/hc/user-guide/articles/1775764014-how-to) | `Segments (saved contact filters)`, `Contact management` |

## Features explained

| Article | Capability node(s) |
|---|---|
| [How to add labels?](https://chatwoot.help/hc/user-guide/articles/1677496066-how-to-add-labels) | `Labels` |
| [How to use Agent bots?](https://chatwoot.help/hc/user-guide/articles/1677497472-how-to-use-agent-bots) | `Agent bots` |
| [Understanding Contacts](https://chatwoot.help/hc/user-guide/articles/1677498364-understanding-contacts) | `Contact management`, `Data import (contact CSV import)` |
| [How to create saved reply templates with Canned Responses?](https://chatwoot.help/hc/user-guide/articles/1677501325-how-to-create-saved-reply-templates-with-canned-responses) | `Canned responses` |
| [How to create and use custom attributes?](https://chatwoot.help/hc/user-guide/articles/1677502327-how-to-create-and-use-custom-attributes) | `Custom attributes (contact & conversation)` |
| [How to enable CSAT surveys?](https://chatwoot.help/hc/user-guide/articles/1677503828-how-to-enable-csat-surveys) | `CSAT: inbox enablement & survey rules`, `CSAT: survey trigger on resolution`, `CSAT report` |
| [How to assign a priority](https://chatwoot.help/hc/user-guide/articles/1682679737-how-to-assign-a-priority) | `Priority` |
| [How to use omnichannel message signature?](https://chatwoot.help/hc/user-guide/articles/1695209306-how-to-use-the-omnichannel-message-signature) | — |
| [Preventing Agent Collision](https://chatwoot.help/hc/user-guide/articles/1732243644-preventing-agent-collision) | `Conversation assignment (agent/team)`, `Conversations: typing indicators` |
| [Manage team access control with flexible role-based permissions](https://chatwoot.help/hc/user-guide/articles/1741923706-manage-team-access-control-with-flexible-role_based-permissions) | `Custom roles`, `Agents & roles (admin/agent)` |
| [WhatsApp CSAT Surveys using Templates](https://chatwoot.help/hc/user-guide/articles/1768303449-whats_app-csat-surveys-in-chatwoot) | `CSAT: WhatsApp & Twilio template management`, `WhatsApp: templates & business token`, `Twilio: content templates & CSAT provisioning` |
| [Review Notes for CSAT](https://chatwoot.help/hc/user-guide/articles/1768536939-review-notes-for-csat) | `CSAT: review notes` |
| [Business Hours and Auto-Responder](https://chatwoot.help/hc/user-guide/articles/1777421876-business-hours-and-auto_responder) | `Business hours`, `Auto-responder (greeting / out-of-office)` |

## Related

- [[feature-index]] — the capability nodes these articles map to
- [[external-docs]] — the umbrella map of all three documentation properties
- [[product-signals]] — where promised-vs-built gaps get recorded
