import { getBrandPlans, getEvents, type EventRec } from "./content";
import { apDate } from "./format";
import type { PlanGroup } from "@/components/PlanView";

const eventLabel = (e: EventRec) => `${e.city} · ${apDate(e.date)}`;

// Sidebar groups for the plan pages. An event's plans list that event's set first, then the always-on membership plans;
// the always-on plans list their own groups, then one link per event that has plans.
export const brandGroups = (): PlanGroup[] => {
  const plans = getBrandPlans();
  return Array.from(new Set(plans.map((p) => p.group ?? "Membership engine"))).map((g) => ({
    name: g, links: plans.filter((p) => (p.group ?? "Membership engine") === g).map((p) => ({ href: `/plans/${p.slug}`, title: p.title })),
  }));
};
export const eventPlanGroup = (e: EventRec): PlanGroup => ({ name: eventLabel(e), links: e.plans.map((p) => ({ href: `/events/${e.slug}/plans/${p.slug}`, title: p.title })) });
export const eventIndexGroup = (): PlanGroup => ({
  name: "Event plans",
  links: getEvents().filter((e) => e.plans.length).map((e) => ({ href: `/events/${e.slug}/plans/${e.plans[0].slug}`, title: eventLabel(e) })),
});
