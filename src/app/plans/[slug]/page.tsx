import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PlanView from "@/components/PlanView";
import { getBrandPlans, planMarkdown } from "@/lib/content";
import { renderPlan } from "@/lib/plan";
import { brandGroups, eventIndexGroup } from "@/lib/planGroups";

// The always-on membership plans. Event plans live under /events/<slug>/plans/ (the old /plans/event-* links redirect there).
export function generateStaticParams() { return getBrandPlans().map((p) => ({ slug: p.slug })); }
export const dynamicParams = false;
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params; const p = getBrandPlans().find((x) => x.slug === slug); return { title: p?.title ?? "Page not found" };
}

export default async function Plan({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const plans = getBrandPlans();
  const plan = plans.find((p) => p.slug === slug);
  if (!plan) notFound();
  const next = plans[(plans.indexOf(plan) + 1) % plans.length];
  const ev = eventIndexGroup();
  return (
    <PlanView groups={[...brandGroups(), ...(ev.links.length ? [ev] : [])]} current={`/plans/${slug}`} tag={plan.group ?? "Membership engine"} title={plan.title} blurb={plan.blurb}
      html={renderPlan(planMarkdown("brand", plan.file))} next={{ href: `/plans/${next.slug}`, title: next.title }} />
  );
}
