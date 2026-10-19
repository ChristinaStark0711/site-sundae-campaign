# Sundae render engine

Re-renders Sundae's delivered creatives (images, flyers + PDFs, videos, Reels) **one asset at a time** from a
per-asset source file, so a GitHub Action can rebuild just the asset that changed. It was moved here from the
studio's `clients/sundae/marketing/{source,render-kit}/` and reproduces the deliveries in
`public/media/` exactly: every still is byte-identical and every video is within render noise (see
[Verification](#verification)).

## Layout

```
engine/
  creatives/                         ONE source file per delivered asset (authoritative, see below)
    events/<event-slug>/{images,flyers}/<ID>.html     static HTML, canvas = width:Npx;height:Npx
    events/<event-slug>/{videos,reels}/<ID>.json      motion spec for kit/engine.js
    brand/{images,flyers,videos,reels}/…              always-on membership assets
  kit/                               shared, served at /kit/
    base.css  local-fonts.css  fonts/*.woff2          Merriweather + Lato only (BRAND-SPEC §3)
    assets/*                                          photos, cutouts, QR codes, wordmarks
    engine.js  engine.css  gsap.min.js                the motion engine (scenes → one paused GSAP timeline)
    aiclips/*.mp4                                     the 9 Kling B-roll clips (frames extracted on demand)
  serve.mjs   render.mjs   lint.mjs
  package.json  package-lock.json                     playwright 1.56.1 (Chromium 141, build 1194)
  .cache/  out/  node_modules/                        git-ignored
```

The asset ID is the file name: `images/05B.html` is library image `05B`, `videos/V1.json` is `V1`, `reels/R7.json`
is `R7`. The kind comes from the parent folder name (`images|flyers|videos|reels`).

## Commands

```bash
node engine/render.mjs <source> <out-dir> [--name <basename>] [--preview] [--timeout <sec>]
node engine/lint.mjs   <source> [--min 16] [--json <file>]
node engine/serve.mjs  [port]      # browse by hand: /creatives/…/01.html, /__video?spec=creatives/…/R7.json
```

`<source>` is resolved against the cwd, then against `engine/`, and must live inside `engine/`. `<out-dir>` is
relative to the cwd. `--name` defaults to the source's own basename; pass the delivered file name, e.g.

```bash
node engine/render.mjs engine/creatives/events/manhattan-beach-2026-10-08/images/01.html public/media/images --name 01-save-your-seat
node engine/render.mjs engine/creatives/events/manhattan-beach-2026-10-08/reels/R7.json public/media/reels --name reel-07-seats-limited
```

| Kind | Output (the delivered formats) |
|---|---|
| images | 1x screenshot → `<name>.jpg` (Pillow `quality=90, optimize=True`) |
| flyers | 2x screenshot → `<name>.jpg` (same) + `<name>.pdf` (CSS page size, backgrounds, first page) |
| videos, reels | 30 fps seek + screenshot → `<name>.mp4` (libx264 `-preset slow`, CRF `spec.crf` or 20, yuv420p, `+faststart`) + `<name>-poster.jpg` at `spec.poster` (else min(total − 0.5, 2.2) s) |
| `--preview` | images/flyers → `<name>.preview.png` at 1x; videos/reels → `<name>.preview.jpg`, one settled frame per scene, tiled with scene labels. Long edge ≤ 1600 px (for an AI reviewer). |

`render.mjs` prints one line of JSON (`{"ok":true,"outputs":[…],…}`) and exits 1 with `render.mjs: ERROR: …` on
any failure: missing asset reference, non-`/kit/` reference, `<script>`/external URL/inline handler in a source,
page error, blocked request, timeout. Outputs are written only on success. It also exports
`renderAsset({ source, outDir, name, preview, timeoutSec })`, which returns the same summary object.

`lint.mjs` runs the studio's brand-lint checks (red text, non-brand font, contrast, palette, sizes, red present)
on the asset page at its canvas size; videos and Reels are checked at their poster time, counting only what is
visible then. It prints a JSON report. Exit codes: 0 pass, 1 hard violation (red text, non-brand font, low
contrast), 2 could not lint (bad source, missing asset, page error). Flyers legitimately report `small<16` (flyer
copy is 12–15 px per BRAND-SPEC §3); that count is advisory.

**Network:** every page can reach only the local server (127.0.0.1, random port). Any other request is aborted,
listed in the error, and fails the render. **Chromium:** `$CHROME_PATH`, else Playwright's bundled full Chromium
(`chromium.executablePath()`, the binary every delivery was rendered with). The headless-shell build gave
identical stills in testing too.

## Rules

1. **The source is authoritative.** From now on the files in `creatives/` are the single source of truth for each
   asset. Edit the source and re-render. Do not regenerate them from the studio's `images.py`/`flyers.py`, and do
   not edit the delivered JPG/MP4 directly. For videos, the JSON is authoritative (the studio's `make_specs.py`
   was already out of sync with it).
2. **Root-absolute `/kit/` paths only.** Every reference in a source is `/kit/base.css`, `/kit/assets/…`, or
   `url(/kit/assets/…)`. Fonts load as `/kit/fonts/…` through `/kit/local-fonts.css`. That way a source renders
   the same from any folder depth, so a new event can copy files anywhere under `creatives/`. In specs, images
   are bare file names from `kit/assets/` (`"img": "cy-night-table.jpg"`) and clips are names from `kit/aiclips/`
   (`"clip": "v-night-peek"`). `engine.js` resolves those to `/kit/assets/` and to
   `/cache/clips/<name>/f_%04d.jpg` (served from `engine/.cache/clips/`).
3. **Static HTML.** No `<script>`, no `http(s)://`, no inline event handlers in a source. `render.mjs` refuses them.
4. **Brand.** Every asset follows `clients/sundae/BRAND-SPEC.md` in the studio repo: no red text, Merriweather +
   Lato only, `#4A4A4A` copy, red on every canvas, AP style. Run `lint.mjs` before shipping.

## Add or change an asset

- **Change one:** edit its source, then render it with `--preview` and look. Run `lint.mjs`, then render it for
  real into `public/media/<kind>/` with `--name <delivered basename>`.
- **New event:** copy `creatives/events/manhattan-beach-2026-10-08/` to `creatives/events/<new-slug>/`. In each
  HTML file, edit the facts (date, time, venue, city) in the copy. In each spec, add an `event` block (below) and
  change any scene text that names the old event. Name new files with their library ID.
- **New asset:** put the source in the right `<kind>` folder (the kind comes from the folder name). For a still,
  keep `width:Npx;height:Npx` on `html,body`. New photos go in `kit/assets/`, new clips in `kit/aiclips/`.

### The `event` block (videos and Reels)

The `details`, `date` and `cta` scenes show event facts when the spec does not spell them out. They come from an
optional top-level `event` object:

```json
"event": {
  "weekday": "Thursday", "month": "Oct.", "day": "8", "time": "7 p.m.",
  "venue": "The Courtyard at Shade Hotel", "venueShort": "The Courtyard at Shade",
  "hotel": "Shade Hotel", "city": "Manhattan Beach", "cityLine": "Manhattan Beach, California",
  "address": "1221 N. Valley Drive, Manhattan Beach", "included": "Dinner and drinks · Seats limited",
  "name": "Private Dinner & Dialogue", "nameLines": ["Private Dinner", "& Dialogue"],
  "hostLine": "with Josh Stech, co-founder and CEO", "pill": "Request your seat →"
}
```

| Field | Shown in |
|---|---|
| `weekday` `month` `day` `time` | details "When" and the CTA chip (`Thursday, Oct. 8 · 7 p.m.`); date card (`Oct.` / `8` / `Thursday · 7 p.m.`) |
| `venue` · `address` · `included` | details "Where", "Address", "Included" |
| `venueShort` · `cityLine` | date card |
| `hotel` + `city` | CTA place line (`Shade Hotel, Manhattan Beach`; `·` on Reels) |
| `name` | default eyebrow of `details` and `date` |
| `nameLines` | default CTA title (defaults to `[name]` when only `name` is given) |
| `hostLine` · `pill` | default CTA sub line and button |

- **No `event` block:** the values above (the Oct. 8, 2026 Manhattan Beach dinner) apply. Every existing spec
  relies on this and renders exactly as delivered.
- **With an `event` block:** every *fact* a scene actually shows (`weekday` … `included`) must be given. A missing
  one fails the render (`SPEC.event.venue is missing…`); the engine never falls back silently to Manhattan Beach.
  Only the series copy (`name`, `nameLines`, `hostLine`, `pill`) falls back. Unknown keys are an error.
- Values are HTML, like every spec string: `<br>` works, and a literal `<` must be written `&lt;`.
- Per-scene overrides still win: `o.kicker`, `o.title`, `o.rows` (details), `o.sub`, `o.when`, `o.pill` (cta).
- Dates are recognised generically (any weekday; `Jan.`/`Feb.`/`Aug.`/`Sept.`/`Oct.`/`Nov.`/`Dec.`; a full month name
  followed by a day; any `a.m.`/`p.m.`). A recognised date in an eyebrow over a photo, or in the brand-bar `tag`,
  becomes a blue date chip.
- The `josh` scene's defaults (Josh Stech's title and bio) are host facts, not event facts. Override them per scene
  (`kicker`, `title`, `sub`, `facts`) if an event has a different host.

## CI

```bash
cd engine && npm ci && npx playwright install --with-deps chromium
node render.mjs creatives/events/<slug>/images/01.html ../public/media/images --name 01-save-your-seat
```

Also required: `ffmpeg` (with libx264) and `python3` with Pillow (`pip install pillow`). With no `CHROME_PATH`,
the engine uses the Chromium that `playwright install` downloads, which is the same build 1194 the deliveries
used. The first video render extracts clip frames into `engine/.cache/clips/` (about 1 s per clip). Cache that
folder between runs if you like; it is re-extracted whenever a clip's SHA-1 changes. Rough timings on 4 vCPU:
a still takes 2–3 s; a 12 s Reel takes about 65 s.

## Verification

Done on 2026-10-19 with chromium-1194:

- All 12 images and all 14 flyer JPGs are **byte-identical** to `public/media/`. Flyer PDFs rasterize
  pixel-identical; only `/CreationDate` and `/Title` differ.
- Videos are near-identical, with run-to-run variation:
  - R7: PSNR avg 55.1–66.5 dB over 2 runs. V6: 52.4–65.7 dB over 4 runs.
  - The poster frames were byte-identical in the final runs.
- The engine builds an identical DOM at every 0.5 s step of all 16 specs, before and after the `event` block
  change. The variation is Chromium rasterization: the clip-frame decode path changes between runs (about ±1–2
  levels across a clip scene, ~52 dB). The pre-change engine.js shows the same two modes. It is invisible.
- Flyer 05 is rendered from the current generator output. The studio README's "legacy `top:400px`" file is
  the pre-brand-refresh design and does **not** match the delivered flyer.

Site build note: Tailwind v4 auto-detects sources, so it also scans `engine/`. That adds 5 utilities (`inline
italic resize ring shrink`, +427 B of CSS) and no visual change. To exclude the folder, add
`@source not "../../engine";` to `src/app/globals.css`.
