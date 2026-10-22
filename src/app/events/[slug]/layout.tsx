import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import EventTabs from "@/components/EventTabs";
import { Icon } from "@/components/Icon";
import { getCities, getEvent, getEvents } from "@/lib/content";
import { whenLine, whereLine } from "@/lib/format";

export function generateStaticParams() { return getEvents().map((e) => ({ slug: e.slug })); }
export const dynamicParams = false;

// The bar every event page shares: back to Events, the city thumbnail, the event name, date and place, and the tabs.
export default async function EventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = getEvent(slug);
  if (!e) notFound();
  const city = getCities()[e.citySlug];
  return (
    <>
      <section aria-label={`${e.city} event`} className="border-b border-gray bg-mist">
        <div className="mx-auto max-w-7xl px-5 pb-5 pt-6 md:px-8">
          <Link href="/" className="inline-flex items-center gap-1.5 text-base font-bold text-blue"><Icon name="arrow-left" />All events</Link>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
            <div className="flex min-w-0 items-center gap-4">
              {city && <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-gray bg-white"><Image src={city.file} alt="" fill sizes="56px" className="object-cover" style={{ objectPosition: city.focus ?? "50% 50%" }} /></div>}
              <div className="min-w-0">
                <p className="text-lg font-bold leading-snug">{e.city}, {e.state} · {e.name}</p>
                <p className="text-base leading-snug">{whenLine(e)} · {whereLine(e)}</p>
              </div>
            </div>
            {e.kind === "campaign" && <EventTabs slug={e.slug} />}
          </div>
        </div>
      </section>
      {children}
    </>
  );
}
