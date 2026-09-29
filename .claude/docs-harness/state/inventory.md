# User guide coverage inventory (all 140 articles)

Source: Notion page "Chatwoot User Guide, Coverage Inventory", read live from chatwoot.help/hc/user-guide on 2026-09-16 (140/140 articles). Coverage only: what each article covers and how. Snapshot copied into the folder so Claude Code can read it.

Observations noted while reading: the two "SLA Reports" articles are near-duplicates; Dyte, Twitter, and Instagram (Facebook login) carry deprecation notices.

## Chatwoot 101
- **Chatwoot Glossary**: Alphabetical reference defining ~100+ terms (Access Token to Widget), across infrastructure, features, and metrics. Concise lookup definitions, not a tutorial. No tier/hosting/beta.
- **Getting Started with Chatwoot**: Preparatory overview of account setup and core concepts (inboxes, conversations, contacts, agents), framing the lesson curriculum. Conceptual, not step-by-step. Mentions free trial.
- **Lesson 1: Your first Chatwoot conversation**: Purpose + channels-vs-inboxes, then creating a website live-chat inbox and first interaction. Tutorial: concepts, diagrams, 7 steps with screenshots, FAQ.
- **Lesson 2: Dashboard Basics**: Dashboard navigation: four regions, filtering/search, lifecycle states, availability, notifications. Tutorial with labeled diagrams, reference tables, a 5-task exercise, FAQ.
- **Lesson 3 (a): Mastering core features**: Six conversation tools: private notes, canned responses, labels, macros, conversation actions, participants. Concepts + setup steps + GIFs + exercise + FAQ. Assumes admin for setup.
- **Lesson 3 (b): Working with Customer Context**: Contact records, conversation history, custom attributes, bulk actions, saved filters/segments, global search. Tutorial with framing, reference table, screenshots, exercise, FAQ.
- **Lesson 4: Automation and Routing**: Business hours, auto-assignment, automation rules, SLAs. Philosophy + diagrams + steps + comparison table + exercise + FAQ. Capacity-based assignment flagged Enterprise/Custom Roles.
- **Lesson 5: AI Actions**: Captain AI: customer-facing Assistants and agent-facing Copilot, plus config, knowledge, actions, custom tools. Conceptual with comparison tables, examples, Q&A. Captain is Enterprise-gated, paid-plans-only on Cloud; requires system OpenAI key.
- **Lesson 6: Reports and Metrics**: Interpreting six core metrics and nine reports. Tutorial with framework, reference table, report-by-report breakdown, screenshots, filtering/export guidance, FAQ.

## Setup account
- **Creating a Chatwoot Account**: Account creation on Cloud or self-hosted. Cloud-vs-self-hosted comparison table, Cloud signup steps with screenshots, field reference, next-steps checklist.
- **Customizing your personal profile**: Profile picture, name, email, font size, language, signature, send-hotkey, password. Step-by-step with screenshots. Email/password may be locked under admin restriction or SAML SSO.
- **Setting up notifications**: Audio, push (browser/mobile), and email notifications, event filtering, browser permissions. Conceptual with screenshots and role-based tips.
- **Updating your Account settings**: Admin config of account name, default language, audio transcription, account ID, deletion. Reference-table format. Admins only; deletion Cloud-only; transcription requires Captain.
- **How to invite agents and manage your support team?**: Agent roles (Admin/Agent), invitations, editing, deletion, availability states. Concepts + reference tables + steps with screenshots + FAQ. Admins only; custom roles noted.
- **What is a channel? What is an inbox?**: Defines channels vs inboxes, lists channel types, common inbox options, FAQ. Conceptual + reference linking to setup guides. Footnote on fair-use policy tied to agent count/plan.
- **A complete guide to teams in Chatwoot**: Teams as agent groupings; create/edit/delete and use for routing, assignment, filtering, automation, macros, reporting. Concepts + 3-step wizard + reference tables + how-tos. Admin-only management.

## Other channels
- **How to setup a Facebook channel?**: Six steps to connect a Facebook page (Messenger inbox) + greeting, CSAT, reauth, agents, business hours. Step-by-step with screenshots. Self-hosted must set up own FB app (linked).
- **How to setup an Instagram channel (via Facebook login)?**: Prerequisites (Business IG + FB page link) and inbox creation. Step-by-step with screenshots. Deprecation notice: FB Login support ending from v4.1; Instagram Business Login preferred.
- **How to setup a Twitter channel?**: Five setup steps + greeting, CSAT, agents, auto-assignment, business hours. Opens with notice: Twitter integration temporarily discontinued due to API changes.
- **How to setup a WhatsApp channel?**: Overview + prerequisites, then routes to two methods (Embedded Signup recommended, or Manual) with use-case guidance and links. Assumes WhatsApp feature enabled.
- **How to setup an SMS channel?**: SMS via Twilio or Bandwidth: dashboard settings, provider config, agents. Step-by-step with screenshots. Mentions Twilio Studio and SMS campaigns.
- **How to setup an Email channel?**: Three sections (general, Gmail, Outlook) and three methods (forwarding, IMAP, SMTP), plus Gmail app passwords. Step-by-step with screenshots.
- **How to setup a Telegram channel?**: Seven steps via BotFather token, plus FAQ on Telegram Business Bot (v4.3.0) and its limitations.
- **How to setup a Line channel?**: Eight steps: Line Developer account, Messaging API channel, credentials, agents, webhook config, testing.
- **How to create an API channel inbox?**: Mixed: setup steps, conceptual model (Channel, Inbox, Conversation, Contact, Contact Inboxes), API reference with JSON, webhook + Client API/WebSocket docs, GitHub example.
- **How to Set Up a WhatsApp Channel with Twilio?**: Two pathways (direct + messaging service) plus webhook config and Twilio Studio. FAQ says templates are not supported with Twilio (now wrong).
- **How to setup an Instagram channel? (via Instagram login)**: Five steps connecting a Business Instagram account via "Continue with Instagram". Explicitly Cloud; self-hosted directed elsewhere.
- **How to setup a WhatsApp channel (Embedded signup)**: Defines embedded signup, prerequisites, Coexistence option, compliance checklist. 4 numbered steps with screenshots. Explicitly Cloud only.
- **How to setup a WhatsApp channel (Manual flow)?**: Three phases (Meta credentials, Chatwoot config, webhook) via WhatsApp Cloud API, plus FAQ (multi-number, templates, media).
- **How to setup a TikTok channel?**: Prerequisites + five OAuth steps, plus Messaging Limitations (customer must initiate; 10-message cap) and FAQ. Available on Cloud and self-hosted.
- **Synchronize WhatsApp templates using a Business Management token**: Seven steps to generate/configure a Meta Business Management token + four-scenario troubleshooting. Cloud-only for Embedded Signup inboxes; requires admin.

## Voice Channels
- **Voice Calling in Chatwoot**: Overview + reference tables (providers, call states) + setup steps + troubleshooting. Twilio Voice and WhatsApp Calling, records/transcripts, outbound. Premium feature.
- **Connecting Twilio voice channel**: New Voice inbox; enable voice on existing inboxes. Requires Account SID/Auth Token + API Key SID/Secret; configure Voice and Status Callback URLs.
- **Connecting WhatsApp voice channel**: New vs existing inboxes. Prerequisites: WhatsApp Cloud API inbox (not 360dialog) + Business Calling API enrollment. Emphasizes customer consent.

## Website live chat
- **Website live chat settings explained**: Creating a website channel, adding agents, installing the widget, then six config tabs. Notes Captain suppresses the unavailability message.
- **How to install live chat using Google Tag Manager?**: Custom HTML tag with the script, trigger All pages, publish.
- **How to install live chat on a Docusaurus website?**: yarn/npm + docusaurus.config.js snippet. Code, no screenshots.
- **How to install live chat on a Webflow website?**: Paste script into Webflow footer custom code, publish, verify.
- **How to install live chat on a Gatsby website?**: gatsby-plugin-chatwoot + gatsby-config.js. Code, no screenshots.
- **How to install live chat on a WordPress website?**: Plugin from GitHub, upload, activate, configure, verify.
- **How to install live-chat on a React Native app?**: @chatwoot/react-native-widget, iOS setup, init example.
- **How to install live-chat on a Next.js app?**: Reusable ChatwootWidget component loading the SDK async.
- **How to install live-chat on a Vue.js app?**: Embed the widget script, plus a community Vue 3/Nuxt 3 module.
- **How to send additional user information to Chatwoot using SDK?**: chatwoot:ready events, setUser(), HMAC identity validation, custom attributes/labels, locale, programmatic controls. Reference with code.
- **How to continue conversations through email?**: When email continuity triggers, and three ways to capture email. Self-hosted needs separate config; Captain suppresses the prompt unless handing off.
- **How to enable identity validation in Chatwoot?**: HMAC token from inbox settings to generate an identifier hash. Code in seven languages.
- **How to enable dark mode on live-chat widget?**: darkMode parameter: light (default) and auto; standalone dark not supported.
- **Understanding Contact Identity and Identity Validation in Chatwoot**: Contact matching vs identity validation, unverified badge, signature mechanism, use cases. Conceptual.

## Features explained
- **How to add labels?**: Creating labels (name, description, color), sidebar visibility, editing/deleting, naming rules.
- **How to use Agent bots?**: How AgentBots respond via APIs, pending-to-open handoff, creation in Settings, webhooks, secret verification.
- **Understanding Contacts**: Adding contacts (manual, CSV, pre-chat, greetings), filtering, sorting, labels, notes, outbound messaging.
- **How to create saved reply templates with Canned Responses?**: Create/edit/delete, use via `/`, template variables.
- **How to create and use custom attributes?**: Conversation vs contact attributes, SDK setCustomAttributes, types.
- **How to enable CSAT surveys?**: Purpose, appearance per inbox type, enabling, display types, message customization, label rules.
- **How to assign a priority**: Four levels via sidebar, right-click, command palette. No custom priorities.
- **How to use omnichannel message signature?**: Signatures in Personal Settings, auto-append, per-message edit. Inline images only in Email, live chat, API.
- **Preventing Agent Collision**: Assignment and typing indicators. Conceptual.
- **Manage team access control with flexible role-based permissions**: Custom roles, six permission levels. Steps + reference table.
- **WhatsApp CSAT Surveys using Templates**: Why WhatsApp needs templates, enabling, auto template creation/approval, statuses. WhatsApp Cloud or Twilio only.
- **Review Notes for CSAT**: Internal context on CSAT responses. Cloud Business/Enterprise only; self-hosted all paid plans.
- **Business Hours and Auto-Responder**: Availability, out-of-office message, SLA timer impact, reporting effects. Admin-only; once-per-day trigger.

## Advanced features explained
- **How to use Conversation Filters?**: 13 filter types, combined example, clearing.
- **How to use pre-chat forms?**: Website live chat only; standard vs custom fields.
- **How to use Campaigns?**: Ongoing (website) and one-off (scheduled SMS to labeled contacts), wildcard URL support. No plan/beta note.
- **How to create interactive messages?**: Four widget interactive types via the New Message API. JSON, no screenshots.
- **How to use Automation?**: Event/Conditions/Actions, 4 events, 11 actions, example, management.
- **How to setup a WebSocket connection?**: URLs, PubSub tokens, RoomChannel, 14 event types. Flagged experimental.
- **How to use template variables?**: {{contact.name}} etc., use in canned/macros/automation, fallback syntax.
- **How to use Macros?**: Sequential saved actions; create, execute with preview, edit/delete.
- **How to use Audit Logs?**: Tracked activities, who/what/when/where. Enterprise feature.
- **Wildcard URL support in website live-chat campaigns**: Four matching modes, http/https prefix required. (Found wrong: see handoff.)
- **Service Level Agreements**: First Response, Next Response, Resolution Time; creating, applying via automation. SLAs cannot be modified once created.
- **How does sorting work?**: Four sorting methods. Conceptual.
- **Setting per-agent conversation caps with Agent Capacity Policies**: Policy components, per-inbox limits, exclusions. Admin-only.
- **What is Human Agent tag in Instagram/Messenger channel**: Extends replies to 7 days. Cloud on by default; self-hosted needs Meta App Review.
- **Whatsapp templates**: Types, sending in conversations/campaigns, limits. Cloud-only; legacy format note v4.7 (outdated).
- **Twilio content templates**: Four types, setup, auto-sync for Twilio WhatsApp, troubleshooting.
- **Setting up SAML Authentication**: IdP fields, SP details, attribute mappings. SAML disables password login.
- **Common WhatsApp issues and how to fix them**: Delivery failures, display-name approval, error 131049. Troubleshooting Q&A.
- **Required Conversation Attributes**: Required fields before resolving. Cloud Business/Enterprise; self-hosted all paid. Manual resolve only.
- **Advanced Assignment Policies**: Round-robin/balanced, capacity, prioritization, exclusions. OSS round-robin only; Business/Enterprise balanced + capacity.

## Apps and Integrations
- **How to bring your Dialogflow chatbot to Chatwoot?**: Bot creation, config, handoffs, interactive messages (website only).
- **How to use webhooks?**: Setup, payload schemas, nine events, HMAC verification examples.
- **How to answer conversations from Slack?**: Setup, replying, private notes, private channels. Pre-Sept-2023 integrations must reconnect.
- **How to use Dashboard Apps?**: Config + postMessage code, JSON schemas.
- **How to enable video calls with Dyte integration?**: Deprecated; points to Cloudflare RealtimeKit.
- **How to translate messages with Google Translate?**: Enabling, site language, service-account setup.
- **How to enhance conversations with OpenAI integration?**: Reply Suggestion, Improve with AI, Summary.
- **How to track Issues and Features with Linear Integration?**: OAuth, create issues, link tickets.
- **How to enable video calls with Cloudflare RealtimeKit?**: Setup and calls. Admin; website inbox only.

## Reports
- **How to read Overview Reports (realtime)?**: Four real-time metrics.
- **How to read CSAT Reports?**: Responses, score, rate, breakdown. Requires CSAT enabled.
- **How to read Conversations Reports?**: Conversation and timing metrics.
- **How to read Bot Reports?**: CSML/Dialogflow bot metrics.
- **How to read SLA Reports?**: Hit rate, misses, log.
- **Reading Conversations, Agents, Labels, Inbox, and Team Reports**: Five report types, metrics, business-hours toggle.
- **How to read the SLA Reports** (second): Near-duplicate of the other SLA Reports article.

## Help Center
- **How to set up a Help Center?**: Portal, categories, articles.
- **How to setup an SSL certificate for your Help Center's custom domain?**: Custom domain + SSL. SSL for paid Cloud plans.
- **Embedding videos in Help Center**: Providers and URL rules.
- **Connect analytics to your help center**: GA, GTM, Hotjar, Plausible, Clarity, Meta Pixel, Amplitude. Admin.
- **Recommend categories and articles**: Featured homepage content (3 categories, 6 articles, per locale).

## Best practices
- **Assigning conversations in a round-robin fashion**: Enabling round-robin per inbox. On by default.
- **Working with command bar**: Cmd/Ctrl+K navigation and actions.
- **Working with keyboard shortcuts**: Shortcut list.
- **Group your contacts into custom segments**: Filters saved as segments.
- **Group chats with filters, save as folders**: Conversation filters saved as folders.

## Captain
- **Introduction to Captain**: Assistant, Copilot, FAQs, Memories overview.
- **Creating an assistant with Captain**: Creation, toggles, inbox connection. Paid plan on Cloud.
- **Creating a document in Captain**: URL or PDF, auto FAQs. Document limits by plan.
- **Creating an FAQ with Captain**: Auto and manual FAQs, approval.
- **How to use Captain Memories?**: Auto-saved customer details.
- **How to use Captain Copilot?**: Drafting, translation, tone, KB search.
- **How to enable Captain on self-hosted installations?**: Super Admin config, BYOK. Enterprise Edition paid plan.
- **How AI Credits work in Captain?**: Deduction, reset, top-ups, allowances by plan.
- **Updating robots.txt to Allow Chatwoot Assistant to Crawl Your Website**: Allow the crawler.
- **How to Set Up Custom Tools for Captain?**: Limits, security, examples, errors. Business and above.
- **Control who Captain replies to and when**: Audience and Schedule settings.

## Migrations
- **How to migrate from Intercom to Chatwoot?**: Built-in importer, paid plans, admin, excludes attachments/teammates.
- **How to migrate from Front to Chatwoot?**: Cleanup, CSV import, conversation migration via API.
- **How to migrate from Freshdesk to Chatwoot?**: Built-in importer, paid plans, API caps, no attachments.
- **How to migrate from Zendesk to Chatwoot?**: Widget removal, contacts, conversations.

## Other topics
- **Which cookies are used by Chatwoot?**: Four cookies.
- **Mobile app for Android**: Install from Google Play (Android 7.0+) and log in, optional beta.
- **Mobile app for iOS**: Download (iOS 11.0+) and log in, optional TestFlight beta.
- **Enterprise Edition**: Community vs Enterprise.
- **Languages supported in Chatwoot**: 30+ languages, widget and dashboard locale.
- **What we don't cover in Chatwoot Free Trial**: Trial exclusions. Cloud-only.
- **How to enable push notifications in your browser**: Per browser.
- **How to hard-reload on most browsers**: Shortcuts.
- **How to Use Your Coupon Code on Chatwoot?**: Billing portal steps.
- **Inconsistencies for WhatsApp Numbers in Brazil and Argentina**: Phone format changes, normalization (also covers Mexico).
- **Troubleshooting: Why am I not receiving notifications?**: Six-step checklist.
- **Migrate a WhatsApp Embedded Signup inbox to manual setup**: Credentials, 4-step migration.

## How To
- **Purchasing a Paid Self-Hosted Chatwoot License**: Offerings and license purchase via Super Admin.
- **How to Find Your Personal Access Token in Chatwoot**: Three steps.
- **How to Embed Your Help Center Articles in the Live Chat Widget**: Five steps.
- **How to Change Your Email Address in Chatwoot**: Profile settings + verification.
- **How to Remove the Free Usage Limit Exceeded Message in Chatwoot**: Triggers and fixes.
- **How to Segment Contacts in Chatwoot?**: Labels, bulk assign, saved segments.
