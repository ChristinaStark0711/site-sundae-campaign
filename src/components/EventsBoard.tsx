"use client";
import { useEffect, useState } from "react";
import { isUpcoming } from "@/lib/format";

// Splits the events into upcoming and past by today's date in the visitor's browser, so an event moves to "Past"
// the day after it happens even before the site is rebuilt. The first paint uses the build date.
export type BoardItem = { slug: string; date: string; asUpcoming: React.ReactNode; asPast: React.ReactNode };

export default function EventsBoard({ items, builtAt, empty, limitPast, sub = false }: { items: BoardItem[]; builtAt: number; empty: React.ReactNode; limitPast?: number; sub?: boolean }) {
  const [now, setNow] = useState(builtAt);
  useEffect(() => setNow(Date.now()), []);
  const up = items.filter((i) => isUpcoming(i.date, now)).sort((a, b) => a.date.localeCompare(b.date));
  const pastAll = items.filter((i) => !isUpcoming(i.date, now)).sort((a, b) => b.date.localeCompare(a.date));
  const past = pastAll.slice(0, limitPast);
  // as a sub-section (the overview), the two headings drop a level and a size
  const H = sub ? "h3" : "h2";
  const hc = sub ? "section-title text-[1.5rem]" : "display h-bar text-[2rem] md:text-[2.5rem]";
  return (
    <>
      <section aria-labelledby="ev-up">
        <div className="flex flex-wrap items-baseline justify-between gap-4"><H id="ev-up" className={hc}>Upcoming events</H><span className="text-lg">{up.length ? `${up.length} on the calendar` : "None booked yet"}</span></div>
        {up.length ? <div className={`${sub ? "mt-6" : "mt-10"} grid gap-6 md:grid-cols-2 xl:grid-cols-3`}>{up.map((i) => <div key={i.slug} className="grid">{i.asUpcoming}</div>)}</div> : <div className={sub ? "mt-6" : "mt-10"}>{empty}</div>}
      </section>
      <section aria-labelledby="ev-past" className={sub ? "mt-14" : "mt-20"}>
        <div className="flex flex-wrap items-baseline justify-between gap-4"><H id="ev-past" className={hc}>Past events</H><span className="text-lg">{pastAll.length} on record</span></div>
        <div className={`${sub ? "mt-6" : "mt-10"} grid gap-6 md:grid-cols-2 xl:grid-cols-3`}>{past.map((i) => <div key={i.slug} className="grid">{i.asPast}</div>)}</div>
      </section>
    </>
  );
}
