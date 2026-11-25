import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { isMarketOpen, istDate, lastCompletedSession, LIVE_STALE_MS } from "@/lib/marketHours";
import historicalData from "@/data/historical.json";
import byeyData from "@/data/byey.json";
import usdinrData from "@/data/usdinr.json";

// EOD data for a session is expected on the site within this long after its 3:30 PM
// close (niftyindices publishes ~6 PM IST; the update runs ~6:30 and ~8 PM IST).
const EOD_GRACE_MS = 6 * 60 * 60 * 1000;
// USD/INR closes land a day after they happen (the current day's bar is still
// trading), so weekends and holidays can leave the latest row a few days old.
const USDINR_MAX_AGE_DAYS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const redis = Redis.fromEnv();

/**
 * Uptime check for cron-job.org: 200 when healthy, 503 with the reasons when not.
 * - EOD: the deployed historical.json must include the last completed session.
 * - BY-EY: byey.json must have a row for the latest EOD date (bond yield fetched).
 * - USD/INR: usdinr.json's latest close must be at most 5 days old.
 * - Live: during market hours, the Redis quotes must be under 10 minutes old.
 */
export async function GET() {
  const now = new Date();
  const problems: string[] = [];

  const latestEod = (historicalData as { date: string }[]).at(-1)?.date ?? null;
  const expectedEod = lastCompletedSession(new Date(now.getTime() - EOD_GRACE_MS));
  if (!latestEod || latestEod < expectedEod) {
    problems.push(`EOD data stale: latest ${latestEod}, expected ${expectedEod}`);
  }

  const latestByey = (byeyData as { date: string }[]).at(-1)?.date ?? null;
  if (latestEod && (!latestByey || latestByey < latestEod)) {
    problems.push(`BY-EY data stale: latest ${latestByey}, EOD ${latestEod}`);
  }

  const latestUsdInr = (usdinrData as { date: string }[]).at(-1)?.date ?? null;
  const usdInrAgeDays = latestUsdInr
    ? Math.round((Date.parse(istDate(now)) - Date.parse(latestUsdInr)) / DAY_MS)
    : null;
  if (usdInrAgeDays == null || usdInrAgeDays > USDINR_MAX_AGE_DAYS) {
    problems.push(`USD/INR data stale: latest ${latestUsdInr}`);
  }

  let liveAsOf: string | null = null;
  if (isMarketOpen(now)) {
    try {
      const data = await redis.get<{ asOf?: string }>("live-prices");
      liveAsOf = data?.asOf ?? null;
    } catch {}
    if (!liveAsOf || now.getTime() - new Date(liveAsOf).getTime() > LIVE_STALE_MS) {
      problems.push(`Live prices stale: last update ${liveAsOf ?? "never"}`);
    }
  }

  return NextResponse.json(
    { ok: problems.length === 0, problems, latestEod, expectedEod, latestByey, latestUsdInr, liveAsOf },
    { status: problems.length ? 503 : 200, headers: { "Cache-Control": "no-store" } }
  );
}
