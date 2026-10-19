import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import CreativeLibrary from "@/components/CreativeLibrary";
import { Icon } from "@/components/Icon";
import { getCaptions, getCities, getEvents, getLibrary, getRequests, libraryCount } from "@/lib/content";
import { apDate } from "@/lib/format";

export const metadata: Metadata = { title: "Creative library" };

// Before the hub went events-based this page was the Manhattan Beach library, so old shared links such as
// /creative#flyers now land on the always-on set. While one of its sections is the URL's target, a note at the foot of
// the screen points to the same section of each event's library (shown by the .lib-note rule in globals.css, no script).
const KIND_NAMES = { images: "images", flyers: "flyers", videos: "videos", reels: "Reels" } as const;

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
      {events.length > 0 && Object.entries(KIND_NAMES).map(([k, name]) => (
        <aside key={k} data-for={k} aria-label={`Event ${name}`} className="lib-note fixed inset-x-4 bottom-4 z-40 flex-wrap items-center gap-x-5 gap-y-3 rounded-[1.25rem] border border-gray bg-white p-4 text-base leading-snug shadow-[0_24px_48px_-24px_rgba(74,74,74,.5)] md:inset-x-auto md:left-1/2 md:w-max md:max-w-[calc(100vw-4rem)] md:-translate-x-1/2 md:px-5">
          <p className="min-w-0 flex-1 basis-60 md:max-w-sm">These are the always-on Sundae Membership {name}. Each event&apos;s {name} are in its own library.</p>
          <div className="flex flex-wrap items-center gap-2.5">
            {events.map((e) => <Link key={e.slug} href={`/events/${e.slug}/creative#${k}`} className="btn btn-blue btn-sm">{e.city} · {apDate(e.date, { year: false })} <Icon name="arrow-right" /></Link>)}
            {/* a fragment that names no element: the section stops being the target, so the note hides and the page stays put */}
            <a href="#note-hidden" className="link px-1.5">Hide</a>
          </div>
        </aside>
      ))}
    </main>
  );
}
