"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// The tab row under an event's title bar: the event's own overview, creative, captions, plans and projections.
export default function EventTabs({ slug, firstPlan }: { slug: string; firstPlan?: string }) {
  const path = usePathname();
  const b = `/events/${slug}`;
  const tabs: [string, string, string][] = [[b, "Overview", b], [`${b}/creative`, "Creative", `${b}/creative`], [`${b}/captions`, "Captions", `${b}/captions`]];
  if (firstPlan) tabs.push([`${b}/plans/${firstPlan}`, "Plans", `${b}/plans`]);
  tabs.push([`${b}/projections`, "Projections", `${b}/projections`]);
  return (
    <nav aria-label="Event sections" className="scroll-x -mx-5 px-5 md:mx-0 md:px-0">
      <div className="flex w-max gap-1.5 pb-1">
        {tabs.map(([href, label, match]) => {
          const on = match === b ? path === b : path.startsWith(match);
          return <Link key={href} href={href} aria-current={on ? "page" : undefined} className={`rounded-full px-4 py-2 text-base font-bold transition-colors ${on ? "bg-blue text-white" : "bg-white text-ink hover:bg-gray"}`}>{label}</Link>;
        })}
      </div>
    </nav>
  );
}
