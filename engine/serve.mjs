// serve.mjs — tiny static server for the Sundae render engine (node:http, no dependencies).
//
//   import { start } from './serve.mjs'; const srv = await start(); … srv.url … await srv.close();
//   node serve.mjs [port]            # browse the creatives by hand: http://127.0.0.1:<port>/creatives/…
//
// Rooted at engine/. Every creative references the kit by ROOT-ABSOLUTE paths (/kit/base.css,
// /kit/assets/…, /kit/fonts/…), so a source renders the same from any folder depth.
//   /cache/…                    → engine/.cache/…  (AI clip frames extracted by render.mjs)
//   /__video?spec=<path.json>   → the motion-engine page for that spec (path relative to engine/)
// Only GET/HEAD, only files inside engine/, no dotfiles, no node_modules, no directory listings.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ENGINE_DIR = fs.realpathSync(path.dirname(fileURLToPath(import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
};

// The page rendervid.mjs used to write next to engine.js, with the kit referenced absolutely.
export function videoPage(spec) {
  const json = JSON.stringify(spec).replace(/</g, '\\u003c'); // a '<' inside the spec can never close the <script>
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/kit/engine.css"><script src="/kit/gsap.min.js"></script></head><body><div id="stage"></div><script>window.SPEC=${json}</script><script src="/kit/engine.js"></script></body></html>`;
}

// URL path → absolute file path inside root, or null when it must not be served.
export function fileFor(urlPath, root = ENGINE_DIR) {
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return null; }
  if (p.includes('\0')) return null;
  const segs = p.split('/').filter(Boolean);
  if (segs[0] === 'cache') segs[0] = '.cache';
  if (segs.some((s, i) => s === '..' || (s.startsWith('.') && !(i === 0 && s === '.cache')) || s === 'node_modules')) return null;
  const abs = path.resolve(root, ...segs);
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return abs;
}

function send(res, code, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}

export function start({ root = ENGINE_DIR, host = '127.0.0.1', port = 0 } = {}) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    let u;
    try { u = new URL(req.url, 'http://local'); } catch { return send(res, 400, 'bad url'); }
    if (u.pathname === '/__video') {
      const f = fileFor(u.searchParams.get('spec') || '', root);
      if (!f || path.extname(f) !== '.json' || !fs.existsSync(f)) return send(res, 404, 'spec not found');
      let spec;
      try { spec = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return send(res, 400, `spec is not valid JSON: ${e.message}`); }
      return send(res, 200, videoPage(spec), TYPES['.html']);
    }
    const f = fileFor(u.pathname, root);
    let st;
    try { st = f && fs.statSync(f); } catch { st = null; }
    if (!st || !st.isFile()) return send(res, 404, 'not found');
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(f).on('error', () => res.destroy()).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const a = server.address();
      resolve({
        url: `http://${host}:${a.port}`, port: a.port, server,
        close: () => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); }),
      });
    });
  });
}

const isMain = () => { try { return pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url; } catch { return false; } };
if (isMain()) {
  const s = await start({ port: Number(process.argv[2] || 0) });
  console.log(`serving ${ENGINE_DIR} at ${s.url}  (Ctrl-C to stop)`);
  console.log(`  image/flyer: ${s.url}/creatives/events/manhattan-beach-2026-10-08/images/01.html`);
  console.log(`  video/reel : ${s.url}/__video?spec=creatives/events/manhattan-beach-2026-10-08/reels/R7.json  (then window.seekTo(t))`);
}
