import Gallery from "@/components/Gallery";
import VideoCard from "@/components/VideoCard";
import RequestLog from "@/components/RequestLog";
import ChangeAll from "@/components/ChangeAll";
import { originals, scopePath, type Asset, type ChangeRequest, type Library } from "@/lib/content";

export const Section = ({ id, eyebrow, title, sub, children }: { id: string; eyebrow: string; title: string; sub: string; children: React.ReactNode }) => (
  <section id={id} className="scroll-mt-28 border-t border-gray py-20 first:border-t-0">
    <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
      <div><p className="eyebrow">{eyebrow}</p><h2 className="display h-bar mt-4 text-[2.25rem] md:text-[2.875rem]">{title}</h2></div>
      <p className="max-w-md text-lg leading-relaxed">{sub}</p>
    </div>
    {children}
  </section>
);

const n = (count: number, one: string, many = one + "s") => `${count} ${count === 1 ? one : many}`;

// One creative library (an event's, or the always-on membership set): images, flyers, videos and Reels, each card with
// its change box, then the change-request log for this library. Empty sections are left out.
export default function CreativeLibrary({ scope, lib, base, header, captions, requests }: {
  scope: string; lib: Library; base: string; header: React.ReactNode; captions?: { href: string; count: number }; requests: ChangeRequest[];
}) {
  const kb = scopePath(scope);
  const nav: [string, string][] = [];
  if (lib.images.length) nav.push(["#images", `Images · ${originals(lib.images).length}`]);
  if (lib.flyers.length) nav.push(["#flyers", `Flyers · ${originals(lib.flyers).length}`]);
  if (lib.videos.length) nav.push(["#videos", `Videos · ${originals(lib.videos).length}`]);
  if (lib.reels.length) nav.push(["#reels", `Reels · ${originals(lib.reels).length}`]);
  if (lib.backdrops.length) nav.push(["#backdrops", `Backdrops · ${originals(lib.backdrops).length}`]);
  if (captions?.count) nav.push([captions.href, `Captions · ${captions.count}`]);
  nav.push(["#changes", "Change requests"]);
  const plusVars = (a: Asset[]) => { const v = a.length - originals(a).length; return v ? ` (plus ${n(v, "variation")})` : ""; };
  return (
    <>
      <header className="py-16 md:py-24">
        {header}
        <nav className="mt-10 flex flex-wrap gap-2.5" aria-label="Library sections">
          {nav.map(([h, l]) => <a key={h} href={h} className="btn btn-outline btn-sm">{l}</a>)}
        </nav>
        {/* every library gets "Change all" (owner's request, 2026-10-27): the originals of each kind, by their change-box keys */}
        <ChangeAll keys={{ images: originals(lib.images).map((a) => `${kb}/images/${a.id}`), flyers: originals(lib.flyers).map((a) => `${kb}/flyers/${a.id}`), videos: originals(lib.videos).map((a) => `${kb}/videos/${a.id}`), reels: originals(lib.reels).map((a) => `${kb}/reels/${a.id}`), backdrops: originals(lib.backdrops).map((a) => `${kb}/backdrops/${a.id}`) }} />
      </header>
      {lib.images.length > 0 && (
        <Section id="images" eyebrow="Social images" title={n(originals(lib.images).length, "image")} sub={`Feed (4:5), square, LinkedIn (1.91:1) and Stories (9:16)${plusVars(lib.images)}. Each lists where it runs and which caption it pairs with.`}>
          <Gallery items={lib.images} base={`${base}/images`} keyBase={`${kb}/images`} />
        </Section>
      )}
      {lib.flyers.length > 0 && (
        <Section id="flyers" eyebrow="Flyers" title={n(originals(lib.flyers).length, "flyer")} sub={`Print-ready PDFs plus digital squares and Stories${plusVars(lib.flyers)}. QR codes go to the RSVP page or the membership intro call.`}>
          <Gallery items={lib.flyers} base={`${base}/flyers`} keyBase={`${kb}/flyers`} aspect="aspect-[4/5]" />
        </Section>
      )}
      {lib.videos.length > 0 && (
        <Section id="videos" eyebrow="Videos" title={n(originals(lib.videos).length, "feed video")} sub={`1920×1080 and 1080×1080 for LinkedIn, Facebook, YouTube and email${plusVars(lib.videos)}. H.264 MP4.`}>
          <div className="grid gap-6 md:grid-cols-2" data-stagger>{lib.videos.map((a) => <VideoCard key={a.file} a={a} base={`${base}/videos`} keyBase={`${kb}/videos`} />)}</div>
        </Section>
      )}
      {lib.reels.length > 0 && (
        <Section id="reels" eyebrow="Instagram Reels" title={n(originals(lib.reels).length, "Reel")} sub={`1080×1920 with captions kept inside the Reels safe zone (clear of the top bar, the right-side buttons and the bottom caption area)${plusVars(lib.reels)}.`}>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4" data-stagger>{lib.reels.map((a) => <VideoCard key={a.file} a={a} base={`${base}/reels`} keyBase={`${kb}/reels`} />)}</div>
        </Section>
      )}
      {/* trade-show backdrops (step and repeat), when an event has them: a preview JPG and a full-size vector print PDF */}
      {lib.backdrops.length > 0 && (
        <Section id="backdrops" eyebrow="Backdrops" title={n(originals(lib.backdrops).length, "backdrop option")} sub={`10×10 ft step-and-repeat backdrops for the booth${plusVars(lib.backdrops)}. The Print PDF is full size (120×120 in), all vector, ready for a large-format printer; ask the printer for their bleed and pole-pocket allowance.`}>
          <Gallery items={lib.backdrops} base={`${base}/backdrops`} keyBase={`${kb}/backdrops`} aspect="aspect-square" />
        </Section>
      )}
      <Section id="changes" eyebrow="Change requests" title="What's been asked for" sub="Type a change in the box under any asset, or in Change all at the top for every asset at once. Updates replace the file; variations appear next to the original. Every change publishes automatically once it passes the brand checks; if it needs a new picture, an openly licensed photo is found (or, for a generic image, one is made with AI). One that can't be made says why.">
        <RequestLog requests={requests} />
      </Section>
    </>
  );
}
