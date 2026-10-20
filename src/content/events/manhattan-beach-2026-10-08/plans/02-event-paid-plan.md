# Event Plan — Paid Ads: six-day sprint to fill the remaining seats

**Budget:** $5,000 base ($3,000 conservative · $8,000 aggressive), Friday, Oct. 2 → Wednesday, Oct. 7,
at noon. **Goal:** about 80 qualified applications from paid. Organic covers the rest (plan 01).\
**Destination:** the one-page RSVP funnel (link 3) with UTMs. The conversion event =
**qualified application submitted**, sent to Meta (Pixel + Conversions API), LinkedIn
(Insight Tag) and Google (gtag).

---

## 1. Budget split (base $5,000)

| Channel | Budget | Daily | Expected CPA (application) | Applications |
|---|---:|---:|---:|---:|
| Meta — Facebook + Instagram (conversions to funnel) | $2,500 | ~$415 | $40-$60 | 42-62 |
| LinkedIn — Sponsored Content + Conversation Ads | $1,500 | ~$250 | $90-$150 | 10-16 |
| Google Search — event + intent keywords | $500 | ~$85 | $60-$120 | 4-8 |
| Retargeting — Meta + LinkedIn (funnel visitors, video viewers) | $500 | ~$85 | $25-$45 | 11-20 |
| **Total** | **$5,000** | | **~$60 blended** | **~83** |

Short flights need fast learning. Run **one campaign per platform** with broad-but-qualified
audiences, and let the algorithm find applicants. Don't fragment $5,000 across 20 ad sets.

---

## 2. Meta (Facebook + Instagram)

- **Campaign:** Sales/Leads objective → *Website conversions* optimizing for the custom event
  `QualifiedApplication` (fires only when the funnel's scoring marks a qualified application).
  Fallback while the pixel has no history: optimize for `Lead` (any submission) and let SHAI's
  scoring sort quality.
- **Special Ad Category check:** this is a business-opportunity event for investors, not a
  housing ad. If Meta flags it as Housing anyway, accept the category. It requires 15-mile+
  radius targeting and no age/gender/ZIP targeting — a 25-mile radius around Manhattan Beach
  already covers LA County and north Orange County.
- **Audiences (one ad set, Advantage+ audience with suggestions):**
  1. Custom audience: **Sundae Marketplace LA/OC/IE investor list** (hashed emails/phones) —
     high intent.
  2. 1%-3% lookalike of marketplace buyers who closed a deal.
  3. Suggestions: real estate investing, wholesaling, house flipping, BiggerPockets, real
     estate investment trust (exclude), property management.
  4. Exclude: current members, Sundae employees, people who already applied.
- **Placements:** Advantage+; creative built 9:16 (Reels/Stories) + 4:5 (Feed) in Sundae's
  brand style (section 8).
- **Creative rotation (four ads):** Reel 01 (POV invite) · Reel 04 (harder market) · Image 01
  (Courtyard save-your-seat) · Image 02 (Josh speaker card). Primary text = captions C03/C05.
- **Cut rule:** after $150 spent, pause any ad with a CTR of less than 0.8% or a CPA of more than $90.

## 3. LinkedIn

- **Audience:** Location = Greater Los Angeles + Orange County. (a) **Matched audience:**
  upload the marketplace list. (b) Job titles: Owner, Founder, CEO, Principal, Managing
  Partner, Acquisitions Manager/Director, Real Estate Investor; Industries: Real Estate,
  Investment Management, Leasing Real Estate; Seniority: Owner/Partner/CXO/Director;
  Company size 2-200.
- **Formats:**
  - **Conversation Ad from Josh** (message ad, sender = Josh Stech): personal invite with two
    buttons — "Request my seat" (funnel) / "Not this time." Usually a low-cost source of
    qualified signups on LinkedIn for exclusive events.
  - **Sponsored single image** (Image 07, 1200×627) with LinkedIn Lead Gen Form (prefilled
    name/email/company, plus two custom questions: deals in last 12 months, primary model),
    synced to GoHighLevel via SHAI / Zapier.
- **Bid:** maximum delivery for two days, then cost cap at $120 a lead.

## 4. Google Search

- **Keywords (phrase/exact):** "real estate investor event los angeles", "real estate
  investor networking los angeles", "wholesaling meetup los angeles", "real estate investor
  dinner", "south bay real estate investors", "sundae membership", "josh stech", "sundae real
  estate investor".
- **Ad copy:** RSA with headlines "Private Dinner With Sundae's CEO" · "LA Operators — Oct. 8"
  · "Shade Manhattan Beach Courtyard" · "Seats Limited — Apply in 60 Seconds".
- **Geo:** LA + Orange County · **Schedule:** Oct. 2-7.

## 5. Retargeting (lower-cost seats)

- Meta: people who visited the funnel, watched 50%+ of any event Reel or engaged with
  Sundae IG/FB in 30 days → Reel 07 (seats left) + Image 03 (countdown).
- LinkedIn: funnel visitors (Insight Tag) + video viewers 50%+ → Video 01 trailer.
- Frequency cap of about three a day. This is where "I'll do it later" people convert.

## 6. Day-by-day pacing

| Day | Meta | LinkedIn | Google | Notes |
|---|---|---|---|---|
| Friday, Oct. 2 | Launch four ads | Launch Conversation Ad + image | Launch | Tracking QA before launch |
| Saturday, Oct. 3 | Read CTR/CPA at noon | — | — | Pause underperformers after $150 |
| Sunday, Oct. 4 | Shift budget to winner | Cost cap $120 | — | |
| Monday, Oct. 5 | +20% on winner | Second Conversation Ad wave | Add negatives | |
| Tuesday, Oct. 6 | Retargeting up | Retarget video viewers | — | Seats-left messaging |
| Wednesday, Oct. 7 | **Stop prospecting at noon** | Stop at noon | Stop | Retargeting only until 6 p.m. |

If the dinner fills early (approved seats reach 75+), switch the funnel to **waitlist mode**
and redirect leftover budget to the always-on membership campaigns (plan 04).

## 7. Tracking + reporting (SHAI `/ads-metrics`, daily at 7 a.m.)

UTMs:

```
utm_source={meta|linkedin|google}&utm_medium=paid&utm_campaign=la-dinner-1008&utm_content={asset-id}
```

Report: spend · impressions · CTR · applications · qualified % · approved · confirmed · cost
per approved seat · cost per attendee (after the event) · intro calls attributed.

**Targets:** CTR of more than 1.0% (Meta), cost per qualified application of less than $75,
approved-to-attended of more than 70% and paid cost per attendee of about $100 (base model).

## 8. Brand compliance (check every ad before it runs)

Page numbers cite Sundae's Creative Guidelines (Agency Partners, 2022), pp. 4-9, 15 and 30-31.
Items marked "studio spec" are the studio's working rules for applying the guide.

- **White space first:** white or light (#F4F7F9) fields, spacious margins and line height
  (pp. 4, 8-9). No dark overlays, gradients, glows or grain (studio spec).
- **Sundae red (#DB3D55) is represented** on every canvas (wordmark, "S" icon tile, accent bar,
  shape or highlight box) **but never as text** (pp. 4, 6, 30).
- **Type:** Merriweather headlines with real impact, Lato for everything else, copy in #4A4A4A;
  use Lato Black for a headline when space is too tight for Merriweather (pp. 7-9).
- **Text on photos goes in highlight boxes** (white box with gray text, blue box with white
  text or red box with large bold white text). A red hand-drawn circle is another way to bring
  in red (pp. 30-31).
- **Logo:** modest size, clear space at least the height of the "u" on every side, never
  crowded (pp. 4-5). Never stretched, recolored or placed directly on a busy photo (studio spec).
- **Sized for an older audience** (font size, line height and color) with WCAG-compliant
  contrast; compliance or legal text is never smaller than the smallest other copy on the ad
  (pp. 4, 8). Contrast is checked at the AA level (studio spec).
- **Copy:** AP style (p. 15), as in "Thursday, Oct. 8, at 7 p.m."; no superlatives such as
  "best" or "highest"; any offer or bid metric reads "An average of X" or carries an asterisk
  explaining it is an average (p. 4).
