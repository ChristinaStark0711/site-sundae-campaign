// Writes src/generated/asset-keys.json: every asset key the change box may send ("brand/images/10",
// "events/<slug>/reels/R7", …), read by /api/requests to refuse unknown assets before starting a workflow run.
// Runs before every build and dev start (package.json prebuild/predev), so it follows the content folders.
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(process.cwd(), 'src/content');
const keys = [];
const add = (scopeDir) => {
  const f = path.join(root, scopeDir, 'library.json');
  if (!fs.existsSync(f)) return;
  const lib = JSON.parse(fs.readFileSync(f, 'utf8'));
  for (const [kind, items] of Object.entries(lib)) for (const a of items) keys.push(`${scopeDir}/${kind}/${a.id}`);
};
add('brand');
for (const d of fs.readdirSync(path.join(root, 'events'))) {
  const ev = path.join(root, 'events', d, 'event.json');
  if (fs.existsSync(ev) && !(JSON.parse(fs.readFileSync(ev, 'utf8'))._todo || []).length) add(`events/${d}`);
}
fs.mkdirSync(path.join(process.cwd(), 'src/generated'), { recursive: true });
fs.writeFileSync(path.join(process.cwd(), 'src/generated/asset-keys.json'), JSON.stringify({ keys: keys.sort() }, null, 1) + '\n');
console.log(`asset-index: ${keys.length} keys`);
