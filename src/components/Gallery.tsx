"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Asset } from "@/lib/content";
import { Icon } from "./Icon";
import ChangeBox from "./ChangeBox";
import { ver } from "@/lib/ver";

export default function Gallery({ items, base, keyBase, cols = "sm:grid-cols-2 lg:grid-cols-3", aspect = "aspect-[4/5]" }: { items: Asset[]; base: string; keyBase: string; cols?: string; aspect?: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const thumbs = useRef<(HTMLButtonElement | null)[]>([]);
  const shown = useRef<number | null>(null);
  // the lightbox is a modal: focus moves to its Close button when it opens (so it is announced) and stays there, since
  // Close is its only control; when it closes, focus goes back to the thumbnail of the image last shown
  useEffect(() => {
    if (open !== null && shown.current === null) closeRef.current?.focus();
    if (open === null && shown.current !== null) thumbs.current[shown.current]?.focus();
    shown.current = open;
  }, [open]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (open === null) return; if (e.key === "Tab") { e.preventDefault(); closeRef.current?.focus(); } if (e.key === "Escape") setOpen(null); if (e.key === "ArrowRight") setOpen((open + 1) % items.length); if (e.key === "ArrowLeft") setOpen((open - 1 + items.length) % items.length); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [open, items.length]);
  return (
    <>
      <div className={`grid gap-6 ${cols}`} data-stagger>
        {items.map((a, i) => (
          <article key={a.file} className="card hover-lift group flex flex-col overflow-hidden">
            <button ref={(el) => { thumbs.current[i] = el; }} className={`relative block w-full overflow-hidden bg-mist ${aspect}`} onClick={() => setOpen(i)} aria-label={`Open ${a.title}`}>
              <Image src={`${base}/${a.file}${ver(a)}`} alt={a.title} fill sizes="(max-width:640px) 100vw, (max-width:1024px) 50vw, 33vw" className="object-contain p-4 transition-transform duration-500 group-hover:scale-[1.02]" />
            </button>
            <div className="flex flex-1 flex-col border-t border-gray p-6">
              <h3 className="section-title text-[1.1875rem]"><span className="mr-2 inline-flex rounded-md bg-ink px-2 py-0.5 text-base text-white">{a.id}</span>{a.title}</h3>
              <div className="mt-3 flex flex-wrap gap-2">{a.variantOf && <span className="tag !border-blue">Variation of {a.variantOf}</span>}<span className="tag">{a.spec}</span></div>
              <p className="mt-3 text-base leading-relaxed">{a.use}</p>
              {a.pair && <p className="mt-1 text-base">Caption: {a.pair}</p>}
              <div className="mt-auto flex flex-wrap gap-2.5 pt-5">
                <a className="btn btn-outline btn-sm" href={`${base}/${a.file}${ver(a)}`} download={a.file}>Download JPG</a>
                {a.pdf && <a className="btn btn-blue btn-sm" href={`${base}/${a.pdf}${ver(a)}`} download={a.pdf}>Print PDF</a>}
              </div>
            </div>
            <ChangeBox asset={`${keyBase}/${a.id}`} title={a.title} />
          </article>
        ))}
      </div>
      {open !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/95 p-4 backdrop-blur" role="dialog" aria-modal aria-label={items[open].title} onClick={() => setOpen(null)}>
          <div className="relative h-[82vh] w-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <Image src={`${base}/${items[open].file}${ver(items[open])}`} alt={items[open].title} fill sizes="100vw" className="object-contain drop-shadow-[0_24px_48px_rgba(74,74,74,.35)]" />
          </div>
          <button ref={closeRef} className="btn btn-blue btn-sm absolute right-5 top-5" onClick={() => setOpen(null)}>Close <Icon name="close" /></button>
          <p className="absolute bottom-5 left-1/2 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-[1.25rem] border border-gray bg-white px-4 py-1.5 text-center text-base leading-snug">{items[open].id} · {items[open].title}<span className="hidden md:inline"> — use the arrow keys to browse</span></p>
        </div>
      )}
    </>
  );
}
