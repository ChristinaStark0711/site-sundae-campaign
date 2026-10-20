"use client";
import { useMemo, useState } from "react";
import { LineChart, monthFull } from "./Charts";
import { SERIES } from "@/content/palette";
import { Arrowed } from "./Icon";

const MONTHS = ["Oct 2026", "Nov 2026", "Dec 2026", "Jan 2027", "Feb 2027", "Mar 2027", "Apr 2027", "May 2027", "Jun 2027", "Jul 2027", "Aug 2027", "Sep 2027"];
const RAMP = [0.7, 0.9, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
// the base case's organic ramp from model.py (40 to 160 leads a month), as a share of the steady month-12 level
const ORGANIC_RAMP = [40, 55, 70, 85, 100, 115, 125, 135, 145, 150, 155, 160].map((v) => v / 160);
const money = (v: number) => "$" + Math.round(v).toLocaleString("en-US");

type In = { budget: number; cpl: number; organic: number; mql: number; booked: number; held: number; fdd: number; signed: number; dinner: number; dinnerSign: number; fee: number; monthly: number; firstDinner: number };
// Same mechanics as clients/sundae/marketing/projections/model.py (base-case defaults).
const BASE: In = { budget: 25000, cpl: 110, organic: 160, mql: 25, booked: 40, held: 70, fdd: 30, signed: 20, dinner: 40, dinnerSign: 3, fee: 50000, monthly: 3000, firstDinner: 2.7 };

function run(p: In) {
  const rows: { m: string; leads: number; perDay: number; held: number; fdds: number; signed: number; cum: number; rev: number }[] = [];
  let prevFdd = 0, cum = 0, rev = 0; const dinnerQ = new Array(14).fill(0);
  MONTHS.forEach((m, i) => {
    const leads = (p.budget / Math.max(p.cpl, 1)) * RAMP[i] + p.organic * ORGANIC_RAMP[i];
    const held = leads * (p.mql / 100) * (p.booked / 100) * (p.held / 100);
    const fdds = held * (p.fdd / 100);
    const d = i === 0 ? p.firstDinner : p.dinner * (p.dinnerSign / 100);
    dinnerQ[i + 1] += d / 2; dinnerQ[i + 2] += d / 2;
    const signed = prevFdd + dinnerQ[i];
    prevFdd = fdds * (p.signed / 100);
    rev += Math.round(signed * p.fee) + Math.round(cum * p.monthly); // model.py rounds each month's revenue
    cum += signed;
    rows.push({ m, leads, perDay: leads / 30.4, held, fdds, signed, cum, rev });
  });
  const spend = p.budget * 12;
  // as in model.py: members to one decimal, ad spend per member on that figure, leads summed from whole monthly counts
  const members = Math.round(cum * 10) / 10;
  return { rows, spend, members, rev, cpm: members ? spend / members : 0, leads: rows.reduce((a, r) => a + Math.round(r.leads), 0) };
}

function Field({ label, value, onChange, step = 1, suffix, prefix, min = 0, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; suffix?: string; prefix?: string; min?: number; max?: number }) {
  return (
    <label className="flex flex-col justify-between gap-1.5 text-base">
      <span className="leading-snug"><Arrowed text={label} /></span>
      <span className="flex items-center rounded-xl border border-ink/60 bg-white px-3.5 transition-[border-color,box-shadow] focus-within:border-blue focus-within:shadow-[0_0_0_3px_rgba(28,81,160,.22)]">
        {prefix && <span>{prefix}</span>}
        <input type="number" inputMode="decimal" className="tnum w-full bg-transparent px-1 py-3 text-lg outline-none" value={value} step={step} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} />
        {suffix && <span>{suffix}</span>}
      </span>
    </label>
  );
}

export default function Calculator() {
  const [p, setP] = useState<In>(BASE);
  const set = (k: keyof In) => (v: number) => setP((x) => ({ ...x, [k]: v }));
  const r = useMemo(() => run(p), [p]);
  return (
    <div className="grid gap-6 xl:grid-cols-[400px_1fr]">
      <div className="card-mist p-6 md:p-7">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="eyebrow">Your inputs</p><button className="link text-base" onClick={() => setP(BASE)}>Reset to base case</button></div>
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5">
          <Field label="Monthly ad budget" prefix="$" value={p.budget} onChange={set("budget")} step={1000} />
          <Field label="Blended cost per lead" prefix="$" value={p.cpl} onChange={set("cpl")} step={5} />
          <Field label="Organic leads a month (steady)" value={p.organic} onChange={set("organic")} step={10} />
          <Field label="Lead → qualified" suffix="%" value={p.mql} onChange={set("mql")} max={100} />
          <Field label="Qualified → call booked" suffix="%" value={p.booked} onChange={set("booked")} max={100} />
          <Field label="Booked → held" suffix="%" value={p.held} onChange={set("held")} max={100} />
          <Field label="Held → FDD sent" suffix="%" value={p.fdd} onChange={set("fdd")} max={100} />
          <Field label="FDD → signed" suffix="%" value={p.signed} onChange={set("signed")} max={100} />
          <Field label="Dinner guests a month" value={p.dinner} onChange={set("dinner")} step={5} />
          <Field label="Dinner guest → signed" suffix="%" value={p.dinnerSign} onChange={set("dinnerSign")} step={0.5} max={100} />
          <Field label="Initial fee (placeholder)" prefix="$" value={p.fee} onChange={set("fee")} step={5000} />
          <Field label="Monthly fee (placeholder)" prefix="$" value={p.monthly} onChange={set("monthly")} step={250} />
        </div>
        <p className="mt-6 text-base leading-relaxed">Fees are placeholders until Sundae confirms the fees in its FDD Items 5 and 6. Signings lag FDD delivery by a month (the 14-day FTC waiting period plus decision time). Paid campaigns run at 70% and 90% efficiency in months 1 and 2 while they learn; organic ramps over 12 months.</p>
      </div>
      <div className="grid gap-6">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[1.25rem] border border-gray bg-gray">
          {[["Leads a day (12-month average)", (r.leads / 365).toFixed(1)], ["Members in 12 months", r.members.toFixed(1)], ["Ad spend per member", money(r.cpm)], ["12-month revenue", money(r.rev)]].map(([k, v]) => (
            <div key={k} className="bg-white p-5 md:p-6"><div className="stat text-[1.625rem] md:text-[2.125rem]" aria-live="polite">{v}</div><div className="mt-1.5 text-base leading-snug">{k}</div></div>
          ))}
        </div>
        <LineChart title="Cumulative members — your inputs" sub="Signed Sundae Members, by month" labels={MONTHS} series={[{ name: "Your scenario", color: SERIES.blue, values: r.rows.map((x) => +x.cum.toFixed(1)) }]} />
        {/* scrolls sideways on phones, so it is a named, focusable region the keyboard can scroll */}
        <div className="card scroll-x p-6 md:p-7" tabIndex={0} role="region" aria-label="Month-by-month results for your inputs">
          <table className="dtable min-w-[640px]">
            <thead><tr>{["Month", "Leads", "Per day", "Calls held", "FDDs", "Signed", "Members", "Revenue (cumulative)"].map((h) => <th key={h} className="!text-right first:!text-left last:!pr-0">{h}</th>)}</tr></thead>
            <tbody>{r.rows.map((x) => (
              <tr key={x.m}><td>{monthFull(x.m)}</td><td className="text-right">{Math.round(x.leads)}</td><td className="text-right">{x.perDay.toFixed(1)}</td><td className="text-right">{Math.round(x.held)}</td><td className="text-right">{x.fdds.toFixed(1)}</td><td className="text-right">{x.signed.toFixed(1)}</td><td className="text-right font-bold">{x.cum.toFixed(1)}</td><td className="!pr-0 text-right">{money(x.rev)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
