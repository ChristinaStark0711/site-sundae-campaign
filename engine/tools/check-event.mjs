// Is an event ready to publish? Checks the record, the catalogue against the rendered files, the sources against
// another event's facts and venue files, the city photo, the plans and the projections. Exit 1 lists every problem.
//   node engine/tools/check-event.mjs <slug>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ENGINE, '..');
const slug = process.argv[2];
const dir = path.join(REPO, 'src/content/events', slug || '');
const errs = [], warns = [];
const ENGINE_DEFAULT_EVENT = 'manhattan-beach-2026-10-08'; // engine.js falls back to this event's facts when a spec has no "event" block
if (!slug || !fs.existsSync(path.join(dir, 'event.json'))) { console.error('usage: check-event.mjs <event slug>'); process.exit(2); }
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const ev = J(path.join(dir, 'event.json'));
for (const k of ['slug', 'kind', 'name', 'audience', 'city', 'state', 'citySlug', 'date', 'venue', 'host', 'media', 'summary']) if (!ev[k]) errs.push(`event.json: missing ${k}`);
if (ev.slug !== slug) errs.push(`event.json: slug is ${ev.slug}, folder is ${slug}`);
if (ev._todo?.length) errs.push(`event.json: _todo still lists ${ev._todo.join('; ')}`);
const todoIn = (p) => /\bTODO\b/.test(fs.readFileSync(p, 'utf8'));
if (todoIn(path.join(dir, 'event.json'))) errs.push('event.json: still has TODO text');
const cities = fs.existsSync(path.join(REPO, 'src/content/cities.json')) ? J(path.join(REPO, 'src/content/cities.json')) : {};
const c = cities[ev.citySlug];
if (!c) errs.push(`cities.json: no photo for ${ev.citySlug} (run engine/tools/city-photo.mjs)`);
else if (!fs.existsSync(path.join(REPO, 'public', c.file))) errs.push(`city photo file missing: ${c.file}`);
if (ev.kind === 'campaign') {
  for (const p of ev.plans) { const f = path.join(dir, 'plans', p.file); if (!fs.existsSync(f)) errs.push(`plan missing: ${p.file}`); else if (todoIn(f)) errs.push(`plan ${p.file}: still a TODO draft`); }
  if (!fs.existsSync(path.join(dir, 'projections.json'))) errs.push('projections.json missing (engine/tools/event-model.mjs)');
  if (fs.existsSync(path.join(dir, 'captions.json')) && todoIn(path.join(dir, 'captions.json'))) errs.push('captions.json: still has TODO text');
  const manifest = J(path.join(ENGINE, 'kit/assets.json'));
  const owner = (name, table) => manifest[table][name]?.event;
  const lib = J(path.join(dir, 'library.json'));
  const otherFacts = fs.readdirSync(path.join(REPO, 'src/content/events')).filter((d) => d !== slug && fs.existsSync(path.join(REPO, 'src/content/events', d, 'event.json')))
    .map((d) => J(path.join(REPO, 'src/content/events', d, 'event.json'))).flatMap((o) => [o.venue, o.space, o.address?.split(',')[0]].filter(Boolean));
  for (const [k, items] of Object.entries(lib)) for (const a of items) {
    const ext = k === 'videos' || k === 'reels' ? 'json' : 'html';
    const src = path.join(ENGINE, 'creatives/events', slug, k, `${a.id}.${ext}`);
    if (!fs.existsSync(src)) { errs.push(`${k}/${a.id}: no source ${path.relative(REPO, src)}`); continue; }
    const s = fs.readFileSync(src, 'utf8');
    for (const file of [a.file, a.pdf, a.poster].filter(Boolean)) if (!fs.existsSync(path.join(REPO, 'public', ev.media, k, file))) errs.push(`${k}/${a.id}: not rendered (${ev.media}/${k}/${file})`);
    for (const m of s.matchAll(/\/kit\/assets\/([^"')\s]+)|"(?:img|side)":\s*"([^"]+)"/g)) { const n = (m[1] || m[2]).replace(/^\/kit\/assets\//, ''); const o = owner(n, 'assets'); if (o && o !== slug) errs.push(`${k}/${a.id}: uses ${n}, which belongs to ${o}`); }
    for (const m of s.matchAll(/"clip":\s*"([^"]+)"/g)) { const o = owner(m[1], 'clips'); if (!manifest.clips[m[1]]) errs.push(`${k}/${a.id}: clip ${m[1]} is not in kit/assets.json`); else if (o && o !== slug) errs.push(`${k}/${a.id}: uses clip ${m[1]}, which belongs to ${o}`); }
    for (const t of otherFacts) if (t && s.includes(t)) warns.push(`${k}/${a.id}: mentions "${t}" from another event; fine only as a deliberate reference to that event`);
    if (ext === 'json' && !JSON.parse(s).event && slug !== ENGINE_DEFAULT_EVENT) errs.push(`${k}/${a.id}: no "event" block, so the motion engine falls back to the Manhattan Beach defaults`);
  }
}
for (const w of warns) console.log('warn: ' + w);
if (errs.length) { console.log(`${slug}: ${errs.length} problem(s)\n  ` + errs.join('\n  ')); process.exit(1); }
console.log(`${slug}: ready`);
