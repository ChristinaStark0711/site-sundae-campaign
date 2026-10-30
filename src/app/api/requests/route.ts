// POST /api/requests: a change request from the box under a creative. It is checked here, then handed to the
// creative-change GitHub workflow (workflow_dispatch), which does the work and commits the result to main.
// Needs GITHUB_DISPATCH_TOKEN in Vercel: a fine-grained token for this one repository with Actions: Read and write
// (enough to start the workflow and read its runs; it cannot push code). Without it the box answers 503 "not switched
// on" and the request is not sent.
import { NextResponse } from "next/server";
import index from "@/generated/asset-keys.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO = process.env.GITHUB_REPO || "ChristinaStark0711/site-sundae-campaign";
const WORKFLOW = "creative-change.yml";
const DAILY_CAP = Number(process.env.CHANGE_DAILY_CAP || 100); // raised from 30 for "Change all" (2026-10-27); keep in step with engine/change/process.mjs
const MAX_BATCH = 60;
const KEYS = new Set<string>(index.keys);
const LIMIT = 6, WINDOW = 10 * 60 * 1000; // per IP: 6 requests every 10 minutes (best effort, per server instance)
const hits = new Map<string, number[]>();
// keep in step with CREDENTIALS in engine/change/lib.mjs (the workflow redacts with it and the guard refuses with it)
const CREDENTIAL = /\bsk-ant-[A-Za-z0-9_-]{6,}|\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}|github_pat_[A-Za-z0-9_]{10,}|gh[pousr]_[A-Za-z0-9]{10,}|glpat-[\w-]{20,}|npm_[A-Za-z0-9]{36}|hf_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{12,}|ASIA[0-9A-Z]{12,}|xox[abpr]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|ya29\.[\w-]{20,}|SG\.[\w-]{16,}\.[\w-]{16,}|eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}|[sr]k_(?:live|test)_[0-9A-Za-z]{10,}|SK[0-9a-fA-F]{32}|-----BEGIN [A-Z ]*PRIVATE KEY|(?<![\w/.#@-])(?=[A-Za-z0-9+/=_-]*\d)(?=[A-Za-z0-9+/=_-]*[a-z])(?=[A-Za-z0-9+/=_-]*[A-Z])[A-Za-z0-9+/=_-]{40,}/;

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
  // one asset (its own box), or "Change all": a list of assets from one library, each sent as its own run
  const batch = Array.isArray(b.assets);
  const assets = batch ? [...new Set((b.assets as unknown[]).map((x) => String(x)))] : [String(b.asset ?? "")];
  const mode = String(b.mode ?? "");
  const text = String(b.text ?? "").toWellFormed().replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim(); // no control characters
  if (!assets.length || assets.length > MAX_BATCH) return bad("Choose between 1 and 60 assets.");
  if (assets.some((a) => !KEYS.has(a))) return bad("Unknown asset. Refresh the page and try again.");
  const scopeOf = (a: string) => a.split("/").slice(0, -2).join("/");
  if (new Set(assets.map(scopeOf)).size > 1) return bad("Change all works on one library at a time. Refresh the page and try again.");
  if (mode !== "update" && mode !== "variant") return bad("Choose Update or New variation.");
  if (text.length < 3) return bad("Describe the change in a few words.");
  if (text.length > 500) return bad("Keep the change under 500 characters.");
  if (CREDENTIAL.test(text)) return bad("Part of this looks like a key or token. Remove it and send again; requests are shown publicly in the change log.");

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
  const left = DAILY_CAP - (runs.total_count ?? 0);
  if (left <= 0) return bad(`Today's limit of ${DAILY_CAP} changes is reached. Try again tomorrow.`, 429);
  // busy: a run for this asset, or an owner's approval (its asset isn't in its name), is waiting or running, whatever
  // day it started (a run from before midnight UTC is not in today's list)
  type Run = { status: string; display_title: string };
  const open = await Promise.all(["queued", "in_progress", "waiting", "pending", "requested"].map((st) => gh(token, `/actions/workflows/${WORKFLOW}/runs?status=${st}&per_page=100`).then((r) => (r.ok ? r.json() : null)).catch(() => null)));
  if (open.some((o) => !o)) return bad("The build service didn't answer. Try again in a minute.", 502);
  const active = [...(runs.workflow_runs ?? []), ...open.flatMap((o) => o.workflow_runs ?? [])].filter((w: Run) => w.status !== "completed");
  if (active.some((w: Run) => w.display_title.startsWith("Creative change: approve"))) return bad("An approval is being applied. Try again in a few minutes.", 409);
  const isBusy = (a: string) => active.some((w: Run) => w.display_title === `Creative change: ${a}`);
  const todo = assets.filter((a) => !isBusy(a)), skipped = assets.filter(isBusy);
  if (!todo.length) return bad(batch ? "Every asset you picked already has a change being made. Try again once those show up (about 10 minutes)." : "A change to this asset (or an approval) is already being made. Try again once it shows up (about 10 minutes).", 409);
  if (todo.length > left) return bad(`That's ${todo.length} changes, but only ${left} of today's ${DAILY_CAP} are left. Pick fewer assets or try again tomorrow.`, 429);

  const ids: string[] = [];
  for (const asset of todo) {
    const id = new Date(now).toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-") + "-" + Math.random().toString(36).slice(2, 6).padEnd(4, "0");
    const r = await gh(token, `/actions/workflows/${WORKFLOW}/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref: "main", inputs: { asset, request: JSON.stringify({ id, mode, text, at: new Date(now).toISOString() }) } }),
    }).catch(() => null);
    if (!r || r.status !== 204) {
      console.error("dispatch failed", r?.status, r ? (await r.text().catch(() => "")).slice(0, 300) : "network");
      if (!ids.length) return bad("The request couldn't be sent to the build service. Try again in a minute.", 502);
      skipped.push(...todo.slice(todo.indexOf(asset))); // the rest weren't sent; the ones already sent still run
      break;
    }
    ids.push(id);
  }
  recent.push(now); hits.set(ip, recent);
  return NextResponse.json(batch ? { ids, skipped } : { id: ids[0] });
}
