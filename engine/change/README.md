# Change requests: the box under every creative

Anyone with the hub's link can type a change under an image, flyer, video or Reel and choose **Update this one**
(the file is replaced) or **New variation** (a new version is added next to the original). This folder is the
pipeline that does the work. Requests and their text are public: they are committed to this (public) repo and listed
in the change log on the hub, and the box says so.

## How a request flows
1. **Site** (`src/components/ChangeBox.tsx` → `src/app/api/requests/route.ts`): refuses anything but a same-origin
   JSON request for a known asset (`src/generated/asset-keys.json`, built before every build), 3–500 characters, no
   credential-like text (keys and tokens of every common format), 6 per 10 minutes per IP address (best effort: the
   count lives in one server instance's memory); then asks GitHub how many runs started today (the daily cap,
   default 30) and whether this asset already has a change waiting or running; then starts the workflow with
   `workflow_dispatch`. The workflow reads its inputs from GitHub's event file, never from step environment
   variables, which GitHub would print in the public log.
2. **Workflow** (`.github/workflows/creative-change.yml`, checks out the latest `main`; runs may overlap, because a
   GitHub concurrency group would cancel a waiting run and lose its request):
   - `intake.mjs` writes `.request/request.json` (credential-like text removed) and counts today's runs again;
   - `process.mjs` asks Claude (Anthropic API, no tools) for a new version of the asset's single source file
     (`engine/creatives/<scope>/<kind>/<ID>.html|json`) and puts every candidate through one gate:
     - source checks (`lib.mjs checkSource`): only `/kit/` files; video spec strings may only use `<br> <b> <i> <em>
       <strong> <span class> <sup> <sub> <small> <u>`;
     - **the rendered-page audit** (`audit.mjs`, Chromium with JavaScript off): no script, form, frame, link or
       media elements, no event handlers or `javascript:` URLs, no files outside the kit, no generated text
       (`::before`/`::after`/`::marker` content, list markers, `attr()`/`counter()`), no at-rules in inline styles
       (no `@media`, so print and screen are the same page), and only tags and attributes the original already uses;
     - **fact checks on the rendered text** (entities decoded, Unicode-normalized, hidden text included): any new
       number, price, date, time, weekday, phone, web address or @handle; any new claim or contact word (cancelled,
       free, gift card, guaranteed, earnings, returns, DM, WhatsApp …); and any event fact (date, time, venue, city)
       that was visible before and isn't now (including the room, the street, the host and "an average of" wording
       or a footnote asterisk); any newly added image that carries its own text (QR codes, screenshots, maps: marked
       `"text": true` in `engine/kit/assets.json`), any photo or footage from another event, and any new drawn SVG
       shape; a new name after "at", "with", "hosted by" … (also capitalized at a line start, or in capitals); legal
       or "an average of" wording that was visible and no longer is (faded, moved off the canvas, covered, clipped),
       even though it is still in the text; and any new hiding style on a part (clip, mask, filter, transform,
       z-index, tiny or transparent text, `pointer-events`, a filled `::before`/`::after` box), judged per element.
       Any of these **holds the request as a proposal** (below), after it passes the brand lint;
     - **wordmark checks** (stills): a Sundae wordmark or icon stretched out of its proportions, a wordmark straight
       on a photo, or a red wordmark on anything but white, mist, pink, slate or gray (a white one on anything but
       red, blue or ink) **fails** the request (BRAND-SPEC §4), as do retired files such as the cream wordmark;
     - a preview render, the brand lint (red text, fonts, contrast; videos at their poster frame), and a
       before/after review by Claude. If the review corrects the source, the correction goes through the whole gate
       and a second review.
   - `apply.mjs` puts the files in place on the latest `main`: an update is refused if the asset's source changed
     while the request was worked on (for an approved proposal: since the proposal was made, so approving an old
     proposal can never undo a newer change); a variation takes the next free id at that moment (05B taken → 05C);
     every field of the log is scrubbed of credential-like text;
   - the site is built to prove it still builds; `guard.mjs` refuses any changed path outside the asset's own files
     (and any credential-like text); `push.sh` commits to `main`, re-applying on top of newer commits, and if anything
     refuses it commits a "failed" log entry instead, so every request ends in the log. Vercel redeploys.
3. Results: **Done** (published), **Waiting for approval** (held) or **Couldn't apply** (failed; nothing changed).

## What waits for approval, and how to approve
Held as a **proposal** (its source is kept in `engine/held/` and its preview shows in the change log): anything that
changes what the asset says (facts, claims, contact details), and, if `CHANGE_UPDATES` is `approve`, every update.
Held without a proposal: requests that need a photo, footage or AI imagery the kit doesn't have, unclear or unrelated
requests, and requests over the daily cap. Earnings or income claims are never made.

To approve: GitHub → this repo → **Actions** → **Creative change** → **Run workflow** → paste the request id from the
change log into **approve** → **Run**. A proposal is applied exactly as previewed (no new AI call). If the approval
fails for a temporary reason the proposal stays, so it can be approved again; if the asset changed after the proposal
was made, the proposal is dropped and the request can be sent again. A request held without a proposal runs again
from the start with only the daily cap waived (fact changes are still held).
Requests that need new photos or AI footage can't run automatically: ask in Claude, where AI generation is quoted
first.

## Switching it on (one time, by the account owner)
1. **Anthropic API key** → GitHub: this repo → Settings → Secrets and variables → Actions → New repository secret
   `ANTHROPIC_API_KEY`. Each request makes up to five model calls; the tokens used are logged in each request's log
   entry and billed to that key's account at Anthropic's current rates.
2. **Dispatch token** → a fine-grained GitHub personal access token for **only this repository** with
   **Actions: Read and write** (it can start the workflow and read its runs; it cannot push code) → Vercel: the hub
   project → Settings → Environment Variables → `GITHUB_DISPATCH_TOKEN` (Production) → redeploy. Treat it like an
   owner credential: whoever holds it can also start an approval run, which publishes a held proposal.
3. Optional: `VERCEL_DEPLOY_HOOK` secret (a Vercel deploy hook URL) if bot pushes ever stop triggering deploys;
   repository variables `CHANGE_MODEL` (default `claude-opus-5-5`), `CHANGE_DAILY_CAP` (default 30; set the same
   number as a Vercel env var `CHANGE_DAILY_CAP` so the site refuses early) and `CHANGE_UPDATES` (`auto` or `approve`).
Never paste a key or token into a chat.

## Limits and notes (honest)
- **Updates publish without a person in the loop**, as asked: someone with the link can change a published asset's
  design and wording. The checks above stop new facts, claims, contact details, scripts, outside files and
  off-brand colors and fonts, but not every unwanted wording (a reworded headline is, by design, allowed). Every
  change is in the public log and in git, and any version can be restored. Set `CHANGE_UPDATES=approve` to make
  every update wait for approval instead.
- Each request commits a log entry to `main`, which redeploys the site; the daily cap bounds that.
- Two requests for the same asset sent within seconds of each other may both start; the second then ends as
  "Couldn't apply" (the asset changed meanwhile) and can be sent again. Nothing is ever lost silently.
- The repo is public, so Actions logs are public: the workflow never prints request text or model output, and the
  run name shows only the asset key.
- Videos and Reels take longer (a full re-render, about 15–20 minutes end to end).
- Tests without an API key: `CHANGE_MOCK=<file.json>` makes `process.mjs` read the model's answers from a file
  (`{"submit_change":[{…}],"submit_review":[{…}]}`); `PUSH_URL` points `push.sh` at a test remote.
