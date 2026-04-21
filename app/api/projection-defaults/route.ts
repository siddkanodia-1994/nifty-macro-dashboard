import { NextResponse } from "next/server";
import { put, list, del } from "@vercel/blob";

const BLOB_KEY = "projection-defaults.json";

export async function GET() {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY });
    if (!blobs.length) return NextResponse.json(null);
    // list() returns ascending by uploadedAt — always read the newest blob
    const latest = blobs.sort(
      (a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )[0];
    const res = await fetch(latest.url, { cache: "no-store" });
    if (!res.ok) return NextResponse.json(null);
    return NextResponse.json(await res.json(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(null);
  }
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  try {
    const { blobs: existing } = await list({ prefix: BLOB_KEY });
    if (existing.length > 0) await del(existing.map((b) => b.url));
  } catch {}
  await put(BLOB_KEY, JSON.stringify(body), {
    access: "public", allowOverwrite: true, contentType: "application/json",
  });
  return NextResponse.json({ ok: true });
}
