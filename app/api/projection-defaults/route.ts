import { NextResponse } from "next/server";
import { put, list } from "@vercel/blob";

const BLOB_KEY = "projection-defaults.json";

export async function GET() {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY });
    if (!blobs.length) return NextResponse.json(null);
    const res = await fetch(blobs[0].url, { cache: "no-store" });
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
  await put(BLOB_KEY, JSON.stringify(body), {
    access: "public", allowOverwrite: true, contentType: "application/json",
  });
  return NextResponse.json({ ok: true });
}
