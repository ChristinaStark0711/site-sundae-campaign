import { SCENARIO } from "@/content/palette";

export type ScenarioName = "conservative" | "base" | "aggressive";
export const KS: ScenarioName[] = ["conservative", "base", "aggressive"];
// phones get one card per scenario instead of a four-column table; the base case leads
export const KS_PHONE: ScenarioName[] = ["base", "conservative", "aggressive"];
export const money = (v: number) => "$" + Math.round(v).toLocaleString("en-US");

export const Key = ({ k }: { k: ScenarioName }) => {
  const s = SCENARIO[k];
  return <svg width="24" height="10" aria-hidden className="shrink-0"><line x1="1" x2="23" y1="5" y2="5" stroke={s.color} strokeWidth={4} strokeLinecap="round" strokeDasharray={"dash" in s ? "6 4" : undefined} /></svg>;
};

export const ScenarioCard = ({ k, sub, rows }: { k: ScenarioName; sub?: string; rows: [string, string][] }) => (
  <div className={`card p-5 ${k === "base" ? "!border-blue" : ""}`}>
    <p className="flex items-center gap-2.5 font-bold"><Key k={k} />{SCENARIO[k].name}</p>
    {sub && <p className="mt-0.5 text-base">{sub}</p>}
    <dl className="tnum mt-3 text-base leading-snug">
      {rows.map(([l, v]) => <div key={l} className="flex items-baseline justify-between gap-4 border-b border-gray py-2.5 last:border-b-0"><dt>{l}</dt><dd className="shrink-0 text-right font-bold">{v}</dd></div>)}
    </dl>
  </div>
);
