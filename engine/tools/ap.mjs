// Helpers shared by the event tools: AP-style dates (same rules as src/lib/format.ts), flag parsing and input checks,
// the leftover-fact scan that new-event.mjs reports and check-event.mjs enforces, the checks on an event's own dates,
// and the render records that let check-event tell a stale render from a fresh one.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MONTHS = ['Jan.', 'Feb.', 'March', 'April', 'May', 'June', 'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function dateParts(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d, month: MONTHS[m - 1], monthFull: MONTHS_FULL[m - 1], weekday: DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}
export const apShort = (iso) => { const p = dateParts(iso); return `${p.month} ${p.d}`; };                 // Oct. 8
export const apDay = (iso) => { const p = dateParts(iso); return `${p.weekday}, ${p.month} ${p.d}`; };      // Thursday, Oct. 8
export const apFull = (iso) => `${apDay(iso)}, ${dateParts(iso).y}`;                                        // Thursday, Oct. 8, 2026
export const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming' };
export const KINDS = ['images', 'flyers', 'videos', 'reels', 'backdrops'];
export const VENUE_TBD = 'Venue to be announced'; // new-event.mjs --no-creative without a venue
// parse "--key value" flags (a flag with no value is true)
export function flags(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; o[k] = v; } else o._.push(a); }
  return o;
}
export const unknownFlags = (f, known) => Object.keys(f).filter((k) => k !== '_' && !known.includes(k));

// ---- Input checks. Each returns { value } or { error }.
export function validDate(iso) { // a real calendar date, YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return false;
  const [y, m, d] = iso.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}
export const AP_TIME = /^(?:(?:[1-9]|1[0-2])(?::[0-5]\d)? [ap]\.m\.|noon|midnight)$/; // 7 p.m., 6:30 p.m., noon
const NUM = /^\d+(?:\.\d+)?$/; // digits only: no "$", no thousands commas (commas separate the three scenarios)
export function parseTrio(v, name, example) {
  if (v === undefined) return {};
  const parts = v === true ? [] : String(v).split(',').map((s) => s.trim());
  if (parts.length !== 3 || !parts.every((s) => NUM.test(s) && Number(s) > 0)) return { error: `--${name} needs three positive numbers, conservative,base,aggressive, digits only (e.g. --${name} ${example}); got ${v === true ? 'nothing' : `"${v}"`}` };
  return { value: parts.map(Number) };
}
// --budget takes the trio, or one number: the base case, with conservative 0.6x and aggressive 1.6x rounded to the
// nearest $500 (labeled assumptions; event-model.mjs says so in the projections notes).
export function parseBudget(v) {
  const s = v === true || v === undefined ? '' : String(v).trim();
  if (!NUM.test(s)) return parseTrio(v, 'budget', '3000,5000,8000');
  const b = Number(s), r = (x) => Math.round(x / 500) * 500, c = r(0.6 * b), a = r(1.6 * b);
  if (!(b > 0 && c > 0 && c < b && a > b)) return { error: `--budget ${s} is too small to derive the other two scenarios from; pass all three (conservative,base,aggressive)` };
  return { value: [c, b, a], derived: true };
}
export function parseSeatCap(v) {
  if (v === undefined) return {};
  const s = v === true ? '' : String(v).trim();
  return /^\d+$/.test(s) && Number(s) >= 1 ? { value: Number(s) } : { error: `--seat-cap needs a whole number of seats, 1 or more; got ${s ? `"${s}"` : 'nothing'}` };
}

// ---- Leftover facts
// An event's text may still carry another event's facts: what new-event.mjs could not swap from its template, or a
// copy-paste. refFacts() collects one event's facts; leftovers() lists the ones a text still shows, skipping anything
// that is also this event's own fact or that its event.json "_allow" list covers. Sundae's own facts are never on the
// list. "_allow":
// - a text entry accepts every match it contains, e.g. "Sacramento · Echo & Rig" or "7:35 p.m.";
// - except the template host's name, handle, title and bio (when this event has another host): those are accepted only
//   inside the allowed phrase itself ("Sacramento dinner with Josh Stech" accepts that phrase, not "Josh Stech"
//   elsewhere), and an entry that is only such a name or fact accepts nothing (check-event reports it);
// - "kit:<file>" accepts that one kit file in kitProblems (e.g. "kit:josh-headshot.jpg") and no text.
const MONTH_NUM = Object.fromEntries([...MONTHS.map((m, i) => [m, i + 1]), ...MONTHS_FULL.map((m, i) => [m, i + 1])]);
// "Oct. 8", "Oct. 8, 2027", "Oct. 8: doors open" (a calendar line); not "Oct. 8:30"
const DATE_RE = /\b(Jan\.|Feb\.|Aug\.|Sept\.|Oct\.|Nov\.|Dec\.|January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?!\d|:\d)(?:,\s*(\d{4})(?!\d))?/g;
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s?([ap])\.m\./g;
const PHONE_RE = /(?<![\d-])\(?(\d{3})\)?[-.\s]?(\d{3})[-.](\d{4})(?![\d-])/g;
const ISO_RE = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g; // 2026-10-08 (file and folder names in plans)
const TAG_RE = /(?<![\p{L}\p{N}_])[#@][\p{L}\p{N}_]+/gu; // #hashtag, @handle (not an e-mail address)
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dayMs = (y, m, d) => Date.UTC(y, m - 1, Math.min(d, daysIn(y, m)));
// A date written without a year means its occurrence nearest the event's own date (a month-only date: its 15th).
export function nearYear(m, d, refIso) {
  const s = String(refIso || ''), iso = validDate(s) ? s : /^\d{4}-\d{2}$/.test(s) ? `${s}-15` : null;
  const t = iso ? Date.parse(`${iso}T00:00:00Z`) : Date.now(), y = new Date(t).getUTCFullYear();
  return [y - 1, y + 1].reduce((b, c) => (Math.abs(dayMs(c, m, d) - t) < Math.abs(dayMs(b, m, d) - t) ? c : b), y);
}
// Dates keyed year-month-day ("2026-10-7"), the year as written or else from nearYear; "real" is false for an
// impossible day ("Dec. 35"). "str" is the month and day as written (without the year).
export const datesIn = (s, refIso) => [...s.matchAll(DATE_RE)].map((x) => {
  const m = MONTH_NUM[x[1]], d = +x[2], y = x[3] ? +x[3] : nearYear(m, d, refIso);
  return { str: x[0].replace(/,\s*\d{4}$/, ''), at: x.index, end: x.index + x[0].length, y, m, d, real: d >= 1 && d <= daysIn(y, m), key: `${y}-${m}-${d}` };
}).concat([...s.matchAll(ISO_RE)].filter((x) => validDate(x[0])).map((x) => ({ str: x[0], at: x.index, end: x.index + x[0].length, y: +x[1], m: +x[2], d: +x[3], real: true, iso: true, key: `${+x[1]}-${+x[2]}-${+x[3]}` })));
export const timesIn = (s) => [...s.matchAll(TIME_RE)].map((m) => ({ str: m[0], key: `${+m[1]}:${m[2] || '00'}${m[3]}` }));
const timeKey = (s) => (/^noon$/i.test(s) ? '12:00p' : /^midnight$/i.test(s) ? '12:00a' : timesIn(s)[0]?.key);
export const phonesIn = (s) => [...s.matchAll(PHONE_RE)].map((m) => ({ str: m[0], key: m[1] + m[2] + m[3] }));
const tagKey = (tag) => tag.replace(/^[#@]/, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (t, g = '') => new RegExp(`(?<![\\p{L}\\p{N}])${esc(t)}(?![\\p{L}\\p{N}])`, 'u' + g);
const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', middot: '·', hellip: '…', times: '×' };
// What a page shows: tags become spaces (so a date card split across elements, "Oct." and "8", reads "Oct. 8"),
// entities are decoded, alt text is kept.
export const htmlText = (s) => s.replace(/<(head|style|script)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*\balt="([^"]*)"[^>]*>/gi, ' $1 ').replace(/<[^>]*>/g, ' ')
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m))
  .replace(/\s+/g, ' ');
export function sourceText(raw, ext) { // a creative source (HTML, or a video spec whose strings are HTML)
  if (ext !== 'json') return htmlText(raw);
  const out = [], walk = (v) => (typeof v === 'string' ? out.push(v) : v && typeof v === 'object' && Object.values(v).forEach(walk));
  walk(JSON.parse(raw));
  return htmlText(out.join(' \n '));
}
export function addressParts(a) { // "1221 N. Valley Drive, Manhattan Beach, CA 90266"
  const m = /^(.+?),\s*([^,]+?),\s*([A-Z]{2})(?:\s+(\d{5}(?:-\d{4})?))?$/.exec(a || '');
  return m ? { street: m[1].trim(), city: m[2], st: m[3], zip: m[4] } : { street: a ? a.split(',')[0].trim() : undefined, zip: (a || '').match(/\b\d{5}(?:-\d{4})?\b/)?.[0] };
}
const VENUE_NOUN = /^(Hotel|Inn|Club|House|Hall|Room|Restaurant|Bar|Grill|Kitchen|Lounge|Resort|Lodge|Tavern|Bistro|Cafe|Café|Steakhouse|Gallery|Studio)$/;
const COMMON_WORD = /^(The|Social|Grand|Royal|City|Country|Golf|Yacht|Private|Public|Union|Central|Main|Old|New|Great|Little|Blue|Green|Red|White|Black|Golden|Summit|Harbor|Park|Garden|Ocean|Bay|Beach|River|Lake|Hill|Station|Market|Event|Events|Conference|Community)$/;
// A venue's name without the city at its start or end, for display next to the city ("Shade Hotel Manhattan Beach" →
// "Shade Hotel", "Fresno Marriott" → "Marriott"); unchanged when that would leave nothing or one generic word.
export function venueCore(venue, city) {
  if (!venue || !city) return venue || '';
  const c = esc(city), core = venue.replace(new RegExp(`^${c}\\s+|[\\s,–—-]+${c}$`, 'u'), '').trim();
  return core && core !== venue && !VENUE_NOUN.test(core) && !/^The$/i.test(core) ? core : venue;
}
// Who hosts and what their bio says (engine/tools/hosts.json): the template host's titles, career facts and handles.
const HOSTS_FILE = fileURLToPath(new URL('./hosts.json', import.meta.url));
let HOSTS; // read on first use, so importing this file (render.mjs does) never reads it
const hosts = () => (HOSTS ??= fs.existsSync(HOSTS_FILE) ? JSON.parse(fs.readFileSync(HOSTS_FILE, 'utf8')) : {});
export const HOST_KINDS = new Set(['host', 'host title', 'host bio']);
export const isHostItem = (s) => /\(host(?: title| bio)?(?: hashtag| handle)?\)$/.test(s); // a leftovers() item about the host
// Another event's city, venue, room and street (not its lone short forms): new-event lists them and check-event warns.
export const otherEventRef = (o) => ({ slug: o.slug, tokens: factTokens({ venue: o.venue, space: o.space, address: o.address, city: o.city }).filter((t) => !t.lone && ['city', 'venue', 'room', 'street'].includes(t.what)), dates: new Set(), times: new Set(), phones: new Map(), tags: new Set() });
// The names that tie text to one event: venue (and its short forms), room, street, ZIP, city, audience area, the other
// places its copy names (event.json "_places", e.g. "South Bay"), and the host: name, handles, title and bio (hosts.json;
// title and bio match in any case). One-word short forms ("Shade", "Courtyard") are marked lone: only the template scan
// uses them. "hostOf" marks the host's own facts: they are another host's leftovers only when the hosts differ.
export function factTokens(ev) {
  const t = [], add = (str, what, o = {}) => { str = str?.trim(); if (str && str.length > 1 && !t.some((x) => x.str.toLowerCase() === str.toLowerCase())) t.push({ str, what, ...o }); };
  add(ev.city, 'city');
  if (ev.venue && ev.venue !== VENUE_TBD) {
    add(ev.venue, 'venue');
    const core = ev.city ? ev.venue.replace(wordRe(ev.city, 'g'), ' ').replace(/\s+/g, ' ').trim() : ev.venue; // "Shade Hotel"
    if (core.length >= 4) add(core, 'venue');
    const w = core.split(' ');
    if (w.length === 2 && VENUE_NOUN.test(w[1]) && /^\p{Lu}\p{Ll}{2,}$/u.test(w[0]) && !COMMON_WORD.test(w[0])) add(w[0], 'venue', { lone: true }); // a lone "Shade"
  }
  if (ev.space) { add(ev.space, 'room'); add(ev.space.replace(/^The\s+/, ''), 'room', { lone: true }); }
  const a = addressParts(ev.address);
  if (a.street) {
    add(a.street, 'street');
    const name = a.street.replace(/^\d+[A-Za-z]?\s+/, '').replace(/^(?:N|S|E|W|NE|NW|SE|SW)\.?\s+/, ''); // "Valley Drive"
    if (name !== a.street && name.split(' ').length >= 2) add(name, 'street');
  }
  add(a.zip, 'ZIP');
  const place = /^(.+?)(?:-area)?\s+real estate\b/i.exec(ev.audience || '')?.[1]; // "Los Angeles real estate operators"
  if (place && /^\p{Lu}/u.test(place)) { add(place, 'audience area'); if (place === 'Los Angeles') add('LA', 'audience area', { of: place }); }
  for (const p of Array.isArray(ev._places) ? ev._places : []) if (typeof p === 'string') add(p, 'area');
  if (ev.host) {
    const h = { hostOf: ev.host }, bio = hosts()[ev.host] || {};
    add(ev.host, 'host', h);
    const [first, ...rest] = ev.host.split(' ');
    if (rest.length) { add(rest.join(' '), 'host', h); if (first.length >= 3) add(first, 'host', h); }
    for (const x of bio.handles || []) add(x, 'host', h);
    // "co-founder and CEO of Sundae" and its core "co-founder and CEO"; one-word titles ("CEO") are too common to scan
    const title = ev.hostTitle?.trim(), core = title?.replace(/(?:\s*,\s*|\s+(?:of|at)\s+)Sundae\b.*$/i, '').trim();
    for (const x of [title, core, ...(bio.titles || [])]) if (x && /\s/.test(x)) add(x, 'host title', { ...h, ci: true });
    for (const x of bio.facts || []) add(x, 'host bio', { ...h, ci: true });
  }
  return t;
}
// Every text an event carries, one item per place it is shown: event.json text and each plan's title and blurb, each
// catalogue entry, each caption, each plan, and every creative source file.
export function eventMaterials(repo, slug, kinds = ['event', 'library', 'caption', 'plan', 'source']) {
  const dir = path.join(repo, 'src/content/events', slug), rel = `src/content/events/${slug}`, out = [];
  const J = (f) => (fs.existsSync(path.join(dir, f)) ? JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) : null);
  const push = (kind, label, parts) => kinds.includes(kind) && out.push({ kind, label, text: parts.filter((x) => typeof x === 'string').join(' \n ') });
  const ev = J('event.json') || {};
  push('event', `${rel}/event.json`, [ev.headline, ev.summary, ev.strategy, ev.creativeNote, ev.sources, ...(ev.moves || []).flat()]);
  for (const p of ev.plans || []) push('event', `${rel}/event.json (plans: ${p.slug})`, [p.title, p.blurb]);
  for (const [k, items] of Object.entries(J('library.json') || {})) for (const a of items) push('library', `${rel}/library.json (${k}/${a.id})`, [a.title, a.use, a.pair]);
  for (const c of J('captions.json') || []) push('caption', `${rel}/captions.json (${c.id})`, [c.platform, c.pair, c.title, c.text, c.hashtags]);
  if (kinds.includes('plan') && fs.existsSync(path.join(dir, 'plans'))) for (const f of fs.readdirSync(path.join(dir, 'plans')).filter((x) => x.endsWith('.md')).sort()) push('plan', `${rel}/plans/${f}`, [fs.readFileSync(path.join(dir, 'plans', f), 'utf8')]);
  const src = path.join(repo, 'engine/creatives/events', slug);
  if (kinds.includes('source')) for (const k of KINDS) if (fs.existsSync(path.join(src, k))) for (const f of fs.readdirSync(path.join(src, k)).filter((x) => /\.(html|json)$/.test(x)).sort()) {
    const raw = fs.readFileSync(path.join(src, k, f), 'utf8'), ext = f.split('.').pop();
    out.push({ kind: 'source', label: `engine/creatives/events/${slug}/${k}/${f}`, text: sourceText(raw, ext), raw, ext, k, id: f.replace(/\.[a-z]+$/, '') });
  }
  return out;
}
// One event's facts as a reference for another event's scan. Times come from everything but the plans (a plan's run of
// show and posting times are not facts another event's creative would carry over). "tags": every hashtag and handle
// its materials use, so a short place name ("LA") is matched inside one of them ("#lainvestors") only when the
// template used that very tag.
export function refFacts(repo, slug) {
  const ev = JSON.parse(fs.readFileSync(path.join(repo, 'src/content/events', slug, 'event.json'), 'utf8'));
  const mats = eventMaterials(repo, slug), all = mats.map((m) => m.text).join('\n'), noPlans = mats.filter((m) => m.kind !== 'plan').map((m) => m.text).join('\n');
  const pjf = path.join(repo, 'src/content/events', slug, 'projections.json');
  const budget = fs.existsSync(pjf) ? JSON.parse(fs.readFileSync(pjf, 'utf8')).scenarios?.base?.paid_budget : undefined;
  return {
    slug, ev, tokens: factTokens(ev), dates: new Set(datesIn(all, ev.date).filter((d) => d.real).map((d) => d.key)), times: new Set(timesIn(noPlans).map((t) => t.key)),
    phones: new Map(phonesIn(all).map((p) => [p.key, p.str])), tags: new Set((all.match(TAG_RE) || []).map(tagKey)), budget,
  };
}
export function ownFacts(ev, budget) {
  const d = validDate(ev.date) ? dateParts(ev.date) : null, a = addressParts(ev.address);
  return {
    host: ev.host, date: ev.date, allow: Array.isArray(ev._allow) ? ev._allow.filter((x) => typeof x === 'string') : [], budget,
    // the address without its state code: "LA" is Louisiana's code, and also the template's short name for Los Angeles
    blob: [ev.venue, ev.space, a.city ? [a.street, a.city, a.zip].filter(Boolean).join(', ') : ev.address, ev.city, STATES[ev.state], ev.host, ev.hostTitle, ev.audience, ev.name, ev.phone].filter(Boolean).join(' | '),
    dateKey: d && `${d.y}-${d.m}-${d.d}`, timeKey: ev.time && timeKey(ev.time), phoneKey: ev.phone && phonesIn(ev.phone)[0]?.key,
  };
}
// What each kind of text is scanned for (tokens always).
export const SCAN = {
  event: { dates: true, times: true, phones: true, budget: true, hashtags: true }, library: { dates: true, times: true, budget: true, hashtags: true },
  caption: { dates: true, times: true, phones: true, hashtags: true }, plan: { dates: true, phones: true, hashtags: true }, source: { dates: true, times: true, phones: true, hashtags: true },
};
export function leftovers(text, ref, own, o = {}) {
  const found = new Map(), allow = own.allow.filter((a) => !a.startsWith('kit:')), ok = (s) => allow.some((a) => a.includes(s));
  const hostForms = new Set(ref.tokens.filter((t) => HOST_KINDS.has(t.what)).map((t) => t.str.toLowerCase()));
  const isOwn = (t) => (t.hostOf && t.hostOf === own.host) || wordRe(t.str, t.ci ? 'i' : '').test(own.blob) || (t.of && wordRe(t.of).test(own.blob));
  // a longer name found is taken out, so "Shade" is listed only where "Shade Hotel" is not; host facts are looked for
  // in a copy with the allowed phrases taken out (an entry that is only a host fact takes nothing out)
  let rest = text, hostRest = allow.filter((a) => !hostForms.has(a.trim().toLowerCase())).reduce((r, a) => r.split(a).join(' '), text);
  for (const tok of [...ref.tokens].sort((a, b) => b.str.length - a.str.length)) { // "of": the long form an abbreviation stands for
    const re = wordRe(tok.str, tok.ci ? 'i' : '');
    if (isOwn(tok) || (HOST_KINDS.has(tok.what) ? !re.test(hostRest) : ok(tok.str) || !re.test(rest))) continue;
    found.set(tok.str, tok.what);
    const g = wordRe(tok.str, tok.ci ? 'gi' : 'g');
    rest = rest.replace(g, ' '); hostRest = hostRest.replace(g, ' ');
  }
  // hashtags and handles, compared letters-only: a name of 5+ letters anywhere inside ("#manhattanbeach", "@JoshStech",
  // "@MariaStech"), a shorter one as the whole tag, or at its start or end when the template used that tag ("#lainvestors")
  if (o.hashtags) for (const tag of new Set(text.match(TAG_RE) || [])) {
    const t = tagKey(tag);
    if (!t || found.has(tag)) continue;
    const hit = ref.tokens.find((tok) => {
      if (tok.what === 'host title' || tok.what === 'host bio' || isOwn(tok)) return false;
      const c = tagKey(tok.str);
      return c.length >= 5 ? t.includes(c) : c.length > 0 && (t === c || (ref.tags.has(t) && (t.startsWith(c) || t.endsWith(c))));
    });
    if (!hit || (HOST_KINDS.has(hit.what) ? !hostRest.includes(tag) : ok(tag))) continue;
    found.set(tag, `${hit.what} ${tag[0] === '@' ? 'handle' : 'hashtag'}`);
  }
  if (o.dates) for (const d of datesIn(text, own.date)) if (d.real && ref.dates.has(d.key) && d.key !== own.dateKey && !ok(d.str)) found.set(d.str, 'date');
  if (o.times) for (const t of timesIn(text)) if (ref.times.has(t.key) && t.key !== own.timeKey && !ok(t.str)) found.set(t.str, 'time');
  if (o.phones) for (const p of phonesIn(text)) if (ref.phones.has(p.key) && p.key !== own.phoneKey && !ok(p.str)) found.set(p.str, 'phone');
  if (o.budget && ref.budget && own.budget && ref.budget !== own.budget) {
    const money = `$${ref.budget.toLocaleString('en-US')}`;
    for (const m of text.match(/\$\d[\d,]*(?:\.\d+)?/g) || []) if (m === money && !ok(m)) found.set(m, 'paid budget');
  }
  return [...found].map(([s, what]) => `"${s}" (${what})`);
}
// "_allow" entries that cannot work: one that is only another host's name, handle, title or bio fact (it accepts
// nothing), and a "kit:" entry that names no kit file.
export function allowProblems(allow, refs, ownHost, manifest) {
  const out = [];
  for (const a of allow) {
    if (a.startsWith('kit:')) { if (!manifest.assets?.[a.slice(4)] && !manifest.clips?.[a.slice(4)]) out.push(`event.json: "_allow" entry "${a}" names no file in engine/kit/assets.json`); continue; }
    for (const r of refs) if (r.ev.host !== ownHost && r.tokens.some((t) => HOST_KINDS.has(t.what) && t.str.toLowerCase() === a.trim().toLowerCase())) out.push(`event.json: "_allow" entry "${a}" is only ${r.ev.host}'s name or bio, which would accept it anywhere, so it accepts nothing: list the whole deliberate phrase as it appears instead (and "kit:<file>" for a photo)`);
  }
  return [...new Set(out)];
}

// ---- This event's own dates
// Each "<Weekday>, <Mon.> <D>" must be a real date on that weekday (the year as written, else the occurrence nearest the
// event); a bare weekday that is the template's event day and not this event's ("Last call for Thursday" for a Friday
// event) is the template's; and a time right after this event's own date ("Friday, Dec. 4 · 7 p.m.") must be its start
// time. An "_allow" entry accepts what it contains, as for leftovers.
const WEEKDAY_RE = new RegExp(`(?<![\\p{L}\\p{N}])(${DAYS.join('|')})(?![\\p{L}\\p{N}])`, 'gu');
export function dateProblems(text, ev, templateWeekdays = [], allow = []) {
  const out = new Map(), ok = (s) => allow.some((a) => !a.startsWith('kit:') && a.includes(s));
  const own = validDate(ev.date) ? dateParts(ev.date) : null, ownKey = own && `${own.y}-${own.m}-${own.d}`, ownTime = ev.time && timeKey(ev.time);
  const dated = new Set(); // where a weekday starts a date
  for (const d of datesIn(text, ev.date)) {
    if (d.iso) continue;
    const wd = new RegExp(`(?<![\\p{L}\\p{N}])(${DAYS.join('|')}),?\\s+$`, 'u').exec(text.slice(Math.max(0, d.at - 12), d.at));
    if (wd) dated.add(d.at - wd[0].length);
    const shown = (wd ? `${wd[1]}, ` : '') + d.str;
    if (!d.real) { if (!ok(shown)) out.set(shown, 'not a real date'); continue; }
    const day = DAYS[new Date(Date.UTC(d.y, d.m - 1, d.d)).getUTCDay()];
    if (wd && wd[1] !== day && !ok(shown)) out.set(shown, `${d.str}, ${d.y} is a ${day}`);
    if (d.key === ownKey && ownTime) {
      const t = /^\s*(?:·|,\s*at|,|at|–|—|-|\|)?\s*(\d{1,2}(?::\d{2})?\s?[ap]\.m\.|noon|midnight)/.exec(text.slice(d.end, d.end + 30));
      if (t && timeKey(t[1]) !== ownTime && !ok(t[1])) out.set(`${shown} · ${t[1]}`, `this event starts at ${ev.time}`);
    }
  }
  if (own) for (const w of text.matchAll(WEEKDAY_RE)) {
    if (w[1] === own.weekday || !templateWeekdays.includes(w[1]) || dated.has(w.index) || ok(w[1])) continue;
    out.set(w[1], `the template's event day; this event is on a ${own.weekday}`);
  }
  return [...out].map(([s, why]) => `"${s}" (${why})`);
}

// ---- Kit files
// Kit files a source uses: /kit/assets/ references, and in a spec every image file name (whatever the key: "img",
// "side", a collage's "imgs") and every "clip"; a "josh" scene always shows josh-polo-cutout.png.
const IMAGE_FILE = /^[\w.-]+\.(?:jpe?g|png|svg|webp|gif|avif)$/i;
export function kitUses(raw, ext) {
  const uses = [], asset = (name) => uses.push({ name, table: 'assets' });
  for (const m of raw.matchAll(/\/kit\/assets\/([^"')\s\\]+)/g)) asset(m[1]);
  if (ext === 'json') {
    const walk = (v, k) => {
      if (typeof v === 'string') { if (k === 'clip') uses.push({ name: v, table: 'clips' }); else if (IMAGE_FILE.test(v)) asset(v); }
      else if (Array.isArray(v)) v.forEach((x) => walk(x, k));
      else if (v && typeof v === 'object') for (const [kk, x] of Object.entries(v)) walk(x, kk);
    };
    const spec = JSON.parse(raw);
    walk(spec);
    if ((spec.scenes || []).some((s) => s?.type === 'josh')) uses.push({ name: 'josh-polo-cutout.png', table: 'assets', scene: 'josh' });
  }
  return uses;
}
// Checked against engine/kit/assets.json: unregistered files, another event's venue photos, clips and QR code, a photo
// of someone who is not the host ("use":"person"; a "use":"photo" of a past dinner, such as sac-dinner.jpg, may show
// anyone), and this event's own QR code, map or screenshot registered without "text": true (the change pipeline holds
// a request that newly adds an image with its own text only when it is marked). "_allow" "kit:<file>" accepts a file.
export function kitProblems(raw, ext, manifest, slug, own) {
  const out = [];
  for (const u of kitUses(raw, ext)) {
    const e = manifest[u.table]?.[u.name];
    if (!e) { out.push(`${u.table === 'clips' ? 'clip ' : ''}${u.name} is not registered in kit/assets.json`); continue; }
    if (own.allow.includes(`kit:${u.name}`)) continue;
    if (e.event && e.event !== slug) out.push(`uses ${u.table === 'clips' ? 'clip ' : ''}${u.name}, which belongs to ${e.event}`);
    if (e.person && e.person !== own.host && e.use !== 'photo') out.push(u.scene ? `has a "${u.scene}" scene, which always shows ${e.person} (${u.name}), who is not this event's host` : `uses ${u.name}, a photo of ${e.person}, who is not this event's host`);
    if (e.event === slug && !e.text && /(?:^|[-_.])(?:qr|map|screenshot)(?:[-_.]|$)/i.test(u.name)) out.push(`uses ${u.name}, a QR code, map or screenshot, registered without "text": true in kit/assets.json (add it: the change pipeline then holds a request that adds it for approval)`);
  }
  return [...new Set(out)];
}

// ---- Render records
// render.mjs writes one record per output it renders into engine/.cache/renders/ (git-ignored): the output's hash and
// the hash of every file the render read (the source, the kit files and clips, the engine). check-event compares them:
// an output whose record still matches it, but whose source or kit files changed since, is stale. An output with no
// record (rendered in another checkout), or one replaced since (a pull, the change pipeline), cannot be judged here.
export const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const realish = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
export const renderRecordFile = (engineDir, outFile) => path.join(engineDir, '.cache/renders', `${crypto.createHash('sha1').update(realish(outFile)).digest('hex')}.json`);
export function renderState(engineDir, outFile) {
  let r;
  try { r = JSON.parse(fs.readFileSync(renderRecordFile(engineDir, outFile), 'utf8')); } catch { return { state: 'unknown' }; }
  if (r.outHash !== sha256(outFile)) return { state: 'unknown' };
  const changed = Object.entries(r.deps || {}).filter(([rel, h]) => { const p = path.join(engineDir, rel); return !fs.existsSync(p) || sha256(p) !== h; }).map(([rel]) => rel);
  return { state: changed.length ? 'stale' : 'fresh', changed };
}
// A rendered file that is empty or not the format its name says (a placeholder, a failed copy).
export function badOutput(file) {
  const fd = fs.openSync(file, 'r'), b = Buffer.alloc(12), n = fs.readSync(fd, b, 0, 12, 0);
  fs.closeSync(fd);
  if (!n) return 'is empty';
  const ext = path.extname(file).toLowerCase();
  const okType = ext === '.jpg' || ext === '.jpeg' ? b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff : ext === '.png' ? b.toString('latin1', 1, 4) === 'PNG'
    : ext === '.pdf' ? b.toString('latin1', 0, 4) === '%PDF' : ext === '.mp4' ? b.toString('latin1', 4, 8) === 'ftyp' : true;
  return okType ? null : `is not a valid ${ext.slice(1).toUpperCase()} file`;
}
