// audit.mjs: inspect one creative source the way Chromium actually parses and renders it, without running any of its
// JavaScript, so the change pipeline can judge a candidate on what would really be published (not on regexes over
// the source text). Used by process.mjs for the original and the candidate of every change.
//
//   node engine/change/audit.mjs <source-file>      (prints the audit as JSON)
//
// Returns { violations[], tags[], attrs[], text, visible, images[], paths[] }:
//   violations  anything a creative may not contain: script or form-like elements, event-handler attributes,
//               javascript: or outside URLs, generated text (::before/::after/::marker content, list markers),
//               inline at-rules (@media, @import, @font-face, …), CSS functions that pull in text (attr(), counter())
//   tags/attrs  the element and attribute names present (process.mjs only allows what the original already uses,
//               plus a small fixed set)
//   text        every text node in the document (hidden ones too), Unicode-normalized (NFKC): the fact check
//   visible     the text a viewer can actually see (stills) or sees at any scene's settled moment (videos)
//   reader      the text as a reader sees it (innerText: words split by inline markup are whole again); readerRaw:
//               the same with text-transform switched off
//   images      every image shown (<img> and CSS backgrounds); paths: every SVG path drawn (shapes can spell words)
//   fetched     every kit file the page requested; skeleton: the layout's structure; risky: hiding/clipping styles;
//   red         whether Sundae red is on the canvas; marks: each wordmark/icon's stretch and what it sits on (stills)
// Stills load with JavaScript switched off. Video specs load the motion engine (it needs JavaScript), but process.mjs
// first checks every spec string against a strict markup allowlist (lib.mjs checkSource), so a spec cannot add script.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { start } from '../serve.mjs';
import { resolveSource, loadSpec, canvasOf, ensureClipFrames, launch, openPage, problems, loadVideo } from '../render.mjs';

// Runs in the page. `root` is the element that holds the creative (body for stills, #stage for videos).
function inspect({ rootSel, canvas }) {
  const root = document.querySelector(rootSel) || document.body;
  const BAD = new Set(['script', 'noscript', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input', 'textarea', 'select', 'option', 'button', 'datalist', 'output',
    'foreignobject', 'animate', 'animatemotion', 'animatetransform', 'set', 'audio', 'video', 'source', 'track', 'canvas', 'template', 'slot', 'portal', 'base', 'marquee', 'details', 'summary',
    'dialog', 'math', 'a', 'area', 'map', 'use', 'image', 'text', 'textpath', 'tspan', 'feimage', 'pattern', 'ol', 'ul', 'li', 'menu', 'table', 'caption', 'abbr', 'q', 'title', 'desc']);
  const URL_ATTR = /^(?:src|href|xlink:href|srcset|poster|data|action|formaction|background|lowsrc|dynsrc|longdesc|cite|ping|manifest|codebase|archive|profile|usemap)$/;
  const okUrl = (v) => /^\/(?:kit|cache)\//.test(v);
  const out = { violations: [], tags: new Set(), attrs: new Set() };
  const v = (m) => { if (out.violations.length < 40) out.violations.push(m); };
  // stills: the whole document (it is all the source); videos: only the stage the engine builds from the spec (the
  // engine page around it, with its own <script>s, is trusted kit code)
  const scope = rootSel === 'body' ? document.documentElement : root;
  const els = [scope, ...scope.querySelectorAll('*')];
  for (const el of els) {
    const t = el.tagName.toLowerCase();
    out.tags.add(t);
    if (BAD.has(t) && !(t === 'title' && el.closest('head'))) v(`<${t}> element`);
    if (t === 'meta' && [...el.attributes].some((a) => a.name !== 'charset')) v('<meta> other than charset');
    if (t === 'link' && !(el.getAttribute('rel') === 'stylesheet' && /^\/kit\/[a-z0-9-]+\.css$/.test(el.getAttribute('href') || ''))) v(`<link> other than a /kit/ stylesheet`);
    for (const a of el.attributes) {
      const n = a.name.toLowerCase(), val = a.value.trim();
      out.attrs.add(`${t}:${n}`);
      if (n.startsWith('on')) v(`event handler ${t} ${n}`);
      if (/^\s*(?:javascript|vbscript|data:text)/i.test(val) || /javascript:/i.test(val)) v(`script URL in ${t} ${n}`);
      if (URL_ATTR.test(n) && val && !(t === 'link' && n === 'href') && !okUrl(val) && !val.startsWith('#')) v(`${t} ${n} points outside the kit: ${val.slice(0, 80)}`);
      if (n === 'style' && /attr\(|counters?\(|image-set\(|expression\(|url\(\s*(?!['"]?\/(?:kit|cache)\/)/i.test(val)) v(`inline style on ${t}: ${val.match(/attr\(|counters?\(|image-set\(|expression\(|url\([^)]*\)?/i)[0].slice(0, 80)}`);
    }
    for (const pe of ['::before', '::after', '::marker']) {
      const c = getComputedStyle(el, pe).content;
      if (c && !['none', 'normal', '""', "''"].includes(c)) v(`generated text ${t}${pe}: ${c.slice(0, 60)}`);
    }
    const cs = getComputedStyle(el);
    if (cs.content && !['none', 'normal'].includes(cs.content)) v(`content on ${t}: ${cs.content.slice(0, 60)}`);
    if (cs.display === 'list-item' && !['none', 'disc', 'circle', 'square'].includes(cs.listStyleType)) v(`list marker on ${t}: ${cs.listStyleType.slice(0, 60)}`);
  }
  // inline <style> sheets (the kit's own sheets are trusted and loaded through <link>)
  for (const sh of document.styleSheets) {
    if (!sh.ownerNode || sh.ownerNode.localName !== 'style') continue; // HTML or SVG <style>
    const walk = (rules) => {
      for (const r of rules) {
        // the one at-rule a source may carry: the flyer's PDF page size
        if (r.type === CSSRule.PAGE_RULE && /^@page \{ size: \d+px \d+px; margin: 0px; \}$/.test(r.cssText)) continue;
        if (r.type !== CSSRule.STYLE_RULE) { v(`@-rule in an inline <style>: ${r.cssText.slice(0, 60)}`); continue; }
        if (/attr\(|counters?\(|counter-(?:reset|increment|set)|image-set\(|expression\(|quotes\s*:/i.test(r.cssText)) v(`inline <style> rule uses text-generating CSS: ${r.cssText.slice(0, 80)}`);
        if (/url\(\s*(?!['"]?\/(?:kit|cache)\/)/i.test(r.cssText)) v(`inline <style> rule loads a file outside the kit: ${r.cssText.slice(0, 80)}`);
        if (r.cssRules?.length) walk(r.cssRules); // nested rules
      }
    };
    try { walk(sh.cssRules); } catch { v('unreadable inline stylesheet'); }
  }
  // text: every text node; visible: what a viewer sees (effective visibility through ancestors, inside the canvas,
  // big enough and not transparent)
  const shown = (el) => {
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0) || b.right <= 0 || b.bottom <= 0 || b.left >= canvas.w || b.top >= canvas.h) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.2) return false; }
    const s = getComputedStyle(el); const fs = parseFloat(s.fontSize);
    const m = s.color.match(/rgba?\(([^)]+)\)/); const alpha = m ? Number((m[1].split(/[ ,/]+/).filter(Boolean)[3]) ?? 1) : 1;
    if (!(fs >= 9 && alpha >= 0.3)) return false;
    // drawn over by something else (stills only: a video stacks its faded-out scenes on top of each other)
    if (rootSel === 'body') {
      const x = Math.min(Math.max((b.left + b.right) / 2, 0), canvas.w - 1), y = Math.min(Math.max((b.top + b.bottom) / 2, 0), canvas.h - 1);
      const top = document.elementFromPoint(x, y);
      if (top && top !== el && !el.contains(top) && !top.contains(el)) return false;
    }
    return true;
  };
  const all = [], vis = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode, p = n.parentElement;
    if (!p || ['style', 'script', 'title'].includes(p.localName)) continue;
    const t = n.nodeValue.normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!t) continue;
    all.push(t);
    if (root.contains(p) && shown(p)) vis.push(t);
  }
  // the images and drawn shapes a viewer sees (text inside them is invisible to the text checks)
  const images = new Set(), paths = new Set();
  for (const el of els) {
    if (el.tagName === 'IMG' && el.getAttribute('src')) images.add(el.getAttribute('src'));
    for (const pe of [null, '::before', '::after']) for (const m of (getComputedStyle(el, pe).backgroundImage || '').matchAll(/url\("?([^")]+)"?\)/g)) images.add(new URL(m[1], location.href).pathname);
    if (el.tagName.toLowerCase() === 'path' && el.getAttribute('d')) paths.add(el.getAttribute('d').replace(/\s+/g, ' ').trim());
  }
  // the layout's skeleton: every element except inline text formatting, with its attribute names, and the geometry of
  // drawn shapes. Wording and styling don't change it; adding, removing or moving parts (or drawing new shapes) does.
  const INLINE = new Set(['br', 'b', 'i', 'em', 'strong', 'span', 'small', 'sup', 'sub', 'u']);
  const GEOM = ['d', 'points', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'viewbox', 'transform'];
  const SHAPES = new Set(['svg', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'g']);
  const skeleton = els.filter((el) => !INLINE.has(el.localName)).map((el) => {
    const names = [...el.attributes].map((a) => a.name.toLowerCase()).filter((n) => n !== 'style' && n !== 'class').sort();
    const geom = SHAPES.has(el.localName) && el.localName !== 'svg' ? GEOM.map((g) => el.getAttribute(g)).filter((v) => v != null).join(' ') : '';
    return `${el.localName}[${names.join(',')}]${geom ? '{' + geom.replace(/\s+/g, ' ') + '}' : ''}`;
  });
  // styles that hide, clip, mask, filter or transform parts: a new one could hide a fact the text check still "sees"
  // Keyed by the element (tag and class), so a style the original uses on one part doesn't excuse it on another.
  // pointer-events: an element that ignores the pointer is invisible to the "drawn over" test in shown(); a pseudo-element
  // with a fill can cover its own element's text (it hit-tests as that element)
  const RISKY = ['clip-path', 'mask-image', '-webkit-mask-image', 'filter', 'backdrop-filter', 'transform', 'mix-blend-mode', 'visibility', 'clip', 'z-index', 'text-indent', 'letter-spacing', 'font-size', 'pointer-events'];
  const risky = new Set();
  if (rootSel === 'body') for (const el of els) { // stills only: the motion engine animates with transforms and opacity
    const cs = getComputedStyle(el), key = `${el.localName}.${(el.getAttribute('class') || '').trim().replace(/\s+/g, '.')}`;
    for (const p of RISKY) {
      const val = cs.getPropertyValue(p);
      if (!val || ['none', 'normal', 'auto', 'visible', '0px', 'matrix(1, 0, 0, 1, 0, 0)'].includes(val)) continue;
      if (p === 'font-size' && parseFloat(val) >= 9) continue; // only tiny text is risky
      if (p === 'letter-spacing' && Math.abs(parseFloat(val)) < 20) continue;
      if (p === 'text-indent' && Math.abs(parseFloat(val)) < 200) continue;
      risky.add(`${key} ${p}: ${val.slice(0, 80)}`);
    }
    if (+cs.opacity < 0.2 && el.textContent.trim()) risky.add(`${key} opacity: ${cs.opacity} on text`);
    for (const pe of ['::before', '::after']) {
      const ps = getComputedStyle(el, pe);
      if (!ps.content || ['none', 'normal'].includes(ps.content)) continue;
      const bg = ps.backgroundColor.match(/rgba?\(([^)]+)\)/)?.[1].split(/[ ,/]+/).filter(Boolean).map(Number);
      if ((bg && (bg[3] ?? 1) > 0.3) || ps.backgroundImage !== 'none' || ps.boxShadow !== 'none') risky.add(`${key}${pe} filled box`);
    }
  }
  // is Sundae red still on the canvas (wordmark, icon or a red fill)?
  const near = (c) => { const m = c && c.match(/rgba?\(([^)]+)\)/); if (!m) return false; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return a > 0.5 && Math.hypot(r - 219, g - 61, b - 85) < 30; };
  const red = els.some((el) => { const cs = getComputedStyle(el); return near(cs.backgroundColor) || near(cs.fill) || near(cs.borderLeftColor) || near(cs.borderTopColor) || (el.localName === 'img' && /wordmark-red|sundae-wordmark\.svg|sundae-icon/.test(el.getAttribute('src') || '')); });
  // the Sundae wordmark and icon (stills; a video's are drawn by the motion engine): how far each is stretched from its
  // own proportions, and what it sits on at its center and four inner corners (BRAND-SPEC §4: red on white, mist, pink,
  // slate or gray; white on red, blue or ink; on a photo only inside a solid field)
  const marks = [];
  const behind = (mark, x, y) => {
    for (const e of document.elementsFromPoint(x, y)) { // top to bottom (the mark's own fill first); transparent wrappers are looked through
      const cs = getComputedStyle(e);
      if (e !== mark && (e.localName === 'img' || e.localName === 'video' || cs.backgroundImage !== 'none')) return 'photo';
      const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/); const c = m ? m[1].split(/[ ,/]+/).filter(Boolean).map(Number) : [0, 0, 0, 0];
      if ((c[3] ?? 1) > 0.5) return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
    return 'rgb(255, 255, 255)'; // the page's own white
  };
  if (rootSel === 'body') for (const el of els) {
    if (el.localName !== 'img' || !/sundae-(?:wordmark|icon)/.test(el.getAttribute('src') || '')) continue;
    const b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0)) continue;
    const nat = el.naturalWidth && el.naturalHeight ? el.naturalWidth / el.naturalHeight : 0;
    const pts = [[0.5, 0.5], [0.15, 0.2], [0.85, 0.2], [0.15, 0.8], [0.85, 0.8]].map(([fx, fy]) => [b.left + fx * b.width, b.top + fy * b.height]).filter(([x, y]) => x >= 0 && y >= 0 && x < canvas.w && y < canvas.h);
    marks.push({ src: el.getAttribute('src').replace(/^.*\//, ''), stretch: nat ? Math.abs(b.width / b.height / nat - 1) : 0, on: [...new Set(pts.map(([x, y]) => behind(el, x, y)))] });
  }
  const reader = (root.innerText || '').normalize('NFKC');
  // the same text with text-transform switched off: a name styled into lowercase still reads as a name here
  const plainCase = document.createElement('style'); plainCase.textContent = '*{text-transform:none!important}'; document.head.appendChild(plainCase);
  const readerRaw = (root.innerText || '').normalize('NFKC'); plainCase.remove();
  return { violations: out.violations, tags: [...out.tags].sort(), attrs: [...out.attrs].sort(), text: all.join(' '), visible: vis.join(' '), reader, images: [...images].sort(), paths: [...paths].sort(), skeleton, risky: [...risky].sort(), red, marks, readerRaw };
}

export async function auditSource(source) {
  const src = resolveSource(source);
  const video = src.kind === 'videos' || src.kind === 'reels';
  let canvas, spec;
  if (video) { spec = loadSpec(src); canvas = { w: spec.w, h: spec.h }; for (const c of new Set(spec.scenes.filter((s) => s.type === 'clip').map((s) => s.clip))) ensureClipFrames(c); }
  else canvas = canvasOf(fs.readFileSync(src.abs, 'utf8'), src.rel);
  const srv = await start();
  const browser = await launch();
  try {
    const { context, page, issues } = await openPage(browser, srv.url, { width: canvas.w, height: canvas.h, js: video });
    // every kit file the page really fetches (whatever CSS property or URL spelling asked for it)
    const fetched = new Set();
    page.on('request', (rq) => { try { const u = new URL(rq.url()); if (u.origin === srv.url) fetched.add(decodeURIComponent(u.pathname).replace(/\/{2,}/g, '/').replace(/\/f_\d+\.jpg$/, '/')); } catch { /* ignore */ } });
    const done = (r) => { r.fetched = [...fetched].filter((f) => /^\/(?:kit\/assets|cache\/clips)\//.test(f)).sort(); r.violations.push(...problems(issues)); return r; };
    try {
      if (!video) {
        await page.goto(`${srv.url}/${src.rel.split('/').map(encodeURIComponent).join('/')}`, { waitUntil: 'load', timeout: 60000 });
        await page.evaluate(() => document.fonts.ready);
        const r = await page.evaluate(inspect, { rootSel: 'body', canvas });
        return done(r);
      }
      await loadVideo(page, srv.url, src);
      const r = await page.evaluate(inspect, { rootSel: '#stage', canvas });
      // what a viewer sees: the union of every scene's settled moment (the same moments the preview shows)
      // and every text it shows, sampled at each scene's settled moment and its last frame (counters finish there)
      const seen = new Set(), texts = new Set([r.text]), readers = new Set([r.reader]), raws = new Set([r.readerRaw]), imgs = new Set(r.images), pths = new Set(r.paths); let t = 0;
      for (const s of spec.scenes) {
        for (const at of [t + Math.min(s.dur - 0.2, 2.6), t + s.dur - 0.04]) {
          await page.evaluate((x) => window.seekTo(x), at);
          const x = await page.evaluate(inspect, { rootSel: '#stage', canvas });
          seen.add(x.visible); texts.add(x.text); readers.add(x.reader); raws.add(x.readerRaw); x.images.forEach((i) => imgs.add(i)); x.paths.forEach((d) => pths.add(d));
        }
        t += s.dur;
      }
      r.visible = [...seen].join(' ');
      r.text = [...texts].join(' ');
      r.reader = [...readers].join('\n');
      r.readerRaw = [...raws].join('\n');
      r.images = [...imgs].sort(); r.paths = [...pths].sort();
      return done(r);
    } finally { await context.close().catch(() => {}); }
  } finally { await browser.close().catch(() => {}); await srv.close(); }
}

const isMain = () => { try { return pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url; } catch { return false; } };
if (isMain()) {
  try { console.log(JSON.stringify(await auditSource(process.argv[2]), null, 1)); }
  catch (e) { console.error(`audit.mjs: ERROR: ${e.message}`); process.exit(2); }
}
