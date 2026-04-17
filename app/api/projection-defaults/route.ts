import { NextResponse } from "next/server";

const KV_KEY = "nifty-projection-defaults";

// GET — return owner defaults (no auth needed)
export async function GET() {
  try {
    const { kv } = await import("@vercel/kv");
    const defaults = await kv.get(KV_KEY);
    return NextResponse.json(defaults ?? null, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    // KV not configured in this environment
    return NextResponse.json(null, { headers: { "Cache-Control": "no-store" } });
  }
}

// POST — save owner defaults (PIN required)
export async function POST(req: Request) {
  try {
    const { kv } = await import("@vercel/kv");
    const { pin, defaults } = await req.json();
    if (!process.env.OWNER_PIN || pin !== process.env.OWNER_PIN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    await kv.set(KV_KEY, defaults);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "KV unavailable" }, { status: 503 });
  }
}
