import Image from "next/image";
import Link from "next/link";
import { Icon } from "./Icon";
import { getCities, getEventProjections, getLibrary, libraryCount, type EventRec } from "@/lib/content";
import { apDate } from "@/lib/format";

// One event on the Events page and the overview: the city photo (openly licensed, credited), the date, the venue and
// what the event's page holds.
export default function EventCard({ e, upcoming }: { e: EventRec; upcoming: boolean }) {
  const city = getCities()[e.citySlug];
  const count = e.kind === "campaign" ? libraryCount(getLibrary(e.slug)) : 0;
  const pj = e.kind === "campaign" ? getEventProjections(e.slug) : null;
  return (
    <article className="card hover-lift group flex flex-col overflow-hidden">
      <Link href={`/events/${e.slug}`} className="flex flex-1 flex-col" aria-label={`${e.city}: ${e.name}, ${apDate(e.date)}`}>
        <div className="relative aspect-[4/3] overflow-hidden border-b border-gray bg-mist">
          {city ? (
            <Image src={city.file} alt={city.alt} fill sizes="(max-width:768px) 100vw, (max-width:1280px) 50vw, 33vw" className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" style={{ objectPosition: city.focus ?? "50% 50%" }} />
          ) : <div className="absolute inset-0 grid place-items-center text-lg font-bold">{e.city}</div>}
          <span className={`absolute left-4 top-4 rounded-full px-3 py-1 text-base font-bold ${upcoming ? "bg-blue text-white" : "bg-white text-ink"}`}>{upcoming ? "Upcoming" : "Past event"}</span>
        </div>
        <div className="flex flex-1 flex-col p-7">
          <p className="eyebrow">{e.city}, {e.state}</p>
          <h3 className="section-title mt-2.5 text-[1.375rem]">{e.name}</h3>
          <p className="mt-2 text-lg leading-relaxed">{apDate(e.date, { weekday: e.date.length > 7 })}{e.time ? `, ${e.time}` : ""}<br />{e.space ? `${e.space} at ` : ""}{e.venue}</p>
          <p className="mt-3 flex-1 text-base leading-relaxed">
            {e.kind === "campaign" ? `${count} creative assets · organic and paid plans${pj ? ` · ${pj.scenarios.base.attendees} guests projected (base)` : ""}` : "On record only: before this hub, no library or plans."}
          </p>
          <span className="mt-6 inline-flex items-center gap-1.5 text-lg font-bold text-blue"><span className="underline decoration-1 underline-offset-4 group-hover:decoration-2">Open the event</span><Icon name="arrow-right" /></span>
        </div>
      </Link>
      {city && <p className="border-t border-gray px-7 py-3 text-base leading-snug">Photo: <a className="link !font-normal" href={city.credit.sourceUrl} target="_blank" rel="noopener">{city.credit.title}</a> by {city.credit.creator} · <a className="link !font-normal" href={city.credit.licenseUrl} target="_blank" rel="noopener">{city.credit.license}</a></p>}
    </article>
  );
}
