# Change requests: the box under every creative

Anyone with the hub's link can type a change under an image, flyer, video or Reel and choose **Update this one**
(the file is replaced) or **New variation** (a new version is added next to the original). This folder is the
pipeline that does the work.

## How a request flows
1. **Site** (`src/components/ChangeBox.tsx` → `src/app/api/requests/route.ts`): checks the request (known asset key,
   3–500 characters, same-origin, honeypot, 6 requests per 10 minutes per device) and sends a GitHub
   `repository_dispatch` (`creative-change`) to this repo. Request text is never stored by the site.
2. **Workflow** (`.github/workflows/creative-change.yml`, one run at a time per asset):
   - `intake.mjs` turns the trigger into `.request/request.json`;
   - `process.mjs` asks Claude (Anthropic API, no tools) for a new version of the asset's single source file
     (`engine/creatives/<scope>/<kind>/<ID>.html|json`), then checks it deterministically: no scripts, handlers or
     web addresses, only `/kit/` files that exist, no new or changed facts (dates, times, numbers, prices, phone
     numbers, web addresses) unless approved; renders a preview with the network blocked, brand-lints it, has Claude
     review before and after once (and fix it if needed), and renders the final files;
   - `apply.mjs` puts the files, the new source and the catalogue change in place and writes the log entry
     `src/content/requests/<id>.json`; `guard.mjs` refuses any changed path outside that list or anything that looks
     like a credential;
   - the site is built once to prove it still builds, then `push.sh` commits to `main` (re-applying on top of any
     newer commit) and Vercel redeploys. The log shows on the library page under **Change requests**.
3. Results: **Done** (published), **Waiting for approval** (held) or **Couldn't apply** (failed; nothing changed).

## What waits for approval
Changes to a fact (date, day, time, venue, address, phone, price, number, name, web address, claims), anything that
needs a photo, footage or AI imagery the kit doesn't have, and requests that are unclear or not about the asset.
Earnings or income claims are never made. To approve a held request: GitHub → this repo → **Actions** →
**Creative change** → **Run workflow** → paste the request id from the change log → **Run**. (Requests that need
new photos or AI footage still can't run automatically: ask in Claude, where AI generation is quoted first.)

## Switching it on (one time, by the account owner)
1. **Anthropic API key** → GitHub: this repo → Settings → Secrets and variables → Actions → New repository secret
   `ANTHROPIC_API_KEY`. Each request makes up to three model calls; the tokens used are logged in each request's
   log entry, billed to that key's account at Anthropic's current rates.
2. **Dispatch token** → a fine-grained GitHub personal access token limited to this one repository with
   **Contents: Read and write** (that permission is what `repository_dispatch` needs) → Vercel: the hub project →
   Settings → Environment Variables → `GITHUB_DISPATCH_TOKEN` (Production) → redeploy.
3. Optional: `VERCEL_DEPLOY_HOOK` secret (a Vercel deploy hook URL) if bot pushes ever stop triggering deploys;
   repository variables `CHANGE_MODEL` (default `claude-opus-5-5`) and `CHANGE_DAILY_CAP` (default 30 a day).
Never paste a key or token into a chat.

## Limits and notes
- The repo is public, so Actions logs are public: the workflow never prints request text or model output.
- If several requests for the same asset arrive while one is running, GitHub keeps only the newest waiting run;
  a skipped request leaves no log entry and can be sent again.
- Videos and Reels take longer (a full re-render, about 15–20 minutes end to end).
- Tests without an API key: `CHANGE_MOCK=<file.json>` makes `process.mjs` read the model's answers from a file
  (`{"submit_change":[{…}],"submit_review":[{…}]}`).
