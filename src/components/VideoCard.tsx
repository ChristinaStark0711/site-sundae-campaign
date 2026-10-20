"use client";
import { useRef, useState } from "react";
import type { Asset } from "@/lib/content";
import ChangeBox from "./ChangeBox";
import { ver } from "@/lib/ver";

export default function VideoCard({ a, base, keyBase }: { a: Asset; base: string; keyBase: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const ratio = a.aspect === "9:16" ? "aspect-[9/16]" : a.aspect === "1:1" ? "aspect-square" : "aspect-video";
  return (
    <article className="card hover-lift flex flex-col overflow-hidden">
      <div className={`relative bg-mist ${ratio}`}>
        <video ref={ref} className="absolute inset-0 h-full w-full object-cover" src={`${base}/${a.file}${ver(a)}`} poster={`${base}/${a.poster}${ver(a)}`} preload="none" playsInline controls={playing} onPlay={() => setPlaying(true)} />
        {!playing && (
          <button className="group absolute inset-0" onClick={() => { setPlaying(true); ref.current?.play(); }} aria-label={`Play ${a.title}`}>
            {/* one compact play control in the bottom-right corner, the corner every poster keeps clear of headlines */}
            <span className="tnum absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-blue py-2 pl-3 pr-4 text-base font-bold leading-none text-white shadow-[0_12px_26px_-12px_rgba(28,81,160,.9)] ring-2 ring-white transition-transform group-hover:scale-105">
              <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden><path d="M8 5v14l11-7z" fill="currentColor" /></svg>{a.dur}
            </span>
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col border-t border-gray p-6">
        <h3 className="section-title text-[1.1875rem]"><span className="mr-2 inline-flex rounded-md bg-ink px-2 py-0.5 text-base text-white">{a.id}</span>{a.title}</h3><div className="mt-3 flex flex-wrap gap-2">{a.variantOf && <span className="tag !border-blue">Variation of {a.variantOf}</span>}<span className="tag">{a.aspect} · {a.spec}</span></div>
        <p className="mt-3 text-base leading-relaxed">{a.use}</p>
        {a.pair && <p className="mt-1 text-base">Caption: {a.pair}</p>}
        <div className="mt-auto pt-5"><a className="btn btn-outline btn-sm" href={`${base}/${a.file}${ver(a)}`} download={a.file}>Download MP4</a></div>
      </div>
      <ChangeBox asset={`${keyBase}/${a.id}`} title={a.title} video />
    </article>
  );
}
