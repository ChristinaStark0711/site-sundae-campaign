import Image from "next/image";
import type { ChangeRequest } from "@/lib/content";
import { apDate } from "@/lib/format";

const STATUS: Record<ChangeRequest["status"], [string, string]> = {
  done: ["Done", "bg-blue text-white border-blue"],
  held: ["Waiting for approval", "bg-white text-ink border-blue"],
  failed: ["Couldn't apply", "bg-white text-ink border-slate"],
};

// The change requests for one library, newest first, as written by the creative-change workflow (src/content/requests/).
// Dates are the Pacific-time day the request was sent. A held request with a proposal shows its preview: the owner
// approves exactly that (engine/change/README.md).
const pacificDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
export default function RequestLog({ requests }: { requests: ChangeRequest[] }) {
  if (!requests.length) return <p className="card-mist max-w-3xl p-6 text-lg leading-relaxed">No change requests yet. Type a change in the box under any image, flyer, video or Reel and it shows up here once it has been worked on.</p>;
  return (
    <ol className="grid gap-4">
      {requests.slice(0, 40).map((r) => {
        const [label, cls] = STATUS[r.status];
        return (
          <li key={r.id} className="card grid gap-3 p-5 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-6 md:p-6">
            <div className="text-base leading-snug">
              <span className={`inline-flex rounded-full border-2 px-3 py-0.5 font-bold ${cls}`}>{label}</span>
              <p className="mt-2.5">{apDate(pacificDay(r.at))}</p>
              <p className="mt-0.5">{r.mode === "variant" ? "New variation" : "Update"}{r.result && r.mode === "variant" ? ` · ${r.result.id}` : ""}{r.approved ? " · approved" : ""}</p>
            </div>
            <div className="min-w-0 text-base leading-relaxed">
              <p className="break-words font-bold">{r.assetTitle ?? r.asset.split("/").pop()} <span className="font-normal">({r.asset.split("/").slice(-2).join(" ")})</span></p>
              <p className="mt-1 break-words">&ldquo;{r.text}&rdquo;</p>
              {r.summary && r.status !== "failed" && <p className="mt-2 break-words">{r.status === "held" ? `Proposed: ${r.summary}` : r.summary}</p>}
              {r.reason && <p className="mt-2 break-words">{r.reason}</p>}
              {r.status === "held" && r.proposal && (
                <a href={r.proposal.preview} target="_blank" rel="noopener" className="mt-3 inline-block w-40 overflow-hidden rounded-xl border border-gray bg-mist" aria-label={`Preview of the proposed change, request ${r.id}`}>
                  <Image src={r.proposal.preview} alt="" width={320} height={320} className="h-auto w-full" />
                </a>
              )}
              <p className="mt-2 text-base">Request {r.id}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
