# Running It on SHAI — who does what

**SHAI** (meetshai.com) is a team of 97 specialist agents in 11 squads. Sundae talks to it
through one concierge — the portal, a phone call, text, Slack or email. It plans, builds,
posts, books and reports across the tools Sundae already uses, and **asks before anything
it can't undo**: spending, sending to someone new, publishing, deleting. It runs on Sundae's
own model key (the AI vendor bills Sundae directly, no markup), meters every run and
commits everything it builds into Sundae's own GitHub.

**Recommended plan: Business — $497 a month** (or $4,970 a year): up to five businesses/workspaces,
team seats with per-business permissions, phone + SMS from SHAI (650 texts and 10 hours of
calls a month), three-day free trial. One Sundae workspace covers the membership engine; add a
workspace per region later if regional teams want their own approvals.

**What Sundae connects once** (setup wizard, about 10 minutes plus approvals):
GoHighLevel (CRM, funnels, calendars, SMS/email, AI agents) · Meta Business (ads + Pages +
Instagram) · Google Ads · LinkedIn (company page; Josh posts himself) · Google Calendar
(Victoria's team) · Twilio or GHL phone (A2P 10DLC registered) · GitHub + Vercel (the three
sites) · the AI model key · optionally Instantly (cold email), Slack.

---

## 1. Day 0 — setup (tonight to tomorrow morning)

| Step | SHAI agent | What it does | Approval needed |
|---|---|---|---|
| 1 | `/get-to-know-you` | Three-minute interview: Sundae's offer (Membership), ideal member, territories, voice, calendar owners | — |
| 2 | `/ghl-setup` | Creates or links the GoHighLevel sub-account for Membership | Yes (creates account) |
| 3 | `/ghl-tags` | Tag taxonomy: `src:{meta,linkedin,google,organic,marketplace,referral}`, `evt:la-1008`, `fit:{a,b,c}`, `stage:*` | — |
| 4 | `/ghl-pipeline` | Pipelines: **Dinner – LA 10/8** (Applied → Approved → Confirmed → Attended → Intro booked) and **Membership** (Lead → MQL → Intro booked → Held → FDD sent → Discovery → Signed / Lost) | — |
| 5 | `/ghl-forms` | Field-by-field spec for the six-question application (matches the event funnel + membership page) | — |
| 6 | `/ghl-calendar` | Victoria's team round-robin "Territory conversation (30 min)" calendar, buffers, reminders | Yes |
| 7 | `/ghl-automations` | Instant reply · approval/decline · reminders 24 hours, three hours and 30 minutes before the event · no-show rebook · post-event sequence · long nurture | Yes (sends) |
| 8 | `/ghl-a2p` | Business number + A2P registration for compliant texting | Yes (purchase) |
| 9 | `/ghl-chat-agent-builder` | AI chat/SMS agent (AI-disclosed) for speed-to-lead, FAQs, booking | Yes (goes live) |
| 10 | `/ghl-voice-agent-builder` | AI voice agent for confirmations and qualified-lead callbacks (disclosure baked in) | Yes |
| 11 | `/meta-account-monitor` | Ad account health, pixel/CAPI check, policy status before launch | — |

## 2. The Oct. 8 dinner sprint

| Job | SHAI agent | Output |
|---|---|---|
| RSVP funnel live + webhook to GHL | (link 3 — built) + `/ghl-automations` | Every RSVP lands in the Dinner pipeline, scored |
| Captions in Josh's voice | `/caption-copy` | LinkedIn/IG/FB/X captions (starter set in this kit) |
| Daily posting | `/organic-content-creator` | Schedules images/Reels through the GHL Social Planner |
| Paid sprint | `/ads-manager` → `/ads-research` → `/ad-copy` → `/ad-creatives` → `/ads-campaigns` | Meta + Google campaigns built, launched **after approval** |
| LinkedIn ads | Built by Sundae's team in Campaign Manager (SHAI writes the copy and the Conversation Ad tree) | Conversation Ad from Josh |
| Pacing and cuts | `/ads-optimize` | Pause/scale proposals, approve by text "YES" |
| Daily scoreboard | `/morning-brief` + `/ads-metrics` | 7 a.m. text: applications, approved, confirmed, seats left |
| Confirmations | `/ghl-voice-agent-builder` agent + Victoria's team | Show rate 70%+ |
| Night-of content | `/new-edit` → `/ingest-footage` → `/build-cut` → `/finish-edit` → `/publish-edit` | Same-night teaser, 24-hour recap Reel, 72-hour highlight film, speech clips |
| Post-event follow-up | `/ghl-email` + `/ghl-automations` | Thank-you, recap, book-a-call sequence |

## 3. The always-on Membership engine

| Weekly job | SHAI agent |
|---|---|
| Offer + VSL | `/offer-builder` (sharpen the membership offer), `/vsl-script` (Josh's VSL) |
| Landing/funnel pages | `/ghl-funnel` (or the rebuilt site's /membership page via `/build-website`) |
| Organic content | `/caption-copy`, `/shortform-scripts`, `/longform-scripts`, `/organic-content-creator` |
| Video editing from dinner/LinkedIn Live footage | `/new-edit` squad (cuts, captions, reframes 9:16/1:1/16:9, thumbnails) |
| Paid ads end to end | `/ads-manager` orchestrates research → copy → creative → campaigns → optimize → metrics |
| Lead lists of active operators | `/lead-list-builder` (public data via Bright Data/Apify, or Sundae's own exports) |
| Cold email (optional) | `/email-outreach` (Instantly; SPF/DKIM/DMARC; CAN-SPAM) |
| Speed-to-lead + booking | GHL chat + voice agents (built above) |
| Sales coaching | `/sales-call-grader` (grades intro calls F to A+), `/sales-roleplay` (practice) |
| Hiring setters/closers as volume grows | `/sales-talent-sourcing`, `/sales-talent-hiring` |
| SEO + AI-answer visibility | `/seo`, `/aeo`, `/site-speed` on the rebuilt sundae.com |
| Website chatbot | `/chat-agent-builder` (the rebuild ships with a site-trained bot; SHAI maintains it) |
| City dinners | `/venue-finder`, `/restaurant-booking` + this kit, reused per city |
| Forecast vs. plan | `/forecasting` (monthly), `/business-plan-existing` (quarterly refresh) |
| Investor/partner decks | `/pitch-deck` |
| Contracts (general drafting only) | `/legal-counsel` — **not a substitute for franchise counsel** |

## 4. The approval model (why this is safe to run daily)
- **Asks first:** any ad spend change, any message to a new contact, any publish, any delete.
  Josh or Victoria approve by text ("YES"), by button or by phone.
- **Daily ceiling:** a hard daily AI spend ceiling across providers. A run that would cross it
  pauses for approval.
- **Compliance in code** for texts, calls and commercial email: consent, opt-outs, quiet
  hours (8 a.m.-9 p.m. recipient time), unsubscribe + postal address and AI disclosure whenever
  SHAI talks to someone who isn't you.
- **Ownership:** everything SHAI builds is committed to Sundae's GitHub; data exports any time.

## 5. Weekly time required from Sundae once it's running

| Person | Time | What |
|---|---|---|
| Josh | About three hours a week | 60 min on camera (batch), 20 min/day LinkedIn, approvals by text, one dinner/month |
| Victoria's team | Calls | Intro calls, discovery, FDD process — SHAI fills the calendar |
| Marketing lead | About five hours a week | Review drafts, approve posts/ads, own the dinner logistics |
| SHAI | Daily | Everything else: building, posting, ads, follow-up, reporting |
