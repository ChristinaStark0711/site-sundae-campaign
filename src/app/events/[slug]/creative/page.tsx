import type { Metadata } from "next";
import CreativeLibrary from "@/components/CreativeLibrary";
import EventDetails from "@/components/EventDetails";
import { getCaptions, getEvent, getEvents, getLibrary, getRequests } from "@/lib/content";

export function generateStaticParams() { return getEvents().filter((e) => e.kind === "campaign").map((e) => ({ slug: e.slug })); }
export const dynamicParams = false;
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const e = getEvent((await params).slug); return { title: e ? `Creative · ${e.city}` : "Creative" };
}

export default async function EventCreative({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const e = getEvent(slug)!;
  return (
    <main className="mx-auto max-w-7xl px-5 md:px-8">
      <CreativeLibrary scope={slug} lib={getLibrary(slug)} base={e.media} requests={getRequests(slug)}
        captions={{ href: `/events/${slug}/captions`, count: getCaptions(slug).length }}
        header={<>
          <p className="eyebrow">Creative library · {e.city}</p>
          <h1 className="display h-bar h-bar-lg mt-5 max-w-4xl text-[clamp(2.375rem,4.6vw,4rem)]">Every asset, ready to post, print and run.</h1>
          {e.creativeNote && <p className="lede mt-7 max-w-3xl">{e.creativeNote}</p>}
          <p className="mt-5 max-w-3xl text-lg leading-relaxed">Need a change? Type it in the box under the asset: <strong className="font-bold">Update this one</strong> replaces it, <strong className="font-bold">New variation</strong> adds a new version next to the original.</p>
          <section aria-labelledby="details" className="mt-12 max-w-3xl">
            <p className="eyebrow">The event</p>
            <h2 id="details" className="display h-bar mt-4 text-[2.25rem]">The details</h2>
            <div className="mt-8"><EventDetails e={e} /></div>
          </section>
        </>} />
    </main>
  );
}
