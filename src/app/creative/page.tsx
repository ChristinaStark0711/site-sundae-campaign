import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import CreativeLibrary from "@/components/CreativeLibrary";
import { Icon } from "@/components/Icon";
import { getCaptions, getCities, getEvent, getEvents, getLibrary, getRequests, libraryCount } from "@/lib/content";
import { apDate } from "@/lib/format";

export const metadata: Metadata = { title: "Creative library" };

// Before the hub went events-based this page was the Manhattan Beach library, so old shared links such as
// /creative#flyers land on the always-on section of the same name. A note at the foot of the screen (bottom right from
// 768px, clear of the first card in each grid) then points to that section of the Manhattan Beach library. It opens
// only when the page is opened at one of those sections (an old link), never from the page's own section buttons,
// because the script below runs once, after the page loads; it closes with Hide or the first move to another section.
// Its link is a plain <a> because the script adds the section to it.
const OLD = "manhattan-beach-2026-10-08"; // as in next.config.ts
const NOTE_JS = `(() => {
  const k = location.hash.slice(1), n = document.getElementById("old-link-note");
  if (!n || !["images", "flyers", "videos", "reels"].includes(k)) return;
  n.querySelector("a").hash = k; n.hidden = false;
  const hide = () => { n.hidden = true; };
  n.querySelector("button").addEventListener("click", hide);
  addEventListener("hashchange", hide, { once: true });
})();`;

// The always-on membership creative, with each event's library one click away at the top.
export default function Creative() {
  const events = getEvents().filter((e) => e.kind === "campaign");
  const cities = getCities();
  const old = getEvent(OLD);
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
      {old && (
        <aside id="old-link-note" hidden aria-label={`${old.city} library`} className="fixed inset-x-4 bottom-4 z-40 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-[1.25rem] border border-gray bg-white p-4 text-base leading-snug shadow-[0_24px_48px_-24px_rgba(74,74,74,.5)] md:inset-x-auto md:bottom-6 md:right-8 md:w-max md:max-w-[calc(100vw-4rem)] md:px-5">
          <p className="min-w-0 flex-1 basis-60 md:max-w-sm">This link used to open the {old.city} library, which has moved to the event&apos;s page.</p>
          <div className="flex flex-wrap items-center gap-2.5">
            <a href={`/events/${OLD}/creative`} className="btn btn-blue btn-sm">{old.city} library <Icon name="arrow-right" /></a>
            <button type="button" className="link px-1.5">Hide</button>
          </div>
        </aside>
      )}
      <Script id="old-link-note-js">{NOTE_JS}</Script>
    </main>
  );
}
