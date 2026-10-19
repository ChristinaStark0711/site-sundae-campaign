// Step 4 of the creative-change workflow: refuse to commit anything apply.mjs was not supposed to write.
// Every changed path must be on .request/out/allowed.json, files must be a sensible size, and no added text may look
// like a credential. Exit 1 stops the workflow before the commit.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { OUT, REPO, readJSON } from './lib.mjs';

const allowed = new Set(readJSON(path.join(OUT, 'allowed.json')));
const status = execFileSync('git', ['status', '--porcelain', '-uall', '-z'], { cwd: REPO }).toString().split('\0').filter(Boolean);
const changed = status.map((l) => l.slice(3));
const errors = [];
for (const p of changed) {
  if (!allowed.has(p)) errors.push(`unexpected change: ${p}`);
  const full = path.join(REPO, p);
  if (!fs.existsSync(full)) { errors.push(`unexpected deletion: ${p}`); continue; }
  const size = fs.statSync(full).size;
  const limit = /\.mp4$/.test(p) ? 80e6 : /\.(jpg|pdf)$/.test(p) ? 25e6 : 400e3;
  if (size > limit) errors.push(`${p} is ${(size / 1e6).toFixed(1)} MB (limit ${(limit / 1e6).toFixed(1)} MB)`);
  if (/\.(json|html)$/.test(p)) {
    const t = fs.readFileSync(full, 'utf8');
    if (/sk-ant-[A-Za-z0-9_-]{8,}|github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY/.test(t)) errors.push(`${p} contains something that looks like a credential`);
    if (/\.json$/.test(p)) { try { JSON.parse(t); } catch { errors.push(`${p} is not valid JSON`); } }
  }
}
if (!changed.length) errors.push('nothing changed');
if (errors.length) { console.error('[guard] refused:\n  ' + errors.join('\n  ')); process.exit(1); }
console.log(`[guard] ok: ${changed.length} paths`);
