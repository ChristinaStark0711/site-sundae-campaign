// Render an event's (or the brand set's) creative from engine/creatives/ into its public media folder (event.json
// "media", e.g. public/media/events/<slug>/<kind>/; Manhattan Beach and the brand set use public/media/<kind>/), then
// brand-lint every asset: stills on the page, videos and Reels at their poster frame (engine/lint.mjs). Use after editing
// sources by hand or after new-event.mjs.
//   node engine/tools/render-event.mjs <slug|brand> [--kinds images,flyers,videos,reels] [--ids 01,02,V1]
// An unknown kind, or an id that matches nothing in the chosen kinds, is an error (exit 2) and renders nothing.
// Exit 1 if any render or lint failed.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { KINDS, flags, unknownFlags } from './ap.mjs';

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ENGINE, '..');
const USAGE = 'usage: render-event.mjs <slug|brand> [--kinds images,flyers,videos,reels,backdrops,tablecloths,materials] [--ids 01,02,V1]';
const f = flags(process.argv.slice(2));
const scope = f._[0];
const usage = (msg) => { console.error(`render-event: ${msg}\n${USAGE}`); process.exit(2); };
if (!scope || f._.length > 1) usage(scope ? `one scope only (got ${f._.join(' ')})` : 'which event?');
const bad = unknownFlags(f, ['kinds', 'ids']);
if (bad.length) usage(`unknown flag --${bad.join(', --')}`);
if (f.kinds === true || f.ids === true) usage(`--${f.kinds === true ? 'kinds' : 'ids'} needs a value`);
const scopeDir = scope === 'brand' ? 'brand' : `events/${scope}`;
const libFile = path.join(REPO, 'src/content', scopeDir, 'library.json');
if (!fs.existsSync(libFile)) usage(`no ${path.relative(REPO, libFile)}`);
const lib = JSON.parse(fs.readFileSync(libFile, 'utf8'));
const media = scope === 'brand' ? '/media' : JSON.parse(fs.readFileSync(path.join(REPO, 'src/content', scopeDir, 'event.json'), 'utf8')).media;
const kinds = f.kinds ? String(f.kinds).split(',').map((s) => s.trim()).filter(Boolean) : KINDS;
const unknownKinds = kinds.filter((k) => !KINDS.includes(k));
if (unknownKinds.length) usage(`unknown kind ${unknownKinds.join(', ')} (kinds: ${KINDS.join(', ')})`);
const ids = f.ids ? String(f.ids).split(',').map((s) => s.trim()).filter(Boolean) : null;
const jobs = kinds.flatMap((k) => (lib[k] || []).filter((a) => !ids || ids.includes(a.id)).map((a) => ({ k, a })));
const missing = ids ? ids.filter((id) => !jobs.some((j) => j.a.id === id)) : [];
if (missing.length) usage(`no ${kinds.join('/')} asset with id ${missing.join(', ')} in ${path.relative(REPO, libFile)} (ids: ${[...new Set(kinds.flatMap((k) => (lib[k] || []).map((a) => a.id)))].join(' ') || 'none'})`);
if (!jobs.length) { console.log(`${scope}: the library is empty; nothing to render`); process.exit(0); }
console.log(`${scope}: rendering ${jobs.length} asset(s) into public${media}/<kind>/`);
let renderFailed = 0, lintFailed = 0;
for (const { k, a } of jobs) {
  const ext = k === 'videos' || k === 'reels' ? 'json' : 'html';
  const src = path.join(ENGINE, 'creatives', scopeDir, k, `${a.id}.${ext}`);
  const out = path.join(REPO, 'public', media, k);
  const name = a.file.replace(/\.[a-z0-9]+$/i, '');
  try {
    execFileSync(process.execPath, [path.join(ENGINE, 'render.mjs'), src, out, '--name', name], { stdio: ['ignore', 'pipe', 'inherit'], timeout: 1800e3 });
  } catch (e) { renderFailed++; console.log(`${k}/${a.id} RENDER FAILED: ${String(e.message).slice(0, 300)}`); continue; }
  let lint;
  try { execFileSync(process.execPath, [path.join(ENGINE, 'lint.mjs'), src], { stdio: 'pipe', timeout: 600e3 }); lint = 'lint ok'; } catch (e) {
    lintFailed++; lint = e.status === 1 ? 'LINT FAILED (brand violation)' : 'LINT ERROR (could not lint)';
    console.log(String(e.stdout || '').slice(0, 1500) + String(e.stderr || '').slice(0, 500));
  }
  console.log(`${k}/${a.id} → ${path.relative(REPO, out)}/${name}  ${lint}`);
}
console.log(`${scope}: ${jobs.length - renderFailed} of ${jobs.length} rendered, ${jobs.length - renderFailed - lintFailed} passed lint${renderFailed + lintFailed ? `; ${renderFailed} render failure(s), ${lintFailed} lint failure(s)` : ''}`);
process.exit(renderFailed || lintFailed ? 1 : 0);
