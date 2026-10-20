import Link from "next/link";
import { Icon } from "@/components/Icon";

export type PlanLink = { href: string; title: string };
export type PlanGroup = { name: string; links: PlanLink[] };

// One plan: the sidebar of plan groups (this set's plans plus links across to the other sets), the rendered markdown and
// a "Next" link to the following plan in the same set.
export default function PlanView({ groups, current, tag, title, blurb, html, next }: { groups: PlanGroup[]; current: string; tag: string; title: string; blurb: string; html: string; next?: PlanLink }) {
  return (
    <main className="mx-auto grid max-w-7xl gap-12 px-5 py-14 md:px-8 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-16">
      <aside className="lg:sticky lg:top-28 lg:h-[calc(100vh-8rem)] lg:overflow-auto">
        <nav aria-label="Plans" className="grid gap-7 rounded-[1.25rem] bg-mist p-5">
          {groups.map((g) => (
            <div key={g.name}><p className="eyebrow px-3">{g.name}</p><ul className="mt-2 grid gap-1">{g.links.map((p) => (
              <li key={p.href}><Link href={p.href} aria-current={p.href === current ? "page" : undefined} className={`block rounded-xl px-3 py-2.5 text-base leading-snug transition-colors ${p.href === current ? "bg-blue font-bold text-white" : "hover:bg-white"}`}>{p.title}</Link></li>
            ))}</ul></div>
          ))}
        </nav>
      </aside>
      <article className="min-w-0">
        <header className="border-b border-gray pb-10">
          {/* an event's tag ("City · Event name") can be wider than a 360px phone: it wraps (a rounded box) instead of widening the page */}
          <span className="tag max-w-full whitespace-normal rounded-[1.25rem]">{tag}</span>
          <h1 className="display h-bar h-bar-lg mt-5 text-[clamp(2.25rem,4.2vw,3.5rem)]">{title}</h1>
          <p className="lede mt-5 max-w-3xl">{blurb}</p>
        </header>
        <div className="prose prose-lg prose-plan mt-10 max-w-none prose-h2:mt-14 prose-h2:text-[2rem] prose-h3:text-[1.3125rem]" dangerouslySetInnerHTML={{ __html: html }} />
        {next && <div className="mt-16 flex justify-end border-t border-gray pt-10"><Link href={next.href} className="btn btn-blue whitespace-normal text-left">Next: {next.title} <Icon name="arrow-right" /></Link></div>}
      </article>
    </main>
  );
}
