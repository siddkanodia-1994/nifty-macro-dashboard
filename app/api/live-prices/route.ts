import { NextResponse } from "next/server";
import { list } from "@vercel/blob";
import { isMarketOpen } from "@/lib/marketHours";

const STALE_MS = 10 * 60 * 1000; // 10 min — accommodates GH Actions 5-min fallback

export async function GET() {
  const now = new Date();

  if (!isMarketOpen(now)) {
    return NextResponse.json(
      { marketOpen: false },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const { blobs } = await list({ prefix: "live-prices.json" });
    if (!blobs.length) throw new Error("no blob");

    const res = await fetch(blobs[0].url, { cache: "no-store" });
    if (!res.ok) throw new Error("blob fetch failed");

    const data = await res.json();
    if (now.getTime() - new Date(data.asOf).getTime() > STALE_MS) throw new Error("stale");

    return NextResponse.json(
      { ...data, bondYield: null },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { marketOpen: false },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
