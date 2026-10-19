// Scaffold a new event from an existing one (default: the Manhattan Beach dinner). Mechanical only: it copies the
// template's catalogue, creative sources, captions and plans, swaps the facts it can find, writes projections, and
// lists everything a person (or Claude, via /sundae-new-event) still has to rewrite. Nothing is rendered or published.
//   node engine/tools/new-event.mjs --city "San Diego" --state CA --date 2026-11-12 --time "7 p.m." \
//     --venue "Hotel Name" [--space "The Rooftop"] [--address "123 Main St., San Diego, CA 92101"] \
//     [--host "Josh Stech"] [--host-title "co-founder and CEO of Sundae"] [--audience "San Diego real estate operators"] \
//     [--rsvp https://…] [--seat-cap 60] [--included "Dinner and drinks · Seats limited"] [--from manhattan-beach-2026-10-08]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { STATES, apDay, apFull, apShort, dateParts, flags, slugify } from './ap.mjs';

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ENGINE, '..');
const f = flags(process.argv.slice(2));
const need = ['city', 'state', 'date', 'venue'];
const missing = need.filter((k) => !f[k] || f[k] === true);
if (missing.length || !/^\d{4}-\d{2}-\d{2}$/.test(f.date || '')) { console.error(`missing or bad: ${missing.join(', ') || 'date (YYYY-MM-DD)'}\n` + fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 7).join('\n')); process.exit(2); }
const from = f.from || 'manhattan-beach-2026-10-08';
const T = JSON.parse(fs.readFileSync(path.join(REPO, 'src/content/events', from, 'event.json'), 'utf8'));
const slug = `${slugify(f.city)}-${f.date}`;
const dir = path.join(REPO, 'src/content/events', slug);
if (fs.existsSync(dir)) { console.error(`${slug} already exists`); process.exit(1); }
const state = String(f.state).toUpperCase();
const ev = {
  slug, kind: 'campaign', name: f.name || T.name, audience: f.audience || `${f.city}-area real estate operators`,
  city: f.city, state, citySlug: `${slugify(f.city)}-${state.toLowerCase()}`, date: f.date, time: f.time && f.time !== true ? f.time : undefined,
  venue: f.venue, space: f.space && f.space !== true ? f.space : undefined, address: f.address && f.address !== true ? f.address : undefined,
  host: f.host || T.host, hostTitle: f['host-title'] || T.hostTitle, rsvp: f.rsvp && f.rsvp !== true ? f.rsvp : undefined,
  media: `/media/events/${slug}`, prepared: new Date().toISOString().slice(0, 10),
  headline: 'TODO headline', summary: 'TODO summary', strategy: 'TODO strategy', creativeNote: 'TODO creative note', sources: 'TODO sources',
  moves: [['TODO move', 'TODO detail']], plans: T.plans.map((p) => ({ ...p })), actuals: null,
  _todo: ['event.json text (headline, summary, strategy, creativeNote, sources, moves)', 'plans', 'captions', 'creative (venue photos, copy, QR code, videos)', 'city photo', 'render and lint'],
};
// Fact swaps, longest first. The template's own strings come from its event.json.
const Tp = dateParts(T.date), Np = dateParts(f.date);
const tVenueFull = `${T.space ? T.space + ' at ' : ''}${T.venue}`;
const nVenueFull = `${ev.space ? ev.space + ' at ' : ''}${ev.venue}`;
const swaps = [
  [apFull(T.date), apFull(f.date)], [apDay(T.date), apDay(f.date)], [`${Tp.weekday} · `, `${Np.weekday} · `],
  [apShort(T.date), apShort(f.date)], [`${Tp.month}&nbsp;${Tp.d}`, `${Np.month}&nbsp;${Np.d}`], [`${Tp.month} ${Tp.d}`, `${Np.month} ${Np.d}`],
  [T.address, ev.address], [tVenueFull, nVenueFull], [T.venue, ev.venue], [`${T.city}, ${STATES[T.state] || T.state}`, `${ev.city}, ${STATES[state] || state}`], [T.city, ev.city],
  ...(T.time && ev.time ? [[T.time, ev.time]] : []),
].filter(([a, b]) => a && b && a !== b).sort((a, b) => b[0].length - a[0].length);
const swap = (s) => swaps.reduce((t, [a, b]) => t.split(a).join(b), s);
// What still points at the template after the swaps: its facts and its venue files.
const manifest = JSON.parse(fs.readFileSync(path.join(ENGINE, 'kit/assets.json'), 'utf8'));
const foreign = [...Object.entries(manifest.assets), ...Object.entries(manifest.clips)].filter(([, v]) => v.event && v.event !== slug).map(([k]) => k);
const tPlace = T.audience?.replace(/ real estate.*$/i, '').replace(/-area$/, ''); // "Los Angeles"
const leftovers = (s) => [...new Set([Tp.weekday !== Np.weekday && Tp.weekday, `${Tp.month} ${Tp.d}`, T.venue, T.space, T.city, tPlace, 'Courtyard', 'Shade', ...(T.address ? [T.address.split(',')[0]] : []), ...foreign].filter((x) => x && s.includes(x))
  .concat(tPlace === 'Los Angeles' && /\bLA\b/.test(s) ? ['LA'] : []))];

const report = [];
const write = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); const l = leftovers(s); if (l.length) report.push(`${path.relative(REPO, p)}: ${l.join(', ')}`); };
fs.mkdirSync(path.join(dir, 'plans'), { recursive: true });
// catalogue: originals only, same ids and file names, no revision history
const lib = JSON.parse(fs.readFileSync(path.join(REPO, 'src/content/events', from, 'library.json'), 'utf8'));
for (const k of Object.keys(lib)) lib[k] = lib[k].filter((a) => !a.variantOf).map(({ rev, updated, ...a }) => ({ ...a, use: swap(a.use), title: swap(a.title), ...(a.pair ? { pair: swap(a.pair) } : {}) }));
fs.writeFileSync(path.join(dir, 'library.json'), JSON.stringify(lib, null, 2) + '\n');
// creative sources
// The motion engine's event block (engine/README.md, "event block"): every fact a scene shows must be given, or the render
// fails rather than falling back to the template's facts. `included` is copied from --included or the template default.
const included = f.included && f.included !== true ? f.included : 'Dinner and drinks · Seats limited';
const eventBlock = { weekday: Np.weekday, month: Np.month, day: String(Np.d), time: ev.time, venue: nVenueFull, venueShort: nVenueFull.replace(/ Hotel$/, ''), hotel: ev.venue, city: ev.city, cityLine: `${ev.city}, ${STATES[state] || state}`, address: ev.address?.replace(/,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?$/, ''), included, name: ev.name };
for (const k of Object.keys(lib)) for (const a of lib[k]) {
  const ext = k === 'videos' || k === 'reels' ? 'json' : 'html';
  let s = swap(fs.readFileSync(path.join(ENGINE, 'creatives/events', from, k, `${a.id}.${ext}`), 'utf8'));
  if (ext === 'json') { const j = JSON.parse(s); j.event = Object.fromEntries(Object.entries(eventBlock).filter(([, v]) => v)); s = JSON.stringify(j, null, 1) + '\n'; }
  write(path.join(ENGINE, 'creatives/events', slug, k, `${a.id}.${ext}`), s);
}
// captions and plans: swapped drafts, flagged
write(path.join(dir, 'captions.json'), swap(fs.readFileSync(path.join(REPO, 'src/content/events', from, 'captions.json'), 'utf8')));
for (const p of ev.plans) write(path.join(dir, 'plans', p.file), `<!-- TODO: rewrite this plan for ${ev.city} (${apFull(f.date)}); it is the ${T.city} plan with the facts swapped -->\n` + swap(fs.readFileSync(path.join(REPO, 'src/content/events', from, 'plans', p.file), 'utf8')));
ev.plans = ev.plans.map((p) => ({ ...p, title: swap(p.title).replace(/fill the Courtyard/i, 'fill the room'), blurb: swap(p.blurb) }));
fs.writeFileSync(path.join(dir, 'event.json'), JSON.stringify(ev, null, 2) + '\n');
execFileSync(process.execPath, [path.join(ENGINE, 'tools/event-model.mjs'), slug, '--seat-cap', String(f['seat-cap'] || 60)], { stdio: 'inherit' });

console.log(`\nCreated ${slug}`);
console.log(`  src/content/events/${slug}/  (event.json, library.json, captions.json, plans/, projections.json)`);
console.log(`  engine/creatives/events/${slug}/  (${Object.values(lib).reduce((n, a) => n + a.length, 0)} sources)`);
console.log(`\nStill pointing at ${T.city} (${report.length} files) — rewrite or replace:`);
for (const r of report) console.log('  ' + r);
if (!ev.time || !ev.address) console.log(`\nMissing ${[!ev.time && '--time', !ev.address && '--address'].filter(Boolean).join(' and ')}: video renders will fail until the event block in each spec has them.`);
console.log(`Confirm "${included}" (what's included) for this event; it is shown in the videos' details scene.`);
console.log(`\nNext: city photo (engine/tools/city-photo.mjs), venue photos into engine/kit/assets/${slug}-*.jpg (+ engine/kit/assets.json), copy and plans, then engine/tools/render-event.mjs ${slug} and engine/tools/check-event.mjs ${slug}.`);
