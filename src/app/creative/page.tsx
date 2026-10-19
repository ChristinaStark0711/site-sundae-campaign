import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import CreativeLibrary from "@/components/CreativeLibrary";
import { Icon } from "@/components/Icon";
import { getCaptions, getCities, getEvents, getLibrary, getRequests, libraryCount } from "@/lib/content";
import { apDate } from "@/lib/format";

export const metadata: Metadata = { title: "Creative library" };

// The always-on membership creative, with each event's library one click away at the top.
export default function Creative() {
  const events = getEvents().filter((e) => e.kind === "campaign");
  const cities = getCities();
  return (
    <main className="mx-auto max-w-7xl px-5 md:px-8">
      <CreativeLibrary scope="brand" lib={getLibrary("brand")} base="/media" requests={getRequests("brand")}
        captions={{ href: "/captions", count: getCaptions("brand").length }}
        header={<>
          <p className="eyebrow">Creative library</p>
          <h1 className="display h-bar h-bar-lg mt-5 max-w-4xl text-[clamp(2.375rem,4.6vw,4rem)]">Every asset, ready to post, print and run.</h1>
          <p className="lede mt-7 max-w-3xl">Each event has its own library. Below them is the always-on Sundae Membership creative that runs between and across events. Everything is designed in Sundae&apos;s brand from real assets only.</p>
          {events.length > 0 && (
            <div className="mt-12">
              <h2 className="section-title">Event libraries</h2>
              <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {events.map((e) => { const c = cities[e.citySlug]; return (
                  <Link key={e.slug} href={`/events/${e.slug}/creative`} className="card hover-lift group flex items-center gap-5 p-4 pr-6">
                    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-mist">{c && <Image src={c.file} alt="" fill sizes="80px" className="object-cover" style={{ objectPosition: c.focus ?? "50% 50%" }} />}</div>
                    <div className="min-w-0 flex-1"><p className="text-lg font-bold leading-snug">{e.city} · {apDate(e.date)}</p><p className="mt-0.5 text-base">{libraryCount(getLibrary(e.slug))} assets · {getCaptions(e.slug).length} captions</p></div>
                    <Icon name="arrow-right" className="text-blue" />
                  </Link>
                ); })}
              </div>
            </div>
          )}
          <h2 className="display h-bar mt-16 text-[2rem] md:text-[2.5rem]">Always-on: Sundae Membership</h2>
        </>} />
    </main>
  );
}
