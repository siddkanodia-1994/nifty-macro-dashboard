import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { isMarketOpen } from "@/lib/marketHours";

const STALE_MS = 10 * 60 * 1000; // 10 min — accommodates GH Actions 5-min fallback

const redis = Redis.fromEnv();

export async function GET() {
  const now = new Date();

  if (!isMarketOpen(now)) {
    return NextResponse.json(
      { marketOpen: false },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const data = await redis.get<Record<string, unknown>>("live-prices");
    if (!data) throw new Error("no data");

    if (now.getTime() - new Date(data.asOf as string).getTime() > STALE_MS) throw new Error("stale");

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
