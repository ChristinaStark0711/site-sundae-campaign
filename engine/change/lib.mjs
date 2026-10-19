// Shared helpers for the creative-change pipeline (intake -> process -> apply -> guard). See engine/change/README.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(ENGINE, '..');
export const REQ = path.join(REPO, '.request');
export const OUT = path.join(REQ, 'out');
export const KEY_RE = /^(brand|events\/[a-z0-9]+(?:-[a-z0-9]+)*)\/(images|flyers|videos|reels)\/([A-Z0-9]{1,6})$/;

export const readJSON = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { if (fb !== undefined) return fb; throw e; } };
export const writeJSON = (p, o) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(o, null, 2) + '\n'); };
export const log = (...a) => console.log('[change]', ...a);

// Everything about one asset key: where its source, catalogue entry and media files live.
export function resolveAsset(key) {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  const [, scopeDir, kind, id] = m;
  const contentDir = path.join(REPO, 'src/content', scopeDir);
  const libPath = path.join(contentDir, 'library.json');
  const lib = readJSON(libPath, null);
  if (!lib) return null;
  const entry = (lib[kind] || []).find((a) => a.id === id);
  if (!entry) return null;
  const event = scopeDir === 'brand' ? null : readJSON(path.join(contentDir, 'event.json'), null);
  const media = scopeDir === 'brand' ? '/media' : event?.media;
  if (!media) return null;
  const ext = kind === 'videos' || kind === 'reels' ? 'json' : 'html';
  const source = path.join(ENGINE, 'creatives', scopeDir, kind, `${id}.${ext}`);
  if (!fs.existsSync(source)) return null;
  return { key, scopeDir, kind, id, entry, lib, libPath, event, media, mediaDir: path.join(REPO, 'public', media, kind), source, ext, isVideo: ext === 'json' };
}

// Next free id for a variation of `baseId` (05 -> 05B, then 05C ...; V1 -> V1B).
export function nextVariantId(items, baseId) {
  const taken = new Set(items.map((a) => a.id));
  for (const L of 'BCDEFGHIJKLMNOPQRSTUVWXYZ') if (!taken.has(baseId + L)) return baseId + L;
  throw new Error('no variant letters left for ' + baseId);
}
export const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');

// Fact-like tokens in rendered text (audit.mjs text, already NFKC-normalized): numbers, money, times, dates, phone
// numbers, web addresses, percentages, weekdays.
const MONTHS = '(?:Jan\\.|Feb\\.|March|April|May|June|July|Aug\\.|Sept\\.|Oct\\.|Nov\\.|Dec\\.|January|February|August|September|October|November|December)';
const FACT_RE = new RegExp([
  `${MONTHS}\\s?\\d{1,2}(?:,\\s?\\d{4})?`,
  '\\b\\d{1,2}(?::\\d{2})?(?:-\\d{1,2}(?::\\d{2})?)?\\s?[ap]\\.?m\\.?',
  '\\$\\s?\\d[\\d,]*(?:\\.\\d+)?(?:\\s?(?:million|billion|[kKmM]))?\\+?',
  '\\b\\d{3}[-. ]\\d{3}[-. ]\\d{4}\\b',
  '\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:com|app|org|net|io|co|ly|me|gg|xyz|link|info|biz|us)\\b(?:\\/[^\\s]*)?',
  '\\b\\d[\\d,]*(?:\\.\\d+)?\\s?%',
  '\\d[\\d,]*(?:\\.\\d+)?\\+?',
  '\\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\\b',
  '@[A-Za-z0-9_.]{2,}',
].join('|'), 'gi');
export const factTokens = (text) => new Set((text.normalize('NFKC').match(FACT_RE) || []).map((t) => t.replace(/\s+/g, ' ').trim().toLowerCase()));
// Words that make a claim, an offer or a contact the original did not make.
const CLAIM_RE = /\b(?:cancel(?:l)?ed|cancel(?:l)?ation|postponed?|rescheduled?|relocated|moved to|sold out|free|gift ?cards?|giveaways?|prizes?|raffle|win|winners?|guarantee[ds]?|risk[- ]free|earn(?:ings)?|income|profits?|returns?|roi|passive|wealth|millionaire|refunds?|discounts?|promo(?: code)?|coupons?|deals? of|crypto|bitcoin|click|dm|whatsapp|telegram|venmo|cash ?app|zelle|paypal|text us|call us|email us|register at|sign up at|password|login)\b/gi;
export const claimWords = (text) => new Set((text.normalize('NFKC').match(CLAIM_RE) || []).map((t) => t.toLowerCase().replace(/\s+/g, ' ')));
const minus = (a, b) => [...a].filter((t) => !b.has(t));
// What the candidate's rendered text adds compared with the original's.
export const newFacts = (oldText, newText) => minus(factTokens(newText), factTokens(oldText));
export const newClaims = (oldText, newText) => minus(claimWords(newText), claimWords(oldText));
// The event facts that must stay on the asset if they were on it: present in the original's visible text, gone from
// the candidate's.
export function missingFacts(event, oldVisible, newVisible) {
  if (!event) return [];
  const norm = (t) => t.normalize('NFKC').replace(/\s+/g, ' ').toLowerCase();
  const [, m, d] = (event.date || '').split('-').map(Number);
  const MON = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
  const keys = [d ? `${MON[m - 1]} ${d}` : null, event.time, event.venue?.split(' ')[0], event.city].filter(Boolean).map(norm);
  const o = norm(oldVisible), n = norm(newVisible);
  return keys.filter((k) => o.includes(k) && !n.includes(k));
}
// Numbers a video spec shows on screen (counters such as {"num": 20000}); layout numbers are left out. Compared as
// facts directly, because a counter animates and its rendered text depends on the moment sampled.
const LAYOUT_NUMS = new Set(['dur', 'accent', 'w', 'h', 'poster', 'frames', 'gx', 'gy', 'crf']);
export function specNumbers(src) {
  const out = new Set();
  const walk = (v, k) => { if (typeof v === 'number') { if (!LAYOUT_NUMS.has(k)) out.add(`${k} ${v}`); } else if (Array.isArray(v)) v.forEach((x) => walk(x, k)); else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) walk(vv, kk); };
  try { walk(JSON.parse(src), ''); } catch { /* checkSource reports invalid JSON */ }
  return out;
}
export const newSpecNumbers = (oldSrc, newSrc) => minus(specNumbers(newSrc), specNumbers(oldSrc)).map((t) => t.replace(/^\S+ /, ''));

// Credential-like strings never reach the public log.
export const redact = (t) => String(t).replace(/sk-ant-[A-Za-z0-9_-]{6,}|github_pat_[A-Za-z0-9_]{10,}|gh[pousr]_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{12,}|xox[abpr]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)|\b[A-Za-z0-9_-]{40,}\b/g, '[removed]');

// Markup a video spec string may carry (the motion engine sets spec strings as HTML).
const SPEC_TAGS = /^(?:br|b|i|em|strong|span|sup|sub|small|u)$/;
function specStringProblems(v) {
  const out = [];
  for (const m of v.matchAll(/<\s*(\/?)\s*([a-zA-Z0-9-]+)([^>]*)>/g)) {
    const [, close, tag, rest] = m;
    if (!SPEC_TAGS.test(tag.toLowerCase())) out.push(`uses a <${tag}> tag`);
    else if (!close && rest.trim() && !/^\s*class="[a-z0-9 _-]*"\s*\/?$/i.test(rest) && !/^\s*\/$/.test(rest)) out.push(`has attributes on <${tag}>`);
  }
  if (/<(?!\s*\/?\s*[a-zA-Z])/.test(v.replace(/&lt;/g, ''))) out.push('has a stray "<"');
  if (/javascript:|data:|https?:\/\/|\/\//i.test(v)) out.push('contains a URL');
  return out;
}

// What a source may contain: no scripts, handlers or outside URLs, only /kit/ references that exist.
export function checkSource(src, isVideo) {
  const problems = [];
  if (!isVideo) {
    if (/<script\b/i.test(src)) problems.push('contains a <script> tag');
    if (/[\s/"'`]on[a-z]+\s*=/i.test(src)) problems.push('contains an inline event handler');
    if (/https?:\/\/|(?:src|href)=["']?\/\//i.test(src)) problems.push('references an outside web address');
    if (/javascript:|data:text\/html|<iframe|<object|<embed|<base\b|<meta[^>]+refresh|<form\b|@import\s+["']/i.test(src)) problems.push('contains a disallowed tag or URL scheme');
    if (!/width:\s*\d+px;\s*height:\s*\d+px/.test(src)) problems.push('lost its canvas size');
    for (const m of src.matchAll(/(?:src=|href=|url\()\s*["']?([^"')\s>]+)/gi)) {
      const ref = m[1];
      if (!ref.startsWith('/kit/')) { problems.push(`references ${ref} (only /kit/ files are allowed)`); continue; }
      if (!fs.existsSync(path.join(ENGINE, decodeURIComponent(ref.split(/[?#]/)[0])))) problems.push(`references a missing file ${ref}`);
    }
  } else {
    let spec;
    try { spec = JSON.parse(src); } catch { return ['is not valid JSON']; }
    if (!spec || !Array.isArray(spec.scenes) || !spec.scenes.length) problems.push('has no scenes');
    if (!(spec.w > 0 && spec.h > 0)) problems.push('lost its canvas size');
    const total = (spec.scenes || []).reduce((n, s) => n + (+s.dur || 0), 0);
    if (total > 60) problems.push(`runs ${total.toFixed(1)}s (the limit is 60s)`);
    for (const s of spec.scenes || []) {
      if (s.img && !fs.existsSync(path.join(ENGINE, 'kit/assets', s.img.replace(/^\/kit\/assets\//, '')))) problems.push(`uses a missing photo ${s.img}`);
      if (s.side && !fs.existsSync(path.join(ENGINE, 'kit/assets', s.side.replace(/^\/kit\/assets\//, '')))) problems.push(`uses a missing photo ${s.side}`);
      if (s.clip && !fs.existsSync(path.join(ENGINE, 'kit/aiclips', `${s.clip}.mp4`))) problems.push(`uses a missing clip ${s.clip}`);
    }
    const walk = (v, k) => { if (typeof v === 'string') { if (!['img', 'side', 'clip', 'pos', 'sidePos', 'type'].includes(k)) for (const p of specStringProblems(v)) problems.push(`${k || 'a string'} ${p}`); } else if (Array.isArray(v)) v.forEach((x) => walk(x, k)); else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) walk(vv, kk); };
    walk(spec, '');
    for (const s of spec.scenes || []) for (const k of ['img', 'side', 'clip']) if (s[k] != null && !/^[a-z0-9][a-z0-9._-]*$/i.test(String(s[k]))) problems.push(`${k} "${String(s[k]).slice(0, 40)}" is not a plain file name`);
  }
  return problems;
}

export const kitAssets = () => fs.readdirSync(path.join(ENGINE, 'kit/assets')).sort();
export const kitClips = () => fs.existsSync(path.join(ENGINE, 'kit/aiclips')) ? fs.readdirSync(path.join(ENGINE, 'kit/aiclips')).filter((f) => f.endsWith('.mp4')).map((f) => f.slice(0, -4)).sort() : [];
