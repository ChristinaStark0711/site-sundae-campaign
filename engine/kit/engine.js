// Frame-accurate motion engine: builds scenes from window.SPEC into one paused GSAP
// timeline. The renderer calls window.seekTo(t) per frame and screenshots.
// Look: Sundae Creative Guidelines (clients/sundae/BRAND-SPEC.md). Card scenes on white/mist with
// Merriweather #4A4A4A headlines, Lato eyebrows and a red accent bar; text over photos/AI clips in
// highlight boxes (white box + ink Merriweather, red box + large white, blue chip for date/time);
// red wordmark on a white tab; red is never a text color. Copy defaults are AP style.
(function () {
  const S = window.SPEC;
  const W = S.w, H = S.h, U = Math.min(W, H) / 100;
  const V = H > W * 1.2, SQ = !V && H > W * 0.8; // vertical / square
  const root = document.documentElement;
  root.style.setProperty('--W', W + 'px'); root.style.setProperty('--H', H + 'px'); root.style.setProperty('--u', U + 'px');
  const stage = document.getElementById('stage');
  const A = '/kit/assets/';            // root-absolute: the page is served from engine/ (serve.mjs)
  const CLIPDIR = '/cache/clips/';     // engine/.cache/clips/<name>/f_%04d.jpg, extracted by render.mjs
  const tl = gsap.timeline({ paused: true });
  const XF = 0.55; // crossfade
  const pad = V ? 7 * U : SQ ? 7 * U : 8 * U;
  // type scale in px (BRAND-SPEC §3 minimums: landscape body 34 / headline 72; Reels body 36 / headline 80;
  // 1080 square social body 30 / eyebrow 22 / headline 64)
  const F = V ? { ey: 2.7 * U, body: 3.6 * U, sub: 4.2 * U, min: 7.5 * U, chip: 3.8 * U }
    : SQ ? { ey: 2.2 * U, body: 2.9 * U, sub: 3.3 * U, min: 6.0 * U, chip: 3.0 * U }
      : { ey: 2.3 * U, body: 3.2 * U, sub: 3.6 * U, min: 6.7 * U, chip: 3.2 * U };
  const RSAFE = V ? H * 0.13 : 0; // keep Reel copy above the caption/UI zone

  // Event facts come from the optional SPEC.event block. With NO block, the defaults below (the Oct. 8, 2026 dinner
  // in Manhattan Beach) apply, so every spec written before the block existed renders exactly as delivered. With a
  // block, a fact a scene actually shows (date, time, venue, place, address, included) must be in it: a missing one
  // is a page error (the render fails), never a silent Manhattan Beach fallback. Only the series copy (name,
  // nameLines, hostLine, pill) falls back to these defaults. Unknown keys are an error (typo guard).
  // Values are HTML like every other spec string (e.g. 'Echo &amp; Rig').
  const EVENT_DEFAULTS = {
    weekday: 'Thursday', month: 'Oct.', day: '8', time: '7 p.m.',          // details/cta 'Thursday, Oct. 8 · 7 p.m.'; date card
    venue: 'The Courtyard at Shade Hotel',                                  // details 'Where'
    venueShort: 'The Courtyard at Shade',                                   // date card
    hotel: 'Shade Hotel', city: 'Manhattan Beach',                          // cta place line 'Shade Hotel, Manhattan Beach'
    cityLine: 'Manhattan Beach, California',                                // date card
    address: '1221 N. Valley Drive, Manhattan Beach',                       // details 'Address'
    included: 'Dinner and drinks · Seats limited',                          // details 'Included'
    name: 'Private Dinner & Dialogue',                                      // details/date default eyebrow
    nameLines: ['Private Dinner', '& Dialogue'],                            // cta default title (default: [name])
    hostLine: 'with Josh Stech, co-founder and CEO',                        // cta default sub
    pill: 'Request your seat →',                                            // cta default button
  };
  const SERIES = ['name', 'nameLines', 'hostLine', 'pill'];
  if (S.event != null) {
    if (typeof S.event !== 'object' || Array.isArray(S.event)) throw new Error('SPEC.event must be an object');
    const bad = Object.keys(S.event).filter(k => !(k in EVENT_DEFAULTS));
    if (bad.length) throw new Error(`SPEC.event has unknown key(s): ${bad.join(', ')} (known: ${Object.keys(EVENT_DEFAULTS).join(', ')})`);
  }
  const ev = k => {
    if (!S.event) return EVENT_DEFAULTS[k];
    const v = S.event[k];
    if (v != null && v !== '') return v;
    if (k === 'nameLines' && S.event.name) return [S.event.name];
    if (SERIES.includes(k)) return EVENT_DEFAULTS[k];
    throw new Error(`SPEC.event.${k} is missing, and a scene in this spec shows it`);
  };
  const whenLine = () => `${ev('weekday')}, ${ev('month')} ${ev('day')} · ${ev('time')}`; // 'Thursday, Oct. 8 · 7 p.m.'

  const el = (tag, cls, html, style) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (style) e.style.cssText = style; return e; };
  // a date or a time: any weekday, a month abbreviation with its period (AP: Jan. Feb. Aug. Sept. Oct. Nov. Dec.;
  // also Sep. Mar. Apr. Jun. Jul.), a full month name followed by a day number ('March 3', but not a bare
  // 'Sacramento · September'), or an a.m./p.m. time
  const DATE_RE = /\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b|\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\.|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b|\b[ap]\.m\./;
  const isDate = s => DATE_RE.test(String(s || ''));
  const ARR = '<svg class="arr" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13M11 4.5 16.5 10 11 15.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const pillHTML = s => /→\s*$/.test(s) ? String(s).replace(/\s*→\s*$/, '') + ARR : String(s);
  const FIT = []; // headline boxes auto-fitted to their column once the fonts are loaded

  // mode 'card': ink Merriweather lines, the accent line in a red highlight box.
  // mode 'box' : every line in a white box (ink), the accent line in a red box (white) — for photos/clips.
  const lines = (arr, cls, ts, accent, mode = 'card') => {
    const box = el('div', cls + (mode === 'box' ? ' boxed' : '')); box.style.setProperty('--ts', ts);
    arr.forEach((t, i) => {
      const acc = accent === i || (Array.isArray(accent) && accent.includes(i));
      const l = el('span', 'line' + (acc ? ' acc' : ''));
      l.appendChild(el('span', mode === 'box' ? (acc ? 'bx red' : 'bx') : (acc ? 'hl' : ''), t)); box.appendChild(l);
    });
    FIT.push(box); return box;
  };
  const addBar = (box) => {
    const g = (V ? 3.2 : 3) * U; box.style.position = 'relative'; box.style.paddingLeft = g + 'px'; box._inset = g;
    const b = el('div', 'abar'); b.style.width = (V ? 1.1 : 0.9) * U + 'px'; box.insertBefore(b, box.firstChild); box._bar = b; return b;
  };
  // keep phrases whole when a line must wrap: break only after ', ' or ' — ' (plain-text strings only)
  const phr = s => (typeof s === 'string' && !/</.test(s) && /(,| —) /.test(s)) ? s.split(/(?<=,| —) /).map(x => `<span class="nw">${x}</span>`).join(' ') : s;
  const kicker = (txt, mode) => {
    // blue chip for a date over a photo/clip, or for any line that carries the time; on a white card a bare
    // date is a Lato eyebrow (the brand bar's tag already shows the date as a chip, so no twin chips)
    if (isDate(txt) && (mode === 'box' || /\b[ap]\.m\./.test(txt))) { const c = el('div', 'chip', txt); c.style.fontSize = F.chip + 'px'; return c; }
    const k = el('div', mode === 'box' ? 'kick bx' : 'kick', txt); k.style.fontSize = F.ey + 'px'; return k;
  };
  const revealLines = (box, at, stagger = 0.09, dur = 0.75) => {
    const spans = box.querySelectorAll('.line>span');
    tl.fromTo(spans, { yPercent: 120 }, { yPercent: 0, duration: dur, ease: 'power3.out', stagger }, at);
  };
  const fadeUp = (n, at, d = 0.6, y = 3) => tl.fromTo(n, { opacity: 0, y: y * U }, { opacity: 1, y: 0, duration: d, ease: 'power2.out' }, at);
  const textBlock = (o, opts = {}) => {
    const mode = opts.mode || 'card';
    const wrap = el('div', 'wrap');
    const align = o.align || 'left';
    const maxW = o.maxW || (V || SQ ? W - 2 * pad : W * 0.62);
    wrap.style.cssText = `left:${pad}px;right:${pad}px;${o.top != null ? `top:${o.top}px` : `bottom:${o.bottom != null ? o.bottom : (V ? H * 0.2 : pad * 1.2)}px`};align-items:${align === 'center' ? 'center' : 'flex-start'};text-align:${align};gap:${(mode === 'box' ? 1.5 : 2.2) * U}px;max-width:${maxW}px`;
    if (align === 'center') { wrap.style.left = '0'; wrap.style.right = '0'; wrap.style.margin = '0 auto'; }
    const parts = {};
    if (o.kicker) { parts.k = kicker(o.kicker, mode); wrap.appendChild(parts.k); }
    if (o.title) {
      parts.t = lines(o.title, 'hd', o.ts || (mode === 'box' ? (V ? 9 : SQ ? 7.2 : 7.4) : (V ? 10.5 : SQ ? 8.5 : 8.5)), o.accent, mode);
      parts.t._wrap = wrap; if (o.minPx) parts.t._min = o.minPx;
      if (mode === 'card' && align !== 'center' && o.bar !== false) parts.bar = addBar(parts.t);
      wrap.appendChild(parts.t);
    }
    if (o.rule) { parts.r = el('div', 'rule'); wrap.appendChild(parts.r); }
    if (o.sub) { parts.s = el('div', mode === 'box' ? 'sub bx' : 'sub', o.sub); parts.s.style.fontSize = (mode === 'box' ? Math.max(F.body, F.sub * 0.92) : F.sub) + 'px'; if (mode === 'box' && V) parts.s.style.maxWidth = W * 0.8 + 'px'; wrap.appendChild(parts.s); }
    if (o.body) { parts.b = el('div', 'body', o.body); parts.b.style.fontSize = F.body + 'px'; parts.b.style.maxWidth = (V || SQ ? W - 2 * pad : W * 0.5) + 'px'; wrap.appendChild(parts.b); }
    if (o.pill) { parts.p = el('div', 'pill', pillHTML(o.pill)); wrap.appendChild(parts.p); }
    return { wrap, parts };
  };
  const animateText = (p, t0) => {
    if (p.k) fadeUp(p.k, t0 + 0.05, 0.5, 1.5);
    if (p.bar) tl.fromTo(p.bar, { scaleY: 0 }, { scaleY: 1, duration: 0.7, ease: 'power3.inOut' }, t0 + 0.1);
    if (p.t) revealLines(p.t, t0 + 0.15);
    if (p.r) tl.fromTo(p.r, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'power2.inOut' }, t0 + 0.5);
    if (p.s) fadeUp(p.s, t0 + 0.55);
    if (p.b) fadeUp(p.b, t0 + 0.7);
    if (p.p) tl.fromTo(p.p, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2)' }, t0 + 0.85);
  };
  // vertically centre a block inside [top, H - bottom]
  const centerIn = (wrap, top = 0, bottom = 0) => { wrap.style.top = (top + (H - top - bottom) / 2) + 'px'; wrap.style.bottom = 'auto'; wrap.style.transform = 'translateY(-50%)'; };
  const vcenter = (wrap) => centerIn(wrap, V ? 0 : 0, RSAFE);

  // full-bleed photo with a slow push-in (never darkened)
  const photo = (sc, img, pos, t0, dur, from, to) => {
    const p = el('div', 'ph'); p.style.backgroundImage = `url(${A}${img})`; p.style.backgroundPosition = pos || '50% 50%'; sc.appendChild(p);
    tl.fromTo(p, from || { scale: 1.14 }, Object.assign({ duration: dur + XF, ease: 'none' }, to || { scale: 1.0 }), t0);
    return p;
  };
  // photo as a clean rectangle: side 'right' | 'left' (full height) or 'top' (full-width band)
  const panel = (sc, img, pos, t0, d, side, size) => {
    if (!img) return;
    const css = side === 'top' ? `left:0;right:0;top:0;height:${size}px` : `top:0;bottom:0;${side}:0;width:${size}px`;
    const b = el('div', 'pan', '', css);
    const p = el('div', 'ph'); p.style.backgroundImage = `url(${A}${img})`; p.style.backgroundPosition = pos || '50% 50%'; b.appendChild(p); sc.appendChild(b);
    tl.fromTo(p, { scale: 1.12 }, { scale: 1, duration: d + XF, ease: 'none' }, t0);
    const from = side === 'right' ? 'inset(0 0 0 100%)' : side === 'left' ? 'inset(0 100% 0 0)' : 'inset(0 0 100% 0)';
    tl.fromTo(b, { clipPath: from }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.9, ease: 'power3.inOut' }, t0 + 0.1);
    return b;
  };
  // deck p.11 shapes
  const circle = (sc, cx, cy, D, t0, d) => {
    const c = el('div', 'circle', '', `left:${cx - D / 2}px;top:${cy - D / 2}px;width:${D}px;height:${D}px`); sc.appendChild(c);
    tl.fromTo(c, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.9, ease: 'power3.out' }, t0 + 0.05);
    tl.fromTo(c, { y: 0 }, { y: -2 * U, duration: d + XF, ease: 'none' }, t0);
    return c;
  };
  const dots = (sc, x, y, t0, size = 1.3 * U) => {
    const g = el('div', 'dots', '', `left:${x}px;top:${y}px;--d:${size}px;--g:${size * 1.25}px`);
    for (let i = 0; i < 16; i++) g.appendChild(el('i')); sc.appendChild(g);
    tl.fromTo(g.children, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.35, stagger: 0.025, ease: 'power2.out' }, t0 + 0.3);
    return g;
  };
  // slate circle + 4×4 dot grid: the grid (top-left x, y) is pushed straight away from the circle until every dot
  // clears its edge by ≥ 3U, then drifts with the circle, so the clear space holds for the whole scene (deck p.11)
  const ring = (sc, cx, cy, D, x, y, t0, d, ds) => {
    const R = D / 2, p = 2.25 * ds, want = 3 * U, cs = [];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) cs.push([ds / 2 + i * p, ds / 2 + j * p]);
    const gap = () => Math.min(...cs.map(([a, b]) => Math.hypot(x + a - cx, y + b - cy) - R - ds / 2));
    const mx = x + ds / 2 + 1.5 * p - cx, my = y + ds / 2 + 1.5 * p - cy, m = Math.hypot(mx, my);
    for (let k = 0; k < 400 && gap() < want; k++) { x += mx / m; y += my / m; }
    const c = circle(sc, cx, cy, D, t0, d), g = dots(sc, x, y, t0, ds);
    tl.fromTo(g, { y: 0 }, { y: -2 * U, duration: d + XF, ease: 'none' }, t0);
    return [c, g];
  };
  const corner = (sc, x, y, s, t0, d) => {
    const c = el('div', 'corner', '', `left:${x}px;top:${y}px;width:${s}px;height:${s}px`); sc.appendChild(c);
    tl.fromTo(c, { opacity: 0, y: 4 * U }, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }, t0 + 0.1);
    tl.fromTo(c, { x: 0 }, { x: -1.5 * U, duration: d + XF, ease: 'none' }, t0);
    return c;
  };
  // the Courtyard's string lights, drawn flat in the palette: slate wire, blue bulbs
  const bulbs = (sc, t0, top, n, sag = (V ? 5 : 4) * U) => {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', W); svg.setAttribute('height', top + sag + 3 * U);
    svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible';
    const y0 = top - 0.1317 * sag, y1 = top + 2.1317 * sag; // parabola through the bulbs, extended to both edges
    const wire = document.createElementNS(NS, 'path'); wire.setAttribute('d', `M0,${y0} Q${W / 2},${y1} ${W},${y0}`);
    wire.setAttribute('fill', 'none'); wire.setAttribute('stroke', '#C9D2E0'); wire.setAttribute('stroke-width', (V ? 0.34 : 0.28) * U); svg.appendChild(wire);
    const bs = [];
    for (let i = 0; i < n; i++) {
      const x = W * (0.03 + i * 0.94 / (n - 1)); const t = (i / (n - 1)) * 2 - 1; const y = top + sag * (1 - t * t);
      const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', x); c.setAttribute('cy', y + (V ? 0.95 : 0.75) * U); c.setAttribute('r', (V ? 0.8 : 0.62) * U); c.setAttribute('fill', '#1C51A0');
      svg.appendChild(c); bs.push(c);
    }
    sc.appendChild(svg);
    tl.fromTo(wire, { opacity: 0 }, { opacity: 1, duration: 0.5 }, t0);
    tl.fromTo(bs, { opacity: 0 }, { opacity: 1, duration: 0.25, stagger: 0.04, ease: 'power1.out' }, t0 + 0.15);
    return svg;
  };
  // two quiet compositions for title cards, alternated so consecutive cards differ
  const accents = (sc, t0, d, variant) => {
    if (variant % 2 === 0) {
      const D = V ? W * 0.7 : SQ ? W * 0.5 : H * 0.64;
      // landscape cy 0.445H: the circle's top stays ≥ 2U below the brand-bar chip/tag after its 2U rise
      const cx = V ? W * 0.92 : SQ ? W * 0.88 : W * 0.86, cy = V ? H * 0.8 : SQ ? H * 0.3 : H * 0.445;
      return ring(sc, cx, cy, D, cx - D * (V ? 0.66 : 0.62), cy + D * (V ? -0.3 : 0.2), t0, d, (V ? 1.5 : 1.3) * U);
    } else {
      const s = V ? W * 0.36 : SQ ? W * 0.28 : H * 0.34;
      const x = W - s * 0.8, y = V ? H * 0.74 : H - s * 0.86;
      // dot grid sits clear of the block (grid width 4 dots + 3 gaps = 7.75 × dot) and drifts with it
      const ds = (V ? 1.5 : 1.3) * U, g = dots(sc, x - 7.75 * ds - 3 * U, y - (V ? 1 : 2) * U, t0, ds);
      tl.fromTo(g, { x: 0 }, { x: -1.5 * U, duration: d + XF, ease: 'none' }, t0);
      return [corner(sc, x, y, s, t0, d), g];
    }
  };
  const label = (sc, txt, t0) => {
    const l = el('div', 'label', txt); l.style.fontSize = (V ? 4 : SQ ? 3.6 : 3.4) * U + 'px';
    l.style.left = pad + 'px'; l.style.top = (V ? 9 * U + TAB + 6 * U : TAB + 6 * U) + 'px'; sc.appendChild(l); // room under the wordmark tab
    tl.fromTo(l, { opacity: 0, rotate: 0, x: -2 * U }, { opacity: 1, rotate: -4, x: 0, duration: 0.6, ease: 'back.out(1.6)' }, t0 + 0.2);
  };
  // brand-bar wordmark size (BRAND-SPEC §4: Reel and landscape ≈ 200–240 px wide, 1080 square ≈ 150–200 px)
  const WMW = (V ? 20 : SQ ? 17 : 20) * U, WMH = WMW * 45 / 159, CS = Math.round(WMH * 0.45), TAB = WMH + 2 * CS;

  const CLIPS = [];
  let SCI = 0; // scene index (for alternating compositions)
  const T = {
    clip(sc, o, t0, d) {
      // AI B-roll: pre-extracted 30fps JPEG frames under /cache/clips/<name>/f_0001.jpg
      const im = el('img', '', null, 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:' + (o.pos || '50% 50%'));
      sc.appendChild(im);
      CLIPS.push({ im, name: o.clip, n: o.frames || 150, t0, span: d + XF, last: -1, from: o.fromFrame || 0 });
      if (o.title || o.kicker) { const { wrap, parts } = textBlock(o, { mode: 'box' }); sc.appendChild(wrap); animateText(parts, t0); }
      if (o.label) label(sc, o.label, t0);
    },
    photo(sc, o, t0, d) {
      photo(sc, o.img, o.pos, t0, d, o.from, o.to);
      if (o.title || o.kicker) { const { wrap, parts } = textBlock(o, { mode: 'box' }); sc.appendChild(wrap); animateText(parts, t0); }
      if (o.label) label(sc, o.label, t0);
    },
    title(sc, o, t0, d) {
      const ts = o.ts || (V ? 9.5 : SQ ? 8.5 : (o.center ? 9.4 : 8.6));
      if (o.bulbs) bulbs(sc, t0, V ? 9 * U + TAB + 5 * U : TAB + 5 * U, V ? 9 : 13);
      const shapes = (!o.bulbs || V) ? accents(sc, t0, d, SCI) : [];
      // vertically centred on Reels, and wherever no shape anchors the lower corner (a bottom-anchored block
      // under the string lights left an empty band)
      const mid = o.center || (o.center !== false && (V || !shapes.length));
      const { wrap, parts } = textBlock(Object.assign({ align: o.align || 'left' }, o, { ts }, mid ? { top: null, bottom: null } : {}));
      if (mid) centerIn(wrap, V ? 0 : TAB, RSAFE * 0.6); // landscape/square: centred in the space under the brand bar
      wrap.style.transformOrigin = '0% 50%';
      if (parts.t && !V && !SQ) parts.t._wide = { wrap, shapes, maxW: W - 2 * pad, recenter: !mid }; // long lines: use the full width before wrapping
      sc.appendChild(wrap); animateText(parts, t0);
      tl.fromTo(wrap, { scale: 1 }, { scale: 1.03, duration: d + XF, ease: 'none' }, t0);
    },
    josh(sc, o, t0, d) {
      const img = el('img'); img.src = A + 'josh-polo-cutout.png';
      let tb;
      if (V) {
        const base = H * 0.6, ih = H * 0.44;
        const D = W * 0.66; circle(sc, W * 0.62, base - ih * 0.5, D, t0, d); dots(sc, pad, base - ih * 0.9, t0, 1.4 * U);
        img.style.cssText = `position:absolute;height:${ih}px;right:${2 * U}px;top:${base - ih}px`; sc.appendChild(img);
        sc.appendChild(el('div', '', '', `position:absolute;left:0;right:0;top:${base}px;bottom:0;background:var(--mist)`));
        tb = { top: base + 6 * U, maxW: W - 2 * pad, ts: 11 };
      } else {
        const ih = SQ ? H * 0.8 : H * 0.9, iw = ih * 430 / 570, right = SQ ? 1 * U : W * 0.06;
        // landscape cy: the circle clears the brand-bar chip by ≥ 2U after its rise; dots clear the circle (ring)
        const D = SQ ? H * 0.6 : H * 0.7; const cx = W - right - iw * 0.52, cy = H - ih * (SQ ? 0.62 : 0.59);
        ring(sc, cx, cy, D, cx - D * 0.5 - 6 * U, cy - D * 0.42, t0, d, 1.3 * U);
        img.style.cssText = `position:absolute;height:${ih}px;right:${right}px;bottom:0`; sc.appendChild(img);
        tb = { maxW: SQ ? W * 0.37 : W * 0.46, ts: SQ ? 10 : 11 };
      }
      tl.fromTo(img, { opacity: 0, x: 6 * U }, { opacity: 1, x: 0, duration: 0.9, ease: 'power3.out' }, t0 + 0.1);
      tl.fromTo(img, { scale: 1 }, { scale: 1.04, duration: d + XF, ease: 'none', transformOrigin: '50% 100%' }, t0);
      const { wrap, parts } = textBlock(Object.assign({ kicker: o.kicker || 'Your host', title: o.title || ['Josh', 'Stech'], sub: phr(o.sub || 'Co-founder and CEO, Sundae') }, tb));
      if (!V) centerIn(wrap, TAB, 0);
      sc.appendChild(wrap); animateText(parts, t0);
      if (o.facts) {
        const f = el('div', '', '', `display:flex;flex-direction:column;gap:${1.4 * U}px;margin-top:${1.2 * U}px`);
        o.facts.forEach(x => { const r = el('div', 'body', `<span class="dot" style="width:${1.1 * U}px;height:${1.1 * U}px;margin-top:${0.62 * F.body}px"></span><span>${x}</span>`, `display:flex;gap:${1.4 * U}px;align-items:flex-start;font-size:${F.body}px;line-height:1.4`); f.appendChild(r); });
        wrap.appendChild(f); tl.fromTo(f.children, { opacity: 0, x: -2 * U }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.2, ease: 'power2.out' }, t0 + 1.0);
      }
    },
    list(sc, o, t0, d) {
      let right = pad, top0 = 0;
      const ph = o.img || o.side;
      if (ph && V && o.img) { top0 = H * 0.27; panel(sc, o.img, o.pos, t0, d, 'top', top0); }
      else if (ph && !V) { const pw = W * (SQ ? 0.38 : 0.36); panel(sc, ph, o.side ? o.sidePos : o.pos, t0, d, 'right', pw); right = pw + 5 * U; }
      const { wrap, parts } = textBlock({ kicker: o.kicker, title: o.title, ts: o.ts || (V ? 9.6 : SQ ? 7.4 : 7.4), maxW: W - pad - right });
      wrap.style.right = right + 'px';
      centerIn(wrap, top0 ? top0 + 2 * U : TAB, RSAFE);
      sc.appendChild(wrap); animateText(parts, t0);
      const ul = el('div', '', '', `display:flex;flex-direction:column;gap:${(V ? 3 : 2.4) * U}px;margin-top:${2 * U}px`);
      o.items.forEach(it => { const r = el('div', 'check', `<i></i><div><div class="hd" style="--ts:${V ? 5.8 : SQ ? 4.4 : 4.3};line-height:1.2">${it[0]}</div>${it[1] ? `<div class="body" style="margin-top:${0.4 * U}px;font-size:${F.body}px;line-height:1.35">${it[1]}</div>` : ''}</div>`); ul.appendChild(r); });
      wrap.appendChild(ul);
      const step = Math.min(0.55, (d - 1.6) / o.items.length);
      tl.fromTo(ul.children, { opacity: 0, x: -3 * U }, { opacity: 1, x: 0, duration: 0.55, stagger: step, ease: 'power3.out' }, t0 + 0.8);
    },
    stats(sc, o, t0, d) {
      sc.classList.add('mist');
      if (o.bulbs) bulbs(sc, t0, V ? 9 * U + TAB + 5 * U : TAB + 4 * U, V ? 9 : 13);
      const { wrap, parts } = textBlock({ kicker: o.kicker, title: o.title, ts: V ? 8 : 6.8, maxW: W - 2 * pad });
      centerIn(wrap, TAB, RSAFE);
      sc.appendChild(wrap); animateText(parts, t0);
      const n = o.items.length; const anyPre = o.items.some(it => it.pre);
      const grid = el('div', '', '', `display:grid;grid-template-columns:${V ? '1fr' : `repeat(${n},1fr)`};gap:${(V ? 5 : 5) * U}px;margin-top:${(V ? 5 : 4) * U}px;width:100%`);
      o.items.forEach(it => {
        const unit = it.unit ? `<span class="unit">${it.unit}</span>` : '';
        const pre = anyPre ? `<div class="body" style="font-size:${F.body}px;font-weight:700;margin-bottom:${0.8 * U}px;line-height:1.3">${it.pre || '&nbsp;'}</div>` : '';
        const c = el('div', '', `${pre}<div class="num" style="font-size:${(V ? 13 : n > 2 ? 10.5 : 12.5) * U}px"><span class="cnt">${it.value}</span>${unit}</div><div class="rule" style="margin:${2 * U}px 0 ${1.8 * U}px"></div><div class="body" style="font-size:${F.body}px;line-height:1.4;max-width:${V ? 999 : (n > 2 ? 48 : 64) * U}px">${it.label}</div>`);
        grid.appendChild(c);
        // count-ups for totals only; an average ('An average of 22+') shows its final value from the first frame
        if (it.num != null && !it.pre) {
          const span = c.querySelector('.cnt'); const obj = { v: 0 };
          tl.fromTo(obj, { v: 0 }, { v: it.num, duration: 1.4, ease: 'power2.out', onUpdate: () => { span.textContent = (it.prefix || '') + Math.round(obj.v).toLocaleString('en-US') + (it.suffix || ''); } }, t0 + 0.6);
        }
      });
      wrap.appendChild(grid);
      tl.fromTo(grid.children, { opacity: 0, y: 3 * U }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.18, ease: 'power3.out' }, t0 + 0.5);
      tl.fromTo(grid.querySelectorAll('.rule'), { scaleX: 0 }, { scaleX: 1, duration: 0.6, stagger: 0.18, ease: 'power2.inOut' }, t0 + 0.8);
    },
    pillars(sc, o, t0, d) {
      sc.classList.add('mist');
      const { wrap, parts } = textBlock({ kicker: o.kicker, title: o.title, ts: V ? 9.6 : 6.8, maxW: W - 2 * pad });
      centerIn(wrap, TAB, RSAFE);
      sc.appendChild(wrap); animateText(parts, t0);
      const grid = el('div', '', '', `display:grid;grid-template-columns:${V ? '1fr' : 'repeat(3,1fr)'};gap:${(V ? 2.4 : 2.6) * U}px;margin-top:${(V ? 4 : 3.6) * U}px;width:100%`);
      // three columns: one comma phrase per line, so every card keeps the same three-line rhythm
      const bodyOf = s => (!V && typeof s === 'string' && !/</.test(s)) ? s.split(/(?<=,) /).map(x => `<span class="nw">${x}</span>`).join('<br>') : phr(s);
      o.items.forEach((it, i) => grid.appendChild(el('div', 'card', `<div class="kick" style="font-size:${F.ey * 1.1}px;font-weight:900;color:var(--blue)">0${i + 1}</div><div class="hd" style="--ts:${V ? 6 : 4.1};line-height:1.2;margin:${1.2 * U}px 0 ${1 * U}px">${it[0]}</div><div class="body" style="font-size:${F.body}px;line-height:1.45">${bodyOf(it[1])}</div>`)));
      wrap.appendChild(grid);
      tl.fromTo(grid.children, { opacity: 0, y: 5 * U }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.35, ease: 'power3.out' }, t0 + 0.7);
    },
    bring(sc, o, t0, d) {
      sc.classList.add('mist');
      const title = o.title || ['You know your market.'];
      // default eyebrow 'Better together', unless the headline already says it (never print the same words twice)
      const dupe = /^better together[.!]?$/i.test(title.join(' ').trim());
      const { wrap, parts } = textBlock({ kicker: o.kicker != null ? o.kicker : (dupe ? null : 'Better together'), title, ts: V ? 9.6 : 6.8, maxW: W - 2 * pad });
      centerIn(wrap, TAB, RSAFE);
      sc.appendChild(wrap); animateText(parts, t0);
      const grid = el('div', '', '', `display:grid;grid-template-columns:${V ? '1fr' : '1fr 1fr'};gap:${2.6 * U}px;margin-top:${(V ? 3.6 : 3.6) * U}px;width:100%`);
      const col = (h, items, cls) => el('div', 'card' + cls, `<div class="kick" style="font-size:${F.ey}px">${h}</div><div style="display:flex;flex-direction:column;gap:${1.1 * U}px;margin-top:${1.8 * U}px">${items.map(x => `<div class="hd" style="--ts:${V ? 5.2 : 4.4};line-height:1.2">${x}</div>`).join('')}</div>`);
      grid.appendChild(col('You bring', ['Local expertise', 'Relationships', 'Leadership', 'Execution'], ''));
      grid.appendChild(col('Sundae brings', ['Marketing', 'Technology', 'Automation', 'Capital', 'Buyer reach'], ' blue'));
      wrap.appendChild(grid);
      grid.querySelectorAll('.card').forEach((c, i) => { tl.fromTo(c, { opacity: 0, y: 4 * U }, { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, t0 + 0.6 + i * 0.9); tl.fromTo(c.querySelectorAll('.hd'), { opacity: 0, x: -2 * U }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.15 }, t0 + 0.9 + i * 0.9); });
    },
    details(sc, o, t0, d) {
      let right = pad, top0 = 0;
      if (o.img) { if (V) { top0 = H * 0.27; panel(sc, o.img, o.pos, t0, d, 'top', top0); } else { const pw = W * 0.33; panel(sc, o.img, o.pos, t0, d, 'right', pw); right = pw + 5 * U; } }
      const { wrap, parts } = textBlock({ kicker: o.kicker || ev('name'), title: o.title || ['Save the date'], ts: V ? 10 : 7.4, maxW: W - pad - right });
      wrap.style.right = right + 'px';
      centerIn(wrap, top0 ? top0 + 2 * U : TAB, RSAFE);
      sc.appendChild(wrap); animateText(parts, t0);
      const rows = o.rows || [['When', whenLine()], ['Where', ev('venue')], ['Address', ev('address')], ['Included', ev('included')]];
      const box = el('div', 'rows', '', `margin-top:${2.4 * U}px`);
      rows.forEach(r => box.appendChild(el('div', '', `<div class="kick" style="font-size:${F.ey}px;min-width:${V ? 0 : 15 * U}px;flex:0 0 auto">${r[0]}</div><div class="hd" style="--ts:${V ? 5 : 3.9};line-height:1.25">${r[1]}</div>`, `display:flex;${V ? 'flex-direction:column;gap:' + 0.8 * U + 'px' : 'align-items:baseline;gap:' + 2.6 * U + 'px'};padding:${(V ? 2 : 1.7) * U}px 0`)));
      wrap.appendChild(box);
      tl.fromTo(box.children, { opacity: 0, y: 2 * U }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.22, ease: 'power2.out' }, t0 + 0.7);
    },
    quote(sc, o, t0, d) {
      let left = pad, top0 = 0;
      if (o.img) { if (V) { top0 = H * 0.4; panel(sc, o.img, o.pos, t0, d, 'top', top0); } else { const pw = W * (SQ ? 0.4 : 0.4); panel(sc, o.img, o.pos, t0, d, 'left', pw); left = pw + 6 * U; } }
      const { wrap, parts } = textBlock({ title: o.title, ts: V ? 11 : SQ ? 8 : 8.4, sub: o.sub, maxW: W - left - pad });
      wrap.style.left = left + 'px';
      centerIn(wrap, top0 ? top0 + 2 * U : TAB, RSAFE);
      if (parts.s) { parts.s.className = 'it'; parts.s.style.fontSize = (V ? 6.4 : SQ ? 5 : 5.2) * U + 'px'; }
      const q = el('div', '', `<svg viewBox="0 0 64 44" width="${(V ? 10 : 8) * U}" height="${(V ? 6.9 : 5.5) * U}" aria-hidden="true"><path fill="#1C51A0" d="M0 31C0 17 8 6 22 0l3 5c-8 4-12 9-12 14a12 12 0 1 1-13 12zM35 31c0-14 8-25 22-31l3 5c-8 4-12 9-12 14a12 12 0 1 1-13 12z"/></svg>`, `line-height:0;margin-bottom:${0.5 * U}px`);
      wrap.insertBefore(q, wrap.firstChild);
      sc.appendChild(wrap); fadeUp(q, t0, 0.6, 2); animateText(parts, t0 + 0.2);
    },
    date(sc, o, t0, d) {
      let top0 = 0, right = pad;
      if (o.img) { if (V || SQ) { top0 = H * (V ? 0.4 : 0.38); panel(sc, o.img, o.pos, t0, d, 'top', top0); } else { const pw = W * 0.4; panel(sc, o.img, o.pos, t0, d, 'right', pw); right = pw + 5 * U; } }
      const box = el('div', 'wrap', '', `left:${pad}px;right:${right}px;align-items:flex-start;gap:${(V ? 3.4 : 2.6) * U}px`);
      const k = kicker(o.kicker || ev('name'), 'card'); box.appendChild(k);
      const tile = (V ? 1.35 : 1) * U;
      const card = el('div', 'dcard', `<div style="background:var(--red);border-radius:0 ${4 * tile}px 0 0;padding:${2.2 * tile}px ${3.4 * tile}px ${2.4 * tile}px;color:#fff;text-align:center;flex:0 0 auto"><div style="font-family:var(--sans);font-weight:900;font-size:${4.2 * tile}px;line-height:1">${ev('month')}</div><div style="font-family:var(--serif);font-weight:900;font-size:${12.5 * tile}px;line-height:1;margin-top:${0.6 * tile}px">${ev('day')}</div></div><div style="display:flex;flex-direction:column;justify-content:center;gap:${1.1 * tile}px"><div class="hd" style="font-size:${(V ? 6.2 : 5.4) * U}px;line-height:1.15">${ev('weekday')} · ${ev('time')}</div><div class="sub" style="font-size:${F.sub}px;font-weight:700">${ev('venueShort')}</div><div class="body" style="font-size:${F.body}px;line-height:1.3">${ev('cityLine')}</div></div>`, `display:flex;align-items:center;gap:${3.4 * tile}px`);
      box.appendChild(card);
      const t = lines(o.title || ['Seats are limited'], 'hd', V ? 11 : SQ ? 7.6 : 8, o.accent); t._wrap = box; addBar(t); box.appendChild(t);
      let s; if (o.sub) { s = el('div', 'body', o.sub); s.style.fontSize = F.body + 'px'; s.style.marginTop = -0.6 * U + 'px'; box.appendChild(s); }
      sc.appendChild(box); centerIn(box, top0 ? top0 + 1 * U : TAB, top0 ? RSAFE + (V ? 0 : 2 * U) : RSAFE);
      fadeUp(k, t0, 0.5, 1.5);
      tl.fromTo(card, { opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.9, ease: 'back.out(1.6)', transformOrigin: '0% 50%' }, t0 + 0.2);
      tl.fromTo(t._bar, { scaleY: 0 }, { scaleY: 1, duration: 0.7, ease: 'power3.inOut' }, t0 + 0.7);
      revealLines(t, t0 + 0.8);
      if (s) fadeUp(s, t0 + 1.2);
    },
    reason(sc, o, t0, d) {
      if (o.img) photo(sc, o.img, o.pos, t0, d);
      const n = el('div', 'label', o.n, `left:${pad}px;top:${V ? 9 * U + TAB + 4 * U : TAB + 4 * U}px;font-size:${(V ? 11 : 9) * U}px;padding:.08em .32em .12em;font-family:var(--serif);font-weight:900`);
      sc.appendChild(n); tl.fromTo(n, { opacity: 0, y: 4 * U, rotate: 0 }, { opacity: 1, y: 0, rotate: -4, duration: 0.7, ease: 'power3.out' }, t0);
      const { wrap, parts } = textBlock({ title: o.title, sub: o.sub, ts: V ? 9 : 7.4, accent: o.accent }, { mode: 'box' });
      sc.appendChild(wrap); animateText(parts, t0 + 0.2);
    },
    cta(sc, o, t0, d) {
      if (o.img) photo(sc, o.img, o.pos, t0, d);
      bulbs(sc, t0, V ? 8 * U : SQ ? 6 * U : 5 * U, V ? 9 : SQ ? 11 : 15);
      if (V) { const D = W * 0.62; circle(sc, W * 0.94, H * 0.86, D, t0, d); dots(sc, W * 0.94 - D * 0.72, H * 0.86 - D * 0.36, t0, 1.5 * U); }
      const box = el('div', '', '', `position:absolute;left:${pad}px;right:${pad}px;top:${V ? '45%' : '53%'};transform:translateY(-50%);display:flex;flex-direction:column;align-items:center;text-align:center;gap:${2.4 * U}px${o.img ? `;background:var(--white);padding:${5 * U}px ${4 * U}px;border-radius:${1.2 * U}px` : ''}`);
      const logo = el('img', 'logo'); logo.src = A + 'sundae-wordmark-red.svg'; logo.style.width = (V ? 22 : SQ ? 18 : 21) * U + 'px'; logo.style.marginBottom = 1.6 * U + 'px'; box.appendChild(logo);
      const t = lines(o.title || ev('nameLines'), 'hd', V ? 11 : SQ ? 9 : 10, o.accent); t._wrap = box; box.appendChild(t);
      const s = el('div', 'sub', phr(o.sub || ev('hostLine'))); s.style.fontSize = F.sub * 1.08 + 'px'; s.style.maxWidth = (V ? W - 2 * pad : W * 0.62) + 'px'; box.appendChild(s);
      // when: a date/time goes in a blue chip; the place line sits beside (landscape) or under (Reel) it
      const whenTxt = o.when || `${whenLine()}<br>${ev('hotel')}${V ? ' · ' : ', '}${ev('city')}`;
      const [w1, ...wr] = whenTxt.split(/<br\s*\/?>/);
      const dt = el('div', '', '', `display:flex;${V || SQ ? 'flex-direction:column;gap:' + 1.4 * U + 'px' : 'gap:' + 2.4 * U + 'px'};align-items:center;justify-content:center`);
      const first = isDate(w1) ? el('div', 'chip', w1) : el('div', 'sub', w1, 'font-weight:700'); first.style.fontSize = (isDate(w1) ? F.chip * 1.12 : F.sub * 1.08) + 'px'; dt.appendChild(first);
      if (wr.length) { const pl = el('div', 'sub', wr.join('<br>'), 'font-weight:700'); pl.style.fontSize = F.sub * 1.08 + 'px'; dt.appendChild(pl); }
      box.appendChild(dt);
      const p = el('div', 'pill', pillHTML(o.pill || ev('pill'))); p.style.marginTop = 1.4 * U + 'px'; p.style.fontSize = (V ? 4.4 : SQ ? 3.5 : 3.7) * U + 'px'; p.style.padding = `${(V ? 2.4 : 2) * U}px ${(V ? 4.8 : 4.2) * U}px`; box.appendChild(p);
      if (o.foot) { const f = el('div', 'body', o.foot); f.style.fontSize = F.body + 'px'; box.appendChild(f); }
      sc.appendChild(box);
      tl.fromTo(logo, { opacity: 0, y: -2 * U }, { opacity: 1, y: 0, duration: 0.6 }, t0);
      revealLines(t, t0 + 0.25); fadeUp(s, t0 + 0.6); fadeUp(dt, t0 + 0.8);
      tl.fromTo(p, { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.6, ease: 'back.out(2)' }, t0 + 1.0);
      tl.to(p, { scale: 1.04, duration: 0.5, yoyo: true, repeat: Math.max(1, Math.floor((d - 2) / 0.5)), ease: 'sine.inOut' }, t0 + 1.7);
    },
    collage(sc, o, t0, d) {
      o.imgs.forEach((img, i) => {
        const c = el('div', '', '', `position:absolute;border-radius:${1.2 * U}px;overflow:hidden;box-shadow:0 ${1.2 * U}px ${4 * U}px rgba(74,74,74,.18);background:url(${A}${img}) center/cover`);
        if (V) { c.style.left = (8 + i * 6) * U + 'px'; c.style.right = (8 - i * 2) * U + 'px'; c.style.top = H * (0.1 + i * 0.17) + 'px'; c.style.height = H * 0.26 + 'px'; }
        else { const w = W * 0.3; c.style.width = w + 'px'; c.style.height = H * 0.56 + 'px'; c.style.left = pad + i * (w + 2 * U) + 'px'; c.style.top = TAB + 2 * U + 'px'; }
        sc.appendChild(c);
        tl.fromTo(c, { opacity: 0, y: 6 * U, rotate: (i - 1) * 2 }, { opacity: 1, y: 0, rotate: 0, duration: 0.8, ease: 'power3.out' }, t0 + 0.2 + i * 0.3);
      });
      const { wrap, parts } = textBlock({ kicker: o.kicker, title: o.title, ts: V ? 9 : 7, bottom: V ? 8 * U : 6 * U, maxW: W - 2 * pad });
      sc.appendChild(wrap); animateText(parts, t0 + 0.9);
    },
  };

  let t = 0; const STARTS = [];
  const spaced = e => { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT), o = []; while (w.nextNode()) o.push(w.currentNode.nodeValue); return o.join(' '); }; // 'Oct.' + '8' → 'Oct. 8'
  S.scenes.forEach((o, i) => {
    const sc = el('div', 'scene'); stage.appendChild(sc);
    const d = o.dur; SCI = i;
    T[o.type](sc, o, t, d);
    STARTS.push({ t, mist: sc.classList.contains('mist'), kt: [...sc.querySelectorAll('.kick, .chip, .dcard')].map(spaced).join(' ') });
    tl.fromTo(sc, { opacity: 0 }, { opacity: 1, duration: i === 0 ? 0.35 : XF, ease: 'power1.inOut' }, t);
    if (i < S.scenes.length - 1) tl.to(sc, { opacity: 0, duration: XF, ease: 'power1.inOut' }, t + d);
    t += d;
  });
  // brand bar: red wordmark on a white tab (clear space ≥ 0.45 × its height), tag chip on the right
  if (!S.noBrand) {
    const bb = el('div', 'brandbar'); bb.style.cssText += `left:${pad}px;right:${pad}px;top:${V ? 9 * U : 0}px`;
    const tab = el('div', 'wm-tab'); tab.style.padding = `${CS}px ${CS}px`;
    const lg = el('img', 'logo'); lg.src = A + 'sundae-wordmark-red.svg'; lg.style.width = WMW + 'px'; lg.style.height = WMH + 'px'; tab.appendChild(lg); bb.appendChild(tab);
    // the tab is the scene colour on mist scenes (red wordmark straight on mist), white everywhere else (photos)
    const tabBg = m => (m ? '#F4F7F9' : '#FFFFFF'); let prevM = STARTS[0].mist; tab.style.backgroundColor = tabBg(prevM);
    STARTS.forEach((s, i) => { if (i && s.mist !== prevM) { tl.fromTo(tab, { backgroundColor: tabBg(prevM) }, { backgroundColor: tabBg(s.mist), duration: XF, ease: 'power1.inOut', immediateRender: false }, s.t); prevM = s.mist; } });
    if (S.tag) {
      const tg = el('div', isDate(S.tag) ? 'chip' : 'tag', S.tag); tg.style.fontSize = (isDate(S.tag) ? 2.7 : 2.2) * U + 'px'; bb.appendChild(tg);
      // the tag/chip steps out while a scene's eyebrow, chip or date card already carries all of its words
      // (e.g. eyebrow 'SUNDAE MEMBERSHIP', 'Oct. 8 · Manhattan Beach'): never the same words twice on one frame
      const wds = x => String(x).toLowerCase().replace(/<[^>]*>/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
      const tagW = wds(S.tag), dup = s => { const k = new Set(wds(s.kt)); return tagW.every(w => k.has(w)); };
      let prevH = dup(STARTS[0]); if (prevH) tg.style.opacity = '0';
      STARTS.forEach((s, i) => { const h = dup(s); if (i && h !== prevH) { tl.fromTo(tg, { opacity: h ? 1 : 0 }, { opacity: h ? 0 : 1, duration: XF, ease: 'power1.inOut', immediateRender: false }, s.t); prevH = h; } });
    }
    stage.appendChild(bb);
    // hide brand bar on the CTA (which carries its own logo)
    const last = S.scenes[S.scenes.length - 1];
    if (last.type === 'cta') tl.to(bb, { opacity: 0, duration: 0.4 }, t - last.dur);
  }
  // typographic apostrophes in visible copy (text nodes only; spec strings stay as written)
  { const tw = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT); while (tw.nextNode()) { const n = tw.currentNode; if (n.nodeValue.includes("'")) n.nodeValue = n.nodeValue.replace(/(\w)'(\w)/g, '$1\u2019$2'); } }
  // progress bar for Reels
  if (V && S.progress !== false) { const pb = el('div', '', '', `position:absolute;left:0;bottom:0;height:${0.5 * U}px;background:var(--red);z-index:60;width:100%;transform-origin:left;transform:scaleX(0)`); stage.appendChild(pb); tl.fromTo(pb, { scaleX: 0 }, { scaleX: 1, duration: t, ease: 'none' }, 0); }
  window.TOTAL = t;
  window.seekTo = async (x) => {
    tl.seek(x, false);
    const waits = [];
    for (const c of CLIPS) {
      if (x < c.t0 - XF - 0.05 || x > c.t0 + c.span + 0.05) continue;
      const usable = c.n - c.from;
      const f = c.from + Math.max(0, Math.min(usable - 1, Math.floor(((x - c.t0 + XF) / (c.span + XF)) * usable)));
      if (f !== c.last) { c.last = f; c.im.src = CLIPDIR + c.name + '/f_' + String(f + 1).padStart(4, '0') + '.jpg'; waits.push(c.im.decode().catch(() => {})); }
    }
    await Promise.all(waits);
  };
  // fit every headline to its column (never below the format's minimum; wrap only if it still cannot fit)
  const fitAll = () => FIT.forEach(box => {
    const host = box._wrap || box.parentElement; if (!host) return;
    const hcs = getComputedStyle(host);
    let avail = host.clientWidth - parseFloat(hcs.paddingLeft) - parseFloat(hcs.paddingRight) - (box._inset || 0);
    const spans = [...box.querySelectorAll('.line>span')];
    const widest = () => Math.max(...spans.map(s => s.offsetWidth));
    let fs = parseFloat(getComputedStyle(box).fontSize); const min = box._min || F.min;
    const shrink = (av) => { for (let k = 0; k < 6 && widest() > av + 0.5 && fs > min; k++) { fs = Math.max(min, fs * av / widest() * 0.99); box.style.fontSize = fs + 'px'; } };
    shrink(avail);
    if (widest() > avail + 0.5 && box._wide) {
      const wd = box._wide; wd.wrap.style.maxWidth = wd.maxW + 'px'; wd.shapes.forEach(x => { x.style.display = 'none'; });
      avail = wd.wrap.clientWidth - (box._inset || 0); shrink(avail);
      // the shapes are gone, so centre the block vertically like the other shape-free cards (top in px; GSAP only scales it)
      if (wd.recenter) { wd.wrap.style.bottom = 'auto'; wd.wrap.style.top = Math.round(TAB + (H - TAB - wd.wrap.offsetHeight) / 2) + 'px'; }
    }
    if (widest() > avail + 0.5) box.classList.add('wrapok');
  });
  const fontsP = Promise.all(['400 40px Merriweather', '700 40px Merriweather', '900 40px Merriweather', 'italic 400 40px Merriweather', '400 40px Lato', '700 40px Lato', '900 40px Lato'].map(f => document.fonts.load(f))).catch(() => {});
  window.READY = Promise.all([fontsP, document.fonts.ready, ...Array.from(document.images).map(im => im.decode().catch(() => {})), ...Array.from(document.querySelectorAll('.ph')).map(p => new Promise(r => { const i = new Image(); i.onload = r; i.onerror = r; i.src = p.style.backgroundImage.slice(5, -2); }))]).then(() => { fitAll(); tl.seek(0); });
  tl.seek(0);
})();
