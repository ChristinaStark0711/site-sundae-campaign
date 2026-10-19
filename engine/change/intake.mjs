// Step 1 of the creative-change workflow: turn the trigger into .request/request.json.
//   from the site's change box: ASSET (the asset key) and REQUEST (JSON: id, mode, text, at)
//   owner approval of a held request: APPROVE_ID (the request id from the site's change log)
// Also counts this workflow's runs started today (GitHub API, GH_TOKEN with actions: read) for the daily cap, and
// removes anything that looks like a credential from the request text before it can reach the public log.
// An invalid trigger writes .request/skip (the workflow then stops quietly: there is nothing to log it against).
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE, REPO, REQ, log, readJSON, redact, resolveAsset, writeJSON } from './lib.mjs';

fs.rmSync(REQ, { recursive: true, force: true });
fs.mkdirSync(REQ, { recursive: true });
const skip = (why) => { fs.writeFileSync(path.join(REQ, 'skip'), why + '\n'); log('skip:', why); process.exit(0); };
const ID_RE = /^\d{8}-\d{6}-[a-z0-9]{4}$/;

async function runsToday() {
  const { GH_TOKEN, GITHUB_REPOSITORY } = process.env;
  if (!GH_TOKEN || !GITHUB_REPOSITORY) return 0;
  const day = new Date().toISOString().slice(0, 10);
  try {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/creative-change.yml/runs?created=%3E%3D${day}&per_page=1`, { headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    if (!r.ok) return 0;
    return (await r.json()).total_count ?? 0;
  } catch { return 0; }
}

let req;
if (process.env.APPROVE_ID) {
  const id = process.env.APPROVE_ID.trim();
  if (!ID_RE.test(id)) skip('approval id has the wrong format');
  const held = readJSON(path.join(REPO, 'src/content/requests', `${id}.json`), null);
  if (!held) skip('no logged request with that id');
  if (held.status !== 'held') skip(`request is ${held.status}, not held`);
  req = { id, asset: held.asset, mode: held.mode, text: held.text, at: held.at, approved: true };
  // a held proposal is applied exactly as it was shown; without one (held for the daily cap, a missing photo, an
  // unclear request) the request runs again from the start, with only the daily cap waived
  const A = resolveAsset(held.asset);
  const cand = A && path.join(ENGINE, 'held', `${id}.${A.ext}`);
  if (held.proposal && cand && fs.existsSync(cand)) Object.assign(req, { candidate: path.relative(REPO, cand), summary: held.summary, variantTitle: held.proposal.variantTitle });
} else {
  let p;
  try { p = JSON.parse(process.env.REQUEST || 'null'); } catch { skip('request is not JSON'); }
  if (!p || typeof p !== 'object') skip('empty request');
  const text = redact(String(p.text ?? '').replace(/\s+/g, ' ').trim());
  req = { id: String(p.id ?? ''), asset: String(process.env.ASSET ?? ''), mode: String(p.mode ?? ''), text, at: String(p.at ?? ''), approved: false };
  if (!ID_RE.test(req.id)) skip('bad id');
  if (!['update', 'variant'].includes(req.mode)) skip('bad mode');
  if (text.length < 3 || text.length > 500) skip('bad text length');
  if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(req.at)) req.at = new Date().toISOString();
  if (fs.existsSync(path.join(REPO, 'src/content/requests', `${req.id}.json`))) skip('request id already processed');
}
if (!resolveAsset(req.asset)) skip('unknown asset');
req.runsToday = await runsToday();
writeJSON(path.join(REQ, 'request.json'), req);
log('request', req.id, req.asset, req.mode, req.approved ? (req.candidate ? '(approved proposal)' : '(approved rerun)') : '', `runs today: ${req.runsToday}`);
