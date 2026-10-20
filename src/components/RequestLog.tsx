import type { ChangeRequest } from "@/lib/content";
import { apDate } from "@/lib/format";

const STATUS: Record<ChangeRequest["status"], [string, string]> = {
  done: ["Done", "bg-blue text-white border-blue"],
  held: ["Waiting for approval", "bg-white text-ink border-blue"],
  failed: ["Couldn't apply", "bg-white text-ink border-slate"],
};

// The change requests for one library, newest first, as written by the creative-change workflow (src/content/requests/).
// Dates are the Pacific-time day the request was sent. A held request says what kind of change waits (never the new
// words themselves) and its id; its proposal and preview stay in the repo (engine/held/), where the owner looks before
// approving (engine/change/README.md), so a held proposal never puts a number, address or claim on the hub. Every held
// request is listed first and never drops off; the others show the newest 40, the older ones behind a "show" toggle.
const pacificDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
// A request is shown as typed, except web and email addresses, phone numbers and @handles: anyone with the link can type
// into the change box, and the log shouldn't repeat a contact for them.
const masked = (t: string) => t
  .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[email]")
  .replace(/(?:https?:\/\/)?\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.[a-z][a-z0-9-]{1,23}\b(?:\/\S*)?/gi, "[link]")
  .replace(/\+?\d[\d\s().-]{6,}\d/g, "[number]")
  .replace(/@[A-Za-z0-9_.]{2,}/g, "[handle]");
const SHOWN = 40;
function Item({ r }: { r: ChangeRequest }) {
  const [label, cls] = STATUS[r.status];
  return (
    <li className="card grid gap-3 p-5 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-6 md:p-6">
      <div className="text-base leading-snug">
        <span className={`inline-flex rounded-full border-2 px-3 py-0.5 font-bold ${cls}`}>{label}</span>
        <p className="mt-2.5">{apDate(pacificDay(r.at))}</p>
        <p className="mt-0.5">{r.mode === "variant" ? "New variation" : "Update"}{r.result && r.mode === "variant" ? ` · ${r.result.id}` : ""}{r.approved ? " · approved" : ""}</p>
      </div>
      <div className="min-w-0 text-base leading-relaxed">
        <p className="break-words font-bold">{r.assetTitle ?? r.asset.split("/").pop()} <span className="font-normal">({r.asset.split("/").slice(-2).join(" ")})</span></p>
        <p className="mt-1 break-words">&ldquo;{masked(r.text)}&rdquo;</p>
        {r.summary && r.status === "done" && <p className="mt-2 break-words">{r.summary}</p>}
        {r.reason && <p className="mt-2 break-words">{r.reason}</p>}
        {r.status === "held" && r.proposal && <p className="mt-2 break-words">A proposal is ready for the account owner to review; nothing changes on the hub until it is approved.</p>}
        <p className="mt-2 text-base">Request {r.id}</p>
      </div>
    </li>
  );
}
export default function RequestLog({ requests }: { requests: ChangeRequest[] }) {
  if (!requests.length) return <p className="card-mist max-w-3xl p-6 text-lg leading-relaxed">No change requests yet. Type a change in the box under any image, flyer, video or Reel and it shows up here once it has been worked on.</p>;
  const held = requests.filter((r) => r.status === "held");
  const rest = requests.filter((r) => r.status !== "held");
  const older = rest.slice(SHOWN);
  return (
    <>
      <ol className="grid gap-4">{[...held, ...rest.slice(0, SHOWN)].map((r) => <Item key={r.id} r={r} />)}</ol>
      {older.length > 0 && (
        <details className="group mt-6">
          <summary className="btn btn-outline btn-sm [&::-webkit-details-marker]:hidden"><span><span className="group-open:hidden">Show</span><span className="hidden group-open:inline">Hide</span> {older.length} older {older.length === 1 ? "request" : "requests"}</span></summary>
          <ol className="mt-6 grid gap-4">{older.map((r) => <Item key={r.id} r={r} />)}</ol>
        </details>
      )}
    </>
  );
}
