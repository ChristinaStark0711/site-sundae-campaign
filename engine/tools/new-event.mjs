// Scaffold a new event from an existing one (default: the Manhattan Beach dinner). Mechanical only: it copies the
// template's catalogue, creative sources, captions and plans, swaps the facts it can, writes projections, and lists
// every template fact it still finds (venue, room, street, ZIP, phone, city, audience area, host, dates, times, paid
// budget, another event's kit files; see "Leftover facts" in ap.mjs). Nothing is rendered or published. The list is
// what a text scan can find; it does not replace looking at every rendered asset.
//   node engine/tools/new-event.mjs --city "San Diego" --state CA --date 2026-11-12 --time "7 p.m." \
//     --venue "Hotel Name" [--space "The Rooftop"] [--address "123 Main St., San Diego, CA 92101"] [--phone 619-555-0100] \
//     [--host "Josh Stech"] [--host-title "co-founder and CEO of Sundae"] [--audience "San Diego real estate operators"] \
//     [--rsvp https://…] [--seat-cap 60] [--budget 5000 | 3000,5000,8000] [--cpl 75,60,50] [--organic 35,45,60] \
//     [--included "Dinner and drinks · Seats limited"] [--name "Private Dinner & Dialogue"] [--from manhattan-beach-2026-10-08]
// Venue not set yet: add --no-creative (--venue may be left out or "TBD"). It writes the record, captions, plans and
// projections with an empty creative library. Once the venue is confirmed, add the creative to that event:
//   node engine/tools/new-event.mjs --add-creative <slug> --venue "Hotel Name" [--space …] [--address …] [--phone …] [--time …]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  AP_TIME, KINDS, SCAN, STATES, VENUE_TBD, addressParts, apDay, apFull, apShort, dateParts, dateProblems, eventMaterials, factTokens, flags, isHostItem,
  kitProblems, kitUses, leftovers, otherEventRef, ownFacts, parseBudget, parseSeatCap, parseTrio, phonesIn, refFacts, slugify, unknownFlags, validDate, venueCore,
} from './ap.mjs';

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ENGINE, '..');
const EVENTS = path.join(REPO, 'src/content/events');
const USAGE = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l, i, a) => a.slice(0, i + 1).every((x) => x.startsWith('//'))).join('\n');
const f = flags(process.argv.slice(2));
const fail = (msg) => { console.error(`new-event: ${msg}\n\n${USAGE}`); process.exit(2); };
const str = (k) => (typeof f[k] === 'string' && f[k].trim() ? f[k].trim() : undefined);
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const TEXT = ['city', 'state', 'date', 'time', 'venue', 'space', 'address', 'phone', 'host', 'host-title', 'audience', 'rsvp', 'included', 'name', 'from', 'seat-cap', 'budget', 'cpl', 'organic'];
const bad = unknownFlags(f, [...TEXT, 'no-creative', 'add-creative']);
if (bad.length || f._.length) fail(`unknown ${bad.length ? `flag --${bad.join(', --')}` : `argument ${f._.join(' ')}`}`);
const problems = TEXT.filter((k) => f[k] === true && !['seat-cap', 'budget', 'cpl', 'organic'].includes(k)).map((k) => `--${k} needs a value`); // the numbers report their own
const addTo = str('add-creative'), noCreative = f['no-creative'] !== undefined;
if (f['add-creative'] === true) problems.push('--add-creative needs the event slug');
if (addTo && noCreative) problems.push('--add-creative and --no-creative do not go together');
const tbd = (v) => !v || /^(tbd|tba|to be (announced|determined))$/i.test(v);
if (tbd(str('venue')) && !noCreative) problems.push(addTo ? '--add-creative needs the confirmed --venue' : '--venue is required (add --no-creative while the venue is not set)');
if (str('time') && !AP_TIME.test(str('time'))) problems.push(`--time "${str('time')}" is not an AP-style time (7 p.m., 6:30 p.m., noon)`);
if (str('phone') && phonesIn(str('phone')).length !== 1) problems.push(`--phone "${str('phone')}" is not one phone number (310-546-4995)`);
const cap = parseSeatCap(f['seat-cap']), budget = parseBudget(f.budget), cpl = parseTrio(f.cpl, 'cpl', '75,60,50'), organic = parseTrio(f.organic, 'organic', '35,45,60');
problems.push(...[cap, budget, cpl, organic].map((x) => x.error).filter(Boolean));

let ev, slug;
if (addTo) { // add the creative to an event scaffolded with --no-creative
  slug = addTo;
  if (!fs.existsSync(path.join(EVENTS, slug, 'event.json'))) fail(`no event ${slug} (src/content/events/${slug}/event.json)`);
  const lib = fs.existsSync(path.join(EVENTS, slug, 'library.json')) ? J(path.join(EVENTS, slug, 'library.json')) : {};
  if (Object.values(lib).some((a) => a.length) || KINDS.some((k) => fs.existsSync(path.join(ENGINE, 'creatives/events', slug, k)))) problems.push(`${slug} already has a creative library or sources`);
  for (const k of ['city', 'state', 'date', 'host', 'host-title', 'audience', 'rsvp', 'name', 'seat-cap', 'budget', 'cpl', 'organic']) if (f[k] !== undefined) problems.push(`--${k} does not apply to --add-creative (edit event.json, or rerun event-model.mjs)`);
  if (problems.length) fail(problems.join('\n'));
  ev = J(path.join(EVENTS, slug, 'event.json'));
  Object.assign(ev, { venue: str('venue'), ...(str('space') && { space: str('space') }), ...(str('address') && { address: str('address') }), ...(str('phone') && { phone: str('phone') }), ...(str('time') && { time: str('time') }) });
} else {
  for (const k of ['city', 'state', 'date']) if (!str(k)) problems.push(`--${k} is required`);
  if (str('state') && !STATES[str('state').toUpperCase()]) problems.push(`--state ${str('state')} is not a US state code (CA, TX, NY …)`);
  if (str('date') && !validDate(str('date'))) problems.push(`--date ${str('date')} is not a real calendar date (YYYY-MM-DD)`);
  if (problems.length) fail(problems.join('\n'));
}
const from = str('from') || ev?._from || 'manhattan-beach-2026-10-08';
if (!fs.existsSync(path.join(EVENTS, from, 'library.json'))) fail(`template ${from} has no library.json (pick a campaign event with --from)`);
const T = J(path.join(EVENTS, from, 'event.json'));

if (!addTo) {
  const city = str('city'), state = str('state').toUpperCase(), date = str('date');
  slug = `${slugify(city)}-${date}`;
  if (fs.existsSync(path.join(EVENTS, slug))) { console.error(`new-event: ${slug} already exists`); process.exit(1); }
  const host = str('host') || T.host;
  ev = {
    slug, kind: 'campaign', name: str('name') || T.name, audience: str('audience') || `${city}-area real estate operators`,
    city, state, citySlug: `${slugify(city)}-${state.toLowerCase()}`, date, time: str('time'),
    venue: tbd(str('venue')) ? VENUE_TBD : str('venue'), space: str('space'), address: str('address'), phone: str('phone'),
    host, hostTitle: str('host-title') || (host === T.host ? T.hostTitle : undefined), rsvp: str('rsvp'),
    media: `/media/events/${slug}`, prepared: new Date().toISOString().slice(0, 10),
    headline: 'TODO headline', summary: 'TODO summary', strategy: 'TODO strategy', creativeNote: 'TODO creative note', sources: 'TODO sources',
    moves: [['TODO move', 'TODO detail']], plans: T.plans.map((p) => ({ ...p })), actuals: null, _from: from,
    _todo: ['event.json text (headline, summary, strategy, creativeNote, sources, moves) and each plan title and blurb', 'plans (remove the TODO line)', 'captions (remove each "_draft")', 'city photo'],
  };
}
const venueKnown = ev.venue !== VENUE_TBD;
const included = str('included') || 'Dinner and drinks · Seats limited';
const creative = !noCreative;
if (creative) ev._todo = [...new Set([...(ev._todo || []).filter((t) => !t.startsWith('creative: waits for the venue')), 'creative (venue photos, copy, QR code, videos)', 'render and lint'])];
else ev._todo.push(`creative: waits for the venue. To publish without it, remove this line and note why in status.md; once the venue is confirmed run node engine/tools/new-event.mjs --add-creative ${slug} --venue "…"`);

// Fact swaps, made in one pass (a swapped-in value is never swapped again), longest first.
const Tp = dateParts(T.date), Np = dateParts(ev.date);
const tVenueFull = `${T.space ? T.space + ' at ' : ''}${T.venue}`, nVenueFull = `${ev.space ? ev.space + ' at ' : ''}${ev.venue}`;
// the venue without its city ("Shade Hotel", "Peerless Hotel"), as the copy names it next to the city or the room
const tCore = venueCore(T.venue, T.city), nCore = venueCore(ev.venue, ev.city);
const tLone = factTokens(T).find((t) => t.what === 'venue' && t.lone)?.str; // "Shade", as in "Shade Manhattan Beach"
const atRoom = (space, core, the = true) => `${space ? `${the ? space : space.replace(/^The\s+/, '')} at ` : ''}${core}`;
const tA = addressParts(T.address), nA = addressParts(ev.address);
const tPhones = [...new Set(eventMaterials(REPO, from, ['source']).flatMap((m) => phonesIn(m.text).map((p) => p.str)))];
// Without a new venue or street, the template's are kept whole (never half-swapped into a made-up address, or next to
// the new city): the report lists them.
const keep = (...xs) => xs.filter(Boolean).map((x) => [x, x]);
const tCityLine = tA.city && `${tA.city}, ${tA.st}${tA.zip ? ' ' + tA.zip : ''}`; // "Manhattan Beach, CA 90266"
const venuePairs = venueKnown
  ? [[tVenueFull, nVenueFull], [T.venue, ev.venue], ...(tCore !== T.venue ? [
    [atRoom(T.space, tCore), atRoom(ev.space, nCore)], [atRoom(T.space, tCore, false), atRoom(ev.space, nCore, false)], [tCore, nCore], // "The Courtyard at Shade Hotel"
    ...(tLone ? [[`${tLone} ${T.city}`, ev.venue]] : []), // "Shade Manhattan Beach"
  ] : [])]
  : keep(tVenueFull, T.venue, `${tCore} · ${T.city}`, `${tCore}, ${T.city}`, tLone && `${tLone} ${T.city}`);
const pairs = [
  [apFull(T.date), apFull(ev.date)], [apDay(T.date), apDay(ev.date)], [`${Tp.weekday} · `, `${Np.weekday} · `],
  [apShort(T.date), apShort(ev.date)], [`${Tp.month}&nbsp;${Tp.d}`, `${Np.month}&nbsp;${Np.d}`],
  ...venuePairs,
  // the address and its short forms: "1221 N. Valley Drive · Manhattan Beach", "…<br>Manhattan Beach, CA 90266"
  ...(venueKnown && nA.street ? [[T.address, ev.address], [tA.street, nA.street], ...(nA.city ? [[tCityLine, `${nA.city}, ${nA.st}${nA.zip ? ' ' + nA.zip : ''}`]] : [])] : keep(T.address, tCityLine, tA.street && `${tA.street} · ${T.city}`)),
  ...(venueKnown && ev.phone && tPhones.length === 1 ? [[tPhones[0], ev.phone]] : []),
  [`${T.city}, ${STATES[T.state] || T.state}`, `${ev.city}, ${STATES[ev.state] || ev.state}`], [`${T.city}, ${T.state}`, `${ev.city}, ${ev.state}`], [T.city, ev.city],
  ...(T.time && ev.time ? [[T.time, ev.time]] : []),
].filter(([a, b]) => a && b);
const map = new Map(pairs.reverse()); // the first pair for a key wins
// a key that starts or ends with a digit matches only a whole number there ("Nov. 2" is not the start of "Nov. 25")
const swapRe = new RegExp([...map.keys()].sort((a, b) => b.length - a.length).map((s) => `${/^\d/.test(s) ? '(?<!\\d)' : ''}${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${/\d$/.test(s) ? '(?!\\d)' : ''}`).join('|'), 'g');
// a date card split across two elements: <div>Oct.</div><div>8</div>
const splitDate = new RegExp(`(>\\s*)${Tp.month.replace('.', '\\.')}(\\s*</[a-z0-9]+>\\s*(?:<[a-z][^>]*>\\s*)+)${Tp.d}(?!\\d)`, 'g');
const swap = (s) => (typeof s === 'string' ? s.replace(splitDate, `$1${Np.month}$2${Np.d}`).replace(swapRe, (m) => map.get(m)) : s);
const swapAll = (v) => (typeof v === 'string' ? swap(v) : Array.isArray(v) ? v.map(swapAll) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swapAll(x)])) : v);

const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const dir = path.join(EVENTS, slug);
const tLib = J(path.join(EVENTS, from, 'library.json'));
// file names that carry the template's city ("06-sacramento-to-manhattan-beach.jpg") get this event's
const rename = (x) => (x && slugify(T.city) !== slugify(ev.city) ? x.split(slugify(T.city)).join(slugify(ev.city)) : x);
const lib = Object.fromEntries(KINDS.map((k) => [k, creative ? (tLib[k] || []).filter((a) => !a.variantOf).map(({ rev, updated, ...a }) => ({
  ...a, title: swap(a.title), file: rename(a.file), ...(a.pdf ? { pdf: rename(a.pdf) } : {}), ...(a.poster ? { poster: rename(a.poster) } : {}), use: swap(a.use), ...(a.pair ? { pair: swap(a.pair) } : {}),
})) : []]));
write(path.join(dir, 'library.json'), JSON.stringify(lib, null, 2) + '\n');
if (creative) {
  // The motion engine's event block (engine/README.md, "event block"): every fact a scene shows must be given, or the
  // render fails rather than falling back to the template's facts. The CTA host line is set whenever the host is not
  // the template's (the engine's default line names Josh Stech).
  // The venue rows sit next to the city (the CTA place line is hotel + city, the date card venueShort over cityLine),
  // so they name the venue without its city, as the template's do ("The Courtyard at Shade Hotel", "Shade Hotel").
  const sameHost = ev.host === T.host;
  const eventBlock = {
    weekday: Np.weekday, month: Np.month, day: String(Np.d), time: ev.time, venue: atRoom(ev.space, nCore), venueShort: atRoom(ev.space, nCore.replace(/ Hotel$/, '')), hotel: nCore,
    city: ev.city, cityLine: `${ev.city}, ${STATES[ev.state] || ev.state}`, address: ev.address?.replace(/,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/, ''), included, name: ev.name,
  };
  for (const k of KINDS) for (const a of lib[k]) {
    const ext = k === 'videos' || k === 'reels' ? 'json' : 'html';
    let s = fs.readFileSync(path.join(ENGINE, 'creatives/events', from, k, `${a.id}.${ext}`), 'utf8');
    if (ext === 'html') s = swap(s);
    else { // swap inside the spec's strings (its raw text escapes some characters, e.g. "\u00b7")
      const j = swapAll(JSON.parse(s)), t = j.event || {};
      j.event = Object.fromEntries(Object.entries({ ...eventBlock, nameLines: t.nameLines, pill: t.pill, hostLine: sameHost ? t.hostLine : `with ${ev.host}${ev.hostTitle ? `, ${ev.hostTitle}` : ''}` }).filter(([, v]) => v));
      s = JSON.stringify(j, null, 1) + '\n';
    }
    write(path.join(ENGINE, 'creatives/events', slug, k, `${a.id}.${ext}`), s);
  }
}
if (!addTo) {
  // captions and plans: swapped drafts, each flagged until rewritten (check-event.mjs blocks on "_draft" and TODO)
  const caps = J(path.join(EVENTS, from, 'captions.json')).map((c) => ({ ...Object.fromEntries(Object.entries(c).map(([k, v]) => [k, swap(v)])), _draft: `TODO: rewrite for ${ev.city}; this is the ${T.city} caption with the facts swapped` }));
  write(path.join(dir, 'captions.json'), JSON.stringify(caps, null, 2) + '\n');
  for (const p of ev.plans) write(path.join(dir, 'plans', p.file), `<!-- TODO: rewrite this plan for ${ev.city} (${apFull(ev.date)}); it is the ${T.city} plan with the facts swapped -->\n` + swap(fs.readFileSync(path.join(EVENTS, from, 'plans', p.file), 'utf8')));
  ev.plans = ev.plans.map((p) => ({ ...p, title: swap(p.title).replace(/fill the Courtyard/i, 'fill the room'), blurb: swap(p.blurb) }));
}
write(path.join(dir, 'event.json'), JSON.stringify(ev, null, 2) + '\n');
if (!addTo) {
  const args = ['--seat-cap', String(cap.value ?? 60), ...(f.budget ? ['--budget', String(f.budget)] : []), ...(f.cpl ? ['--cpl', String(f.cpl)] : []), ...(f.organic ? ['--organic', String(f.organic)] : [])];
  execFileSync(process.execPath, [path.join(ENGINE, 'tools/event-model.mjs'), slug, ...args], { stdio: 'inherit' });
}

// The report: every template fact and kit file still in the new event's text, and any mention of another event's venue
// (check-event.mjs warns on those: fine only when true and deliberate).
const ref = refFacts(REPO, from);
const others = fs.readdirSync(EVENTS).filter((d) => d !== slug && d !== from && fs.existsSync(path.join(EVENTS, d, 'event.json'))).map((d) => J(path.join(EVENTS, d, 'event.json')))
  .map(otherEventRef);
const pjf = path.join(dir, 'projections.json');
const own = ownFacts(ev, fs.existsSync(pjf) ? J(pjf).scenarios?.base?.paid_budget : undefined);
const manifest = J(path.join(ENGINE, 'kit/assets.json'));
const report = [], hostFiles = [];
for (const m of eventMaterials(REPO, slug, addTo ? ['library', 'source'] : undefined)) {
  const l = leftovers(m.text, ref, own, SCAN[m.kind]);
  let host = l.some(isHostItem);
  l.push(...dateProblems(m.text, ev, [Tp.weekday], own.allow));
  for (const o of others) l.push(...leftovers(m.text, o, own).map((x) => `${x.replace(/\)$/, '')} of ${o.slug}: keep only if true and deliberate)`));
  if (m.kind === 'source') {
    l.push(...kitProblems(m.raw, m.ext, manifest, slug, own));
    host ||= kitUses(m.raw, m.ext).some((u) => { const e = manifest.assets[u.name]; return e?.person && e.person !== ev.host && e.use !== 'photo'; });
  }
  if (host && ev.host !== T.host) hostFiles.push(m.kind === 'source' ? `${m.k}/${m.id}` : m.label.replace(`src/content/events/${slug}/`, ''));
  if (l.length) report.push(`${m.label}: ${l.join(', ')}`);
}
const n = Object.values(lib).reduce((s, a) => s + a.length, 0);
const rel = (p) => path.relative(REPO, p);
console.log(`\n${addTo ? 'Added the creative to' : 'Created'} ${slug}${addTo ? '' : ` (template: ${from})`}`);
if (!addTo) console.log(`  ${rel(dir)}/  (event.json, library.json, captions.json, plans/, projections.json)`);
console.log(`  engine/creatives/events/${slug}/  (${n} sources${creative ? '' : '; no creative yet: --no-creative'})`);
console.log(`\nStill showing ${T.city} facts (${report.length} places). Rewrite or replace each${creative ? ', then look at every rendered asset' : ''}:`);
for (const r of report) console.log('  ' + r);
if (creative && ev.host !== T.host) console.log(`\nHost: ${ev.host} replaces ${T.host}. The CTA host line now reads "with ${ev.host}${ev.hostTitle ? `, ${ev.hostTitle}` : ''}"${ev.hostTitle ? '' : ' (no --host-title given)'}. Replace the host photos and every "josh" scene (it always shows ${T.host}'s cutout) in ${hostFiles.length ? hostFiles.join(', ') : 'no sources'}, and rewrite every line that names ${T.host}.`);
if (creative && (!ev.time || !ev.address)) console.log(`\nMissing ${[!ev.time && '--time', !ev.address && '--address'].filter(Boolean).join(' and ')}: video renders fail until the event block in each spec has them.`);
if (creative && venueKnown && !ev.address) console.log(`No --address: the template's street, ZIP and phone stay in the sources (listed above) until rewritten.`);
if (creative) console.log(`Confirm "${included}" (what's included) for this event; it is shown in the videos' details scene.`);
if (!venueKnown) console.log(`\nVenue: not set ("${VENUE_TBD}" on the page). Captions and plans still name ${T.city}'s venue: rewrite them venue-free.`);
const cities = fs.existsSync(path.join(REPO, 'src/content/cities.json')) ? J(path.join(REPO, 'src/content/cities.json')) : {};
console.log('\nNext:');
let i = 1;
if (!cities[ev.citySlug]) console.log(`  ${i++}. City photo: node engine/tools/city-photo.mjs search "${ev.city}, ${ev.state}"\n     then node engine/tools/city-photo.mjs pick ${ev.citySlug} <openverseId> --name "${ev.city}" --state ${ev.state} --alt "<what it shows>" [--focus "50% 50%"]`);
if (creative) console.log(`  ${i++}. Venue photos into engine/kit/assets/${slug}-<what>.jpg and the RSVP QR code into engine/kit/assets/${slug}-qr-rsvp.svg, each registered in engine/kit/assets.json`);
console.log(`  ${i++}. Rewrite everything listed above${addTo ? '' : ', the captions (remove each "_draft"), the plans (remove the TODO line) and the event.json TODO text'}; clear event.json "_todo" item by item`);
if (creative) console.log(`  ${i++}. node engine/tools/render-event.mjs ${slug}`);
console.log(`  ${i++}. node engine/tools/check-event.mjs ${slug}`);
