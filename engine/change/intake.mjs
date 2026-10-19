// Step 1 of the creative-change workflow: turn the trigger into .request/request.json.
//   repository_dispatch (from the site's change box): PAYLOAD = the client_payload JSON
//   workflow_dispatch (owner approves a held request): APPROVE_ID = the request id
// An invalid trigger writes .request/skip (the workflow then stops quietly: nothing to log against).
import fs from 'node:fs';
import path from 'node:path';
import { REPO, REQ, log, readJSON, resolveAsset, writeJSON } from './lib.mjs';

fs.rmSync(REQ, { recursive: true, force: true });
fs.mkdirSync(REQ, { recursive: true });
const skip = (why) => { fs.writeFileSync(path.join(REQ, 'skip'), why + '\n'); log('skip:', why); process.exit(0); };
const ID_RE = /^\d{8}-\d{6}-[a-z0-9]{4}$/;

let req;
if (process.env.APPROVE_ID) {
  const id = process.env.APPROVE_ID.trim();
  if (!ID_RE.test(id)) skip('approval id has the wrong format');
  const held = readJSON(path.join(REPO, 'src/content/requests', `${id}.json`), null);
  if (!held) skip('no logged request with that id');
  if (held.status !== 'held') skip(`request is ${held.status}, not held`);
  req = { id, asset: held.asset, mode: held.mode, text: held.text, at: held.at, approved: true };
} else {
  let p;
  try { p = JSON.parse(process.env.PAYLOAD || 'null'); } catch { skip('payload is not JSON'); }
  if (!p || typeof p !== 'object') skip('empty payload');
  const text = String(p.text ?? '').replace(/\s+/g, ' ').trim();
  req = { id: String(p.id ?? ''), asset: String(p.asset ?? ''), mode: String(p.mode ?? ''), text, at: String(p.at ?? ''), approved: false };
  if (!ID_RE.test(req.id)) skip('bad id');
  if (!['update', 'variant'].includes(req.mode)) skip('bad mode');
  if (text.length < 3 || text.length > 500) skip('bad text length');
  if (!/^\d{4}-\d{2}-\d{2}T/.test(req.at)) req.at = new Date().toISOString();
  if (fs.existsSync(path.join(REPO, 'src/content/requests', `${req.id}.json`))) skip('request id already processed');
}
if (!resolveAsset(req.asset)) skip('unknown asset');
writeJSON(path.join(REQ, 'request.json'), req);
log('request', req.id, req.asset, req.mode, req.approved ? '(approved)' : '');
