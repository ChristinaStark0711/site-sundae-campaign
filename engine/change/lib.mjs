// Shared helpers for the creative-change pipeline (intake -> process -> apply -> guard). See engine/change/README.md.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(ENGINE, '..');
export const REQ = path.join(REPO, '.request');
export const OUT = path.join(REQ, 'out');
export const KEY_RE = /^(brand|events\/[a-z0-9]+(?:-[a-z0-9]+)*)\/(images|flyers|videos|reels|backdrops|tablecloths)\/([A-Z0-9]{1,6})$/;

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

// Fact-like tokens in rendered text (audit.mjs text, already NFKC-normalized): numbers (any script's digits, circled
// and dingbat ones too), money, times, dates (also a bare month, a spelled ordinal or a relative day), phone numbers,
// web addresses (also with a spaced, non-ASCII or spelled-out dot), percentages, weekdays.
const MONTHS = '(?:Jan\\.|Feb\\.|March|April|May|June|July|Aug\\.|Sept\\.|Oct\\.|Nov\\.|Dec\\.|January|February|August|September|October|November|December)';
const TLDS = '(?:com|net|org|io|ai|app|vip|info|biz|xyz|me)'; // not "co" or "us" ("Co-founder", "with us")
const FACT_RE = new RegExp([
  `${MONTHS}\\s?\\d{1,2}(?:,\\s?\\d{4})?`,
  '\\b\\d{1,2}(?::\\d{2})?(?:-\\d{1,2}(?::\\d{2})?)?\\s?[ap]\\.?m\\.?',
  '\\$\\s?\\d[\\d,]*(?:\\.\\d+)?(?:\\s?(?:million|billion|[kKmM]))?\\+?',
  '\\b\\d{3}[-. ]\\d{3}[-. ]\\d{4}\\b',
  '\\b[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)*\\.[a-z][a-z0-9-]{1,23}\\b(?:\\/[^\\s]*)?', // any web address or email domain, whatever its ending
  // an address whose dot is spaced out in front, not ASCII, or spelled ("sundae dot com", "sundae(dot)ai"), and "(at)"
  `[\\p{L}\\p{N}](?:\\s+\\.\\s*|\\s*(?:[。｡·•・․﹒∙⋅]|\\(dot\\)|\\[dot\\]|\\bdot\\b)\\s*)${TLDS}\\b(?!-)`,
  '\\((?:at)\\)|\\[(?:at)\\]',
  '\\b\\d[\\d,]*(?:\\.\\d+)?\\s?%',
  '\\p{N}[\\p{N},]*(?:\\.\\p{N}+)?\\+?',
  '\\u{1F51F}', // keycap ten (a symbol, not a number character)
  '\\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\\b',
  '@[A-Za-z0-9_.]{2,}',
  // a month on its own (not "May" or "March", which are ordinary words too) and relative days
  '\\b(?:Jan|Feb|Aug|Sept?|Oct|Nov|Dec)\\.(?=\\s|$)|\\b(?:January|February|April|June|July|August|September|October|November|December)\\b',
  '\\b(?:tonight|tomorrow|yesterday|this (?:week|weekend)|next (?:week|month|year)|weekend)\\b',
  // spelled-out numbers, ordinals, times and money (AP style spells out one through nine, so "nine seats" is a fact too)
  '\\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundreds?|thousands?|millions?|billions?|dozens?|half|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|noon|midnight|o\'clock|dollars?|bucks|cents?|percent)\\b',
].join('|'), 'giu');
// Roman numerals count only after a numbering word, and only in capitals ("No. XII"; "did" and "mix" are words)
const ROMAN_RE = /(?:\bNo\.|#|\bVol\.|\bPart)\s*[IVXLCDM]+\b/g;
// invisible characters (zero-width spaces, soft hyphens, joiners) are removed first, so they can't split a word
export const clean = (t) => String(t).normalize('NFKC').replace(/[\p{Cf}\u00ad\u200b-\u200d\u2060\ufeff]/gu, '');
// "thirty" and "30" are the same fact, and so are "20,000+" and "20,000" ("more than 20,000")
const WORD_NUM = Object.fromEntries(['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'].map((w, i) => [w, String(i)]).concat(['thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'].map((w, i) => [w, String(30 + 10 * i)])));
const factKey = (t) => { const k = t.replace(/\s+/g, ' ').trim().toLowerCase().replace(/(\d)\+$/, '$1'); return WORD_NUM[k] ?? k; };
export const factTokens = (text) => new Set([...(clean(text).match(FACT_RE) || []), ...(clean(text).match(ROMAN_RE) || [])].map(factKey));
// Phrases that make a claim, an offer or a contact the original did not make. "free" counts on its own except in
// "feel free"; "earn" only next to money words ("built to earn homeowner trust" is not a claim). Compared by stem and
// by count, so "profits" is not new next to "profit" but a second profit claim is; the original's own disclaimer
// sentences are set aside first, so "No earnings representations" can't excuse a new earnings claim.
const CLAIM_RE = /\b(?:cancel+(?:ed|ation)|postpone[ds]?|reschedule[ds]?|relocated|moved to|sold out|(?<!feel )free|complimentary|on (?:us|the house)|no (?:cost|charge|fee)s?|gift ?cards?|gift (?:bags?|baskets?)|swag|giveaways?|prizes?|raffles?|sweepstakes|chance to win|win (?:a|an|free|cash|\$)|winners?|bonus(?:es)?|cash back|guarantee[ds]?|guaranteed returns|earnings|earn(?:s|ed|ing)?\s+(?:\$|money|more|income|up to|\d)|make money|income|passive income|profits?|returns? on|roi|wealth|millionaires?|get rich|refunds?|discounts?|promo(?: code)?|coupons?|deal of the|crypto|bitcoin|dm (?:me|us)|whatsapp|telegram|signal app|venmo|cash ?app|zelle|paypal|instagram|linkedin|facebook|tiktok|twitter|youtube|text (?:me|us)|call (?:me|us)|email (?:me|us)|(?:message|contact) (?:me|us)|reach out|password|log ?in)\b/giu;
// a contact prompt naming someone ("Call Josh", "DM Maria"): case-sensitive, so "call him" or "text your agent" isn't one
const CONTACT_RE = /\b(?:[Cc]all|CALL|[Tt]ext|TEXT|DM|[Dd]m|[Mm]essage|MESSAGE|[Ee]mail|EMAIL|[Ww]hats[Aa]pp)[^\S\n]+\p{Lu}[\p{L}'’-]+/gu; // within one line
const stem = (w) => w.toLowerCase().replace(/\s+/g, ' ').replace(/(\w{3,}?)(?:es|s|ed)$/, '$1'); // "refunds" -> "refund"; "on us" stays
const chunks = (t) => clean(t).split(/(?<=[.!?])\s+|\n+/).map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
const claimCounts = (text) => { const m = new Map(); for (const w of [...(text.match(CLAIM_RE) || []).map(stem), ...(text.match(CONTACT_RE) || []).map((x) => x.toLowerCase())]) m.set(w, (m.get(w) || 0) + 1); return m; };
export const claimWords = (text) => new Set(claimCounts(clean(text)).keys());
const minus = (a, b) => [...a].filter((t) => !b.has(t));
// What the candidate's rendered text adds compared with the original's.
export const newFacts = (oldText, newText) => minus(factTokens(newText), factTokens(oldText));
export function newClaims(oldText, newText) {
  const disclaimers = new Set(chunks(oldText).filter((x) => LEGAL_RE.test(x)).map((x) => x.toLowerCase()));
  const body = (t) => chunks(t).filter((x) => !disclaimers.has(x.toLowerCase())).join('\n');
  const o = claimCounts(body(oldText)), n = claimCounts(body(newText));
  return [...n].filter(([w, k]) => k > (o.get(w) || 0)).map(([w]) => w);
}
// Event facts that must stay on the asset if they were on it, compared on the text a viewer can see: a fact that
// disappears, or one mention of it replaced by something else, is held.
export function missingFacts(event, oldVisible, newVisible) {
  const norm = (t) => clean(t).replace(/\s+/g, ' ').toLowerCase();
  const keys = [];
  if (event) {
    const [, m, d] = (event.date || '').split('-').map(Number);
    const MON = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
    const venueCore = event.venue?.replace(new RegExp(`\\s+${event.city}$`, 'i'), ''); // "Shade Hotel Manhattan Beach" -> "Shade Hotel"
    keys.push(d ? `${MON[m - 1]} ${d}` : null, event.time, venueCore, event.venue?.split(' ')[0], event.space, event.city, event.address?.split(',')[0], event.host);
  }
  // a still is one scene with one moment; a video's visible text comes per scene, one entry per sampled moment, and a
  // mention counts once per scene (its best moment), so a scene's timing can't make a fact look dropped or doubled
  const scenes = (v) => (Array.isArray(v) ? v : [[v]]);
  const os = scenes(oldVisible), ns = scenes(newVisible);
  const count = (t, k) => norm(t).split(k).length - 1;
  const mentions = (sc, k) => Math.max(0, ...sc.map((x) => count(x, k)));
  const total = (ss, k) => ss.reduce((sum, sc) => sum + mentions(sc, k), 0);
  const where = (ss, k) => ss.filter((sc) => mentions(sc, k) > 0).length;
  // fewer mentions is a dropped (or replaced) fact unless it only collapsed a repeat: every scene that showed the fact
  // still shows it, and no new words came in that could have replaced a mention ("The Rooftop Terrace" for one of two
  // "The Courtyard"s). A kicker that now names the city, so the video drops its own repeat of the tag, is not a drop.
  const words = (ss) => new Set(norm(ss.flat().join(' ')).match(/[\p{L}\p{N}]+/gu) || []);
  const ow = words(os), added = [...words(ns)].some((w) => !ow.has(w));
  return [...new Set(keys.filter(Boolean).map(norm))].filter((k) => { const o = total(os, k), n = total(ns, k); return n < o && (n === 0 || added || where(ns, k) < where(os, k)); });
}

// Wording that must survive any edit: legal and compliance sentences (franchise disclosures, "not an offer", earnings
// disclaimers, footnotes) and the "average" qualifier on offer metrics (BRAND-SPEC rule 7). Compared on reader text,
// and on visible text wherever the original showed it.
const LEGAL_RE = /\b(?:franchise|disclosure|FDD|not an offer|offer to sell|required by law|representations?|earnings|financial[- ]performance|disclaimer|terms|conditions|restrictions apply|licensed|license|equal housing|brokerage|DRE|NMLS|average)\b/i;
const sentences = (t) => clean(t).split(/(?<=[.!?])\s+|\n+/).map((x) => x.replace(/\s+/g, ' ').trim()).filter((x) => x.length > 12);
export function lostWording(oldReader, newReader, oldVisible = '', newVisible = '') {
  // reader text (innerText) still holds text that is moved off the canvas, covered, faded out or clipped, so wording a
  // viewer could see in the original must also stay visible (compared without spaces: inline markup splits text nodes)
  const bare = (t) => clean(t).replace(/\s+/g, '').toLowerCase();
  const ov = bare(oldVisible), nv = bare(newVisible);
  // each legal sentence must survive as a sentence of its own: wrapping it in more words ("It is not true that this is
  // not an offer…") keeps it in the text but turns it around
  const ns = new Set(sentences(newReader).map((x) => x.toLowerCase()));
  const lost = sentences(oldReader).filter((x) => LEGAL_RE.test(x) && (!ns.has(x.toLowerCase()) || (ov.includes(bare(x)) && !nv.includes(bare(x)))));
  // a metric that read as an average (or carried a footnote asterisk) must still do so wherever it appears, and where
  // it is visible, visibly
  const qualified = (t) => new Set([...clean(t).replace(/\s+/g, ' ').matchAll(/\baverage(?: of)?\s+([\d,.]+\+?)|([\d,.]+\+?)\s*\*/gi)].map((m) => m[1] || m[2]));
  const nums = (t) => new Set(clean(t).match(/[\d,.]*\d\+?/g) || []);
  const unqualified = (o, c) => { const oq = qualified(o), cq = qualified(c), cn = nums(c); return [...oq].filter((x) => cn.has(x) && !cq.has(x)); };
  const unq = [...new Set([...unqualified(oldReader, newReader), ...(oldVisible ? unqualified(oldVisible, newVisible) : [])])];
  return [...lost.map((x) => `drops the wording "${x.length > 70 ? x.slice(0, 67) + '…' : x}"`), ...unq.map((x) => `shows ${x} without "an average of" or its footnote`)];
}

// A new place or person: a capitalized name after a lead word ("at", "in", "on", "inside", "with", "hosted by",
// "joined by", "featuring", "special guest:", "keynote:" …) or after a colon, dash or separator dot when two capitalized
// words follow ("Special guest: Elon Musk", "Keynote — Elon Musk"), that neither the original nor the event record has.
// The lead word counts lowercase anywhere, capitalized where a line or sentence starts ("With Elon Musk"), and in
// capitals where the source is typed in capitals. Names joined by "and", "&", "+" or a comma are each checked
// ("Josh Stech and Elon Musk"). A name that runs onto the next line is checked line by line, so two known lines that
// merely changed places don't read as a new name. Known gap: a name typed all in lowercase ("dinner with elon musk").
const NAME_LEADS = ['at', 'in', 'on', 'inside', 'near', 'atop', 'with', 'hosted by', 'joined by', 'presented by', 'sponsored by', 'moderated by', 'featuring', 'special guests?:?', 'guests?:?', 'keynote:?', 'venue:?', 'hosts?:?', 'speakers?:?', 'panel:?', 'by'];
const PLACE_LEADS = /^(?:at|in|on|inside|near|atop|venue:?|@)$/i;
const leads = (f) => NAME_LEADS.map(f).join('|');
const W = String.raw`\p{Lu}[\p{L}\p{M}\d_'’&.-]*`;
const NM = String.raw`(?:the[^\S\n]+)?${W}(?:[^\S\n]+(?:of[^\S\n]+|&[^\S\n]+|the[^\S\n]+)?${W})*`; // one line only
const nameRe = (caps) => new RegExp(String.raw`(?:(\b(?:${leads((w) => w)})|(?<=(?:^|[.!?:•·|—–])\s*)(?:${leads((w) => w[0].toUpperCase() + w.slice(1))})${caps ? String.raw`|\b(?:${leads((w) => w.toUpperCase())})` : ''})[^\S\n]+|@[^\S\n]+|(?<=[:—–·|][^\S\n]*)(?=\p{Lu}[\p{L}\p{M}'’.-]*[^\S\n]+(?:of[^\S\n]+|the[^\S\n]+)?\p{Lu}))(${NM}(?:[^\S\n]*(?:,|\band\b|\bAND\b|&|\+)[^\S\n]*${NM})*)`, 'gmu');
const NAME_RE = nameRe(false), NAME_RE_CAPS = nameRe(true);
// Words Sundae's own copy uses as ordinary lowercase words (the plans, captions and creatives, never the request log,
// which visitors write): a capitalized run made only of these ("In Good Company", "By Design", "With A View") is
// wording, not a name. A place lead before "the" ("on the Rooftop", "at the Bar") still counts as a named place.
let VOCAB = null;
function vocab() {
  if (VOCAB) return VOCAB;
  const files = [];
  const walk = (d, ok) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== 'requests') walk(p, ok); } else if (ok(e.name)) files.push(p); } };
  walk(path.join(REPO, 'src/content'), (n) => /\.md$|^captions\.json$|^plans\.json$/.test(n));
  walk(path.join(ENGINE, 'creatives'), (n) => /\.(?:html|json)$/.test(n));
  VOCAB = new Set();
  for (const f of files) for (const w of fs.readFileSync(f, 'utf8').replace(/<[^>]*>/g, ' ').match(/(?<![\p{L}])[a-z][a-z'’-]*/gu) || []) VOCAB.add(w.replace(/['’]s$/, ''));
  for (const w of ['a', 'an', 'the', 'of', 'and', 'for', 'to', 'by', 'in', 'on', 'at', 'with', 'or']) VOCAB.add(w);
  return VOCAB;
}
export function newNames(event, oldReader, newReader, newRaw = '') {
  const flat = (t) => t.replace(/\s+/g, ' ').trim();
  const known = flat(clean([oldReader, event ? Object.values(event).filter((v) => typeof v === 'string').join(' ') : ''].join(' '))).toLowerCase();
  const out = new Set();
  // capitalized lead words count in the text as shown; all-caps ones only where the source itself is typed in capitals
  // (a kicker styled into capitals, "SEATS BY REQUEST ONLY", is not a name after "BY")
  const runs = [...clean(newReader).matchAll(NAME_RE), ...clean(newRaw).matchAll(NAME_RE_CAPS)];
  for (const m of runs) {
    const place = m[1] && PLACE_LEADS.test(m[1].trim()) || /^@/.test(m[0]);
    for (const piece of m[2].split(/\s*\n\s*|\s*(?:,|\band\b|\bAND\b|\+)\s*/)) {
      const named = /^the\s/i.test(piece);
      const name = flat(piece.replace(/^the\s+/i, '').replace(/[.'’&-]+$/, '').replace(/['’]s$/, '')); // "Manhattan Beach." / "Sundae’s"
      if (name.length <= 2 || known.includes(name.toLowerCase()) || /^(?:Sundae|SHAI|Membership|Josh|Dinner|Dialogue|Private)$/i.test(name)) continue;
      if (/^[A-Z&]{1,4}$/.test(name)) continue; // an acronym ("Q&A", "FAQ", "LA")
      const ordinary = name.toLowerCase().split(/\s+/).every((w) => vocab().has(w.replace(/['’]s$/, '')));
      if (ordinary && !(place && named)) continue;
      out.add(name);
    }
  }
  return [...out];
}

// Letters from another alphabet than the original's (a Cyrillic "о" in "sundae.cоm" reads as Latin but isn't).
export function newScripts(oldText, newText) {
  const other = (t) => new Set(clean(t).match(/(?![\p{Script=Latin}])\p{L}/gu) || []);
  return minus(other(newText), other(oldText));
}

// Numbers a video spec shows on screen (counters such as {"num": 20000}); layout numbers are left out. Compared as
// facts directly, because a counter animates and its rendered text depends on the moment sampled.
const SHOWN_NUMS = new Set(['num']); // every other number in a spec is layout (sizes, timings, positions, zoom)
export function specNumbers(src) {
  const out = new Set();
  const walk = (v, k) => { if (typeof v === 'number') { if (SHOWN_NUMS.has(k)) out.add(`${k} ${v}`); } else if (Array.isArray(v)) v.forEach((x) => walk(x, k)); else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) walk(vv, kk); };
  try { walk(JSON.parse(src), ''); } catch { /* checkSource reports invalid JSON */ }
  return out;
}
export const newSpecNumbers = (oldSrc, newSrc) => minus(specNumbers(newSrc), specNumbers(oldSrc)).map((t) => t.replace(/^\S+ /, ''));

// Credential-like strings never reach the public log. Keep in step with CREDENTIAL in src/app/api/requests/route.ts
// (which refuses them up front) and with guard.mjs (which refuses to commit them).
export const CREDENTIALS = /\bsk-ant-[A-Za-z0-9_-]{6,}|\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{10,}|gh[pousr]_[A-Za-z0-9]{10,}|glpat-[\w-]{20,}|npm_[A-Za-z0-9]{36}|hf_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{12,}|ASIA[0-9A-Z]{12,}|xox[abpr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|ya29\.[\w-]{20,}|SG\.[\w-]{16,}\.[\w-]{16,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}|[sr]k_(?:live|test)_[0-9A-Za-z]{10,}|SK[0-9a-fA-F]{32}|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)|(?<![\w/.#@-])(?=[A-Za-z0-9+/=_-]*\d)(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[A-Z])[A-Za-z0-9+/=_-]{40,}/g; // last: any long mixed-case token (base64-style secrets, '/' '_' '-' inside); hashtags, file names and URL paths (a run that starts after '/', '.', '#' or '@') don't match
export const redact = (t) => String(t).replace(CREDENTIALS, '[removed]');
export const redactDeep = (v) => (typeof v === 'string' ? redact(v) : Array.isArray(v) ? v.map(redactDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redactDeep(x)])) : v);

// Kit files that carry text of their own (QR codes, screenshots, maps): text the rendered-text checks can't read.
// A candidate that newly uses one, or a venue file that belongs to another event, is held as a proposal.
export function kitImageNotes(url, scopeDir) {
  const m = /\/kit\/assets\/([^"')?#]+)/.exec(url);
  if (!m) return null;
  const meta = readJSON(path.join(ENGINE, 'kit/assets.json'), { assets: {} }).assets[decodeURIComponent(m[1])] || {};
  if (meta.text) return `adds ${m[1]}, an image with its own text`;
  if (meta.event && `events/${meta.event}` !== scopeDir) return `adds ${m[1]}, a photo from another event`;
  return null;
}

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
  if (/javascript:|data:[a-z]+\/|data:[^\s]*base64|https?:\/\/|\/\//i.test(v)) out.push('contains a URL'); // "data: 20,000 deals" is wording
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
// What each kit file usable in this scope shows, with its source and required credit (kit/assets.json "what"), so a
// request like "use the skyline photo and update the credit" can be made from the record instead of guessed.
export const kitAssetNotes = (scopeDir) => Object.entries(readJSON(path.join(ENGINE, 'kit/assets.json'), { assets: {} }).assets)
  .filter(([, m]) => m.what && m.use !== 'retired' && (!m.event || `events/${m.event}` === scopeDir))
  .map(([name, m]) => `${name}: ${m.what}`).sort();
export const kitClips = () => fs.existsSync(path.join(ENGINE, 'kit/aiclips')) ? fs.readdirSync(path.join(ENGINE, 'kit/aiclips')).filter((f) => f.endsWith('.mp4')).map((f) => f.slice(0, -4)).sort() : [];
