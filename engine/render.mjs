// render.mjs — render ONE Sundae creative from its source file.
//
//   node engine/render.mjs <source-file> <out-dir> [--name <basename>] [--preview] [--timeout <sec>]
//
//   <source-file>  creatives/**/{images,flyers}/<ID>.html or creatives/**/{videos,reels}/<ID>.json
//                  (relative to the cwd, else to engine/; it must live inside engine/ because it is served from there)
//   <out-dir>      relative to the cwd; created if missing
//   --name         output basename (default: the source's own basename, e.g. "01"); pass the delivered name,
//                  e.g. --name 01-save-your-seat
//   --preview      quick review render instead: images/flyers → <name>.preview.png (1x), videos/reels →
//                  <name>.preview.jpg (one settled frame per scene, tiled); long edge ≤ 1600 px
//
// Outputs (the delivered formats):
//   images  1x screenshot → <name>.jpg (PIL quality 90, optimize=True)
//   flyers  2x screenshot → <name>.jpg (same) + <name>.pdf (CSS size, printBackground, first page)
//   videos/reels  30 fps seek+screenshot → <name>.mp4 (libx264 slow, CRF spec.crf||20, yuv420p, +faststart)
//                 + <name>-poster.jpg (at spec.poster, else min(total-0.5, 2.2) s)
// Prints one line of JSON to stdout; exits non-zero on any failure (missing asset, page error, blocked request, timeout).
// Chromium: $CHROME_PATH, else Playwright's bundled Chromium (the full chromium build, as used for every delivery).
// All network access except the local engine server is blocked (WebSockets included). The change pipeline audits
// every candidate source with JavaScript switched off before it is rendered (engine/change/audit.mjs).
import { chromium } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { start, ENGINE_DIR, fileFor } from './serve.mjs';
import { renderRecordFile, sha256 } from './tools/ap.mjs';

export { ENGINE_DIR };
export const KINDS = ['images', 'flyers', 'videos', 'reels'];
export const FPS = 30;
export const PREVIEW_MAX = 1600;
const PY = process.env.PYTHON || 'python3';

export class RenderError extends Error {}
const fail = (msg) => { throw new RenderError(msg); };

// ------------------------------------------------------------------------------------------------ sources
export function resolveSource(p) {
  if (!p) fail('no source file given');
  const cands = path.isAbsolute(p) ? [p] : [path.resolve(process.cwd(), p), path.resolve(ENGINE_DIR, p)];
  const hit = cands.find(c => { try { return fs.statSync(c).isFile(); } catch { return false; } });
  if (!hit) fail(`source not found: ${p} (looked at ${[...new Set(cands)].join(' and ')})`);
  const abs = fs.realpathSync(hit);
  const rel = path.relative(ENGINE_DIR, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) fail(`source must live inside ${ENGINE_DIR} (it is served from there): ${abs}`);
  const kind = path.basename(path.dirname(abs));
  if (!KINDS.includes(kind)) fail(`cannot tell the asset kind of ${rel}: its parent folder is "${kind}", expected one of ${KINDS.join('|')}`);
  const ext = path.extname(abs).toLowerCase();
  const want = kind === 'images' || kind === 'flyers' ? '.html' : '.json';
  if (ext !== want) fail(`${rel}: a ${kind} source must be a ${want} file`);
  return { abs, rel: rel.split(path.sep).join('/'), kind, stem: path.basename(abs, ext) };
}

export function canvasOf(html, label = 'source') {
  const m = html.match(/width:(\d+)px;height:(\d+)px/); // same rule as the studio's shoot.mjs
  if (!m) fail(`${label}: no "width:Npx;height:Npx" canvas size found`);
  return { w: +m[1], h: +m[2] };
}

const kitFile = (u) => path.join(ENGINE_DIR, ...u.split('?')[0].split('#')[0].split('/').filter(Boolean).map(decodeURIComponent));

// Static-HTML policy + every kit reference must exist. Returns a list of problems (empty = fine).
export function checkHtmlSource(html) {
  const out = [];
  if (/<script/i.test(html)) out.push('contains <script> (creative sources are static HTML)');
  const ext = html.match(/https?:\/\/[^\s"')<]+/gi); if (ext) out.push(`external reference(s): ${[...new Set(ext)].join(', ')}`);
  const on = html.match(/[\s/"']on[a-z]+\s*=/gi); if (on) out.push(`inline event handler(s): ${[...new Set(on.map(s => s.trim()))].join(', ')}`);
  const refs = [...html.matchAll(/\b(?:href|src)\s*=\s*"([^"]*)"|\b(?:href|src)\s*=\s*'([^']*)'|url\(\s*([^)]*?)\s*\)/gi)].map(m => (m[1] ?? m[2] ?? m[3]).replace(/^['"]|['"]$/g, ''));
  for (const r of refs) {
    if (!r || r.startsWith('data:') || r.startsWith('#')) continue;
    if (!r.startsWith('/kit/')) { out.push(`reference is not root-absolute /kit/…: ${r}`); continue; }
    if (!fs.existsSync(kitFile(r))) out.push(`missing asset reference: ${r}`);
  }
  for (const imp of html.matchAll(/@import\s+url\(\s*['"]?([^'")]+)/gi)) if (!imp[1].startsWith('/kit/')) out.push(`@import is not /kit/…: ${imp[1]}`);
  return out;
}

export function loadSpec(src) {
  let spec;
  try { spec = JSON.parse(fs.readFileSync(src.abs, 'utf8')); } catch (e) { fail(`${src.rel}: not valid JSON (${e.message})`); }
  if (!(spec.w > 0 && spec.h > 0) || !Array.isArray(spec.scenes) || !spec.scenes.length) fail(`${src.rel}: a spec needs w, h and a non-empty scenes[]`);
  const missing = [];
  const need = new Set(['josh-polo-cutout.png', 'sundae-wordmark-red.svg']); // used by the engine itself
  spec.scenes.forEach((s, i) => {
    if (!(s.dur > 0)) missing.push(`scene ${i + 1}: no positive "dur"`);
    for (const k of ['img', 'side']) if (s[k]) need.add(s[k]);
    for (const x of s.imgs || []) need.add(x);
    if (s.type === 'clip' && !fs.existsSync(path.join(ENGINE_DIR, 'kit', 'aiclips', `${s.clip}.mp4`))) missing.push(`scene ${i + 1}: missing AI clip kit/aiclips/${s.clip}.mp4`);
  });
  for (const a of need) if (/[\\/]|^\./.test(a) || !fs.existsSync(path.join(ENGINE_DIR, 'kit', 'assets', a))) missing.push(`missing asset reference: kit/assets/${a}`);
  if (missing.length) fail(`${src.rel}: ${missing.join('; ')}`);
  return spec;
}

export const posterTime = (spec, total) => spec.poster ?? Math.min(total - 0.5, 2.2);

// ------------------------------------------------------------------------------------------------ AI clip frames
// Exactly how build_workspace.sh made them: ffmpeg -i kit/aiclips/<name>.mp4 -vf fps=30 -q:v 3 .cache/clips/<name>/f_%04d.jpg
export function ensureClipFrames(name, log = () => {}) {
  const mp4 = path.join(ENGINE_DIR, 'kit', 'aiclips', `${name}.mp4`);
  if (!fs.existsSync(mp4)) fail(`missing AI clip kit/aiclips/${name}.mp4`);
  const base = path.join(ENGINE_DIR, '.cache', 'clips'); const dir = path.join(base, name);
  const sha = crypto.createHash('sha1').update(fs.readFileSync(mp4)).digest('hex');
  const count = d => { try { return fs.readdirSync(d).filter(f => /^f_\d{4}\.jpg$/.test(f)).length; } catch { return 0; } };
  try { const st = JSON.parse(fs.readFileSync(path.join(dir, '.src'), 'utf8')); if (st.sha1 === sha && st.frames > 0 && count(dir) === st.frames) return { name, frames: st.frames, extracted: false }; } catch { /* (re)extract */ }
  fs.mkdirSync(base, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(base, `.tmp-${name}-`));
  try {
    log(`extracting frames: ${name}`);
    execFileSync('ffmpeg', ['-nostdin', '-y', '-loglevel', 'error', '-i', mp4, '-vf', 'fps=30', '-q:v', '3', path.join(tmp, 'f_%04d.jpg')], { stdio: ['ignore', 'ignore', 'pipe'] });
    const n = count(tmp); if (!n) fail(`ffmpeg produced no frames for ${name}`);
    fs.writeFileSync(path.join(tmp, '.src'), JSON.stringify({ sha1: sha, frames: n }));
    fs.chmodSync(tmp, 0o755); // mkdtemp makes it 0700
    fs.rmSync(dir, { recursive: true, force: true }); fs.renameSync(tmp, dir);
    return { name, frames: n, extracted: true };
  } catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); if (e instanceof RenderError) throw e; fail(`frame extraction failed for ${name}: ${String(e.stderr || e.message).trim()}`); }
}

// ------------------------------------------------------------------------------------------------ browser
export function chromePath() {
  if (process.env.CHROME_PATH) {
    if (!fs.existsSync(process.env.CHROME_PATH)) fail(`CHROME_PATH does not exist: ${process.env.CHROME_PATH}`);
    return process.env.CHROME_PATH;
  }
  try { const p = chromium.executablePath(); if (p && fs.existsSync(p)) return p; } catch { /* fall through */ }
  return undefined; // Playwright's own default (headless shell)
}
export const launch = () => chromium.launch({ executablePath: chromePath() });

// A page that can only reach the local engine server; everything else is aborted and recorded.
// `js: false` loads a page with JavaScript switched off (used by engine/change/audit.mjs to inspect a source safely).
export async function openPage(browser, origin, { width, height, scale = 1, js = true }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, javaScriptEnabled: js });
  const issues = { blocked: [], http: [], failed: [], pageErrors: [], served: new Set() }; // served: local paths requested
  await context.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith(origin + '/')) { issues.served.add(u.slice(origin.length)); return route.continue(); }
    issues.blocked.push(u); return route.abort('blockedbyclient');
  });
  // WebSockets bypass context.route, so they are intercepted separately and closed
  await context.routeWebSocket(() => true, ws => { issues.blocked.push(ws.url()); ws.close().catch(() => {}); });
  const page = await context.newPage();
  const local = u => { try { return decodeURI(u.slice(origin.length)); } catch { return u.slice(origin.length); } };
  page.on('response', r => { if (r.status() >= 400) issues.http.push(`${r.status()} ${local(r.url())}`); });
  page.on('requestfailed', r => { const u = r.url(); if (u.startsWith(origin + '/')) issues.failed.push(`${local(u)} (${r.failure()?.errorText})`); });
  page.on('pageerror', e => issues.pageErrors.push(e.message));
  return { context, page, issues };
}
export function problems(issues) {
  const p = [];
  if (issues.blocked.length) p.push(`blocked non-local request(s): ${[...new Set(issues.blocked)].join(', ')}`);
  if (issues.http.length) p.push(`missing asset reference(s): ${[...new Set(issues.http)].join(', ')}`);
  if (issues.failed.length) p.push(`failed request(s): ${[...new Set(issues.failed)].join(', ')}`);
  if (issues.pageErrors.length) p.push(`page error(s): ${issues.pageErrors.join(' | ')}`);
  return p;
}

// Load a static creative and wait until fonts, <img>s and CSS background images are in (then 300 ms, as shoot.mjs did).
export async function loadStill(page, url) {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  const bad = await page.evaluate(async () => {
    await document.fonts.ready;
    const urls = new Set();
    for (const el of document.querySelectorAll('*')) {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') for (const m of bg.matchAll(/url\("?([^")]+)"?\)/g)) urls.add(m[1]);
    }
    const bad = [];
    await Promise.all([
      ...[...document.images].map(im => im.decode().catch(() => bad.push(im.getAttribute('src')))),
      ...[...urls].map(u => new Promise(r => { const i = new Image(); i.onload = r; i.onerror = () => { bad.push(u); r(); }; i.src = u; })),
    ]);
    return bad;
  });
  if (bad.length) fail(`image(s) failed to load: ${bad.join(', ')}`);
  await page.waitForTimeout(300);
}

// Load the motion-engine page for a spec and wait for window.READY (then 400 ms, as rendervid.mjs did).
export async function loadVideo(page, origin, src) {
  await page.goto(`${origin}/__video?spec=${encodeURIComponent(src.rel)}`, { waitUntil: 'load', timeout: 60000 });
  await page.evaluate(() => window.READY);
  await page.waitForTimeout(400);
  return page.evaluate(() => window.TOTAL);
}

// ------------------------------------------------------------------------------------------------ helpers
const py = (code, ...args) => {
  try { return execFileSync(PY, ['-c', code, ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim(); }
  catch (e) { fail(`${PY} failed: ${String(e.stderr || e.message).trim()}`); }
};
// exactly how every delivered JPG was saved (render-kit/README.md)
const PNG2JPG = "import sys\nfrom PIL import Image\nImage.open(sys.argv[1]).convert('RGB').save(sys.argv[2], quality=90, optimize=True)";
const SHRINK = "import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]); L=int(sys.argv[3]); s=min(1.0, L/max(im.size))\nif s<1: im=im.resize((max(1,round(im.width*s)),max(1,round(im.height*s))), Image.LANCZOS)\nim.save(sys.argv[2], optimize=True); print(im.width, im.height)";
const SHEET = `import sys, json, math
from PIL import Image, ImageDraw, ImageFont
a = json.loads(sys.argv[1]); L, gap, cap = a['max'], 8, 26
ims = [Image.open(t['path']).convert('RGB') for t in a['tiles']]
w, h = ims[0].size; ar = w / h; n = len(ims); best = None
for c in range(1, n + 1):
    r = math.ceil(n / c)
    th = min((L - (c - 1) * gap) / (c * ar), (L - (r - 1) * gap) / r - cap, h)
    if best is None or th > best[0] + 1e-6: best = (th, c, r)
th, c, r = best; th = int(th); tw = int(th * ar)
W = min(n, c) * tw + (min(n, c) - 1) * gap; H = r * (th + cap) + (r - 1) * gap
sheet = Image.new('RGB', (W, H), (51, 51, 51)); d = ImageDraw.Draw(sheet)
try: font = ImageFont.load_default(size=15)
except TypeError: font = ImageFont.load_default()
for i, (im, t) in enumerate(zip(ims, a['tiles'])):
    x = (i % c) * (tw + gap); y = (i // c) * (th + cap + gap)
    sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y))
    d.text((x + 6, y + th + 5), t['label'], fill=(255, 255, 255), font=font)
sheet.save(a['out'], quality=88, optimize=True); print(W, H)`;
const ffmpeg = (args) => {
  try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['ignore', 'ignore', 'pipe'] }); }
  catch (e) { fail(`ffmpeg failed: ${String(e.stderr || e.message).trim()}`); }
};
const show = p => { const r = path.relative(process.cwd(), p); return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : p; };
// One record per output in engine/.cache/renders/ ("Render records" in tools/ap.mjs): the output's hash and the hash of
// every file the render read (the source; the kit files, fonts and engine the page requested; the clips behind the
// frames it showed), so check-event can tell when an output is older than its sources. Never fails a render.
function recordRender(outs, src, served) {
  try {
    const deps = new Set([src.abs]);
    for (const u of served) {
      const p = u.split('?')[0], clip = /^\/cache\/clips\/([^/]+)\//.exec(p);
      if (p === '/__video') continue; // the spec, already in
      const f = clip ? path.join(ENGINE_DIR, 'kit/aiclips', `${decodeURIComponent(clip[1])}.mp4`) : fileFor(p);
      if (f && fs.existsSync(f) && fs.statSync(f).isFile()) deps.add(f);
    }
    const hashes = Object.fromEntries([...deps].sort().map(f => [path.relative(ENGINE_DIR, f), sha256(f)]));
    for (const out of outs) {
      const rf = renderRecordFile(ENGINE_DIR, out);
      fs.mkdirSync(path.dirname(rf), { recursive: true });
      fs.writeFileSync(rf, JSON.stringify({ output: out, outHash: sha256(out), source: src.rel, deps: hashes, at: new Date().toISOString() }, null, 1) + '\n');
    }
  } catch { /* the record only helps check-event */ }
}

// ------------------------------------------------------------------------------------------------ renderAsset
export async function renderAsset({ source, outDir, name, preview = false, timeoutSec, log = (m) => process.stderr.write(`render: ${m}\n`) } = {}) {
  const t0 = Date.now();
  const src = resolveSource(source);
  if (!outDir) fail('no output directory given');
  name = name || src.stem;
  if (/[\\/]/.test(name) || name.startsWith('.')) fail(`--name must be a plain basename: ${name}`);
  const video = src.kind === 'videos' || src.kind === 'reels';
  let canvas, spec;
  if (video) { spec = loadSpec(src); canvas = { w: spec.w, h: spec.h }; }
  else {
    const html = fs.readFileSync(src.abs, 'utf8');
    const bad = checkHtmlSource(html); if (bad.length) fail(`${src.rel}: ${bad.join('; ')}`);
    canvas = canvasOf(html, src.rel);
  }
  const clips = video ? [...new Set(spec.scenes.filter(s => s.type === 'clip').map(s => s.clip))].map(c => ensureClipFrames(c, log)) : [];

  const outAbs = path.resolve(process.cwd(), outDir);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sundae-render-'));
  let srv, browser, stage = 'starting', timedOut = false, timer;
  const limit = (timeoutSec ?? (video ? (preview ? 300 : 1800) : 180)) * 1000;
  const summary = { ok: true, kind: src.kind, source: src.rel, name, preview: !!preview, canvas: `${canvas.w}x${canvas.h}`, outputs: [] };
  try {
    timer = setTimeout(() => { timedOut = true; browser?.close().catch(() => {}); }, limit);
    stage = 'starting server'; srv = await start();
    stage = 'launching Chromium'; browser = await launch();
    summary.chromium = browser.version();
    const files = []; // [tmpPath, finalName]
    const blocked = [], served = new Set();
    const run = async (opts, fn) => {
      const { context, page, issues } = await openPage(browser, srv.url, opts);
      let err;
      try { await fn(page); } catch (e) { err = e; } finally { await context.close().catch(() => {}); }
      blocked.push(...issues.blocked); issues.served.forEach(u => served.add(u));
      const p = problems(issues); // the root cause (404, blocked request, page error) beats a downstream symptom
      if (p.length && !timedOut) fail(`${src.rel}: ${p.join('; ')}${err ? ` (then: ${String(err.message).split('\n')[0]})` : ''}`);
      if (err) throw err;
    };
    const pageUrl = `${srv.url}/${src.rel.split('/').map(encodeURIComponent).join('/')}`;

    if (!video && preview) {
      stage = 'preview screenshot';
      await run({ width: canvas.w, height: canvas.h, scale: 1 }, async page => { await loadStill(page, pageUrl); await page.screenshot({ path: path.join(tmp, 'p.png') }); });
      const dims = py(SHRINK, path.join(tmp, 'p.png'), path.join(tmp, 'out.png'), String(PREVIEW_MAX));
      files.push([path.join(tmp, 'out.png'), `${name}.preview.png`]); summary.previewSize = dims.replace(' ', 'x');
    } else if (!video) {
      const scale = src.kind === 'flyers' ? 2 : 1;
      stage = `screenshot at ${scale}x`;
      await run({ width: canvas.w, height: canvas.h, scale }, async page => { await loadStill(page, pageUrl); await page.screenshot({ path: path.join(tmp, 's.png') }); });
      py(PNG2JPG, path.join(tmp, 's.png'), path.join(tmp, 'out.jpg'));
      files.push([path.join(tmp, 'out.jpg'), `${name}.jpg`]);
      if (src.kind === 'flyers') {
        stage = 'printing PDF';
        await run({ width: canvas.w, height: canvas.h, scale: 1 }, async page => {
          await loadStill(page, pageUrl);
          await page.evaluate(t => { document.title = t; }, name); // PDF /Title (else Chromium uses the server URL); not rendered
          await page.pdf({ path: path.join(tmp, 'out.pdf'), width: canvas.w + 'px', height: canvas.h + 'px', printBackground: true, pageRanges: '1' });
        });
        files.push([path.join(tmp, 'out.pdf'), `${name}.pdf`]);
      }
    } else if (preview) {
      stage = 'preview frames';
      const tiles = [];
      await run({ width: canvas.w, height: canvas.h, scale: 1 }, async page => {
        await loadVideo(page, srv.url, src);
        let t = 0;
        for (const [i, s] of spec.scenes.entries()) {
          const at = t + Math.min(s.dur - 0.2, 2.6); // a settled frame, as preview.mjs picked it
          await page.evaluate(x => window.seekTo(x), at);
          const f = path.join(tmp, `scene_${i}.jpg`);
          await page.screenshot({ path: f, type: 'jpeg', quality: 90 });
          tiles.push({ path: f, label: `${i + 1} · ${s.type} · ${at.toFixed(2)}s` }); t += s.dur;
        }
      });
      const dims = py(SHEET, JSON.stringify({ tiles, out: path.join(tmp, 'out.jpg'), max: PREVIEW_MAX }));
      files.push([path.join(tmp, 'out.jpg'), `${name}.preview.jpg`]); summary.previewSize = dims.replace(' ', 'x'); summary.scenes = tiles.map(x => x.label);
    } else {
      const fdir = path.join(tmp, 'frames'); fs.mkdirSync(fdir);
      let total = 0, N = 0;
      await run({ width: canvas.w, height: canvas.h, scale: 1 }, async page => {
        stage = 'loading the motion engine';
        total = await loadVideo(page, srv.url, src); N = Math.round(total * FPS);
        for (let i = 0; i < N; i++) {
          stage = `frame ${i + 1}/${N}`;
          await page.evaluate(t => window.seekTo(t), i / FPS);
          await page.screenshot({ path: path.join(fdir, `f_${String(i).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 });
          if ((i + 1) % 150 === 0) log(`${name}: ${i + 1}/${N} frames`);
        }
      });
      stage = 'encoding';
      const mp4 = path.join(tmp, 'out.mp4'), poster = path.join(tmp, 'poster.jpg');
      ffmpeg(['-framerate', String(FPS), '-i', path.join(fdir, 'f_%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', String(spec.crf || 20), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
      ffmpeg(['-ss', String(posterTime(spec, total)), '-i', mp4, '-frames:v', '1', '-q:v', '3', poster]);
      files.push([mp4, `${name}.mp4`], [poster, `${name}-poster.jpg`]);
      Object.assign(summary, { frames: N, durationSec: +total.toFixed(3), posterSec: posterTime(spec, total) });
    }
    stage = 'writing outputs';
    fs.mkdirSync(outAbs, { recursive: true });
    const written = [];
    for (const [from, to] of files) { const dst = path.join(outAbs, to); fs.copyFileSync(from, dst); written.push(dst); summary.outputs.push(show(dst)); }
    if (!preview) recordRender(written, src, served);
    if (clips.length) summary.clips = clips.map(c => `${c.name}:${c.frames}${c.extracted ? ' (extracted)' : ''}`);
    summary.blockedRequests = [...new Set(blocked)];
    summary.seconds = +((Date.now() - t0) / 1000).toFixed(1);
    return summary;
  } catch (e) {
    if (timedOut) fail(`${src.rel}: timed out after ${limit / 1000}s while ${stage}`);
    if (e instanceof RenderError) throw e;
    fail(`${src.rel}: ${stage}: ${e.message.split('\n')[0]}`);
  } finally {
    clearTimeout(timer);
    await browser?.close().catch(() => {});
    await srv?.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------------------------------------ CLI
export function parseArgs(argv, flags = {}) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { pos.push(a); continue; }
    const k = a.slice(2);
    if (!(k in flags)) fail(`unknown option ${a}`);
    if (flags[k] === 'bool') opt[k] = true;
    else { if (i + 1 >= argv.length) fail(`${a} needs a value`); opt[k] = argv[++i]; }
  }
  return { pos, opt };
}

const isMain = () => { try { return pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url; } catch { return false; } };
if (isMain()) {
  const USAGE = 'usage: node engine/render.mjs <source-file> <out-dir> [--name <basename>] [--preview] [--timeout <sec>]';
  try {
    const { pos, opt } = parseArgs(process.argv.slice(2), { name: 'str', preview: 'bool', timeout: 'str', help: 'bool' });
    if (opt.help) { console.error(USAGE); process.exit(0); }
    if (pos.length !== 2) fail(USAGE);
    const timeoutSec = opt.timeout != null ? Number(opt.timeout) : undefined;
    if (timeoutSec != null && !(timeoutSec > 0)) fail('--timeout must be a positive number of seconds');
    const s = await renderAsset({ source: pos[0], outDir: pos[1], name: opt.name, preview: !!opt.preview, timeoutSec });
    console.log(JSON.stringify(s));
  } catch (e) {
    const msg = e instanceof RenderError ? e.message : (e.stack || String(e));
    console.error(`render.mjs: ERROR: ${msg}`);
    console.log(JSON.stringify({ ok: false, error: msg }));
    process.exit(1);
  }
}
