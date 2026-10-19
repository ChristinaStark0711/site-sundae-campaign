import type { Metadata } from "next";
import CaptionCards from "@/components/CaptionCards";
import { getCaptions, getEvent, getEvents } from "@/lib/content";
import { apDate } from "@/lib/format";

export function generateStaticParams() { return getEvents().filter((e) => e.kind === "campaign").map((e) => ({ slug: e.slug })); }
export const dynamicParams = false;
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const e = getEvent((await params).slug); return { title: e ? `Captions · ${e.city}` : "Captions" };
}

export default async function EventCaptions({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = getEvent(slug)!;
  const caps = getCaptions(slug);
  return (
    <main className="mx-auto max-w-7xl px-5 md:px-8">
      <header className="py-16 md:py-24">
        <p className="eyebrow">Captions · {e.city}</p>
        <h1 className="display h-bar h-bar-lg mt-5 max-w-4xl text-[clamp(2.375rem,4.6vw,4rem)]">{caps.length} {caps.length === 1 ? "caption" : "captions"}, written for each platform.</h1>
        <p className="lede mt-7 max-w-3xl">{e.host}&apos;s founder voice on LinkedIn, tighter copy for Instagram and Facebook, one-liners for X. Replace <code className="rounded-md border border-gray bg-mist px-1.5 font-bold">{"{RSVP link}"}</code> with the event page link. No earnings claims anywhere.</p>
      </header>
      <section className="border-t border-gray py-16">
        <h2 className="display h-bar text-[2rem] md:text-[2.5rem]">{e.name}, {apDate(e.date, { year: false })}</h2>
        {caps.length ? <CaptionCards captions={caps} /> : <p className="mt-8 text-lg">No captions yet for this event.</p>}
      </section>
    </main>
  );
}
