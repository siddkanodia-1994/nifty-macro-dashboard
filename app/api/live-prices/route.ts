import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { isMarketOpen, LIVE_STALE_MS } from "@/lib/marketHours";

const POST_CLOSE_MS = 7 * 60 * 60 * 1000; // 7 h after close (covers until ~10:30 PM IST)

// Every visitor polls this once a minute; let the CDN share one Redis read per 30s.
const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" };

const redis = Redis.fromEnv();

/**
 * Latest live quotes from Redis. Prices are omitted when there is nothing fresh to
 * show (stale during market hours, or older than the post-close window) — that's a
 * normal state, so it returns 200, not an error.
 */
export async function GET() {
  const now = new Date();
  const marketOpen = isMarketOpen(now);

  try {
    const data = await redis.get<Record<string, unknown>>("live-prices");
    if (!data) throw new Error("no data");
    const ageMs = now.getTime() - new Date(data.asOf as string).getTime();
    if (ageMs > (marketOpen ? LIVE_STALE_MS : POST_CLOSE_MS)) {
      return NextResponse.json({ marketOpen, stale: true, asOf: data.asOf }, { headers: CACHE_HEADERS });
    }
    return NextResponse.json(
      {
        ...data,
        marketOpen,
        bondYield: (data.bondYield as number | null | undefined) ?? null,
        usdInr:    (data.usdInr    as number | null | undefined) ?? null,
      },
      { headers: CACHE_HEADERS }
    );
  } catch {
    return NextResponse.json({ marketOpen, stale: true, asOf: null }, { headers: CACHE_HEADERS });
  }
}
