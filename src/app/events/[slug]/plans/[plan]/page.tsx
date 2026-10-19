import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlanView from "@/components/PlanView";
import { getEvent, getEvents, planMarkdown } from "@/lib/content";
import { renderPlan } from "@/lib/plan";
import { brandGroups, eventPlanGroup } from "@/lib/planGroups";

export function generateStaticParams() { return getEvents().flatMap((e) => e.plans.map((p) => ({ slug: e.slug, plan: p.slug }))); }
export const dynamicParams = false;
export async function generateMetadata({ params }: { params: Promise<{ slug: string; plan: string }> }): Promise<Metadata> {
  const { slug, plan } = await params; const e = getEvent(slug); const p = e?.plans.find((x) => x.slug === plan);
  return { title: p && e ? `${p.title} · ${e.city}` : "Page not found" };
}

export default async function EventPlan({ params }: { params: Promise<{ slug: string; plan: string }> }) {
  const { slug, plan } = await params;
  const e = getEvent(slug);
  const p = e?.plans.find((x) => x.slug === plan);
  if (!e || !p) notFound();
  const i = e.plans.indexOf(p);
  const nx = e.plans[(i + 1) % e.plans.length];
  return (
    <PlanView groups={[eventPlanGroup(e), ...brandGroups()]} current={`/events/${slug}/plans/${plan}`} tag={`${e.city} · ${e.name}`} title={p.title} blurb={p.blurb}
      html={renderPlan(planMarkdown(slug, p.file))} next={e.plans.length > 1 ? { href: `/events/${slug}/plans/${nx.slug}`, title: nx.title } : undefined} />
  );
}
