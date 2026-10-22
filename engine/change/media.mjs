// New pictures for a change request, when the kit has nothing that fits (process.mjs, decision "need_image"):
//   search  openly licensed photos on Openverse (it indexes Wikimedia Commons and Flickr): only licenses that allow
//           commercial use without share-alike (CC BY, CC0, public domain), at least MIN_WIDTH wide. The model looks at
//           the candidates and picks one, or none; the credit is built from the record, never written by the model.
//   ai      one image from Sundae's Higgsfield API account (SOUL V2), only when HF_API_KEY_ID/HF_API_KEY_SECRET are set,
//           the estimate is known, and the last 24 hours' AI spend plus this estimate stays under CHANGE_AI_DAILY_USD
//           (default $20). Labelled "AI-generated image" wherever it shows; never presented as a real place or person.
// A picture is saved into engine/kit/assets/ (and registered in kit/assets.json) for this run, and recorded in the
// result so apply.mjs adds the same file and record to main with the change.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { ENGINE, REPO, log, readJSON, slugify, writeJSON } from './lib.mjs';

const MIN_WIDTH = 1000;
const LICENSES = { by: 'CC BY', cc0: 'CC0', pdm: 'public domain' };
const HF = 'https://api.higgsfield.ai';
const HF_MODEL = 'higgsfield-ai/soul/v2/standard';
export const AI_ASPECTS = ['9:16', '16:9', '4:3', '3:4', '1:1', '2:3', '3:2'];
export const aiDailyUsd = () => Number(process.env.CHANGE_AI_DAILY_USD || 20);
export const aiAvailable = () => !!(process.env.HF_API_KEY_ID && process.env.HF_API_KEY_SECRET);

const toJpg = (from, to, max) => execFileSync('python3', ['-c', 'import sys;from PIL import Image;im=Image.open(sys.argv[1]).convert("RGB");m=int(sys.argv[3]);im.thumbnail((m,m));im.save(sys.argv[2],quality=88)', from, to, String(max)]);
// Wikimedia asks for a user agent naming the client and a contact (its User-Agent policy)
const UA = 'SundaeCampaignHub/1.0 (https://github.com/GabrealMDHindley/site-sundae-campaign; creative change box)';
async function download(url, file, timeoutMs = 60e3) {
  let r;
  for (let i = 0; i < 2; i++) { // one retry after a rate limit
    r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { 'user-agent': UA } });
    if (r.status !== 429 && r.status !== 503) break;
    await new Promise((res) => setTimeout(res, 4000));
  }
  if (!r.ok) throw new Error(`download ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > 40e6) throw new Error('image too large');
  fs.writeFileSync(file, buf);
}

// Openverse results (Wikimedia Commons, Flickr and more) as candidate records
async function openverse(query) {
  const u = new URL('https://api.openverse.org/v1/images/');
  u.search = new URLSearchParams({ q: query, license: Object.keys(LICENSES).join(','), license_type: 'commercial', page_size: '20', mature: 'false' }).toString();
  let r;
  for (let i = 0; i < 2 && !r?.ok; i++) r = await fetch(u, { signal: AbortSignal.timeout(45e3), headers: { 'user-agent': UA } }).catch((e) => ({ ok: false, status: e.name }));
  if (!r.ok) throw new Error(`Openverse ${r.status}`);
  return ((await r.json()).results || []).filter((x) => LICENSES[x.license] && !x.mature)
    .map((x) => ({ title: x.title, creator: x.creator, license: x.license, version: x.license_version || '', landing: x.foreign_landing_url || x.url, url: x.url, thumbUrl: x.thumbnail, width: x.width, height: x.height }));
}
// Wikimedia Commons' own search, read straight from each file's license record
const strip = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
async function commons(query) {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  u.search = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: '20', prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '640' }).toString();
  const r = await fetch(u, { signal: AbortSignal.timeout(45e3), headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`Wikimedia Commons ${r.status}`);
  const pages = Object.values((await r.json()).query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  return pages.map((pg) => {
    const ii = pg.imageinfo?.[0] || {}, m = ii.extmetadata || {};
    const lic = strip(m.LicenseShortName?.value);
    const by = /^CC BY (\d\.\d)$/i.exec(lic);
    const license = by ? 'by' : /^CC0/i.test(lic) ? 'cc0' : /^public domain$/i.test(lic) ? 'pdm' : null;
    return { title: pg.title, creator: strip(m.Artist?.value).slice(0, 80), license, version: by?.[1] || '', landing: ii.descriptionurl, url: ii.url, thumbUrl: ii.thumburl, width: ii.width, height: ii.height };
  }).filter((x) => x.license && x.url && x.creator);
}

// Candidates for a query from both sources (Commons first), best first; each with a small JPEG for the model.
export async function searchPhotos(query, workDir, n = 6) {
  const [c, o] = await Promise.allSettled([commons(query), openverse(query)]);
  const errors = [c, o].filter((x) => x.status === 'rejected').map((x) => String(x.reason?.message || x.reason).slice(0, 80));
  log(`photo sources: Commons ${c.status === 'fulfilled' ? c.value.length : 'failed'}, Openverse ${o.status === 'fulfilled' ? o.value.length : 'failed'}${errors.length ? ` (${errors.join('; ')})` : ''}`);
  if (errors.length === 2) throw new Error(errors.join('; '));
  const seen = new Set(), all = [];
  for (const x of [...(c.value || []), ...(o.value || [])]) {
    const key = decodeURIComponent(String(x.url).split('/').pop()).toLowerCase();
    if (seen.has(key) || (x.width || 0) < MIN_WIDTH) continue;
    seen.add(key); all.push(x);
  }
  const out = [];
  for (const x of all) {
    if (out.length >= n) break;
    const thumb = path.join(workDir, `cand-${out.length}.jpg`);
    let ok = false;
    for (const u of [x.thumbUrl, x.url].filter(Boolean)) {
      try { await download(u, thumb + '.raw', 30e3); toJpg(thumb + '.raw', thumb, 640); ok = true; break; } catch { /* next */ }
    }
    if (!ok) continue;
    out.push({ ...x, title: String(x.title || '').replace(/^File:/, '').replace(/\.(jpe?g|png|tiff?|webp)$/i, '').slice(0, 120), creator: String(x.creator).slice(0, 80), thumb });
  }
  return out;
}

const uniqueName = (stem) => {
  const dir = path.join(ENGINE, 'kit/assets');
  let name = `${stem}.jpg`;
  for (let i = 2; fs.existsSync(path.join(dir, name)); i++) name = `${stem}-${i}.jpg`;
  return name;
};
const scopeMeta = (A) => (A.event ? { use: 'event', event: path.basename(A.scopeDir) } : { use: 'brand' });
const prefix = (A) => (A.event ? path.basename(A.scopeDir) : 'brand');

// Save a picked Openverse photo into the kit; returns { name, meta, from } for the result.
export async function addSearchedPhoto(A, c, outDir) {
  const name = uniqueName(`${prefix(A)}-web-${slugify(c.title || 'photo').slice(0, 32) || 'photo'}`);
  const raw = path.join(outDir, `${name}.raw`), file = path.join(outDir, name);
  await download(c.url, raw);
  toJpg(raw, file, 2400);
  fs.rmSync(raw);
  const lic = `${LICENSES[c.license]}${c.license === 'by' && c.version ? ` ${c.version}` : ''}`;
  const credit = c.license === 'by' ? `Photo: ${c.creator} (${lic})` : `Photo: ${c.creator} (${lic}; credit optional)`;
  const meta = { ...scopeMeta(A), what: `${c.title} (openly licensed photo found for a change request; it shows the subject, not the venue): "${c.title}" by ${c.creator}, ${lic}, from ${c.landing}; credit line "${credit}"${c.license === 'by' ? ' wherever it shows' : ''}`, source: c.landing, license: lic, added: new Date().toISOString().slice(0, 10) };
  return { name, meta, from: file };
}

// AI spend in the last 24 hours, from the request log on main (each request records what its AI image cost).
export function aiSpentLast24h() {
  const dir = path.join(REPO, 'src/content/requests');
  if (!fs.existsSync(dir)) return 0;
  const since = Date.now() - 24 * 3600e3;
  let usd = 0;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const r = readJSON(path.join(dir, f), {});
    if (r.ai?.usd && Date.parse(r.finishedAt || r.at || 0) >= since) usd += Number(r.ai.usd) || 0;
  }
  return Math.round(usd * 1000) / 1000;
}

const hfHeaders = () => ({ Authorization: `Key ${process.env.HF_API_KEY_ID}:${process.env.HF_API_KEY_SECRET}`, 'Content-Type': 'application/json' });
// One AI image within the daily ceiling. Returns { name, meta, from, usd } or throws with a plain reason.
export async function addAiImage(A, prompt, aspect, outDir) {
  if (!aiAvailable()) throw new Error('AI images aren\'t switched on (no Higgsfield API key)');
  const body = { prompt: `${prompt}. Photographic, natural light, bright and warm. No text, no words, no letters, no logos, no signs, no watermark.`, aspect_ratio: AI_ASPECTS.includes(aspect) ? aspect : '3:2', resolution: '1080p', enhance_prompt: false, batch_size: 1 };
  const est = await fetch(`${HF}/estimate/${HF_MODEL}`, { method: 'POST', headers: hfHeaders(), body: JSON.stringify(body), signal: AbortSignal.timeout(30e3) });
  if (!est.ok) throw new Error(`the AI image price couldn't be checked (Higgsfield ${est.status})`);
  const usd = Number((await est.json()).usd);
  if (!(usd >= 0)) throw new Error('the AI image price couldn\'t be checked');
  const spent = aiSpentLast24h(), cap = aiDailyUsd();
  if (spent + usd > cap) throw new Error(`today's AI image budget of $${cap} is used up ($${spent.toFixed(2)} spent in the last 24 hours)`);
  log(`AI image: estimate $${usd}, spent $${spent} of $${cap} in the last 24 hours`);
  const sub = await fetch(`${HF}/${HF_MODEL}`, { method: 'POST', headers: { ...hfHeaders(), 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(body), signal: AbortSignal.timeout(60e3) });
  if (!sub.ok) throw new Error(`Higgsfield refused the AI image (${sub.status})`);
  const { request_id: rid } = await sub.json();
  let st;
  for (let i = 0; i < 90; i++) { // up to about 6 minutes
    await new Promise((res) => setTimeout(res, 4000));
    const r = await fetch(`${HF}/requests/${rid}/status`, { headers: hfHeaders(), signal: AbortSignal.timeout(30e3) }).catch(() => null);
    if (!r?.ok) continue;
    st = await r.json();
    if (['completed', 'failed', 'nsfw', 'canceled'].includes(st.status)) break;
  }
  if (st?.status !== 'completed' || !st.images?.[0]?.url) {
    if (st?.status !== 'failed' && st?.status !== 'nsfw' && st?.status !== 'canceled') await fetch(`${HF}/requests/${rid}/cancel`, { method: 'POST', headers: hfHeaders() }).catch(() => null);
    throw new Error(`the AI image didn't finish (${st?.status || 'timed out'})`);
  }
  const name = uniqueName(`${prefix(A)}-ai-${slugify(prompt).slice(0, 32) || 'image'}`);
  const raw = path.join(outDir, `${name}.raw`), file = path.join(outDir, name);
  await download(st.images[0].url, raw);
  toJpg(raw, file, 2400);
  fs.rmSync(raw);
  const meta = { ...scopeMeta(A), what: `AI-generated image (Higgsfield SOUL V2) of: ${prompt.slice(0, 200)}. Not a real place, venue or person, so never present it as one; label it "AI-generated image" wherever it shows`, source: `higgsfield:${rid}`, license: 'AI-generated (Sundae\'s Higgsfield account)', ai: true, added: new Date().toISOString().slice(0, 10) };
  return { name, meta, from: file, usd };
}

// Put a new picture into this run's kit so the render and the checks can use it (apply.mjs repeats this on main).
export function installKitFile(k) {
  fs.copyFileSync(k.from, path.join(ENGINE, 'kit/assets', k.name));
  const p = path.join(ENGINE, 'kit/assets.json');
  const j = readJSON(p, { assets: {} });
  j.assets[k.name] = k.meta;
  writeJSON(p, j);
}
