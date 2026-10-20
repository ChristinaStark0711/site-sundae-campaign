"use client";
import { useEffect, useMemo, useRef, useState } from "react";

import { SERIES } from "@/content/palette";
export { SERIES };

export type Series = { name: string; color: string; values: number[]; dash?: string };

const INK = "#4a4a4a", GRID = "#e6e6e6", BASELINE = "#c9d2e0";
const FS = 16; // chart text renders at true CSS pixels (the viewBox tracks the measured width)

const money = (v: number) => "$" + Math.round(v).toLocaleString("en-US");
const FORMATS = {
  number: { short: (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 }), full: (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 }) },
  // one case for both units ("$764K", "$1.9M"); whole millions drop the ".0" on axis ticks ("$2M")
  moneyShort: { short: (v: number) => (v >= 1e6 ? "$" + +(v / 1e6).toFixed(1) + "M" : v === 0 ? "$0" : "$" + Math.round(v / 1000) + "K"), full: money },
};
type Fmt = keyof typeof FORMATS;

// AP style: a month without a specific date is spelled out and never abbreviated ("October 2026").
// Axis ticks show the month name; the first and last ticks carry the year.
const FULL: Record<string, string> = { Jan: "January", Feb: "February", Mar: "March", Apr: "April", May: "May", Jun: "June", Jul: "July", Aug: "August", Sep: "September", Oct: "October", Nov: "November", Dec: "December" };
export const monthFull = (l: string) => { const [m, y] = l.split(" "); return FULL[m] ? `${FULL[m]} ${y}` : l; };
const textW = (s: string, size = FS) => s.length * size * 0.56;
// month ticks at an even step: as many as fit without touching; the first and last months are always labeled,
// and each label is kept inside the chart (centered on its point unless that would cut it off at an edge)
function tickPlan(labels: string[], at: (i: number) => number, W: number) {
  const n = labels.length;
  const text = labels.map((l, i) => { const [m, y] = l.split(" "); return !FULL[m] ? l : i === 0 || i === n - 1 ? `${FULL[m]} ${y}` : FULL[m]; });
  const w = text.map((t) => textW(t));
  const x = (i: number) => Math.min(W - w[i] / 2, Math.max(w[i] / 2, at(i)));
  const fits = (a: number, b: number) => x(b) - w[b] / 2 - (x(a) + w[a] / 2) >= 14;
  let pick = [0, n - 1];
  for (let step = 1; step < n - 1; step++) {
    const p = Array.from({ length: n }, (_, i) => i).filter((i) => i % step === 0 && i < n - 1);
    while (p.length > 1 && !fits(p[p.length - 1], n - 1)) p.pop();
    p.push(n - 1);
    if (p.every((v, k) => k === 0 || fits(p[k - 1], v))) { pick = p; break; }
  }
  return { show: (i: number) => pick.includes(i), text: (i: number) => text[i], x };
}
// round tick values: step of 1, 2, 2.5 or 5 x 10^k, about four intervals
function niceTicks(v: number) {
  if (v <= 0) return [0, 1];
  const raw = v / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  const top = Math.ceil(v / step - 1e-9) * step;
  const out: number[] = []; for (let t = 0; t <= top + step / 2; t += step) out.push(+t.toFixed(6));
  return out;
}

// measure the plot container so one viewBox unit is one CSS pixel
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    setW(Math.round(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Swatch({ s, bar }: { s: Series; bar?: boolean }) {
  if (bar) return <span className="inline-block h-3.5 w-3.5 rounded-[4px]" style={{ background: s.color }} />;
  return <svg width="30" height="10" aria-hidden className="shrink-0"><line x1="1" x2="29" y1="5" y2="5" stroke={s.color} strokeWidth={4} strokeLinecap="round" strokeDasharray={s.dash ? "7 5" : undefined} /></svg>;
}

function Legend({ series, bar }: { series: Series[]; bar?: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-2 text-base">
      {series.map((s) => <span key={s.name} className="inline-flex items-center gap-2.5"><Swatch s={s} bar={bar} />{s.name}</span>)}
    </div>
  );
}

function Table({ title, labels, series, fmt, decimals }: { title: string; labels: string[]; series: Series[]; fmt: (v: number) => string; decimals?: boolean }) {
  // when a column holds decimals, show every value with one decimal so the column lines up (18.0, not 18)
  const one = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const f = (s: Series) => (decimals && s.values.some((v) => !Number.isInteger(v)) ? one : fmt);
  return (
    <div className="scroll-x" tabIndex={0} role="region" aria-label={`${title} table`}>
      <table className="dtable min-w-[520px]">
        <thead><tr><th>Month</th>{series.map((s) => <th key={s.name} className="!text-right">{s.name}</th>)}</tr></thead>
        <tbody>{labels.map((l, i) => <tr key={l}><td>{monthFull(l)}</td>{series.map((s) => <td key={s.name} className="text-right">{f(s)(s.values[i])}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Head({ title, sub, table, setTable }: { title: string; sub?: string; table: boolean; setTable: (v: boolean) => void }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div><figcaption className="section-title">{title}</figcaption>{sub && <p className="mt-1 text-base leading-snug">{sub}</p>}</div>
      <button className="btn btn-outline btn-sm" onClick={() => setTable(!table)} aria-pressed={table}>{table ? "Chart view" : "Table view"}</button>
    </div>
  );
}

function Tip({ left, label, rows, total }: { left: string; label: string; rows: { s: Series; v: string }[]; total?: string }) {
  return (
    <div className="pointer-events-none absolute top-2 z-10 min-w-[190px] rounded-xl border border-gray bg-white px-4 py-3 text-base shadow-[0_18px_40px_-20px_rgba(74,74,74,.55)]" style={{ left }}>
      <div className="mb-1.5 font-bold">{label}</div>
      {rows.map(({ s, v }) => <div key={s.name} className="flex items-center justify-between gap-5"><span className="inline-flex items-center gap-2"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.name}</span><strong className="tnum">{v}</strong></div>)}
      {total && <div className="mt-1.5 flex justify-between gap-5 border-t border-gray pt-1.5"><span>Total</span><strong className="tnum">{total}</strong></div>}
    </div>
  );
}

export function LineChart({ title, sub, labels, series, format = "number", height = 320 }: { title: string; sub?: string; labels: string[]; series: Series[]; format?: Fmt; height?: number }) {
  const fmt = FORMATS[format];
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const [box, measured] = useWidth();
  const W = measured || 640;
  const narrow = W < 520;
  const H = narrow ? Math.round(height * 0.86) : height;
  const ticks = niceTicks(Math.max(...series.flatMap((s) => s.values)));
  const max = ticks[ticks.length - 1];
  const single = series.length === 1;
  const endText = (s: Series) => (narrow || single ? fmt.short(s.values[s.values.length - 1]) : `${fmt.short(s.values[s.values.length - 1])} ${s.name.split(" ")[0]}`);
  const padL = Math.max(...ticks.map((t) => textW(fmt.short(t)))) + 14;
  const padR = Math.max(...series.map((s) => textW(endText(s)))) + 22;
  const padT = 14, padB = 40;
  const x = (i: number) => padL + (i / (labels.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const tick = tickPlan(labels, x, W);
  const svgRef = useRef<SVGSVGElement>(null);
  const onMove = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - padL) / (W - padL - padR)) * (labels.length - 1));
    setHover(Math.max(0, Math.min(labels.length - 1, i)));
  };
  // end labels, nudged apart so they never collide
  const ends = useMemo(() => {
    const e = series.map((s) => ({ s, yy: y(s.values[s.values.length - 1]) })).sort((a, b) => a.yy - b.yy);
    for (let i = 1; i < e.length; i++) if (e[i].yy - e[i - 1].yy < 21) e[i].yy = e[i - 1].yy + 21;
    return e;
  }, [series, max, W, H]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <figure className="card p-6 md:p-8">
      <Head title={title} sub={sub} table={table} setTable={setTable} />
      {series.length > 1 && <div className="mb-4"><Legend series={series} /></div>}
      <div ref={box}>
        {table ? <Table title={title} labels={labels} series={series} fmt={fmt.full} decimals={format === "number"} /> : (
          <div className="relative" style={{ height: H }}>
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="tnum block touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`${title}. ${series.map((s) => `${s.name}: ${fmt.full(s.values[s.values.length - 1])} by ${monthFull(labels[labels.length - 1])}`).join("; ")}`}>
              {ticks.map((t, k) => (
                <g key={t}><line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={k === 0 ? BASELINE : GRID} strokeWidth={k === 0 ? 1.5 : 1} /><text x={padL - 10} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={FS} fill={INK}>{fmt.short(t)}</text></g>
              ))}
              {labels.map((l, i) => tick.show(i) && <text key={l} x={tick.x(i)} y={H - 12} textAnchor="middle" fontSize={FS} fill={INK}>{tick.text(i)}</text>)}
              {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} stroke={INK} strokeOpacity={0.3} strokeWidth={1} />}
              {series.map((s) => (
                <g key={s.name}>
                  <path d={s.values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ")} fill="none" stroke={s.color} strokeWidth={3} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />
                  {hover !== null && <circle cx={x(hover)} cy={y(s.values[hover])} r={6} fill={s.color} stroke="#fff" strokeWidth={2.5} />}
                </g>
              ))}
              {ends.map(({ s, yy }) => <text key={s.name} x={W - padR + 10} y={yy} dominantBaseline="middle" fontSize={FS} fill={INK} fontWeight={700}>{fmt.short(s.values[s.values.length - 1])}{!narrow && !single && <tspan fontWeight={400}> {s.name.split(" ")[0]}</tspan>}</text>)}
            </svg>
            {hover !== null && (
              <Tip left={`clamp(0px, calc(${(x(hover) / W) * 100}% + 14px), calc(100% - 210px))`} label={monthFull(labels[hover])} rows={series.map((s) => ({ s, v: fmt.full(s.values[hover]) }))} />
            )}
          </div>
        )}
      </div>
    </figure>
  );
}

export function StackedBars({ title, sub, labels, series, format = "number", height = 300 }: { title: string; sub?: string; labels: string[]; series: Series[]; format?: Fmt; height?: number }) {
  const fmt = FORMATS[format];
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const [box, measured] = useWidth();
  const W = measured || 640;
  const narrow = W < 520;
  const H = narrow ? Math.round(height * 0.86) : height;
  const totals = labels.map((_, i) => series.reduce((a, s) => a + s.values[i], 0));
  const ticks = niceTicks(Math.max(...totals));
  const max = ticks[ticks.length - 1];
  const padL = Math.max(...ticks.map((t) => textW(fmt.short(t)))) + 14, padR = 8, padT = 30, padB = 40;
  const bw = (W - padL - padR) / labels.length;
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  const tick = tickPlan(labels, (i) => padL + i * bw + bw / 2, W);
  return (
    <figure className="card p-6 md:p-8">
      <Head title={title} sub={sub} table={table} setTable={setTable} />
      <div className="mb-4"><Legend series={series} bar /></div>
      <div ref={box}>
        {table ? <Table title={title} labels={labels} series={[...series, { name: "Total", color: INK, values: totals }]} fmt={fmt.full} decimals={format === "number"} /> : (
          <div className="relative" style={{ height: H }}>
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="tnum block" role="img" aria-label={`${title}. Total by ${monthFull(labels[labels.length - 1])}: ${fmt.full(totals[totals.length - 1])}`} onPointerLeave={() => setHover(null)}>
              {ticks.map((t, k) => <g key={t}><line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={k === 0 ? BASELINE : GRID} strokeWidth={k === 0 ? 1.5 : 1} /><text x={padL - 10} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={FS} fill={INK}>{fmt.short(t)}</text></g>)}
              {labels.map((l, i) => {
                let acc = 0; const x0 = padL + i * bw + bw * 0.17, w = bw * 0.66;
                return (
                  <g key={l} onPointerEnter={() => setHover(i)}>
                    <rect x={padL + i * bw} y={padT} width={bw} height={H - padT - padB} fill="transparent" />
                    {series.map((s, k) => {
                      const v = s.values[i], top = acc + v; const yy = y(top), hh = y(acc) - y(top); acc = top;
                      const isTop = k === series.length - 1;
                      // 2px white gap between stacked segments; 4px rounded data end on the top segment
                      return <rect key={s.name} x={x0} y={yy} width={w} height={Math.max(0, hh - (k > 0 ? 2 : 0))} rx={isTop ? 4 : 0} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.45} />;
                    })}
                    {tick.show(i) && <text x={tick.x(i)} y={H - 12} textAnchor="middle" fontSize={FS} fill={INK}>{tick.text(i)}</text>}
                  </g>
                );
              })}
              <text x={W - padR} y={y(totals[totals.length - 1]) - 10} textAnchor="end" fontSize={FS} fontWeight={700} fill={INK}>{fmt.short(totals[totals.length - 1])}</text>
            </svg>
            {hover !== null && (
              <Tip left={`clamp(0px, calc(${((hover + 1) / labels.length) * 100}% - 40px), calc(100% - 210px))`} label={monthFull(labels[hover])} rows={series.map((s) => ({ s, v: fmt.full(s.values[hover]) }))} total={fmt.full(totals[hover])} />
            )}
          </div>
        )}
      </div>
    </figure>
  );
}
