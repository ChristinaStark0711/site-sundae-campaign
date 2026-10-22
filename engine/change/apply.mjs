// Step 3 of the creative-change workflow: apply .request/out/result.json to a fresh checkout of main.
// Re-runnable: push.sh resets to origin/main and calls this again if the push races another change.
//   done    copy the rendered files and the new source into place and update the library entry, after checking that
//           the asset's source is still the one the change started from (else the request fails: send it again).
//           A variation takes the next free id at this moment (05B taken meanwhile -> 05C, files renamed to match).
//   held    keep the proposal (engine/held/<id>.<ext> and its preview engine/held/<id>.jpg, never served by the site) for
//           the owner to approve.
//   failed  log only.
// Always writes the request log (src/content/requests/<id>.json). Writes .request/out/allowed.json for guard.mjs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ENGINE, OUT, REPO, log, nextVariantId, readJSON, redact, resolveAsset, writeJSON } from './lib.mjs';

const r = readJSON(path.join(OUT, 'result.json'));
const allowed = [], deleted = [];
const id = r.request.id;
const logPath = `src/content/requests/${id}.json`;
// idempotent against main: a request already logged there (or an approval whose request is no longer held, e.g. the
// same proposal approved twice) changes nothing
const onMain = readJSON(path.join(REPO, logPath), null);
if (onMain && (!r.request.approved || onMain.status !== 'held')) {
  writeJSON(path.join(OUT, 'allowed.json'), { paths: [], deleted: [], noop: true });
  log('nothing to apply: request', id, 'is already', onMain.status, 'on main');
  process.exit(0);
}
const record = (extra = {}) => {
  const rec = { ...r.log, ...extra, text: redact(r.log.text) };
  writeJSON(path.join(REPO, logPath), Object.fromEntries(Object.entries(rec).filter(([, v]) => v !== undefined)));
  allowed.push(logPath);
};
const failNow = (reason) => { const { result, proposal, ...rest } = r.log; r.log = { ...rest, status: 'failed', reason }; r.status = 'failed'; };
const A = resolveAsset(r.request.asset);
const heldSrc = A && `engine/held/${id}.${A.ext}`, heldImg = `engine/held/${id}.jpg`;
const heldDir = path.join(REPO, 'engine/held');
const removeHeld = () => {
  const ps = [heldImg, ...(fs.existsSync(heldDir) ? fs.readdirSync(heldDir).filter((f) => f.startsWith(`${id}.`)).map((f) => `engine/held/${f}`) : [])];
  for (const p of ps) if (fs.existsSync(path.join(REPO, p))) { fs.rmSync(path.join(REPO, p)); deleted.push(p); }
};

if (r.status === 'done') {
  const { files, library } = r.apply;
  if (!A) failNow('The asset is no longer in the library, so nothing was changed.');
  const libFile = path.join(REPO, library.path);
  const lib = readJSON(libFile);
  const list = lib[library.kind];
  const current = A && fs.existsSync(A.source) ? crypto.createHash('sha256').update(fs.readFileSync(A.source)).digest('hex') : null;
  let plan = null;
  // an update must sit on the source it was made from; so must an approved proposal of either kind (a variation made
  // before the original was corrected would bring the old wording back next to it)
  if (!A) { /* failed above */ } else if ((r.request.mode === 'update' || r.request.candidate) && current !== r.sourceHash) failNow(r.request.candidate ? 'The asset changed after this proposal was made, so applying it would undo the newer change. Nothing was changed; the request can be sent again.' : 'This asset changed while the request was being worked on, so nothing was changed. It can be sent again.');
  else if (library.op === 'replace') {
    const i = list.findIndex((a) => a.id === library.entry.id);
    if (i < 0) failNow('The asset is gone from the library, so nothing was changed.');
    else plan = { files, apply: () => { list[i] = { ...list[i], rev: (list[i].rev || 0) + 1, updated: library.entry.updated, ...(library.entry.dur ? { dur: library.entry.dur } : {}) }; } };
  } else {
    // the variation's id is decided now, against the library as it is on main at this moment
    const want = library.entry.id, got = nextVariantId(list, library.baseId);
    const oldL = want.slice(library.baseId.length).toLowerCase(), newL = got.slice(library.baseId.length).toLowerCase();
    const ren = (f) => (got === want ? f : f.replace(new RegExp(`^((?:video|reel)-)?(\\d+)${oldL}-`, 'i'), `$1$2${newL}-`).replace(new RegExp(`^${want}\\.`), `${got}.`));
    const entry = { ...library.entry, id: got, file: ren(library.entry.file), ...(library.entry.pdf ? { pdf: ren(library.entry.pdf) } : {}), ...(library.entry.poster ? { poster: ren(library.entry.poster) } : {}) };
    let at = -1;
    list.forEach((a, i) => { if (a.id === library.baseId || a.variantOf === library.baseId) at = i; });
    if (at < 0) failNow('The original of this variation is gone from the library, so nothing was changed.');
    else plan = { files: files.map((f) => ({ ...f, to: path.join(path.dirname(f.to), ren(path.basename(f.to))) })), apply: () => list.splice(at + 1, 0, entry), id: got, file: entry.file };
  }
  if (plan) {
    for (const f of plan.files) if (!fs.existsSync(path.join(REPO, f.from))) throw new Error(`missing rendered file ${f.from}`);
    plan.apply();
    for (const f of plan.files) {
      fs.mkdirSync(path.dirname(path.join(REPO, f.to)), { recursive: true });
      fs.copyFileSync(path.join(REPO, f.from), path.join(REPO, f.to));
      allowed.push(f.to);
    }
    writeJSON(libFile, lib);
    allowed.push(library.path);
    // a picture found or generated for this request joins the kit with its record (source, license, credit)
    for (const k of r.apply.kit || []) {
      if (!/^[a-z0-9][a-z0-9-]*\.jpg$/.test(k.name)) throw new Error(`bad kit file name ${k.name}`);
      fs.copyFileSync(path.join(REPO, k.from), path.join(ENGINE, 'kit/assets', k.name));
      const kp = path.join(ENGINE, 'kit/assets.json'), kj = readJSON(kp);
      kj.assets[k.name] = k.meta;
      writeJSON(kp, kj);
      allowed.push(`engine/kit/assets/${k.name}`, 'engine/kit/assets.json');
    }
    if (plan.id) r.log.result = { id: plan.id, file: plan.file };
    if (r.apply.clearHeld) { removeHeld(); delete r.log.proposal; }
  }
} else if (r.status === 'held' && r.held) {
  for (const [from, to] of [[r.held.source, heldSrc], [r.held.preview, heldImg]]) {
    fs.mkdirSync(path.dirname(path.join(REPO, to)), { recursive: true });
    fs.copyFileSync(path.join(REPO, from), path.join(REPO, to));
    allowed.push(to);
  }
}
if (r.status === 'failed') removeHeld(); // a failed approval drops its proposal
record();
writeJSON(path.join(OUT, 'allowed.json'), { paths: allowed, deleted });
log('applied', r.status, allowed.length, 'paths', deleted.length ? `(${deleted.length} removed)` : '');
