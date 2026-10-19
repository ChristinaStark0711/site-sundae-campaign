// Step 3 of the creative-change workflow: apply .request/out/result.json to a fresh checkout of main.
// Re-runnable: the workflow resets to origin/main and calls this again if the push races another change.
// Always writes the request log (src/content/requests/<id>.json); on "done" it also copies the rendered files and
// the new source into place and updates the library entry. Writes .request/out/allowed.json for guard.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { OUT, REPO, log, readJSON, writeJSON } from './lib.mjs';

const r = readJSON(path.join(OUT, 'result.json'));
const allowed = [];
const logPath = `src/content/requests/${r.request.id}.json`;
writeJSON(path.join(REPO, logPath), Object.fromEntries(Object.entries(r.log).filter(([, v]) => v !== undefined)));
allowed.push(logPath);

if (r.status === 'done') {
  const { files, library } = r.apply;
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(REPO, f.to)), { recursive: true });
    fs.copyFileSync(path.join(REPO, f.from), path.join(REPO, f.to));
    allowed.push(f.to);
  }
  const libFile = path.join(REPO, library.path);
  const lib = readJSON(libFile);
  const list = lib[library.kind];
  if (library.op === 'replace') {
    const i = list.findIndex((a) => a.id === library.entry.id);
    if (i < 0) throw new Error(`entry ${library.entry.id} is gone from ${library.path}`);
    list[i] = { ...list[i], rev: (list[i].rev || 0) + 1, updated: library.entry.updated, ...(library.entry.dur ? { dur: library.entry.dur } : {}) };
  } else {
    if (list.some((a) => a.id === library.entry.id)) throw new Error(`id ${library.entry.id} is already taken in ${library.path}`);
    let at = -1;
    list.forEach((a, i) => { if (a.id === library.baseId || a.variantOf === library.baseId) at = i; });
    list.splice(at + 1, 0, library.entry);
  }
  writeJSON(libFile, lib);
  allowed.push(library.path);
}
writeJSON(path.join(OUT, 'allowed.json'), allowed);
log('applied', r.status, allowed.length, 'paths');
