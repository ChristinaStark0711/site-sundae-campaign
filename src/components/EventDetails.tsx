import { VENUE_TBA, whenLine } from "@/lib/format";
import type { EventRec } from "@/lib/content";

// The event's details card (owner's choice, 2026-10-22: kept at the top of the event's creative page when the overview went).
const when = (e: EventRec) => `${whenLine(e)}${e.venue === VENUE_TBA && !e.time ? " · Time to be announced" : ""}`;

export default function EventDetails({ e }: { e: EventRec }) {
  const rows: [string, React.ReactNode][] = [
    ["When", when(e)],
    ["Where", e.venue === VENUE_TBA ? `${e.venueNote ?? VENUE_TBA} · ${e.city}, ${e.state}` : <>{e.space ? `${e.space} at ` : ""}{e.venue}{e.address ? <><br />{e.address}</> : `, ${e.city}`}</>],
    ["Host", `${e.host}${e.hostTitle ? `, ${e.hostTitle}` : ""}`],
    ["Who it's for", e.audience],
  ];
  if (e.rsvp) rows.push(["RSVP page", <a key="r" href={e.rsvp} target="_blank" rel="noopener" className="link">{e.rsvp.replace(/^https?:\/\//, "")}</a>]);
  return (
    <dl className="card grid gap-0 p-6 md:p-7">
      {rows.map(([l, v]) => <div key={l} className="grid gap-1 border-b border-gray py-3.5 last:border-b-0 sm:grid-cols-[9rem_1fr] sm:gap-4"><dt className="text-base font-bold">{l}</dt><dd className="text-lg leading-relaxed">{v}</dd></div>)}
    </dl>
  );
}
