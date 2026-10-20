// Turns the current request into a "failed" result (used when a later step breaks, e.g. the site build), so the
// change log on the site still says what happened. Usage: node engine/change/fail.mjs "<reason for the Sundae team>"
import path from 'node:path';
import { OUT, REQ, readJSON, redact, resolveAsset, writeJSON } from './lib.mjs';

const req = readJSON(path.join(REQ, 'request.json'));
const prev = readJSON(path.join(OUT, 'result.json'), null);
const reason = process.argv[2] || 'Something went wrong while making this change, so nothing was changed. It can be sent again.';
// a minimal record with no model-written text, so nothing in it can trip the guard
const log = { id: req.id, at: req.at, asset: req.asset, assetTitle: resolveAsset(req.asset)?.entry.title, mode: req.mode, text: redact(req.text), status: 'failed', reason, finishedAt: new Date().toISOString(), ...(req.approved ? { approved: true } : {}) };
if (req.approved) {
  // an approval that failed for a reason outside the request (install, build, push) stays held, so it can be approved again
  const why = reason.split(/\.(\s|$)/)[0].replace(/^./, (c) => c.toLowerCase()); // "the site didn't build with this change, so it was not published"
  Object.assign(log, { status: 'held', reason: `The approval didn't go through: ${why}. Approve it again.`, ...(req.summary ? { summary: req.summary } : {}), ...(req.proposal ? { proposal: req.proposal } : {}) });
  delete log.approved;
}
writeJSON(path.join(OUT, 'result.json'), { status: log.status, request: req, sourceHash: prev?.sourceHash, log });
console.log(`[change] marked ${log.status}`);
