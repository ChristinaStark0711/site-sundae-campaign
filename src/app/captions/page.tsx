import type { Metadata } from "next";
import Link from "next/link";
import CaptionCards from "@/components/CaptionCards";
import { Icon } from "@/components/Icon";
import { getCaptions, getEvents } from "@/lib/content";
import { apDate } from "@/lib/format";

export const metadata: Metadata = { title: "Captions" };

export default function Captions() {
  const caps = getCaptions("brand");
  const events = getEvents().filter((e) => e.kind === "campaign");
  return (
    <main className="mx-auto max-w-7xl px-5 md:px-8">
      <header className="py-16 md:py-24">
        <p className="eyebrow">Captions</p>
        <h1 className="display h-bar h-bar-lg mt-5 max-w-4xl text-[clamp(2.375rem,4.6vw,4rem)]">Captions, written for each platform.</h1>
        <p className="lede mt-7 max-w-3xl">The always-on membership captions are below. Each event&apos;s captions live with that event. Replace <code className="rounded-md border border-gray bg-mist px-1.5 font-bold">{"{membership link}"}</code> with the membership page. No earnings claims anywhere.</p>
        {events.length > 0 && (
          <nav className="mt-10 flex flex-wrap gap-2.5" aria-label="Event captions">
            {events.map((e) => <Link key={e.slug} href={`/events/${e.slug}/captions`} className="btn btn-outline btn-sm">{e.city} · {apDate(e.date, { year: false })} · {getCaptions(e.slug).length} {getCaptions(e.slug).length === 1 ? "caption" : "captions"} <Icon name="arrow-right" /></Link>)}
          </nav>
        )}
      </header>
      <section className="border-t border-gray py-16">
        <h2 className="display h-bar text-[2rem] md:text-[2.5rem]">Always-on: Sundae Membership</h2>
        <CaptionCards captions={caps} />
      </section>
    </main>
  );
}
