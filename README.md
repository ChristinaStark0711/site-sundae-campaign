# site-sundae-campaign

Sundae × SHAI growth hub (prepared by SHAI): every Sundae event, each with its own creative library, captions,
plans, budgets and projections, plus the always-on Sundae Membership (franchise) growth engine.
Live at https://site-sundae-campaign.vercel.app (Vercel, deploys on every push to `main`).

## Pages
- `/` overview · `/events` upcoming and past events (openly licensed city photos, credited)
- `/events/<slug>` an event: overview, `/creative`, `/captions`, `/plans/<plan>`, `/projections`
- `/creative`, `/captions`, `/plans/<slug>`, `/projections`: the always-on membership set, with links to each event's
- `/api/requests`: the change box under every creative (see `engine/change/README.md`)
- Old links `/plans/event-organic`, `/plans/event-paid`, `/plans/filming`, `/plans/action-plan` redirect to the
  Manhattan Beach event (`next.config.ts`).

## Content (no code changes needed for a new event)
`src/lib/content.ts` reads these at build time:
- `src/content/events/<city-slug>-<YYYY-MM-DD>/`: `event.json` (facts, copy, plan list, actual results),
  `library.json` (images, flyers, videos, Reels), `captions.json`, `plans/*.md`, `projections.json`.
  An event with `"kind": "record"` (e.g. Sacramento) is listed with its facts only.
- `src/content/brand/`: the always-on membership library, captions, plans and 12-month projections.
- `src/content/cities.json` + `public/media/cities/`: one city photo per city with its licence credit.
- `src/content/requests/<id>.json`: the change log, written by the change workflow.
- Media: `public/media/<kind>/` for Manhattan Beach and the brand set (original paths kept), and
  `public/media/events/<slug>/<kind>/` for every later event.

## Creative engine (`engine/`)
One source file per asset (`engine/creatives/<brand|events/<slug>>/<kind>/<ID>.html|json`), the shared kit
(`engine/kit/`: brand fonts, CSS, photos, the motion engine and AI clips, with `assets.json` saying which event owns
each venue file), the renderer (`render.mjs`), brand lint (`lint.mjs`), the change pipeline (`change/`) and event
tools (`tools/`: `new-event.mjs`, `event-model.mjs`, `city-photo.mjs`, `render-event.mjs`, `check-event.mjs`).
See `engine/README.md`. From 2026-10-19 these sources are the master copy of Sundae's published creative.
`engine/`, `.github/` and `.request/` are left out of Vercel deploys (`.vercelignore`).

New events are built by the studio's `/sundae-new-event` agent.

## Stack and style
Next.js 16 · Tailwind v4 · React Three Fiber (lead-funnel hero) · GSAP + Lenis. Styled to Sundae's Creative
Guidelines (`clients/sundae/BRAND-SPEC.md` in the studio repo; condensed in `engine/BRAND.md`): Merriweather headlines
and Lato everywhere else, palette tokens in `src/app/globals.css`, chart colors in `src/content/palette.ts` (red is an
accent and never text), AP style in all copy. `public/media/ai-start-frames/` are the Shade Courtyard frames used to
generate the Manhattan Beach AI B-roll. `robots: noindex` (review build).

Moved to Sundae’s own GitHub and Vercel on 29 Oct 2026.
