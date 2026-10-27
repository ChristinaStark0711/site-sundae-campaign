import Image from "next/image";
import { Icon } from "./Icon";
import { originals, type EventRec, type Library } from "@/lib/content";
import { ver } from "@/lib/ver";

// The blue "Creative library" band (counts, five image previews, the creative note), kept on the event's creative page
// at the owner's request (2026-10-22) when the overview went; full width, and its links jump to the images below.
export default function CreativeBand({ e, lib, captions }: { e: EventRec; lib: Library; captions: number }) {
  const previews = originals(lib.images).slice(0, 5);
  if (!previews.length) return null;
  const counts = [[originals(lib.images).length, "images"], [originals(lib.flyers).length, "flyers"], [originals(lib.videos).length, "videos"], [originals(lib.reels).length, "Reels"], [originals(lib.backdrops).length, "backdrops"], [originals(lib.tablecloths).length, "table cloths"], [captions, "captions"]] as const;
  return (
    <section className="relative left-1/2 mt-16 w-screen -translate-x-1/2 overflow-hidden bg-blue py-24 text-white" aria-labelledby="creative">
      <div aria-hidden className="dots-white pointer-events-none absolute right-8 top-10 hidden h-16 w-16 opacity-60 md:block" />
      <div className="relative mx-auto max-w-7xl px-5 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-6"><div><p className="eyebrow !text-white">Creative library</p><h2 id="creative" className="display mt-4 max-w-4xl text-balance text-[2.25rem] !text-white md:text-[2.875rem]">{counts.filter(([c]) => c).map(([c, l]) => `${c} ${l}`).join(" · ")}</h2></div><a href="#images" className="btn btn-white">Open the library <Icon name="arrow-right" /></a></div>
        <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-5 [&>*:nth-child(5)]:hidden md:[&>*:nth-child(5)]:block" data-stagger>
          {previews.map((a) => (
            <a key={a.file} href="#images" className="relative aspect-[4/5] overflow-hidden rounded-xl bg-white"><Image src={`${e.media}/images/${a.file}${ver(a)}`} alt={a.title} fill sizes="(max-width:768px) 50vw, 20vw" className="object-cover transition-transform duration-500 hover:scale-105" /></a>
          ))}
        </div>
        {e.creativeNote && <p className="mt-8 max-w-3xl text-lg leading-relaxed">{e.creativeNote}</p>}
      </div>
    </section>
  );
}
