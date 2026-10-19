// Render an event's (or the brand set's) creative from engine/creatives/ into its public media folder, then brand-lint
// every still. Use after editing sources by hand or after new-event.mjs.
//   node engine/tools/render-event.mjs <slug|brand> [--kinds images,flyers,videos,reels] [--ids 01,02,V1]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { flags } from './ap.mjs';

const ENGINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ENGINE, '..');
const f = flags(process.argv.slice(2));
const scope = f._[0];
if (!scope) { console.error('usage: render-event.mjs <slug|brand> [--kinds images,flyers] [--ids 01,02]'); process.exit(2); }
const scopeDir = scope === 'brand' ? 'brand' : `events/${scope}`;
const lib = JSON.parse(fs.readFileSync(path.join(REPO, 'src/content', scopeDir, 'library.json'), 'utf8'));
const media = scope === 'brand' ? '/media' : JSON.parse(fs.readFileSync(path.join(REPO, 'src/content', scopeDir, 'event.json'), 'utf8')).media;
const kinds = f.kinds ? String(f.kinds).split(',') : ['images', 'flyers', 'videos', 'reels'];
const ids = f.ids ? new Set(String(f.ids).split(',')) : null;
let bad = 0;
for (const k of kinds) for (const a of lib[k] || []) {
  if (ids && !ids.has(a.id)) continue;
  const ext = k === 'videos' || k === 'reels' ? 'json' : 'html';
  const src = path.join(ENGINE, 'creatives', scopeDir, k, `${a.id}.${ext}`);
  const out = path.join(REPO, 'public', media, k);
  const name = a.file.replace(/\.[a-z0-9]+$/i, '');
  try {
    execFileSync(process.execPath, [path.join(ENGINE, 'render.mjs'), src, out, '--name', name], { stdio: ['ignore', 'pipe', 'inherit'], timeout: 1800e3 });
    let lint = '';
    if (ext === 'html') { try { execFileSync(process.execPath, [path.join(ENGINE, 'lint.mjs'), src], { stdio: 'pipe', timeout: 180e3 }); lint = 'lint ok'; } catch (e) { lint = 'LINT FAILED'; bad++; console.log(String(e.stdout || '').slice(0, 1500)); } }
    console.log(`${k}/${a.id} → ${path.relative(REPO, out)}/${name}  ${lint}`);
  } catch (e) { bad++; console.log(`${k}/${a.id} RENDER FAILED: ${String(e.message).slice(0, 300)}`); }
}
process.exit(bad ? 1 : 0);
