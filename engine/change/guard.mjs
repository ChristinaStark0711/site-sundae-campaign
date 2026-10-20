// Step 4 of the creative-change workflow: refuse to commit anything apply.mjs was not supposed to write.
// Every changed path must be on .request/out/allowed.json (deletions only where it lists them), files must be a sensible size, and no added text may look
// like a credential. Exit 1 stops the workflow before the commit.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CREDENTIALS, OUT, REPO, readJSON } from './lib.mjs';

const { paths, deleted, noop } = readJSON(path.join(OUT, 'allowed.json'));
if (noop) { console.log('[guard] ok: nothing to apply'); process.exit(0); }
const allowed = new Set(paths), mayDelete = new Set(deleted || []);
const status = execFileSync('git', ['status', '--porcelain', '-uall', '-z'], { cwd: REPO }).toString().split('\0').filter(Boolean);
const changed = status.map((l) => l.slice(3));
const errors = [];
for (const p of changed) {
  const full = path.join(REPO, p);
  if (!fs.existsSync(full)) { if (!mayDelete.has(p)) errors.push(`unexpected deletion: ${p}`); continue; }
  if (!allowed.has(p)) errors.push(`unexpected change: ${p}`);
  const size = fs.statSync(full).size;
  const limit = /\.mp4$/.test(p) ? 80e6 : /\.(jpg|pdf)$/.test(p) ? 25e6 : 400e3;
  if (size > limit) errors.push(`${p} is ${(size / 1e6).toFixed(1)} MB (limit ${(limit / 1e6).toFixed(1)} MB)`);
  if (/\.(json|html)$/.test(p)) {
    const t = fs.readFileSync(full, 'utf8');
    // JSON: check the string values as written, not the escaped file text (an escape such as \u0001 must not glue onto a word)
    const strings = (v) => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
    if (/\.json$/.test(p)) { try { if (strings(JSON.parse(t)).some((x) => new RegExp(CREDENTIALS.source).test(x))) errors.push(`${p} contains something that looks like a credential`); } catch { /* reported below */ } }
    else if (/sk-ant-[A-Za-z0-9_-]{8,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY/.test(t)) errors.push(`${p} contains something that looks like a credential`);
    if (/\.json$/.test(p)) { try { JSON.parse(t); } catch { errors.push(`${p} is not valid JSON`); } }
  }
}
if (!changed.length) errors.push('nothing changed');
if (errors.length) { console.error('[guard] refused:\n  ' + errors.join('\n  ')); process.exit(1); }
console.log(`[guard] ok: ${changed.length} paths`);
