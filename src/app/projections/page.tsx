import type { Metadata } from "next";
import Link from "next/link";
import { LineChart, StackedBars } from "@/components/Charts";
import { SCENARIO, SERIES } from "@/content/palette";
import Calculator from "@/components/Calculator";
import { Icon } from "@/components/Icon";
import { KS, KS_PHONE, Key, money, ScenarioCard, type ScenarioName as K } from "@/components/ScenarioKey";
import P from "@/content/brand/projections.json";
import { getEventProjections, getEvents } from "@/lib/content";
import { apDate } from "@/lib/format";

export const metadata: Metadata = { title: "Projections" };
const months = P.engine.base.months.map((m) => m.month);
const scen = (k: K, values: number[]) => ({ ...SCENARIO[k], values });

const To = () => <Icon name="arrow-right" label="to" />;

const REV_NOTE = "*Revenue uses placeholder fees. Benchmark check: U.S. franchise systems commonly spend about $10,000 to $30,000 in marketing per unit sold; the base case lands at about $10,300 per member because Sundae's marketplace list and dinners add low-cost organic demand.";

export default function Projections() {
  const sumRows: [string, keyof typeof P.engine.base.summary, (v: number) => string][] = [
    ["Ad spend (12 months)", "ad_spend_12mo", money], ["Leads (12 months)", "leads_12mo", (v) => v.toLocaleString("en-US")], ["Average leads per day", "avg_leads_per_day", (v) => v.toFixed(1)],
    ["Intro calls held", "intro_calls_held_12mo", (v) => v.toLocaleString("en-US")], ["Members signed", "members_12mo", (v) => v.toFixed(1)], ["Ad spend per member", "ad_cost_per_member", money],
    ["Exit run rate (members a month)", "exit_run_rate_members_per_month", (v) => v.toFixed(1)], ["Initial-fee revenue*", "initial_fee_revenue_12mo", money], ["Recurring revenue*", "recurring_revenue_12mo", money], ["Total revenue (12 months)*", "total_revenue_12mo", money],
  ];
  const evs = getEvents().flatMap((e) => { const pj = getEventProjections(e.slug); return pj ? [{ e, pj }] : []; });
  return (
    <main className="mx-auto max-w-7xl px-5 md:px-8">
      <header className="py-16 md:py-24">
        <p className="eyebrow">Lead flow and sales projections</p>
        <h1 className="display h-bar h-bar-lg mt-5 max-w-4xl text-[clamp(2.375rem,4.6vw,4rem)]">What the plan produces, if Sundae executes it.</h1>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {P.notes.map((n) => <p key={n} className="rounded-2xl bg-mist px-5 py-4 text-lg leading-relaxed">{n}</p>)}
        </div>
      </header>

      {evs.length > 0 && (
        <section className="border-t border-gray py-16" aria-labelledby="ev">
          <p className="eyebrow">Per event</p>
          <h2 id="ev" className="display h-bar mt-4 text-[2.25rem] md:text-[2.625rem]">Each dinner has its own budget and projections</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {evs.map(({ e, pj }) => (
              <Link key={e.slug} href={`/events/${e.slug}/projections`} className="card hover-lift group flex flex-col p-7">
                <p className="eyebrow">{e.city} · {apDate(e.date)}</p>
                <dl className="tnum mt-4 grid grid-cols-3 gap-3 text-base leading-snug">
                  <div><dt>Paid budget</dt><dd className="mt-1 text-xl font-bold">{money(pj.scenarios.base.paid_budget)}</dd></div>
                  <div><dt>Guests</dt><dd className="mt-1 text-xl font-bold">{pj.scenarios.base.attendees}</dd></div>
                  <div><dt>Members</dt><dd className="mt-1 text-xl font-bold">{pj.scenarios.base.members_signed_45d.toFixed(1)}</dd></div>
                </dl>
                <p className="mt-3 text-base">Base case</p>
                <span className="mt-5 inline-flex items-center gap-1.5 text-lg font-bold text-blue"><span className="underline decoration-1 underline-offset-4 group-hover:decoration-2">Open</span><Icon name="arrow-right" /></span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="border-t border-gray py-16" aria-labelledby="eng">
        <p className="eyebrow">The always-on membership engine · 12 months</p>
        <h2 id="eng" className="display h-bar mt-4 text-[2.25rem] md:text-[2.625rem]">Lead flow and members, three scenarios</h2>
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <LineChart title="Qualified-lead flow per day" sub="Paid and organic leads ÷ 30.4" labels={months} series={KS.map((k) => scen(k, P.engine[k].months.map((m) => m.leads_per_day)))} />
          <LineChart title="Cumulative members signed" sub="Funnel signings lag FDD delivery by about one month; dinners convert over the following two months" labels={months} series={KS.map((k) => scen(k, P.engine[k].months.map((m) => m.cumulative_members)))} />
          <StackedBars title="Base case — where the leads come from" sub="Monthly leads: paid ($25,000 a month at a $110 blended CPL) vs. organic" labels={months} series={[{ name: "Paid", color: SERIES.blue, values: P.engine.base.months.map((m) => m.paid_leads) }, { name: "Organic", color: SERIES.slate, values: P.engine.base.months.map((m) => m.organic_leads) }]} />
          <LineChart title="Cumulative revenue (placeholder fees)" sub="$50,000 initial plus $3,000 a month per member — replace with FDD numbers" format="moneyShort" labels={months} series={KS.map((k) => { let c = 0; return scen(k, P.engine[k].months.map((m) => (c += m.initial_fee_revenue + m.recurring_revenue))); })} />
        </div>
        <div className="mt-6 grid gap-4 md:hidden">
          {KS_PHONE.map((k) => <ScenarioCard key={k} k={k} sub={`${money(P.engine[k].assumptions.budget)} a month in ads`} rows={sumRows.map(([l, key, f]) => [l, f(P.engine[k].summary[key] as number)])} />)}
          <p className="text-base leading-relaxed">{REV_NOTE}</p>
        </div>
        <div className="card scroll-x mt-6 hidden p-6 md:block md:p-7" tabIndex={0} role="region" aria-label="12-month summary by scenario">
          <table className="dtable min-w-[640px]">
            <thead><tr><th>12-month summary</th>{KS.map((k) => <th key={k} className="!text-right"><span className="inline-flex items-center gap-2"><Key k={k} />{SCENARIO[k].name}</span><span className="block font-normal">{money(P.engine[k].assumptions.budget)} a month</span></th>)}</tr></thead>
            <tbody>{sumRows.map(([l, key, f]) => <tr key={l}><td>{l}</td>{KS.map((k) => <td key={k} className={`text-right ${k === "base" ? "font-bold" : ""}`}>{f(P.engine[k].summary[key] as number)}</td>)}</tr>)}</tbody>
          </table>
          <p className="mt-4 text-base leading-relaxed">{REV_NOTE}</p>
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {KS.map((k) => { const a = P.engine[k].assumptions; return (
            <div key={k} className={`p-6 text-base ${k === "base" ? "card border-blue" : "card"}`}><p className="flex items-center gap-2.5 font-bold"><Key k={k} />{SCENARIO[k].name} assumptions</p>
              <ul className="tnum mt-3 grid gap-1.5 leading-relaxed"><li>Ads {money(a.budget)} a month · blended CPL {money(a.cpl)}</li><li>Organic {a.organic[0]} <To /> {a.organic[11]} leads a month</li><li>Lead <To /> qualified {Math.round(a.lead_mql * 100)}% · qualified <To /> call booked {Math.round(a.mql_booked * 100)}%</li><li>Booked <To /> held {Math.round(a.booked_held * 100)}% · held <To /> FDD {Math.round(a.held_fdd * 100)}% · FDD <To /> signed {Math.round(a.fdd_signed * 100)}%</li><li>Monthly dinner: {a.dinner_attendees} guests × {(a.dinner_sign * 100).toFixed(1)}%</li></ul></div>
          ); })}
        </div>
      </section>

      <section className="border-t border-gray py-16" aria-labelledby="calc">
        <p className="eyebrow">Try your own numbers</p>
        <h2 id="calc" className="display h-bar mt-4 text-[2.25rem] md:text-[2.625rem]">Projection calculator</h2>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed">Same mechanics as the model above. Plug in Sundae&apos;s real fee, budget and conversion rates once two or three weeks of live data are in. SHAI&apos;s <code className="rounded-md border border-gray bg-mist px-1.5 font-bold">/forecasting</code> agent re-runs this monthly from actuals.</p>
        <div className="mt-10"><Calculator /></div>
      </section>
    </main>
  );
}
