import type { Metadata } from "next";
import Link from "next/link";
import EventFunnel from "@/components/EventFunnel";
import { Icon } from "@/components/Icon";
import { KS, KS_PHONE, Key, money, ScenarioCard } from "@/components/ScenarioKey";
import { SCENARIO } from "@/content/palette";
import { getEvent, getEventProjections, getEvents } from "@/lib/content";
import { apDate } from "@/lib/format";

export function generateStaticParams() { return getEvents().filter((e) => e.kind === "campaign").map((e) => ({ slug: e.slug })); }
export const dynamicParams = false;
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const e = getEvent((await params).slug); return { title: e ? `Projections · ${e.city}` : "Projections" };
}

const ROWS: [string, string, (v: number) => string][] = [
  ["Paid budget", "paid_budget", money], ["Cost per application", "paid_cpl", money], ["Paid applications", "paid_applications", String],
  ["Organic applications", "organic_applications", String], ["Total applications", "applications", String], ["Approved seats", "approved_seats", String],
  ["Attendees", "attendees", String], ["Intro calls booked", "intro_calls", String], ["Members signed within about 45 days", "members_signed_45d", (v) => v.toFixed(1)], ["Paid cost per attendee", "cost_per_attendee", money],
];

export default async function EventProjectionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = getEvent(slug)!;
  const pj = getEventProjections(slug);
  const paid = e.plans.find((p) => p.slug === "paid");
  return (
    <main className="mx-auto max-w-7xl px-5 md:px-8">
      <header className="py-16 md:py-24">
        <p className="eyebrow">Projected results · {e.city}, {apDate(e.date)}</p>
        <h1 className="display h-bar h-bar-lg mt-5 max-w-4xl text-[clamp(2.375rem,4.6vw,4rem)]">Budget, forecast and projected results.</h1>
        {pj && <div className="mt-10 grid gap-4 md:grid-cols-2">{pj.notes.map((n) => <p key={n} className="rounded-2xl bg-mist px-5 py-4 text-lg leading-relaxed">{n}</p>)}</div>}
      </header>
      {pj ? (
        <section className="border-t border-gray py-16" aria-labelledby="ev">
          <p className="eyebrow">Three scenarios</p>
          <h2 id="ev" className="display h-bar mt-4 text-[2.25rem] md:text-[2.625rem]">From applications to signed members</h2>
          <div className="mt-10 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
            <div className="grid gap-4 md:hidden">
              {KS_PHONE.map((k) => <ScenarioCard key={k} k={k} rows={ROWS.map(([l, key, f]) => [l, f(pj.scenarios[k][key])])} />)}
            </div>
            <div className="card scroll-x hidden p-6 md:block md:p-7" tabIndex={0} role="region" aria-label="Three scenarios table">
              <table className="dtable min-w-[560px]">
                <thead><tr><th />{KS.map((k) => <th key={k} className="!text-right"><span className="inline-flex items-center gap-2"><Key k={k} />{SCENARIO[k].name}</span></th>)}</tr></thead>
                <tbody>{ROWS.map(([l, key, f]) => <tr key={l}><td>{l}</td>{KS.map((k) => <td key={k} className={`text-right ${k === "base" ? "font-bold" : ""}`}>{f(pj.scenarios[k][key])}</td>)}</tr>)}</tbody>
              </table>
              <p className="mt-4 text-base leading-relaxed">Attendance is capped at {pj.seat_cap} seats; approvals can run higher to allow for no-shows. Projections generated {apDate(pj.generated)}.</p>
            </div>
            <EventFunnel pj={pj} />
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            {paid && <Link href={`/events/${slug}/plans/paid`} className="btn btn-blue">How the budget is spent <Icon name="arrow-right" /></Link>}
            <Link href="/projections" className="btn btn-outline">The always-on membership engine</Link>
          </div>
        </section>
      ) : <p className="border-t border-gray py-16 text-lg">No projections yet for this event.</p>}
    </main>
  );
}
