import type { EventProjections } from "@/lib/content";

const pct = (v: number) => `${Math.round(v * 100)}%`;
export const assumptionLine = (pj: EventProjections) => {
  const a = pj.scenarios.base.assumptions;
  return `Assumes ${pct(a.approve)} of applications approved, a ${pct(a.show)} show rate with SHAI confirmations, ${pct(a.call_rate)} of attendees booking an intro call and ${pct(a.sign_rate)} of those signing after the FDD period.`;
};

// Base-case funnel for one event: each step as a share of applications.
export default function EventFunnel({ pj }: { pj: EventProjections }) {
  const b = pj.scenarios.base;
  const steps: [string, number][] = [["Applications", b.applications], ["Approved seats", b.approved_seats], ["Attendees", b.attendees], ["Intro calls", b.intro_calls], ["Members (about 45 days)", b.members_signed_45d]];
  return (
    <div className="card p-6 md:p-7">
      <p className="section-title">Base-case funnel</p>
      <p className="mt-1 text-base">Each step as a share of applications</p>
      <div className="mt-6 grid gap-4">
        {steps.map(([l, v]) => (
          <div key={l}>
            <div className="flex justify-between text-base"><span>{l}</span><strong className="tnum">{Number.isInteger(v) ? v : v.toFixed(1)}</strong></div>
            <div className="mt-1.5 h-3 rounded-full bg-mist"><div className="h-3 rounded-full bg-blue" style={{ width: `${Math.max(2, (v / b.applications) * 100)}%` }} /></div>
          </div>
        ))}
      </div>
      <p className="mt-7 text-lg leading-relaxed">{assumptionLine(pj)}</p>
    </div>
  );
}
