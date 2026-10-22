import Image from "next/image";
import Link from "next/link";
import { Icon } from "./Icon";
import { EventCardTitle } from "./EventsBoard";
import { getCaptions, getCities, getLibrary, libraryCount, type EventRec } from "@/lib/content";
import { apDate, whenLine, whereLine } from "@/lib/format";

// One event on the events list: the city photo (openly licensed, credited), the date, the venue and what its pages hold.
// An event with content opens its creative library; one on record only (no library) has no page to open.
const Wrap = ({ e, children }: { e: EventRec; children: React.ReactNode }) =>
  e.kind === "campaign"
    ? <Link href={`/events/${e.slug}/creative`} className="flex flex-1 flex-col" aria-label={`${e.city}: ${e.name}, ${apDate(e.date)}`}>{children}</Link>
    : <div className="flex flex-1 flex-col">{children}</div>;

export default function EventCard({ e, upcoming }: { e: EventRec; upcoming: boolean }) {
  const city = getCities()[e.citySlug];
  const count = e.kind === "campaign" ? libraryCount(getLibrary(e.slug)) + getCaptions(e.slug).length : 0; // same count as the event page
  return (
    <article className="card hover-lift group flex flex-col overflow-hidden">
      <Wrap e={e}>
        <div className="relative aspect-[4/3] overflow-hidden border-b border-gray bg-mist">
          {city ? (
            <Image src={city.file} alt={city.alt} fill sizes="(max-width:768px) 100vw, (max-width:1280px) 50vw, 33vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" style={{ objectPosition: city.focus ?? "50% 50%" }} />
          ) : <div className="absolute inset-0 grid place-items-center text-lg font-bold">{e.city}</div>}
          <span className={`absolute left-4 top-4 rounded-full px-3 py-1 text-base font-bold ${upcoming ? "bg-blue text-white" : "bg-white text-ink"}`}>{upcoming ? "Upcoming" : "Past event"}</span>
        </div>
        <div className="flex flex-1 flex-col p-7">
          <p className="eyebrow">{e.city}, {e.state}</p>
          <EventCardTitle className="section-title mt-2.5 text-[1.375rem]">{e.name}</EventCardTitle>
          <p className="mt-2 text-lg leading-relaxed">{whenLine(e)}<br />{whereLine(e)}</p>
          <p className="mt-3 flex-1 text-base leading-relaxed">
            {e.kind === "campaign" ? `${count} creative assets and captions` : "On record only: no creative library for this event."}
          </p>
          {e.kind === "campaign" && <span className="mt-6 inline-flex items-center gap-1.5 text-lg font-bold text-blue"><span className="underline decoration-1 underline-offset-4 group-hover:decoration-2">Open the creative</span><Icon name="arrow-right" /></span>}
        </div>
      </Wrap>
      {city && <p className="border-t border-gray px-7 py-3 text-base leading-snug">Photo: <a className="link !font-normal" href={city.credit.sourceUrl} target="_blank" rel="noopener">{city.credit.title}</a> by {city.credit.creator} · <a className="link !font-normal" href={city.credit.licenseUrl} target="_blank" rel="noopener">{city.credit.license}</a></p>}
    </article>
  );
}
