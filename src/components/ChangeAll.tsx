"use client";
import { useId, useState } from "react";
import { Icon } from "./Icon";

// "Change all": one request applied to every original asset in this library (or one kind of them). It posts the list to
// /api/requests, which starts one creative-change run per asset, so each asset is edited, checked against the brand
// rules and published on its own, exactly as if its own box had been used. Variations aren't included.
type Mode = "update" | "variant";
type Kind = "all" | "images" | "flyers" | "videos" | "reels";
const LABEL: Record<Kind, string> = { all: "Everything", images: "Images", flyers: "Flyers", videos: "Videos", reels: "Reels" };
type State = { kind: "idle" | "sending" } | { kind: "sent"; sent: number; skipped: number; mode: Mode } | { kind: "error"; msg: string };

export default function ChangeAll({ keys }: { keys: Record<Exclude<Kind, "all">, string[]> }) {
  const uid = useId();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("update");
  const [kind, setKind] = useState<Kind>("all");
  const [hp, setHp] = useState("");
  const [st, setSt] = useState<State>({ kind: "idle" });
  const all = [...keys.images, ...keys.flyers, ...keys.videos, ...keys.reels];
  const pick = kind === "all" ? all : keys[kind];
  const kinds = (["all", "images", "flyers", "videos", "reels"] as Kind[]).filter((k) => (k === "all" ? all : keys[k]).length);
  const busy = st.kind === "sending";
  const hasVideo = pick.some((k) => /\/(videos|reels)\//.test(k));

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 3 || busy || !pick.length) return;
    if (!window.confirm(`${mode === "variant" ? "Make a new variation of" : "Update"} all ${pick.length} ${kind === "all" ? "assets" : LABEL[kind].toLowerCase()} on this page with this change?`)) return;
    setSt({ kind: "sending" });
    try {
      const r = await fetch("/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assets: pick, mode, text: text.trim(), website: hp }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(j.ids)) { setSt({ kind: "sent", sent: j.ids.length, skipped: (j.skipped ?? []).length, mode }); setText(""); return; }
      setSt({ kind: "error", msg: r.status === 503 ? "Automatic changes aren't switched on yet, so nothing was sent." : j.error || "That didn't go through. Try again in a minute." });
    } catch { setSt({ kind: "error", msg: "That didn't go through. Check the connection and try again." }); }
  }

  if (!all.length) return null;
  return (
    <form onSubmit={send} className="card-mist mt-10 max-w-4xl p-6 md:p-7" aria-labelledby={`${uid}-h`}>
      <h2 id={`${uid}-h`} className="section-title text-[1.375rem]">Change all</h2>
      <p className="mt-2 text-base leading-relaxed">Type one change and apply it to every asset on this page at once, or to one kind of asset. Each one is made to fit Sundae&apos;s brand guidelines and published on its own, just like a change from its own box.</p>
      <label htmlFor={`${uid}-t`} className="mt-4 block text-base font-bold">The change</label>
      <textarea id={`${uid}-t`} value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={500} required minLength={3}
        placeholder="e.g. Change the button to say “Reserve your seat”"
        className="mt-2 block w-full resize-y rounded-xl border border-slate bg-white px-3.5 py-2.5 text-base leading-snug text-ink placeholder:text-ink focus:border-blue" />
      <input type="text" name="website" value={hp} onChange={(e) => setHp(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-px w-px opacity-0" />
      <fieldset className="mt-4">
        <legend className="text-base font-bold">Apply to</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {kinds.map((k) => (
            <label key={k} className={`cursor-pointer rounded-full border-2 px-3.5 py-1.5 text-base font-bold leading-tight transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue ${kind === k ? "border-blue bg-blue text-white" : "border-slate bg-white text-ink hover:border-blue"}`}>
              <input type="radio" name={`${uid}-k`} value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />{LABEL[k]} · {(k === "all" ? all : keys[k]).length}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-4">
        <legend className="sr-only">What should happen</legend>
        <div className="flex flex-wrap items-center gap-2">
          {([["update", "Update all"], ["variant", "New variation of each"]] as const).map(([v, l]) => (
            <label key={v} className={`cursor-pointer rounded-full border-2 px-3.5 py-1.5 text-base font-bold leading-tight transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue ${mode === v ? "border-blue bg-blue text-white" : "border-slate bg-white text-ink hover:border-blue"}`}>
              <input type="radio" name={`${uid}-m`} value={v} checked={mode === v} onChange={() => setMode(v)} className="sr-only" />{l}
            </label>
          ))}
          <button type="submit" disabled={busy || text.trim().length < 3} className="btn btn-blue btn-sm ml-auto disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Sending…" : `Change all (${pick.length})`}<Icon name="arrow-right" /></button>
        </div>
      </fieldset>
      <p className="mt-3 text-base leading-snug" aria-live="polite">
        {st.kind === "idle" && <>{mode === "variant" ? "A new version of each appears next to its original." : "Each one is replaced with your change."} Variations aren&apos;t included. Each request is listed in the change log below.</>}
        {st.kind === "sending" && "Sending your requests…"}
        {st.kind === "sent" && <>Sent {st.sent} {st.sent === 1 ? "request" : "requests"}{st.skipped ? ` (${st.skipped} skipped because ${st.skipped === 1 ? "it is" : "they are"} already being changed)` : ""}. They run side by side; the {st.mode === "variant" ? "new versions show up" : "updated versions show up"} over the next {hasVideo ? "20 to 40" : "10 to 20"} minutes. Refresh then.</>}
        {st.kind === "error" && st.msg}
      </p>
    </form>
  );
}
