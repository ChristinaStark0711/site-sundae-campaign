"use client";
import { useId, useState } from "react";
import { Icon } from "./Icon";

// The "request a change" box under every creative. It posts to /api/requests, which starts the creative-change
// workflow in GitHub; the workflow edits this asset's source, re-renders it, checks it against the brand rules and
// pushes, and the site redeploys with the new file (an update) or a new card beside this one (a variation).
type Mode = "update" | "variant";
// The form's name carries the asset's kind and id ("Meet your host, image 02"), since an image and a video can share a title
const KIND: Record<string, string> = { images: "image", flyers: "flyer", videos: "video", reels: "Reel" };
// "sent" keeps the mode the request went out with, so the confirmation stays right if the radio is changed afterwards
type State = { kind: "idle" | "sending" } | { kind: "sent"; id: string; mode: Mode } | { kind: "error"; msg: string; offline?: boolean };

export default function ChangeBox({ asset, title, video = false }: { asset: string; title: string; video?: boolean }) {
  const uid = useId();
  const [text, setText] = useState("");
  const [mode, setMode] = useState<Mode>("update");
  const [hp, setHp] = useState("");
  const [st, setSt] = useState<State>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const busy = st.kind === "sending";
  const [kind, id] = asset.split("/").slice(-2);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim().length < 3 || busy) return;
    setSt({ kind: "sending" });
    try {
      const r = await fetch("/api/requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ asset, mode, text: text.trim(), website: hp }) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.id) { setSt({ kind: "sent", id: j.id, mode }); setText(""); return; }
      if (r.status === 503) setSt({ kind: "error", offline: true, msg: "Automatic changes aren't switched on yet, so this request wasn't sent. Copy it and send it to the studio." });
      else setSt({ kind: "error", msg: j.error || "That didn't go through. Try again in a minute." });
    } catch { setSt({ kind: "error", msg: "That didn't go through. Check the connection and try again." }); }
  }

  const copy = async () => {
    try { await navigator.clipboard.writeText(`Change request — ${title} (${asset})\n${mode === "variant" ? "New variation" : "Update"}: ${text.trim()}`); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };

  return (
    <form onSubmit={send} className="border-t border-gray bg-mist px-6 pb-6 pt-5" aria-label={`Request a change to ${title}, ${KIND[kind] ?? kind} ${id}`}>
      <label htmlFor={`${uid}-t`} className="text-base font-bold">Request a change</label>
      {/* three rows for videos: their longer example wraps to three lines in the narrow Reel cards (768-1279px) */}
      <textarea id={`${uid}-t`} value={text} onChange={(e) => setText(e.target.value)} rows={video ? 3 : 2} maxLength={500} required minLength={3}
        placeholder={video ? "e.g. Make the last scene say “Final seats”" : "e.g. Make the headline bigger"}
        className="mt-2 block w-full resize-y rounded-xl border border-slate bg-white px-3.5 py-2.5 text-base leading-snug text-ink placeholder:text-ink focus:border-blue" />
      {/* honeypot: hidden from people, filled by bots */}
      <input type="text" name="website" value={hp} onChange={(e) => setHp(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden className="absolute left-[-9999px] h-px w-px opacity-0" />
      <fieldset className="mt-3">
        <legend className="sr-only">What should happen</legend>
        <div className="flex flex-wrap gap-2">
          {([["update", "Update this one"], ["variant", "New variation"]] as const).map(([v, l]) => (
            <label key={v} className={`cursor-pointer rounded-full border-2 px-3.5 py-1.5 text-base font-bold leading-tight transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-blue ${mode === v ? "border-blue bg-blue text-white" : "border-slate bg-white text-ink hover:border-blue"}`}>
              <input type="radio" name={`${uid}-m`} value={v} checked={mode === v} onChange={() => setMode(v)} className="sr-only" />{l}
            </label>
          ))}
          <button type="submit" disabled={busy || text.trim().length < 3} className="btn btn-blue btn-sm ml-auto disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Sending…" : "Send"}<Icon name="arrow-right" /></button>
        </div>
      </fieldset>
      <p className="mt-2.5 text-base leading-snug" aria-live="polite">
        {st.kind === "idle" && <>{mode === "variant" ? "A new version with your change appears next to this one." : "This one is replaced with your change."} Requests are listed publicly in the change log below.</>}
        {st.kind === "sending" && "Sending your request…"}
        {st.kind === "sent" && <>Sent. The {st.mode === "variant" ? "variation shows up next to this one" : "updated version shows up here"} in about {video ? "15 to 20" : "5 to 10"} minutes. Refresh then. Request <span className="font-bold">{st.id}</span>.</>}
        {st.kind === "error" && <>{st.msg}{st.offline && text.trim() && <> <button type="button" onClick={copy} className="link">{copied ? "Copied" : "Copy request"}</button></>}</>}
      </p>
    </form>
  );
}
