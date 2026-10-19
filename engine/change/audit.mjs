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
//   images      every image shown (<img> and CSS backgrounds); paths: every SVG path drawn (shapes can spell words)
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
    if (!sh.ownerNode || sh.ownerNode.tagName !== 'STYLE') continue;
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
    return fs >= 9 && alpha >= 0.3;
  };
  const all = [], vis = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode, p = n.parentElement;
    if (!p || ['STYLE', 'SCRIPT', 'TITLE'].includes(p.tagName)) continue;
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
  return { violations: out.violations, tags: [...out.tags].sort(), attrs: [...out.attrs].sort(), text: all.join(' '), visible: vis.join(' '), images: [...images].sort(), paths: [...paths].sort() };
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
    try {
      if (!video) {
        await page.goto(`${srv.url}/${src.rel.split('/').map(encodeURIComponent).join('/')}`, { waitUntil: 'load', timeout: 60000 });
        await page.evaluate(() => document.fonts.ready);
        const r = await page.evaluate(inspect, { rootSel: 'body', canvas });
        r.violations.push(...problems(issues));
        return r;
      }
      await loadVideo(page, srv.url, src);
      const r = await page.evaluate(inspect, { rootSel: '#stage', canvas });
      // what a viewer sees: the union of every scene's settled moment (the same moments the preview shows)
      // and every text it shows, sampled at each scene's settled moment and its last frame (counters finish there)
      const seen = new Set(), texts = new Set([r.text]), imgs = new Set(r.images), pths = new Set(r.paths); let t = 0;
      for (const s of spec.scenes) {
        for (const at of [t + Math.min(s.dur - 0.2, 2.6), t + s.dur - 0.04]) {
          await page.evaluate((x) => window.seekTo(x), at);
          const x = await page.evaluate(inspect, { rootSel: '#stage', canvas });
          seen.add(x.visible); texts.add(x.text); x.images.forEach((i) => imgs.add(i)); x.paths.forEach((d) => pths.add(d));
        }
        t += s.dur;
      }
      r.visible = [...seen].join(' ');
      r.text = [...texts].join(' ');
      r.images = [...imgs].sort(); r.paths = [...pths].sort();
      r.violations.push(...problems(issues));
      return r;
    } finally { await context.close().catch(() => {}); }
  } finally { await browser.close().catch(() => {}); await srv.close(); }
}

const isMain = () => { try { return pathToFileURL(fs.realpathSync(process.argv[1])).href === import.meta.url; } catch { return false; } };
if (isMain()) {
  try { console.log(JSON.stringify(await auditSource(process.argv[2]), null, 1)); }
  catch (e) { console.error(`audit.mjs: ERROR: ${e.message}`); process.exit(2); }
}
