// Is an event ready to publish? Checks the record, the city photo, the plans, captions and projections, the catalogue
// against the rendered files and the kit, and scans every text the event carries (event.json text and plan blurbs,
// library.json, captions.json, plans/*.md and every creative source) for another event's facts. Exit 1 lists every
// problem; warnings do not block.
//   node engine/tools/check-event.mjs <slug>
// Template facts are errors: the venue (and "Shade"-style short names), room, street, ZIP, phone, city, audience area
// and host of the event in event.json "_from" (written by new-event.mjs; without one, every earlier campaign event),
// plus the dates and times its materials show and its paid budget. A deliberate reference (a true mention of an
// earlier dinner, a confirmed run-of-show time) goes in event.json "_allow", e.g. ["Sacramento · Echo & Rig",
// "7:35 p.m."]: any match an "_allow" string contains is accepted. Other events' city, venue, room and street are
// warnings.
// An empty creative library is accepted (new-event.mjs --no-creative while the venue is not set).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AP_TIME, KINDS, SCAN, STATES, VENUE_TBD, eventMaterials, kitProblems, leftovers, otherEventRef, ownFacts, refFacts, slugify, validDate } from './ap.mjs';

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ENGINE, '..');
const EVENTS = path.join(REPO, 'src/content/events');
const slug = process.argv[2];
const dir = path.join(EVENTS, slug || '');
const errs = [], warns = [], notes = [];
const ENGINE_DEFAULT_EVENT = 'manhattan-beach-2026-10-08'; // engine.js falls back to this event's facts when a spec has no "event" block
if (!slug || !fs.existsSync(path.join(dir, 'event.json'))) { console.error('usage: check-event.mjs <event slug>'); process.exit(2); }
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const ev = J(path.join(dir, 'event.json'));
for (const k of ['slug', 'kind', 'name', 'audience', 'city', 'state', 'citySlug', 'date', 'venue', 'host', 'media', 'summary']) if (!ev[k]) errs.push(`event.json: missing ${k}`);
if (ev.slug !== slug) errs.push(`event.json: slug is ${ev.slug}, folder is ${slug}`);
if (ev._todo?.length) errs.push(`event.json: _todo still lists ${ev._todo.join('; ')}`);
const todoIn = (p) => /\bTODO\b/.test(fs.readFileSync(p, 'utf8'));
if (todoIn(path.join(dir, 'event.json'))) errs.push('event.json: still has TODO text');
if (ev.state && !STATES[ev.state]) errs.push(`event.json: state ${ev.state} is not a US state code`);
if (ev._allow !== undefined && !(Array.isArray(ev._allow) && ev._allow.every((x) => typeof x === 'string' && x.trim()))) errs.push('event.json: "_allow" must be a list of strings');
const cities = fs.existsSync(path.join(REPO, 'src/content/cities.json')) ? J(path.join(REPO, 'src/content/cities.json')) : {};
const c = cities[ev.citySlug];
if (!c) {
  const stray = ev.city && cities[slugify(ev.city)] ? slugify(ev.city) : null;
  errs.push(`cities.json: no photo for ${ev.citySlug} (node engine/tools/city-photo.mjs pick ${ev.citySlug} <openverseId> …)${stray ? `; "${stray}" has no state: pick again as ${ev.citySlug}, then delete the "${stray}" entry and public${cities[stray].file}` : ''}`);
} else if (!fs.existsSync(path.join(REPO, 'public', c.file))) errs.push(`city photo file missing: ${c.file}`);

if (ev.kind === 'campaign') {
  if (!validDate(ev.date)) errs.push(`event.json: date ${ev.date} is not a real calendar date (YYYY-MM-DD)`);
  if (ev.time && !AP_TIME.test(ev.time)) errs.push(`event.json: time "${ev.time}" is not AP style (7 p.m., 6:30 p.m., noon)`);
  if (ev.venue === VENUE_TBD) notes.push(`venue not set yet ("${VENUE_TBD}" on the page)`);
  for (const p of ev.plans) { const f = path.join(dir, 'plans', p.file); if (!fs.existsSync(f)) errs.push(`plan missing: ${p.file}`); else if (todoIn(f)) errs.push(`plan ${p.file}: still a TODO draft`); }

  // projections: the numbers the projections page prints (src/app/events/[slug]/projections/page.tsx)
  const pjf = path.join(dir, 'projections.json');
  let pj = null;
  if (!fs.existsSync(pjf)) errs.push('projections.json missing (engine/tools/event-model.mjs)');
  else {
    pj = J(pjf);
    const P = (m) => errs.push(`projections.json: ${m}; rerun engine/tools/event-model.mjs ${slug} with valid inputs`);
    if (!Number.isInteger(pj.seat_cap) || pj.seat_cap < 1) P(`seat_cap is ${JSON.stringify(pj.seat_cap)}, not a whole number of seats`);
    if (!Array.isArray(pj.notes) || !pj.notes.every((n) => typeof n === 'string')) P('notes must be a list of sentences');
    else if (pj.notes.some((n) => /approved-seat count never exceeds/.test(n))) errs.push('projections.json: a note says approvals never exceed the seat cap, but the model lets them run up to the cap divided by the show rate; correct the note (event-model.mjs writes the right one)');
    if (!validDate(pj.generated)) P(`generated is ${JSON.stringify(pj.generated)}, not a date`);
    for (const k of ['conservative', 'base', 'aggressive']) {
      const s = pj.scenarios?.[k];
      if (!s) { P(`no ${k} scenario`); continue; }
      for (const n of ['paid_budget', 'paid_cpl', 'paid_applications', 'organic_applications', 'applications', 'approved_seats', 'attendees', 'intro_calls', 'members_signed_45d', 'cost_per_attendee']) {
        const v = s[n];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || (['paid_budget', 'paid_cpl'].includes(n) && v <= 0)) P(`${k}.${n} is ${JSON.stringify(v)}`);
      }
      if (Number.isInteger(pj.seat_cap) && s.attendees > pj.seat_cap) P(`${k} has ${s.attendees} attendees, above the ${pj.seat_cap}-seat cap`);
    }
  }

  const capf = path.join(dir, 'captions.json');
  if (fs.existsSync(capf)) {
    if (todoIn(capf)) errs.push('captions.json: still has TODO text');
    const drafts = J(capf).filter((x) => x._draft).map((x) => x.id);
    if (drafts.length) errs.push(`captions.json: ${drafts.join(', ')} still marked "_draft" (rewrite each for this event, then delete its "_draft")`);
  }

  // the catalogue: every source exists, is rendered, and uses only this event's own kit files and host
  const manifest = J(path.join(ENGINE, 'kit/assets.json'));
  const lib = J(path.join(dir, 'library.json'));
  const own = ownFacts(ev, pj?.scenarios?.base?.paid_budget);
  let n = 0;
  for (const [k, items] of Object.entries(lib)) for (const a of items) {
    n++;
    if (!KINDS.includes(k)) { errs.push(`library.json: unknown kind "${k}"`); break; }
    const ext = k === 'videos' || k === 'reels' ? 'json' : 'html';
    const src = path.join(ENGINE, 'creatives/events', slug, k, `${a.id}.${ext}`);
    if (!fs.existsSync(src)) { errs.push(`${k}/${a.id}: no source ${path.relative(REPO, src)}`); continue; }
    const s = fs.readFileSync(src, 'utf8');
    for (const file of [a.file, a.pdf, a.poster].filter(Boolean)) if (!fs.existsSync(path.join(REPO, 'public', ev.media, k, file))) errs.push(`${k}/${a.id}: not rendered (${ev.media}/${k}/${file})`);
    for (const p of kitProblems(s, ext, manifest, slug, own)) errs.push(`${k}/${a.id}: ${p}`);
    if (ext === 'json' && !JSON.parse(s).event && slug !== ENGINE_DEFAULT_EVENT) errs.push(`${k}/${a.id}: no "event" block, so the motion engine falls back to the Manhattan Beach defaults`);
  }
  if (!n) notes.push('the creative library is empty (fine while the venue is not set; add it with new-event.mjs --add-creative)');

  // another event's facts anywhere in this event's text
  const others = fs.readdirSync(EVENTS).filter((d) => d !== slug && fs.existsSync(path.join(EVENTS, d, 'event.json'))).map((d) => J(path.join(EVENTS, d, 'event.json')));
  const templates = ev._from ? others.filter((o) => o.slug === ev._from) : others.filter((o) => o.kind === 'campaign' && String(o.date) < String(ev.date));
  if (ev._from && !templates.length) errs.push(`event.json: "_from" names ${ev._from}, which does not exist`);
  const refs = templates.map((o) => refFacts(REPO, o.slug));
  const mats = eventMaterials(REPO, slug);
  for (const m of mats) for (const r of refs) {
    const l = leftovers(m.text, r, own, SCAN[m.kind]);
    if (l.length) errs.push(`${m.label}: ${l.join(', ')} from ${r.slug}`);
  }
  for (const o of others.filter((x) => !templates.includes(x))) {
    const r = otherEventRef(o), hits = new Set(), where = [];
    for (const m of mats) { const l = leftovers(m.text, r, own); if (l.length) { l.forEach((x) => hits.add(x)); where.push(m.label.replace(/^(src\/content|engine\/creatives)\/events\/[^/]+\//, '')); } }
    if (where.length) warns.push(`${[...hits].join(', ')} from ${o.slug} in ${where.join(', ')}: fine only as a true, deliberate reference to that event (list it in "_allow" to silence this)`);
  }
  if (errs.some((e) => / from [a-z0-9-]+$/.test(e))) notes.push('rewrite each template fact listed, or add a deliberate reference to event.json "_allow"');
}
for (const w of warns) console.log('warn: ' + w);
for (const x of notes) console.log('note: ' + x);
if (errs.length) { console.log(`${slug}: ${errs.length} problem(s)\n  ` + errs.join('\n  ')); process.exit(1); }
console.log(`${slug}: ready`);
