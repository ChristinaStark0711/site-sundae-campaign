// Helpers shared by the event tools: AP-style dates (same rules as src/lib/format.ts), flag parsing and input checks,
// and the leftover-fact scan that new-event.mjs reports and check-event.mjs enforces.
import fs from 'node:fs';
import path from 'node:path';

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
export const KINDS = ['images', 'flyers', 'videos', 'reels'];
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
// that is also this event's own fact or that its event.json "_allow" list covers (an "_allow" string accepts every
// match it contains, e.g. "Sacramento · Echo & Rig" or "7:35 p.m."). Sundae's own facts are never on the list.
const MONTH_NUM = Object.fromEntries([...MONTHS.map((m, i) => [m, i + 1]), ...MONTHS_FULL.map((m, i) => [m, i + 1])]);
const DATE_RE = /\b(Jan\.|Feb\.|Aug\.|Sept\.|Oct\.|Nov\.|Dec\.|January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?![\d:])/g;
const TIME_RE = /\b(\d{1,2})(?::(\d{2}))?\s?([ap])\.m\./g;
const PHONE_RE = /(?<![\d-])\(?(\d{3})\)?[-.\s]?(\d{3})[-.](\d{4})(?![\d-])/g;
const ISO_RE = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g; // 2026-10-08 (file and folder names in plans)
export const datesIn = (s) => [...s.matchAll(DATE_RE)].map((m) => ({ str: m[0], key: `${MONTH_NUM[m[1]]}-${+m[2]}` }))
  .concat([...s.matchAll(ISO_RE)].filter((m) => validDate(m[0])).map((m) => ({ str: m[0], key: `${+m[2]}-${+m[3]}` })));
export const timesIn = (s) => [...s.matchAll(TIME_RE)].map((m) => ({ str: m[0], key: `${+m[1]}:${m[2] || '00'}${m[3]}` }));
export const phonesIn = (s) => [...s.matchAll(PHONE_RE)].map((m) => ({ str: m[0], key: m[1] + m[2] + m[3] }));
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
// Another event's city, venue, room and street (not its lone short forms): new-event lists them and check-event warns.
export const otherEventRef = (o) => ({ slug: o.slug, tokens: factTokens({ venue: o.venue, space: o.space, address: o.address, city: o.city }).filter((t) => !t.lone && ['city', 'venue', 'room', 'street'].includes(t.what)), dates: new Set(), times: new Set(), phones: new Map() });
// The names that tie text to one event: venue (and its short forms), room, street, ZIP, city, audience area, host.
// One-word short forms ("Shade", "Courtyard") are marked lone: only the template scan uses them.
export function factTokens(ev) {
  const t = [], add = (str, what, lone, of) => { str = str?.trim(); if (str && str.length > 1 && !t.some((x) => x.str === str)) t.push({ str, what, ...(lone && { lone }), ...(of && { of }) }); };
  add(ev.city, 'city');
  if (ev.venue && ev.venue !== VENUE_TBD) {
    add(ev.venue, 'venue');
    const core = ev.city ? ev.venue.replace(wordRe(ev.city, 'g'), ' ').replace(/\s+/g, ' ').trim() : ev.venue; // "Shade Hotel"
    if (core.length >= 4) add(core, 'venue');
    const w = core.split(' ');
    if (w.length === 2 && VENUE_NOUN.test(w[1]) && /^\p{Lu}\p{Ll}{2,}$/u.test(w[0]) && !COMMON_WORD.test(w[0])) add(w[0], 'venue', true); // a lone "Shade"
  }
  if (ev.space) { add(ev.space, 'room'); add(ev.space.replace(/^The\s+/, ''), 'room', true); }
  const a = addressParts(ev.address);
  if (a.street) {
    add(a.street, 'street');
    const name = a.street.replace(/^\d+[A-Za-z]?\s+/, '').replace(/^(?:N|S|E|W|NE|NW|SE|SW)\.?\s+/, ''); // "Valley Drive"
    if (name !== a.street && name.split(' ').length >= 2) add(name, 'street');
  }
  add(a.zip, 'ZIP');
  const place = /^(.+?)(?:-area)?\s+real estate\b/i.exec(ev.audience || '')?.[1]; // "Los Angeles real estate operators"
  if (place && /^\p{Lu}/u.test(place)) { add(place, 'audience area'); if (place === 'Los Angeles') add('LA', 'audience area', false, place); }
  if (ev.host) { add(ev.host, 'host'); const [first, ...rest] = ev.host.split(' '); if (rest.length) { add(rest.join(' '), 'host'); if (first.length >= 3) add(first, 'host'); } }
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
// show and posting times are not facts another event's creative would carry over).
export function refFacts(repo, slug) {
  const ev = JSON.parse(fs.readFileSync(path.join(repo, 'src/content/events', slug, 'event.json'), 'utf8'));
  const mats = eventMaterials(repo, slug), all = mats.map((m) => m.text).join('\n'), noPlans = mats.filter((m) => m.kind !== 'plan').map((m) => m.text).join('\n');
  const pjf = path.join(repo, 'src/content/events', slug, 'projections.json');
  const budget = fs.existsSync(pjf) ? JSON.parse(fs.readFileSync(pjf, 'utf8')).scenarios?.base?.paid_budget : undefined;
  return { slug, ev, tokens: factTokens(ev), dates: new Set(datesIn(all).map((d) => d.key)), times: new Set(timesIn(noPlans).map((t) => t.key)), phones: new Map(phonesIn(all).map((p) => [p.key, p.str])), budget };
}
export function ownFacts(ev, budget) {
  const d = validDate(ev.date) ? dateParts(ev.date) : null;
  return {
    host: ev.host, allow: Array.isArray(ev._allow) ? ev._allow.filter((x) => typeof x === 'string') : [], budget,
    blob: [ev.venue, ev.space, ev.address, ev.city, STATES[ev.state], ev.host, ev.hostTitle, ev.audience, ev.name, ev.phone].filter(Boolean).join(' | '),
    dateKey: d && `${d.m}-${d.d}`, timeKey: ev.time && timesIn(ev.time)[0]?.key, phoneKey: ev.phone && phonesIn(ev.phone)[0]?.key,
  };
}
// What each kind of text is scanned for (tokens always).
export const SCAN = {
  event: { dates: true, times: true, phones: true, budget: true }, library: { dates: true, times: true, budget: true },
  caption: { dates: true, times: true, phones: true, hashtags: true }, plan: { dates: true, phones: true }, source: { dates: true, times: true, phones: true },
};
export function leftovers(text, ref, own, o = {}) {
  const found = new Map(), ok = (s) => own.allow.some((a) => a.includes(s));
  let rest = text; // a longer name found is taken out, so "Shade" is listed only where "Shade Hotel" is not
  for (const { str, what, of } of [...ref.tokens].sort((a, b) => b.str.length - a.str.length)) { // "of": the long form an abbreviation stands for
    if (wordRe(str).test(own.blob) || (of && wordRe(of).test(own.blob)) || ok(str) || !wordRe(str).test(rest)) continue;
    found.set(str, what); rest = rest.replace(wordRe(str, 'g'), ' ');
  }
  if (o.hashtags) for (const tag of text.match(/#[\p{L}\p{N}_]+/gu) || []) {
    const t = tag.toLowerCase(), hit = ref.tokens.find(({ str }) => { const c = str.toLowerCase().replace(/[^a-z0-9]/g, ''); return c.length >= 5 && t.includes(c) && !own.blob.toLowerCase().replace(/[^a-z0-9]/g, '').includes(c); });
    if (hit && !ok(tag)) found.set(tag, `${hit.what} hashtag`);
  }
  if (o.dates) for (const d of datesIn(text)) if (ref.dates.has(d.key) && d.key !== own.dateKey && !ok(d.str)) found.set(d.str, 'date');
  if (o.times) for (const t of timesIn(text)) if (ref.times.has(t.key) && t.key !== own.timeKey && !ok(t.str)) found.set(t.str, 'time');
  if (o.phones) for (const p of phonesIn(text)) if (ref.phones.has(p.key) && p.key !== own.phoneKey && !ok(p.str)) found.set(p.str, 'phone');
  if (o.budget && ref.budget && own.budget && ref.budget !== own.budget) {
    const money = `$${ref.budget.toLocaleString('en-US')}`;
    for (const m of text.match(/\$\d[\d,]*(?:\.\d+)?/g) || []) if (m === money && !ok(m)) found.set(m, 'paid budget');
  }
  return [...found].map(([s, what]) => `"${s}" (${what})`);
}
// Kit files a source uses (a "josh" scene always shows josh-polo-cutout.png), checked against engine/kit/assets.json:
// another event's venue photos, clips and QR code, unregistered clips, and photos of someone who is not the host.
export function kitUses(raw, ext) {
  const uses = [...raw.matchAll(/\/kit\/assets\/([^"')\s]+)|"(?:img|side)":\s*"([^"]+)"/g)].map((m) => ({ name: (m[1] || m[2]).replace(/^\/kit\/assets\//, ''), table: 'assets' }));
  for (const m of raw.matchAll(/"clip":\s*"([^"]+)"/g)) uses.push({ name: m[1], table: 'clips' });
  if (ext === 'json' && /"type":\s*"josh"/.test(raw)) uses.push({ name: 'josh-polo-cutout.png', table: 'assets', scene: 'josh' });
  return uses;
}
export function kitProblems(raw, ext, manifest, slug, own) {
  const out = [];
  for (const u of kitUses(raw, ext)) {
    const e = manifest[u.table]?.[u.name];
    if (!e) { if (u.table === 'clips') out.push(`clip ${u.name} is not in kit/assets.json`); continue; }
    if (e.event && e.event !== slug) out.push(`uses ${u.table === 'clips' ? 'clip ' : ''}${u.name}, which belongs to ${e.event}`);
    if (e.person && e.person !== own.host && !own.allow.some((a) => a.includes(e.person))) out.push(u.scene ? `has a "${u.scene}" scene, which always shows ${e.person} (${u.name}), who is not this event's host` : `uses ${u.name}, a photo of ${e.person}, who is not this event's host`);
  }
  return [...new Set(out)];
}
