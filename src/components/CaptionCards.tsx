import CopyButton from "@/components/CopyButton";
import { Arrowed } from "@/components/Icon";
import type { Caption } from "@/lib/content";

export default function CaptionCards({ captions }: { captions: Caption[] }) {
  return (
    <div className="mt-10 grid gap-6 md:grid-cols-2" data-stagger>
      {captions.map((c) => {
        const full = c.text + (c.hashtags ? "\n\n" + c.hashtags : "");
        return (
          <article key={c.id} className="card flex flex-col p-7">
            <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-base font-bold"><span className="mr-2 inline-flex rounded-md bg-ink px-2 py-0.5 text-white">{c.id}</span><Arrowed text={c.title} /></span><span className="tag">{c.platform}</span></div>
            <p className="mt-5 flex-1 whitespace-pre-line text-lg leading-relaxed"><Arrowed text={c.text} /></p>
            {c.hashtags && <p className="mt-4 text-base font-bold leading-relaxed">{c.hashtags}</p>}
            <div className="mt-6 flex items-center justify-between gap-4 border-t border-gray pt-5"><span className="text-base">Pair with: {c.pair}</span><CopyButton text={full} /></div>
          </article>
        );
      })}
    </div>
  );
}
