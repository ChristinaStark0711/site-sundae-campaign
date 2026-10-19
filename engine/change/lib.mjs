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

// The visible text of a source: HTML without tags/styles, or the copy strings of a video spec.
const SPEC_SKIP = new Set(['type', 'img', 'clip', 'pos', 'side', 'sidePos', 'frames', 'dur', 'poster', 'crf', 'w', 'h', 'accent', 'mode', 'align', 'focus', 'fit', 'src', 'file']);
export function visibleText(src, isVideo) {
  if (!isVideo) {
    return src.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&rsquo;|&#8217;/g, '’').replace(/&lsquo;/g, '‘').replace(/&ldquo;|&rdquo;/g, '"').replace(/&middot;/g, '·').replace(/&[a-z]+;/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  const out = [];
  const walk = (v, k) => { if (typeof v === 'string') { if (!SPEC_SKIP.has(k)) out.push(v); } else if (Array.isArray(v)) v.forEach((x) => walk(x, k)); else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) walk(vv, kk); };
  walk(typeof src === 'string' ? JSON.parse(src) : src, '');
  return out.join(' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Fact-like tokens in visible text: numbers, money, times, dates, phone numbers, web addresses, percentages.
const MONTHS = '(?:Jan\\.|Feb\\.|March|April|May|June|July|Aug\\.|Sept\\.|Oct\\.|Nov\\.|Dec\\.|January|February|August|September|October|November|December)';
const FACT_RE = new RegExp([
  `${MONTHS}\\s?\\d{1,2}(?:,\\s?\\d{4})?`,
  '\\b\\d{1,2}(?::\\d{2})?(?:-\\d{1,2}(?::\\d{2})?)?\\s?[ap]\\.m\\.',
  '\\$\\s?\\d[\\d,]*(?:\\.\\d+)?(?:\\s?(?:million|billion|[kKmM]))?\\+?',
  '\\b\\d{3}[-. ]\\d{3}[-. ]\\d{4}\\b',
  '\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:com|app|org|net|io|co)\\b(?:\\/[^\\s]*)?',
  '\\b\\d[\\d,]*(?:\\.\\d+)?\\s?%',
  '\\b\\d[\\d,]*(?:\\.\\d+)?\\+?',
  '\\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\\b',
].join('|'), 'gi');
export const factTokens = (text) => new Set((text.match(FACT_RE) || []).map((t) => t.replace(/\s+/g, ' ').trim().toLowerCase()));
// Tokens that appear in the new text but not the old one: a new or changed fact.
export function newFacts(oldSrc, newSrc, isVideo) {
  const before = factTokens(visibleText(oldSrc, isVideo));
  return [...factTokens(visibleText(newSrc, isVideo))].filter((t) => !before.has(t));
}

// What a source may contain: no scripts, handlers or outside URLs, only /kit/ references that exist.
export function checkSource(src, isVideo) {
  const problems = [];
  if (!isVideo) {
    if (/<script\b/i.test(src)) problems.push('contains a <script> tag');
    if (/\son[a-z]+\s*=/i.test(src)) problems.push('contains an inline event handler');
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
    if (/<script|\son[a-z]+\s*=|javascript:|https?:\/\//i.test(src)) problems.push('contains markup or a URL that is not allowed');
  }
  return problems;
}

export const kitAssets = () => fs.readdirSync(path.join(ENGINE, 'kit/assets')).sort();
export const kitClips = () => fs.existsSync(path.join(ENGINE, 'kit/aiclips')) ? fs.readdirSync(path.join(ENGINE, 'kit/aiclips')).filter((f) => f.endsWith('.mp4')).map((f) => f.slice(0, -4)).sort() : [];
