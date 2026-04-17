import { NextResponse } from "next/server";

const BLOB_PATHNAME = "projection-defaults.json";

// GET — return owner defaults (no auth needed)
export async function GET() {
  try {
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: BLOB_PATHNAME });
    const blob = blobs.find((b) => b.pathname === BLOB_PATHNAME);
    if (!blob) return NextResponse.json(null, { headers: { "Cache-Control": "no-store" } });

    const res = await fetch(blob.url, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json(null, { headers: { "Cache-Control": "no-store" } });
  }
}

// POST — save owner defaults (PIN required)
export async function POST(req: Request) {
  try {
    const { put } = await import("@vercel/blob");
    const { pin, defaults } = await req.json();
    if (!process.env.OWNER_PIN || pin !== process.env.OWNER_PIN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await put(BLOB_PATHNAME, JSON.stringify(defaults), {
      access: "public",
      allowOverwrite: true,
      contentType: "application/json",
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Blob unavailable" }, { status: 503 });
  }
}
