import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { isMarketOpen } from "@/lib/marketHours";

const STALE_MS       = 10 * 60 * 1000; // 10 min during market hours
const POST_CLOSE_MS  =  7 * 60 * 60 * 1000; // 7 h after close (covers until ~10:30 PM IST)

const redis = Redis.fromEnv();

export async function GET() {
  const now = new Date();
  const marketOpen = isMarketOpen(now);

  if (!marketOpen) {
    // After close: serve last known prices from today's session if fresh enough
    try {
      const data = await redis.get<Record<string, unknown>>("live-prices");
      if (!data) throw new Error("no data");
      const ageMs = now.getTime() - new Date(data.asOf as string).getTime();
      if (ageMs > POST_CLOSE_MS) throw new Error("stale day");
      return NextResponse.json(
        { ...data, marketOpen: false, bondYield: null },
        { headers: { "Cache-Control": "no-store" } }
      );
    } catch {
      return NextResponse.json(
        { marketOpen: false },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  // Market is open — enforce 10-min staleness
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
