# User guide: proposed restructure and doc map

Source: Notion page "User Guide, Proposed Restructure & Doc Map" (built from inventory.md), including the Pricing & Plans section. Snapshot copied into the folder so Claude Code can read it. This is the target structure the new docs are planned against.

## The new shape (top level)
1. **Start here**: onboarding and education (glossary, getting started, the lessons)
2. **Account & team**: one-time account and team setup
3. **Channels**: one journey per channel
4. **Conversations & productivity**: the day-to-day feature journeys
5. **Quality & compliance**: CSAT, SLAs, audit, access
6. **Outreach**: Campaigns
7. **Reports**
8. **Captain (AI)**
9. **Apps & integrations**
10. **Help Center (knowledge base)**
11. **Shared building blocks**: concepts many features link into
12. **Migrating to Chatwoot**
13. **Pricing & Plans**: centralized pricing, fair-use and plan facts (single source of truth)
14. **Reference**: factual lookups
15. **Quick how-tos**: small task recipes

Each feature or channel entry (3 to 9) is a journey: Discover, Set up & try, Get value, Troubleshoot. Entries 1 to 2 and 11 to 15 are the supporting layers.

## Channels: one journey per channel
| Channel journey | Consolidates today's articles | Move |
|---|---|---|
| Website live chat | Settings explained; 9 platform install guides (GTM, WordPress, Webflow, Gatsby, Docusaurus, React Native, Next.js, Vue, SDK); pre-chat forms; dark mode; continue via email | Installs become a "Set up, by platform" sub-page, not 9 top-level articles |
| WhatsApp | Setup overview; Embedded signup; Manual flow; Twilio setup; Template sync; Common WhatsApp issues; Brazil/Argentina number inconsistencies; Migrate embedded to manual; WhatsApp voice; WhatsApp CSAT | About 10 scattered articles to one journey. The flagship consolidation. |
| Facebook (Messenger) | Setup Facebook channel | Add Discover (plan/access) + Troubleshoot |
| Instagram | Setup via Instagram login (primary) + via Facebook login (deprecating) | Merge into one; Instagram login is the path |
| Email | Setup Email channel | |
| SMS | Setup SMS channel | |
| Telegram | Setup Telegram channel | |
| Line | Setup Line channel | |
| TikTok | Setup TikTok channel | |
| API channel | Create an API channel inbox | Straddles user/developer; keep the user-facing half here |
| Voice | Voice Calling overview; Twilio voice; WhatsApp voice | Premium; note enablement in Discover |
| Twitter | (temporarily discontinued) | Retire/flag |

## Conversations & productivity
| Feature journey | Consolidates today's articles |
|---|---|
| Contacts | Understanding contacts; custom attributes; segment contacts; group into custom segments |
| Labels | How to add labels |
| Canned responses | Saved reply templates |
| Macros | How to use macros |
| Automation | How to use automation; business hours and auto-responder |
| Filters & views | Conversation filters; group chats into folders (also a shared block) |
| Priorities | How to assign a priority |
| Message signature | Omnichannel signature |
| Agent collision | Preventing agent collision |
| Assignment | Round-robin; advanced assignment policies; agent capacity policies |
| Agent bots | How to use agent bots |
| Interactive messages | Interactive messages |

## Quality & compliance
| Area | Consolidates today's articles |
|---|---|
| CSAT | Enable CSAT surveys; WhatsApp CSAT via templates; review notes for CSAT |
| SLAs | Service Level Agreements (report reading lives under Reports) |
| Required attributes | Required conversation attributes |
| Audit logs | How to use audit logs (Enterprise) |
| Access & auth | Role-based permissions; SAML authentication |

## Outreach
| Feature journey | Consolidates today's articles |
|---|---|
| Campaigns | How to use Campaigns; wildcard URL support |

This is where the WhatsApp-campaign beta / on-request flag belongs. Discover states the plan and beta requirement before anyone sets one up.

## Reports
All seven report articles to one Reports section (Overview, CSAT, Conversations, Bot, SLA, and the combined Conversations/Agents/Labels/Inbox/Team report). Merge the two near-duplicate SLA-report articles into one.

## Captain (AI)
All eleven Captain articles to one Captain area, shaped as a journey: Discover (Introduction), Set up (assistant, document, FAQ, custom tools, self-hosted enablement, robots.txt), Get value (Copilot, Memories, audience/schedule control), with AI credits and plan limits as reference within it.

## Apps & integrations
Nine integration articles to one section (Dialogflow, webhooks, Slack, Dashboard Apps, Google Translate, OpenAI, Linear, Cloudflare RealtimeKit). Retire Dyte (deprecated, points to Cloudflare RealtimeKit).

## Help Center (knowledge base)
Set up a Help Center; SSL for custom domain; embed videos; connect analytics; recommend categories/articles; embed articles in the live-chat widget, to one Help Center section.

## Shared building blocks (live once, linked everywhere)
| Block | Canonical source article(s) | Linked from |
|---|---|---|
| Templates | WhatsApp templates; Twilio content templates; WhatsApp template sync | WhatsApp, Campaigns, WhatsApp CSAT |
| Identity validation | Enable identity validation; Understanding contact identity | Website live chat, channels |
| Filters & segments | Conversation filters; custom segments; folders | Contacts, Conversations, Reports |
| Template variables | How to use template variables | Canned responses, Macros, Automation, Campaigns |
| Human Agent tag | What is the Human Agent tag | WhatsApp, Instagram/Messenger |

## Pricing & Plans
Centralized single source of truth for plan and cost facts. Every feature's Discover "Plan & access" line links here.

| Page | Covers | Sourced from today |
|---|---|---|
| Plans & pricing | The tiers, what each includes, and cost; links out to the live pricing page so numbers never go stale | New canonical page |
| Fair-use policy | Usage / fair-use limits tied to agent count and plan, shown right against pricing | Today only a footnote inside "What is a channel/inbox?" |
| Captain AI credits | Free credits per plan and top-up costs (the numbers); the how-to stays in Captain and links here | From Captain "How AI credits work" |
| Free trial | What's included and excluded in the trial | Moved from Reference ("What's not in Free Trial") |
| Editions & licensing | Community vs Enterprise, and buying a self-hosted license | Moved from Reference (Enterprise Edition; self-hosted license purchase) |

## Supporting layers
| Layer | Maps in today's articles |
|---|---|
| Start here | Glossary; Getting Started; Lessons 1 to 6 |
| Account & team | Create account; personal profile; notifications; account settings; invite agents; teams; "what is a channel/inbox" |
| Migrating to Chatwoot | Intercom; Front; Freshdesk; Zendesk |
| Reference | Cookies; supported languages; mobile apps (Android/iOS) |
| Quick how-tos | Find your access token; change email; hard-reload; enable browser push; remove free-usage-limit message; apply coupon code; command bar; keyboard shortcuts |
| Notifications (troubleshooting) | "Why am I not receiving notifications?" + enable push |

## Retire / merge (cleanup pass)
- **Twitter channel**: integration temporarily discontinued; unlist or mark clearly deprecated.
- **Dyte integration**: deprecated; redirect to Cloudflare RealtimeKit.
- **Instagram via Facebook login**: deprecating (v4.1); fold into the single Instagram journey.
- **Two "SLA Reports" articles**: near-duplicates; merge into one.
