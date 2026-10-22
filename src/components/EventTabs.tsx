"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

// The tab row under an event's title bar: the event's creative library and its captions (owner's choice, 2026-10-22).
export default function EventTabs({ slug }: { slug: string }) {
  const path = usePathname();
  const b = `/events/${slug}`;
  const tabs: [string, string, string][] = [[`${b}/creative`, "Creative", `${b}/creative`], [`${b}/captions`, "Captions", `${b}/captions`]];
  // on phones the row scrolls sideways and would always open at its start, hiding a later tab:
  // center the current tab in the row (the row only; the page itself doesn't move)
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const n = nav.current, a = n?.querySelector<HTMLElement>('[aria-current="page"]');
    if (n && a) n.scrollLeft += a.getBoundingClientRect().left - n.getBoundingClientRect().left - (n.clientWidth - a.offsetWidth) / 2;
  }, [path]);
  return (
    <nav ref={nav} aria-label="Event sections" className="scroll-x -mx-5 px-5 md:mx-0 md:px-0">
      <div className="flex w-max gap-1.5 pb-1">
        {tabs.map(([href, label, match]) => {
          const on = match === b ? path === b : path.startsWith(match);
          return <Link key={href} href={href} aria-current={on ? "page" : undefined} className={`rounded-full px-4 py-2 text-base font-bold transition-colors ${on ? "bg-blue text-white" : "bg-white text-ink hover:bg-gray"}`}>{label}</Link>;
        })}
      </div>
    </nav>
  );
}
