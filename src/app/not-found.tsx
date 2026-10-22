import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { getEvents } from "@/lib/content";
import { apDate } from "@/lib/format";

// House-style 404 for unknown URLs and unknown plan or event links (shared links can go stale).
// Renders inside the root layout, so the nav (red wordmark) and footer stay in place.
// Its own title, so the tab and history don't read like the home page (Next uses a root not-found's metadata for every 404).
export const metadata: Metadata = { title: "Page not found" };
export default function NotFound() {
  const links = [
    ...getEvents().map((e) => ({ href: `/events/${e.slug}`, title: `${e.city} · ${apDate(e.date)}` })),
  ];
  return (
    <main className="mx-auto max-w-7xl px-5 md:px-8">
      <section className="grid gap-14 py-16 md:py-24 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-20" aria-labelledby="nf">
        <div>
          <p className="eyebrow">404 · Page not found</p>
          <h1 id="nf" className="display h-bar h-bar-lg mt-5 max-w-3xl text-balance text-[clamp(2.375rem,4.6vw,4rem)]">This page isn&apos;t here.</h1>
          <p className="lede mt-7 max-w-2xl text-pretty">The link may be mistyped or out of date. Every event is still one click away.</p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/" className="btn btn-blue">See the events <Icon name="arrow-right" /></Link>
          </div>
        </div>
        <nav aria-label="Events" className="card-mist self-start p-5 md:p-6">
          <p className="eyebrow px-3">Events</p>
          <ul className="mt-3 grid gap-1">
            {links.map((p) => (
              <li key={p.href}><Link href={p.href} className="block rounded-xl px-3 py-2.5 text-lg leading-snug transition-colors hover:bg-white">{p.title}</Link></li>
            ))}
          </ul>
        </nav>
      </section>
    </main>
  );
}
