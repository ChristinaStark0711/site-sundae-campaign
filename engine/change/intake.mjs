// Step 1 of the creative-change workflow: turn the trigger into .request/request.json.
//   from the site's change box: inputs.asset and inputs.request (JSON: id, mode, text, at)
//   owner approval of a held request: inputs.approve (the request id from the site's change log)
// The inputs are read from the event file GitHub writes (GITHUB_EVENT_PATH), never from step env, because GitHub prints
// a step's env in its public log. Local tests can pass ASSET, REQUEST and APPROVE_ID as env instead.
// Also counts this workflow's runs started today (GitHub API, GH_TOKEN with actions: read) for the daily cap, and
// removes anything that looks like a credential from the request text before it can reach the public log.
// An invalid trigger writes .request/skip (the workflow then stops quietly: there is nothing to log it against).
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE, OUT, REPO, REQ, log, readJSON, redact, resolveAsset, writeJSON } from './lib.mjs';

fs.rmSync(REQ, { recursive: true, force: true });
fs.mkdirSync(REQ, { recursive: true });
// a bad request from the site ends quietly (nothing to log it against); a bad approval turns the run red, so the owner
// sees why in GitHub
let approving = false;
const skip = (why) => { fs.writeFileSync(path.join(REQ, 'skip'), why + '\n'); log('skip:', why); process.exit(approving ? 1 : 0); };
const plain = (t) => String(t ?? '').toWellFormed().replace(/[\u0000-\u001f\u007f]/g, ' '); // no control characters or lone surrogates
const ID_RE = /^\d{8}-\d{6}-[a-z0-9]{4}$/;

async function runsToday() {
  const { GH_TOKEN, GITHUB_REPOSITORY } = process.env;
  if (!GH_TOKEN || !GITHUB_REPOSITORY) return null; // unknown: process.mjs holds rather than guess
  const day = new Date().toISOString().slice(0, 10);
  try {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/creative-change.yml/runs?created=%3E%3D${day}&per_page=1`, { headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    if (!r.ok) return null;
    return (await r.json()).total_count ?? null;
  } catch { return null; }
}

let inputs = { approve: process.env.APPROVE_ID, asset: process.env.ASSET, request: process.env.REQUEST };
if (process.env.GITHUB_EVENT_PATH && fs.existsSync(process.env.GITHUB_EVENT_PATH)) inputs = readJSON(process.env.GITHUB_EVENT_PATH, {}).inputs || {};

let req;
if (inputs.approve && String(inputs.approve).trim()) {
  approving = true;
  const id = /\d{8}-\d{6}-[a-z0-9]{4}/.exec(String(inputs.approve))?.[0] ?? ''; // "Request 20261019-…" pasted whole is fine
  if (!ID_RE.test(id)) skip('approval id has the wrong format');
  const held = readJSON(path.join(REPO, 'src/content/requests', `${id}.json`), null);
  if (!held) skip('no logged request with that id');
  if (held.status !== 'held') skip(`request is ${held.status}, not held`);
  req = { id, asset: held.asset, mode: held.mode, text: held.text, at: held.at, approved: true, summary: held.summary, heldReason: held.reason };
  if (!resolveAsset(held.asset)) {
    // the asset left the library: close the request with a log entry (push.sh then removes its held files)
    fs.mkdirSync(OUT, { recursive: true });
    writeJSON(path.join(REQ, 'request.json'), req);
    writeJSON(path.join(OUT, 'result.json'), { status: 'failed', request: req, log: { id, at: held.at, asset: held.asset, assetTitle: held.assetTitle, mode: held.mode, text: held.text, status: 'failed', reason: 'The asset is no longer in the library, so this request was closed.', finishedAt: new Date().toISOString() } });
    log('approval of', id, 'closed: asset no longer in the library');
    process.exit(0);
  }
  // a held proposal is applied exactly as it was shown; without one (held for the daily cap, a missing photo, an
  // unclear request) the request runs again from the start, with only the daily cap waived
  const A = resolveAsset(held.asset);
  const cand = A && path.join(ENGINE, 'held', `${id}.${A.ext}`);
  if (held.proposal && cand && fs.existsSync(cand)) Object.assign(req, { candidate: path.relative(REPO, cand), summary: held.summary, variantTitle: held.proposal.variantTitle, proposal: held.proposal, baseHash: held.proposal.baseHash });
} else {
  let p;
  try { p = JSON.parse(inputs.request || 'null'); } catch { skip('request is not JSON'); }
  if (!p || typeof p !== 'object') skip('empty request');
  const text = redact(plain(p.text).replace(/\s+/g, ' ').trim());
  req = { id: String(p.id ?? ''), asset: String(inputs.asset ?? ''), mode: String(p.mode ?? ''), text, at: String(p.at ?? ''), approved: false };
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
