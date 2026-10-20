// lint.mjs — brand-lint ONE creative source against clients/sundae/BRAND-SPEC.md.
// Adapted from the studio's render-kit/brand-lint.mjs: same checks and thresholds, run on the asset page at its
// canvas size (1x). Videos/Reels: the spec page is loaded and seeked to the poster time (spec.poster, else
// min(total-0.5, 2.2) s), and only what is visible at that moment is checked (elements inside a scene that is
// faded out count as hidden — the one change from brand-lint, whose visibility test ignored ancestor opacity).
//
//   node engine/lint.mjs <source-file> [--min 16] [--json <out.json>]
//
// Prints a JSON report to stdout (and a one-line summary to stderr).
// Exit 0 = pass · 1 = hard violation (red text, non-brand font, low contrast) · 2 = could not lint (bad source,
// missing asset, blocked request, page error).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { start } from './serve.mjs';
import { resolveSource, loadSpec, canvasOf, checkHtmlSource, ensureClipFrames, launch, openPage, problems, loadStill, loadVideo, posterTime, parseArgs, RenderError } from './render.mjs';

// Runs in the page. Body copied from brand-lint.mjs; only vis() changed (effective visibility through ancestors).
function CHECKS(MIN) {
  const PAL = { ink: [74, 74, 74], white: [255, 255, 255], blue: [28, 81, 160], red: [219, 61, 85], pink: [244, 204, 204], mist: [244, 247, 249], gray: [230, 230, 230], slate: [201, 210, 224] };
  const TEXT_OK = ['ink', 'white', 'blue'];
  const parse = c => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; };
  const dist = (c, p) => Math.hypot(c.r - p[0], c.g - p[1], c.b - p[2]);
  const near = (c, name, tol = 18) => dist(c, PAL[name]) <= tol;
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const ratio = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
  const hsl = c => { const r = c.r / 255, g = c.g / 255, b = c.b / 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); const l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > .5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; } return { h, s, l }; };
  const isReddish = c => { const { h, s, l } = hsl(c); return (h >= 335 || h <= 12) && s > 0.45 && l > 0.25 && l < 0.75; };
  const vis = el => {
    const b = el.getBoundingClientRect(); if (!(b.width > 0 && b.height > 0)) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; }
    return true;
  };
  const bgOf = el => { let e = el; while (e && e.nodeType === 1) { const cs = getComputedStyle(e); if (cs.backgroundImage && cs.backgroundImage !== 'none') return { image: true }; const c = parse(cs.backgroundColor); if (c && c.a > 0.85) return { c }; e = e.parentElement; } return { c: { r: 255, g: 255, b: 255, a: 1 } }; };
  const out = { redText: [], badFont: [], offPaletteText: [], lowContrast: [], small: [], offPaletteBg: [], fonts: {}, textColors: {}, redPresent: false, textNodes: 0 };
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = walker.currentNode; const txt = t.textContent.replace(/\s+/g, ' ').trim(); if (!txt) continue;
    const el = t.parentElement; if (!el || !vis(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE'].includes(el.tagName)) continue;
    if (el.closest('[aria-hidden="true"]') && el.closest('svg')) continue;
    out.textNodes++;
    const cs = getComputedStyle(el); const c = parse(cs.color); const fs = parseFloat(cs.fontSize); const fw = +cs.fontWeight || 400;
    const fam = cs.fontFamily; const key = el.tagName + '|' + txt.slice(0, 40);
    if (seen.has(key)) continue; seen.add(key);
    const sample = { tag: el.tagName.toLowerCase(), cls: (el.className && el.className.baseVal === undefined ? String(el.className) : '').slice(0, 60), text: txt.slice(0, 70), color: cs.color, size: fs, weight: fw, font: fam.split(',')[0] };
    out.fonts[fam.split(',')[0].replace(/['"]/g, '')] = (out.fonts[fam.split(',')[0].replace(/['"]/g, '')] || 0) + 1;
    if (c) { const k = `rgb(${c.r},${c.g},${c.b})`; out.textColors[k] = (out.textColors[k] || 0) + 1; }
    if (!/merriweather|lato/i.test(fam.split(',')[0])) out.badFont.push(sample);
    if (c && c.a > 0.2 && (near(c, 'red', 40) || isReddish(c))) out.redText.push(sample);
    else if (c && !TEXT_OK.some(n => near(c, n, 14))) out.offPaletteText.push(sample);
    if (fs < MIN) out.small.push(sample);
    const bg = bgOf(el);
    if (c && bg.c) { const large = fs >= 24 || (fs >= 18.66 && fw >= 700); const cr = ratio(c, bg.c); const need = large ? 3 : 4.5; if (cr < need) out.lowContrast.push({ ...sample, bg: `rgb(${bg.c.r},${bg.c.g},${bg.c.b})`, ratio: +cr.toFixed(2), need }); }
  }
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el)) continue; const cs = getComputedStyle(el);
    const bg = parse(cs.backgroundColor);
    if (bg && bg.a > 0.85) { if (near(bg, 'red', 30)) out.redPresent = true; const okBg = Object.keys(PAL).some(n => near(bg, n, 14)); if (!okBg) { const b = el.getBoundingClientRect(); if (b.width * b.height > 2500) out.offPaletteBg.push({ tag: el.tagName.toLowerCase(), cls: String(el.className && el.className.baseVal === undefined ? el.className : '').slice(0, 60), bg: cs.backgroundColor, area: Math.round(b.width * b.height) }); } }
    for (const p of ['borderTopColor', 'borderLeftColor']) { const bc = parse(cs[p]); if (bc && bc.a > 0.5 && parseFloat(cs[p.replace('Color', 'Width')]) > 0 && near(bc, 'red', 30)) out.redPresent = true; }
    if (el instanceof SVGElement) { const f = parse(cs.fill); if (f && near(f, 'red', 30)) out.redPresent = true; }
    if (el.tagName === 'IMG' && /wordmark-red|sundae-wordmark\.svg|sundae-icon|logo-red|wordmark/i.test(el.getAttribute('src') || '')) { if (!/white|cream/i.test(el.getAttribute('src'))) out.redPresent = true; }
  }
  return out;
}

export async function lintAsset({ source, min = 16 } = {}) {
  const src = resolveSource(source);
  const video = src.kind === 'videos' || src.kind === 'reels';
  let spec, canvas, policy = [];
  if (video) {
    spec = loadSpec(src); canvas = { w: spec.w, h: spec.h };
    for (const c of new Set(spec.scenes.filter(s => s.type === 'clip').map(s => s.clip))) ensureClipFrames(c, m => process.stderr.write(`lint: ${m}\n`));
  } else {
    const html = fs.readFileSync(src.abs, 'utf8');
    policy = checkHtmlSource(html); canvas = canvasOf(html, src.rel);
  }
  const srv = await start(); const browser = await launch();
  try {
    const { context, page, issues } = await openPage(browser, srv.url, { width: canvas.w, height: canvas.h, scale: 1 });
    let at, r; const errs = [];
    try {
      if (video) { const total = await loadVideo(page, srv.url, src); at = posterTime(spec, total); await page.evaluate(x => window.seekTo(x), at); await page.waitForTimeout(100); }
      else await loadStill(page, `${srv.url}/${src.rel.split('/').map(encodeURIComponent).join('/')}`);
    } catch (e) { errs.push(String(e.message).split('\n')[0]); }
    try { r = await page.evaluate(CHECKS, min); } catch (e) { errs.push(`checks failed: ${String(e.message).split('\n')[0]}`); } // still lint what did load
    await context.close().catch(() => {});
    const load = [...problems(issues), ...errs];
    const hard = !!r && !!(r.redText.length || r.badFont.length || r.lowContrast.length);
    const report = {
      source: src.rel, kind: src.kind, canvas: `${canvas.w}x${canvas.h}`, ...(video ? { atSec: at } : {}), min,
      pass: !hard && !policy.length && !load.length, hardViolations: hard, sourcePolicy: policy, loadProblems: load,
    };
    if (r) Object.assign(report, {
      textNodes: r.textNodes, redPresent: r.redPresent, fonts: r.fonts, textColors: r.textColors,
      counts: { redText: r.redText.length, badFont: r.badFont.length, lowContrast: r.lowContrast.length, offPaletteText: r.offPaletteText.length, small: r.small.length, offPaletteBg: r.offPaletteBg.length },
      redText: r.redText, badFont: r.badFont, lowContrast: r.lowContrast, offPaletteText: r.offPaletteText.slice(0, 25), small: r.small.slice(0, 25), offPaletteBg: r.offPaletteBg.slice(0, 25),
    });
    return report;
  } finally { await browser.close().catch(() => {}); await srv.close(); }
}

const isMain = () => { try { return pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url; } catch { return false; } };
if (isMain()) {
  try {
    const { pos, opt } = parseArgs(process.argv.slice(2), { min: 'str', json: 'str' });
    if (pos.length !== 1) throw new RenderError('usage: node engine/lint.mjs <source-file> [--min 16] [--json <out.json>]');
    const min = opt.min != null ? Number(opt.min) : 16;
    const rep = await lintAsset({ source: pos[0], min });
    const json = JSON.stringify(rep, null, 2);
    if (opt.json) fs.writeFileSync(path.resolve(process.cwd(), opt.json), json + '\n');
    console.log(json);
    const c = rep.counts;
    const counts = c ? `red=${rep.redPresent ? 'yes' : 'NO'} redText=${c.redText} badFont=${c.badFont} lowContrast=${c.lowContrast} offPaletteText=${c.offPaletteText} small<${min}=${c.small} offPaletteBg=${c.offPaletteBg}` : 'checks did not run';
    console.error(`lint: ${rep.source}${rep.atSec != null ? ` @${rep.atSec}s` : ''}  ${rep.pass ? 'PASS' : 'FAIL'}  ${counts}${rep.sourcePolicy.length ? `  policy: ${rep.sourcePolicy.join('; ')}` : ''}${rep.loadProblems.length ? `  load: ${rep.loadProblems.join('; ')}` : ''}`);
    process.exit(rep.sourcePolicy.length || rep.loadProblems.length ? 2 : rep.hardViolations ? 1 : 0);
  } catch (e) {
    console.error(`lint.mjs: ERROR: ${e instanceof RenderError ? e.message : (e.stack || e)}`);
    process.exit(2);
  }
}
