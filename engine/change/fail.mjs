// Turns the current request into a "failed" result (used when a later step breaks, e.g. the site build), so the
// change log on the site still says what happened. Usage: node engine/change/fail.mjs "<reason for the Sundae team>"
import path from 'node:path';
import { OUT, REQ, readJSON, resolveAsset, writeJSON } from './lib.mjs';

const req = readJSON(path.join(REQ, 'request.json'));
const prev = readJSON(path.join(OUT, 'result.json'), null);
const reason = process.argv[2] || 'Something went wrong while making this change, so nothing was changed. It can be sent again.';
const log = { ...(prev?.log ?? { id: req.id, at: req.at, asset: req.asset, assetTitle: resolveAsset(req.asset)?.entry.title, mode: req.mode, text: req.text }), status: 'failed', reason, finishedAt: new Date().toISOString() };
delete log.result;
writeJSON(path.join(OUT, 'result.json'), { status: 'failed', request: req, log });
console.log('[change] marked failed');
