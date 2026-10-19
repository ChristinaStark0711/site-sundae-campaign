// POST /api/requests: a change request from the box under a creative. It is checked here, then handed to the
// creative-change GitHub workflow (workflow_dispatch), which does the work and commits the result to main.
// Needs GITHUB_DISPATCH_TOKEN in Vercel: a fine-grained token for this one repository with Actions: Read and write
// (enough to start the workflow and read its runs; it cannot push code). Without it the box answers 503 "not switched
// on" and the request is not sent.
import { NextResponse } from "next/server";
import index from "@/generated/asset-keys.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO = process.env.GITHUB_REPO || "GabrealMDHindley/site-sundae-campaign";
const WORKFLOW = "creative-change.yml";
const DAILY_CAP = Number(process.env.CHANGE_DAILY_CAP || 30);
const KEYS = new Set<string>(index.keys);
const LIMIT = 6, WINDOW = 10 * 60 * 1000; // per IP: 6 requests every 10 minutes (best effort, per server instance)
const hits = new Map<string, number[]>();
// keep in step with CREDENTIALS in engine/change/lib.mjs (the workflow redacts with it and the guard refuses with it)
const CREDENTIAL = /sk-ant-[A-Za-z0-9_-]{6,}|github_pat_[A-Za-z0-9_]{10,}|gh[pousr]_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{12,}|ASIA[0-9A-Z]{12,}|xox[abpr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|[sr]k_(?:live|test)_[0-9A-Za-z]{10,}|SK[0-9a-fA-F]{32}|-----BEGIN [A-Z ]*PRIVATE KEY|(?=[A-Za-z0-9/+=]*\d)(?=[A-Za-z0-9/+=]*[a-z])(?=[A-Za-z0-9/+=]*[A-Z])[A-Za-z0-9/+=]{32,}/;

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
const gh = (token: string, url: string, init?: RequestInit) => fetch(`https://api.github.com/repos/${REPO}${url}`, {
  ...init, headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", "User-Agent": "sundae-hub" },
});

export async function POST(req: Request) {
  // the box on this site only: a browser always sends Origin on a POST, and it must be this host
  const origin = req.headers.get("origin"), host = req.headers.get("host");
  let sameOrigin = false;
  try { sameOrigin = !!origin && !!host && new URL(origin).host === host; } catch { sameOrigin = false; }
  if (!sameOrigin) return bad("Not allowed.", 403);

  let body: unknown;
  try { body = await req.json(); } catch { return bad("Send the request as JSON."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("Send the request as JSON.");
  const b = body as Record<string, unknown>;
  if (b.website) return NextResponse.json({ id: "ok" }); // honeypot: quietly drop bots
  const asset = String(b.asset ?? ""), mode = String(b.mode ?? ""), text = String(b.text ?? "").replace(/\s+/g, " ").trim();
  if (!KEYS.has(asset)) return bad("Unknown asset. Refresh the page and try again.");
  if (mode !== "update" && mode !== "variant") return bad("Choose Update or New variation.");
  if (text.length < 3) return bad("Describe the change in a few words.");
  if (text.length > 500) return bad("Keep the change under 500 characters.");
  if (CREDENTIAL.test(text)) return bad("Remove the key or password from the request. Requests are shown publicly in the change log.");

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW);
  if (recent.length >= LIMIT) return bad("Too many requests from this device. Try again in a few minutes.", 429);

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return bad("Automatic changes aren't switched on yet.", 503);

  // today's runs (the daily cap) and whether this asset already has a change waiting or running
  const day = new Date(now).toISOString().slice(0, 10);
  const runs = await gh(token, `/actions/workflows/${WORKFLOW}/runs?created=%3E%3D${day}&per_page=100`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (!runs) return bad("The build service didn't answer. Try again in a minute.", 502);
  if ((runs.total_count ?? 0) >= DAILY_CAP) return bad(`Today's limit of ${DAILY_CAP} changes is reached. Try again tomorrow.`, 429);
  const busy = (runs.workflow_runs ?? []).some((w: { status: string; display_title: string }) => w.status !== "completed" && w.display_title === `Creative change: ${asset}`);
  if (busy) return bad("A change to this asset is already being made. Try again once it shows up (about 10 minutes).", 409);

  const id = new Date(now).toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-") + "-" + Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  const r = await gh(token, `/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs: { asset, request: JSON.stringify({ id, mode, text, at: new Date(now).toISOString() }) } }),
  }).catch(() => null);
  if (!r || r.status !== 204) {
    console.error("dispatch failed", r?.status, r ? (await r.text().catch(() => "")).slice(0, 300) : "network");
    return bad("The request couldn't be sent to the build service. Try again in a minute.", 502);
  }
  recent.push(now); hits.set(ip, recent);
  return NextResponse.json({ id });
}
