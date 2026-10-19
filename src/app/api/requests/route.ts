// POST /api/requests: a change request from the box under a creative. It is checked here, then handed to the
// creative-change GitHub workflow (repository_dispatch), which does the work and commits the result.
// Needs GITHUB_DISPATCH_TOKEN (a fine-grained token with Contents: read and write on this repo) set in Vercel;
// without it the box answers 503 "not switched on" and the request is not sent.
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO = process.env.GITHUB_REPO || "GabrealMDHindley/site-sundae-campaign";
const KEY = /^(brand|events\/[a-z0-9]+(?:-[a-z0-9]+)*)\/(images|flyers|videos|reels)\/[A-Z0-9]{1,6}$/;
const LIMIT = 6, WINDOW = 10 * 60 * 1000; // per IP: 6 requests every 10 minutes (best effort, per server instance)
const hits = new Map<string, number[]>();

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  // same-origin only: the box on this site, not a form elsewhere
  const origin = req.headers.get("origin"), host = req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return bad("Not allowed.", 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("Send the request as JSON."); }
  const asset = String(body.asset ?? ""), mode = String(body.mode ?? ""), text = String(body.text ?? "").replace(/\s+/g, " ").trim();
  if (body.website) return NextResponse.json({ id: "ok" }); // honeypot: quietly drop bots
  if (!KEY.test(asset)) return bad("Unknown asset.");
  if (mode !== "update" && mode !== "variant") return bad("Choose Update or New variation.");
  if (text.length < 3) return bad("Describe the change in a few words.");
  if (text.length > 500) return bad("Keep the change under 500 characters.");

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW);
  if (recent.length >= LIMIT) return bad("Too many requests from this device. Try again in a few minutes.", 429);

  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return bad("Automatic changes aren't switched on yet.", 503);

  const d = new Date(now);
  const id = d.toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-") + "-" + Math.random().toString(36).slice(2, 6);
  const r = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", "User-Agent": "sundae-hub" },
    body: JSON.stringify({ event_type: "creative-change", client_payload: { id, asset, mode, text, at: d.toISOString() } }),
  }).catch(() => null);
  if (!r || r.status !== 204) {
    console.error("dispatch failed", r?.status, r ? await r.text().catch(() => "") : "network");
    return bad("The request couldn't be sent to the build service. Try again in a minute.", 502);
  }
  recent.push(now); hits.set(ip, recent);
  return NextResponse.json({ id });
}
