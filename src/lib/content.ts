// Server-only content loader. Everything the hub shows lives under src/content/ as plain files, so a new event is
// one new folder (src/content/events/<slug>/) and no code changes:
//   brand/                    always-on Sundae Membership engine (library.json, captions.json, plans.json + plans/, projections.json)
//   events/<slug>/            one event (event.json, library.json, captions.json, plans/, projections.json)
//   cities.json               city photos and their licence credits, keyed by city slug
//   requests/<id>.json        change requests written by the creative-change workflow
// Pages are statically generated, so these reads happen at build time.
import fs from "node:fs";
import path from "node:path";
import { isUpcoming } from "./format";

const ROOT = path.join(process.cwd(), "src/content");
const read = <T,>(p: string, fallback?: T): T => {
  const f = path.join(ROOT, p);
  if (!fs.existsSync(f)) { if (fallback !== undefined) return fallback; throw new Error(`missing content file ${p}`); }
  return JSON.parse(fs.readFileSync(f, "utf8")) as T;
};

export type Asset = { id: string; title: string; file: string; spec: string; use: string; pair?: string; pdf?: string; poster?: string; dur?: string; aspect?: string; variantOf?: string; rev?: number; updated?: string };
export const KINDS = ["images", "flyers", "videos", "reels"] as const;
export type Kind = (typeof KINDS)[number];
export type Library = Record<Kind, Asset[]>;
export type Caption = { id: string; platform: string; pair: string; title: string; text: string; hashtags?: string };
export type PlanMeta = { slug: string; file: string; title: string; blurb: string; group?: string };
export type Credit = { title: string; creator: string; creatorUrl: string | null; license: string; licenseUrl: string; sourceUrl: string; provider?: string };
export type City = { name: string; state: string; file: string; width: number; height: number; alt: string; focus?: string; credit: Credit };
export type EventRec = {
  slug: string; kind: "campaign" | "record"; name: string; audience: string;
  city: string; state: string; citySlug: string; date: string; time?: string;
  venue: string; space?: string; address?: string; host: string; hostTitle?: string; rsvp?: string; media: string;
  prepared?: string; headline?: string; summary: string; strategy?: string; creativeNote?: string; sources?: string;
  moves?: [string, string][]; movesLabel?: string; plans: PlanMeta[]; photo?: { file: string; alt: string; credit: string };
  _todo?: string[];
  actuals?: { attendees?: number; applications?: number; intro_calls?: number; members_signed?: number; ad_spend?: number; note?: string } | null;
};
type Scenario = Record<string, number> & { assumptions: Record<string, number> };
export type EventProjections = { generated: string; notes: string[]; seat_cap: number; scenarios: Record<"conservative" | "base" | "aggressive", Scenario> };
export type ChangeRequest = {
  id: string; at: string; asset: string; assetTitle?: string; mode: "update" | "variant"; text: string; name?: string;
  status: "done" | "held" | "failed"; summary?: string; reason?: string; result?: { id: string; file: string }; proposal?: { preview: string; changes: string[]; variantTitle?: string }; approved?: boolean; finishedAt?: string;
};

// A scope is "brand" or an event slug. Asset keys are "<scope path>/<kind>/<id>", e.g. "events/<slug>/images/01" or "brand/reels/R8".
export const scopePath = (scope: string) => (scope === "brand" ? "brand" : `events/${scope}`);
export const assetKey = (scope: string, kind: Kind, id: string) => `${scopePath(scope)}/${kind}/${id}`;

export function getEvents(): EventRec[] {
  const dir = path.join(ROOT, "events");
  return fs.readdirSync(dir).filter((d) => fs.existsSync(path.join(dir, d, "event.json")))
    .map((d) => read<EventRec>(`events/${d}/event.json`))
    .filter((e) => !e._todo?.length) // a scaffolded event stays hidden until its _todo list is empty (engine/tools/new-event.mjs)
    .sort((a, b) => b.date.localeCompare(a.date));
}
export const getEvent = (slug: string) => getEvents().find((e) => e.slug === slug);
export const splitEvents = (events: EventRec[], now = Date.now()) => ({
  upcoming: events.filter((e) => isUpcoming(e.date, now)).reverse(), // soonest first
  past: events.filter((e) => !isUpcoming(e.date, now)), // most recent first
});

const EMPTY: Library = { images: [], flyers: [], videos: [], reels: [] };
export const getLibrary = (scope: string): Library => ({ ...EMPTY, ...read<Partial<Library>>(`${scopePath(scope)}/library.json`, {}) });
export const mediaBase = (scope: string) => (scope === "brand" ? "/media" : getEvent(scope)?.media ?? `/media/events/${scope}`);
export const getCaptions = (scope: string) => read<Caption[]>(`${scopePath(scope)}/captions.json`, []);
export const getBrandPlans = () => read<PlanMeta[]>("brand/plans.json");
export const planMarkdown = (scope: string, file: string) => fs.readFileSync(path.join(ROOT, scopePath(scope), "plans", file), "utf8");
export const getEventProjections = (slug: string) => read<EventProjections | null>(`events/${slug}/projections.json`, null);
export const getCities = () => read<Record<string, City>>("cities.json", {});

// Counts for headings: variations are listed beside their original and do not add to the count.
export const originals = (a: Asset[]) => a.filter((x) => !x.variantOf);
export const libraryCount = (lib: Library) => originals(lib.images).length + originals(lib.flyers).length + originals(lib.videos).length + originals(lib.reels).length;

export function getRequests(scope?: string): ChangeRequest[] {
  const dir = path.join(ROOT, "requests");
  if (!fs.existsSync(dir)) return [];
  const prefix = scope ? scopePath(scope) + "/" : "";
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
    .map((f) => read<ChangeRequest>(`requests/${f}`))
    .filter((r) => r.asset.startsWith(prefix))
    .sort((a, b) => b.at.localeCompare(a.at));
}
