#!/usr/bin/env node
// city-photo.mjs: find and install a free, openly licensed city-view photo for the Events page.
//
// Source: the Openverse API (https://api.openverse.org), which indexes Flickr, Wikimedia Commons
// and other open collections. Only CC0, Public Domain Mark and CC BY are accepted by default;
// CC BY-SA only with --allow-sa. Every other license (NC, ND) is always refused.
//
//   node engine/tools/city-photo.mjs search "<City>, <ST>" [--query "extra terms"]...
//        [--only] [--limit 16] [--min-width 1024] [--source flickr,wordpress]
//        [--exclude-source wikimedia] [--allow-sa] [--no-previews] [--out <dir>]
//     Runs several sensible queries, merges and ranks the results, prints the top candidates
//     (id, size, license, title, creator, landing URL) and saves small previews plus
//     candidates.json to a temp directory it prints. --only runs just the --query terms.
//
//   node engine/tools/city-photo.mjs pick <slug> <openverseId> --name "<City>" --state <ST>
//        --alt "<plain description>" [--focus "50% 40%"] [--allow-sa] [--max-width 1600]
//        [--quality 85] [--min-width 1024] [--no-upgrade] [--force]
//     Downloads the image (for Flickr, first a larger 2048/1600 px copy from the photo's public
//     sizes page when the owner allows it; then the original URL; then Openverse's full-size
//     thumb endpoint), resizes it with python3 Pillow (<= max-width, keep aspect, JPEG q85
//     progressive, metadata stripped, converted to sRGB), writes public/media/cities/<slug>.jpg
//     and upserts the entry in src/content/cities.json. Paths are resolved from this script's
//     location, so it can run from any working directory.
//
// Node 20+, built-ins only. Needs python3 with Pillow (pip install pillow) for `pick`.
// Openverse anonymous limits (from its response headers): 20 searches/min, 200/day,
// 1000 thumbnails/day. The tool waits out a short 429 when the server says how long.
// Seen in Oct. 2026 from a cloud container: Openverse's thumb endpoint answers 424 for Wikimedia
// files (so previews fall back to Commons' own /thumb/ widths), and curl through the sandbox proxy
// got 429 from Wikimedia while this script's Node fetch was served; Flickr's static host refuses
// curl's default user agent but serves this tool's. Set CITY_PHOTO_UA to override the user agent.

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");
const OUT_DIR = join(REPO_ROOT, "public", "media", "cities");
const CITIES_JSON = join(REPO_ROOT, "src", "content", "cities.json");
const API = "https://api.openverse.org/v1/images/";
const UA = process.env.CITY_PHOTO_UA || "site-sundae-campaign-city-photo/1.0 (Openverse client; Node.js)";

const BASE_LICENSES = ["cc0", "pdm", "by"];
const LICENSE_LABEL = { cc0: "CC0", pdm: "Public Domain Mark", by: "CC BY", "by-sa": "CC BY-SA" };

const STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// ---------------------------------------------------------------- helpers

function die(msg, code = 1) {
  console.error(`city-photo: ${msg}`);
  process.exit(code);
}

function parseArgs(argv) {
  const positional = [];
  const opts = {};
  const repeatable = new Set(["query"]);
  const boolean = new Set(["allow-sa", "no-previews", "no-upgrade", "only", "force", "help"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { positional.push(...argv.slice(i + 1)); break; }
    if (a.startsWith("--")) {
      let key = a.slice(2);
      let val;
      const eq = key.indexOf("=");
      if (eq >= 0) { val = key.slice(eq + 1); key = key.slice(0, eq); }
      else if (boolean.has(key)) { val = true; }
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) { val = argv[++i]; }
      else { val = true; }
      if (repeatable.has(key)) (opts[key] ||= []).push(val);
      else opts[key] = val;
    } else positional.push(a);
  }
  return { positional, opts };
}

function intOpt(opts, key, dflt) {
  if (opts[key] === undefined) return dflt;
  const n = Number(opts[key]);
  if (!Number.isInteger(n) || n <= 0) die(`--${key} must be a positive integer`);
  return n;
}

function slugify(s) {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url, { accept, tries = 3, timeoutMs = 60000 } = {}) {
  let last;
  for (let attempt = 1; attempt <= tries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, ...(accept ? { Accept: accept } : {}) },
        redirect: "follow",
        signal: ctrl.signal,
      });
      if (res.status === 429 || res.status === 503) {
        const ra = Number(res.headers.get("retry-after"));
        // Only wait when the server asks for a short pause; long bans are reported, not waited out.
        if (attempt < tries && Number.isFinite(ra) && ra > 0 && ra <= 65) {
          await res.arrayBuffer().catch(() => {});
          console.error(`  (rate limited by ${new URL(url).host}; waiting ${ra}s)`);
          await sleep(ra * 1000 + 250);
          continue;
        }
      }
      return res;
    } catch (e) {
      last = e;
      if (attempt < tries) await sleep(1000 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw last ?? new Error(`fetch failed: ${url}`);
}

async function getJson(url) {
  const res = await fetchWithRetry(url, { accept: "application/json" });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

function sniffImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") return "webp";
  if (buf.slice(0, 3).toString("latin1") === "GIF") return "gif";
  if (buf.slice(4, 12).toString("latin1").startsWith("ftypavi")) return "avif";
  if (buf.slice(0, 2).toString("latin1") === "II" || buf.slice(0, 2).toString("latin1") === "MM") return "tiff";
  return null;
}

async function downloadImage(url) {
  const res = await fetchWithRetry(url, { accept: "image/jpeg,image/*;q=0.9,*/*;q=0.8" });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok) return { ok: false, status: res.status, why: `HTTP ${res.status}` };
  const kind = sniffImage(buf);
  if (!kind) return { ok: false, status: res.status, why: `not an image (${res.headers.get("content-type") || "?"})` };
  return { ok: true, buf, kind };
}

// Openverse indexes Flickr photos at the 1024 px "_b" size. When the owner allows it, the photo's
// public "sizes" page lists larger copies (2048 px "_k", 1600 px "_h") of the same photo under the
// same license. Best effort only: any failure falls through to the original URL and the thumb.
async function flickrLargerSizes(r) {
  if (r.provider !== "flickr" && r.source !== "flickr") return [];
  const m = String(r.foreign_landing_url || "").match(/flickr\.com\/photos\/([^/]+)\/(\d+)/);
  if (!m) return [];
  const [, owner, photoId] = m;
  const found = [];
  for (const label of ["k", "h"]) {
    try {
      const res = await fetchWithRetry(`https://www.flickr.com/photos/${owner}/${photoId}/sizes/${label}/`, { tries: 1, timeoutMs: 20000 });
      if (!res.ok) { await res.arrayBuffer().catch(() => {}); continue; }
      const html = await res.text();
      const re = new RegExp(`(?:https:)?//live\\.staticflickr\\.com/\\d+/${photoId}_[0-9a-f]+_${label}\\.jpg`);
      const hit = html.match(re);
      if (hit) found.push([`flickr-${label} (larger size from the photo's sizes page)`, hit[0].startsWith("//") ? `https:${hit[0]}` : hit[0]]);
    } catch {
      // ignore: the upgrade is optional
    }
    if (found.length) break; // the largest available size is enough
  }
  return found;
}

// Wikimedia Commons serves resized copies at standard widths (250, 330, 500, 960, 1280, 1920, ...)
// under /thumb/. Openverse's own thumb endpoint fails for Commons files (HTTP 424), so previews and
// the last-resort download use these instead. Returns null for anything that is not a plain
// Commons JPEG/PNG/WebP original URL, or when the original is not wider than the requested width.
function wikimediaThumb(r, width) {
  const m = String(r.url || "").match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+\.(?:jpe?g|png|webp))$/i);
  if (!m) return null;
  if (r.width && r.width <= width) return null;
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${m[3]}/${width}px-${m[3]}`;
}

function cleanTitle(t) {
  return String(t || "").replace(/^File:/i, "").replace(/\.(jpe?g|png|tiff?|webp|gif)$/i, "").trim();
}

function licenseLabel(r) {
  const base = LICENSE_LABEL[r.license] || r.license.toUpperCase();
  return r.license_version ? `${base} ${r.license_version}` : base;
}

function allowedLicenses(allowSa) {
  return allowSa ? [...BASE_LICENSES, "by-sa"] : BASE_LICENSES;
}

function parseCity(s) {
  const m = String(s).match(/^\s*(.+?)\s*,\s*([A-Za-z]{2})\s*$/);
  if (!m) die(`city must look like "<City>, <ST>" (got "${s}")`);
  const st = m[2].toUpperCase();
  if (!STATES[st]) die(`unknown state code "${st}"`);
  return { city: m[1], st, stateName: STATES[st] };
}

function haystack(r) {
  const tags = (r.tags || []).map((t) => t.name).join(" ");
  return `${r.title || ""} ${tags} ${r.foreign_landing_url || ""}`.toLowerCase();
}

// ---------------------------------------------------------------- search

async function cmdSearch(positional, opts) {
  if (!positional[0]) die('usage: search "<City>, <ST>" [--query "extra terms"]');
  const { city, st, stateName } = parseCity(positional[0]);
  const limit = intOpt(opts, "limit", 16);
  const minWidth = intOpt(opts, "min-width", 1024);
  const licenses = allowedLicenses(!!opts["allow-sa"]);

  const queries = opts.only ? [] : [
    `${city} ${stateName}`,
    `${city} skyline`,
    `${city} downtown`,
    `${city} cityscape`,
    `${city} aerial view`,
    `${city} waterfront`,
  ];
  for (const extra of opts.query || []) {
    if (typeof extra !== "string" || !extra.trim()) continue;
    const q = extra.toLowerCase().includes(city.toLowerCase()) ? extra : `${city} ${extra}`;
    queries.unshift(q); // user-supplied terms go first: they are the most specific
  }
  if (!queries.length) die("--only needs at least one --query");

  const cityKey = city.toLowerCase();
  const cityKeyTight = cityKey.replace(/[^a-z0-9]/g, "");
  const stateKeys = [stateName.toLowerCase(), stateName.toLowerCase().replace(/\s+/g, ""), ` ${st.toLowerCase()} `, `, ${st.toLowerCase()}`];

  const seen = new Map();
  for (const [qi, q] of queries.entries()) {
    const params = new URLSearchParams({ q, license: licenses.join(","), page_size: "20", aspect_ratio: "wide" });
    if (typeof opts.source === "string") params.set("source", opts.source);
    if (typeof opts["exclude-source"] === "string") params.set("excluded_source", opts["exclude-source"]);
    let data;
    try {
      data = await getJson(`${API}?${params}`);
    } catch (e) {
      console.error(`  query "${q}" failed: ${e.message}`);
      continue;
    }
    console.error(`  query "${q}": ${data.result_count} results`);
    (data.results || []).forEach((r, rank) => {
      const prev = seen.get(r.id);
      const score = 1 / (rank + 1) + (qi < (opts.query || []).length ? 0.5 : 0);
      if (prev) { prev.score += score; prev.queries.push(q); return; }
      seen.set(r.id, { r, score, queries: [q] });
    });
  }

  const candidates = [...seen.values()]
    .map((c) => {
      const h = haystack(c.r);
      const cityMatch = h.includes(cityKey) || h.includes(cityKeyTight);
      const stateMatch = stateKeys.some((k) => h.includes(k)) || (c.r.title || "").toLowerCase().includes(`, ${st.toLowerCase()}`);
      const w = c.r.width || 0, ht = c.r.height || 0;
      let rank = c.score + (cityMatch ? 2 : 0) + (stateMatch ? 0.5 : 0) + (w >= 1600 ? 0.3 : 0);
      return { ...c, cityMatch, stateMatch, rank };
    })
    .filter((c) => licenses.includes(c.r.license))
    .filter((c) => (c.r.width || 0) >= minWidth && (c.r.width || 0) > (c.r.height || 0))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit);

  if (!candidates.length) die(`no eligible candidates (landscape, >= ${minWidth}px wide, ${licenses.join("/")})`, 2);

  const outDir = typeof opts.out === "string"
    ? (mkdirSync(resolve(opts.out), { recursive: true }), resolve(opts.out))
    : mkdtempSync(join(tmpdir(), `city-photo-${slugify(`${city}-${st}`)}-`));

  const rows = [];
  const doPreviews = !opts["no-previews"];
  for (const [i, c] of candidates.entries()) {
    const r = c.r;
    const n = String(i + 1).padStart(2, "0");
    let preview = null, previewNote = "";
    if (doPreviews) {
      const sources = [`${API}${r.id}/thumb/`, wikimediaThumb(r, 500)].filter(Boolean);
      const whys = [];
      for (const src of sources) {
        try {
          const got = await downloadImage(src);
          if (got.ok) {
            preview = join(outDir, `${n}-${r.id.slice(0, 8)}.${got.kind === "jpeg" ? "jpg" : got.kind}`);
            writeFileSync(preview, got.buf);
            break;
          }
          whys.push(got.why);
        } catch (e) {
          whys.push(e.message);
        }
      }
      if (!preview) previewNote = `no preview (${whys.join("; ")}; the full download may fail too)`;
    }
    rows.push({
      n: i + 1, id: r.id, width: r.width, height: r.height, license: licenseLabel(r),
      provider: r.provider, title: cleanTitle(r.title), creator: r.creator || null,
      landing: r.foreign_landing_url, cityMatch: c.cityMatch, stateMatch: c.stateMatch,
      preview, previewNote, queries: c.queries,
    });
  }

  writeFileSync(join(outDir, "candidates.json"), JSON.stringify(rows, null, 2) + "\n");

  console.log(`\nTop ${rows.length} candidates for ${city}, ${st} (city/state = name found in title, tags or landing URL):\n`);
  for (const row of rows) {
    const flags = `${row.cityMatch ? "city" : "----"}/${row.stateMatch ? "state" : "-----"}`;
    console.log(`${String(row.n).padStart(2)}. ${row.id}  ${row.width}x${row.height}  ${row.license}  [${row.provider}]  ${flags}`);
    console.log(`    "${row.title}" by ${row.creator ?? "unknown"}`);
    console.log(`    ${row.landing}`);
    if (row.preview) console.log(`    preview: ${row.preview}`);
    else if (row.previewNote) console.log(`    ${row.previewNote}`);
  }
  if (rows.some((row) => row.provider === "flickr")) {
    console.log(`\nFlickr sizes are the 1024 px copy Openverse indexes; pick fetches a 2048/1600 px copy when the owner allows it.`);
  }
  console.log(`\nPreviews and candidates.json: ${outDir}`);
  const self = fileURLToPath(import.meta.url);
  const rel = relative(process.cwd(), self);
  const shown = rel && !rel.startsWith("..") ? rel : self;
  console.log(`Next: look at the previews, confirm the place on the landing page, then\n  node ${shown} pick <slug> <openverseId> --name "${city}" --state ${st} --alt "..." [--focus "50% 50%"]`);
}

// ---------------------------------------------------------------- pick

const PY_RESIZE = String.raw`
import sys, io, json
from PIL import Image, ImageOps
src, dst, max_w, quality = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src)
im.load()
src_w, src_h = im.size
im = ImageOps.exif_transpose(im)
icc = im.info.get("icc_profile")
if im.mode not in ("RGB", "L"):
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
if icc:
    try:
        from PIL import ImageCms
        im = ImageCms.profileToProfile(im, ImageCms.ImageCmsProfile(io.BytesIO(icc)), ImageCms.createProfile("sRGB"), outputMode="RGB")
    except Exception:
        pass
if im.mode != "RGB":
    im = im.convert("RGB")
if im.width > max_w:
    h = round(im.height * max_w / im.width)
    im = im.resize((max_w, h), Image.LANCZOS)
clean = Image.new("RGB", im.size)
clean.paste(im)
clean.save(dst, "JPEG", quality=quality, progressive=True, optimize=True)
print(json.dumps({"srcWidth": src_w, "srcHeight": src_h, "width": clean.width, "height": clean.height}))
`;

async function cmdPick(positional, opts) {
  const [slug, id] = positional;
  if (!slug || !id) die('usage: pick <slug> <openverseId> --name "<City>" --state <ST> --alt "..." [--focus "50% 50%"]');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) die(`slug must be lowercase-kebab (got "${slug}")`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) die(`openverseId must be the full Openverse UUID (got "${id}")`);
  const name = typeof opts.name === "string" ? opts.name.trim() : "";
  const state = typeof opts.state === "string" ? opts.state.trim().toUpperCase() : "";
  const alt = typeof opts.alt === "string" ? opts.alt.trim() : "";
  const focus = typeof opts.focus === "string" ? opts.focus.trim() : "50% 50%";
  if (!name) die("--name is required");
  if (!STATES[state]) die("--state must be a two-letter US state code");
  if (!alt) die("--alt is required (a plain description of what the photo shows)");
  if (!/^\d{1,3}(?:\.\d+)?% \d{1,3}(?:\.\d+)?%$/.test(focus)) die(`--focus must look like "50% 40%" (got "${focus}")`);
  const maxWidth = intOpt(opts, "max-width", 1600);
  const quality = intOpt(opts, "quality", 85);
  const minWidth = intOpt(opts, "min-width", 1024);

  const r = await getJson(`${API}${id}/`);
  const licenses = allowedLicenses(!!opts["allow-sa"]);
  if (!licenses.includes(r.license)) {
    const hint = r.license === "by-sa" ? " (pass --allow-sa to accept CC BY-SA, and credit it as share-alike)" : "";
    die(`refusing license "${licenseLabel(r)}" for ${id}; allowed: ${licenses.join(", ")}${hint}`, 3);
  }
  console.error(`  ${cleanTitle(r.title)} by ${r.creator ?? "unknown"} - ${licenseLabel(r)} [${r.provider}] ${r.width}x${r.height}`);

  const tmp = mkdtempSync(join(tmpdir(), "city-photo-pick-"));
  try {
    const attempts = [
      ...(opts["no-upgrade"] ? [] : await flickrLargerSizes(r)),
      ["original", r.url],
      ["wikimedia-1920", wikimediaThumb(r, 1920)],
      ["openverse-thumb-full", `${API}${id}/thumb/?full_size=true`],
    ].filter(([, u]) => !!u);
    let got = null, via = null;
    for (const [label, u] of attempts) {
      try {
        const d = await downloadImage(u);
        if (d.ok) { got = d; via = label; break; }
        console.error(`  ${label}: ${d.why}`);
      } catch (e) {
        console.error(`  ${label}: ${e.message}`);
      }
    }
    if (!got) die("could not download the image from the original URL or Openverse's thumb endpoint; pick another candidate or save the file by hand from the landing page", 4);
    const srcPath = join(tmp, `source.${got.kind === "jpeg" ? "jpg" : got.kind}`);
    writeFileSync(srcPath, got.buf);
    console.error(`  downloaded via ${via}: ${got.buf.length} bytes`);

    mkdirSync(OUT_DIR, { recursive: true });
    const outPath = join(OUT_DIR, `${slug}.jpg`);
    const tmpOut = join(tmp, "out.jpg");
    const py = spawnSync("python3", ["-I", "-c", PY_RESIZE, srcPath, tmpOut, String(maxWidth), String(quality)], { encoding: "utf8" });
    if (py.error) die(`python3 not runnable: ${py.error.message}`);
    if (py.status !== 0) {
      const err = py.stderr || "";
      if (/No module named 'PIL'/.test(err)) die("Pillow is missing: pip install pillow");
      die(`resize failed: ${err.trim().split("\n").slice(-3).join(" | ")}`);
    }
    const dims = JSON.parse(py.stdout.trim().split("\n").pop());
    if (dims.srcWidth < minWidth && !opts.force) {
      die(`downloaded image is only ${dims.srcWidth}px wide (minimum ${minWidth}); pick another or pass --force`, 5);
    }
    if (dims.width <= dims.height && !opts.force) die(`image is not landscape (${dims.width}x${dims.height}); pass --force to keep it`, 5);
    copyFileSync(tmpOut, outPath); // copy, not rename: the temp dir may be on another device
    const bytes = statSync(outPath).size;

    const entry = {
      name,
      state,
      file: `/media/cities/${slug}.jpg`,
      width: dims.width,
      height: dims.height,
      alt,
      focus,
      credit: {
        title: cleanTitle(r.title),
        creator: r.creator || "Unknown",
        creatorUrl: r.creator_url || null,
        license: licenseLabel(r),
        licenseUrl: r.license_url,
        sourceUrl: r.foreign_landing_url,
        provider: r.provider,
      },
      openverseId: r.id,
    };
    let all = {};
    if (existsSync(CITIES_JSON)) {
      try { all = JSON.parse(readFileSync(CITIES_JSON, "utf8")); } catch (e) { die(`${relative(REPO_ROOT, CITIES_JSON)} is not valid JSON: ${e.message}`); }
    }
    all[slug] = entry;
    mkdirSync(dirname(CITIES_JSON), { recursive: true });
    writeFileSync(CITIES_JSON, JSON.stringify(all, null, 2) + "\n");

    console.log(`wrote ${relative(REPO_ROOT, outPath)}  ${dims.width}x${dims.height}  ${(bytes / 1024).toFixed(0)} KB  (source ${dims.srcWidth}x${dims.srcHeight} via ${via})`);
    console.log(`upserted "${slug}" in ${relative(REPO_ROOT, CITIES_JSON)}`);
    console.log(`credit: "${entry.credit.title}" by ${entry.credit.creator}, ${entry.credit.license} (${entry.credit.sourceUrl})`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- main

const HELP = `city-photo: open-licensed city photos from Openverse for the Events page

  search "<City>, <ST>" [--query "extra terms"]... [--only] [--limit 16] [--min-width 1024]
         [--source flickr] [--exclude-source wikimedia] [--allow-sa] [--no-previews] [--out <dir>]
  pick <slug> <openverseId> --name "<City>" --state <ST> --alt "..." [--focus "50% 50%"]
         [--allow-sa] [--max-width 1600] [--quality 85] [--min-width 1024] [--no-upgrade] [--force]

Writes public/media/cities/<slug>.jpg and upserts src/content/cities.json (repo: ${REPO_ROOT}).`;

const [cmd, ...rest] = process.argv.slice(2);
const { positional, opts } = parseArgs(rest);
if (!cmd || cmd === "help" || cmd === "--help" || cmd === "-h" || opts.help) {
  console.log(HELP);
} else if (cmd === "search") {
  await cmdSearch(positional, opts);
} else if (cmd === "pick") {
  await cmdPick(positional, opts);
} else {
  die(`unknown command "${cmd}"\n\n${HELP}`);
}
