import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { isMarketOpen, lastCompletedSession, LIVE_STALE_MS } from "@/lib/marketHours";
import historicalData from "@/data/historical.json";

// EOD data for a session is expected on the site within this long after its 3:30 PM
// close (niftyindices publishes ~6 PM IST; the update runs ~6:30 and ~8 PM IST).
const EOD_GRACE_MS = 6 * 60 * 60 * 1000;

const redis = Redis.fromEnv();

/**
 * Uptime check for cron-job.org: 200 when healthy, 503 with the reasons when not.
 * - EOD: the deployed historical.json must include the last completed session.
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
    { ok: problems.length === 0, problems, latestEod, expectedEod, liveAsOf },
    { status: problems.length ? 503 : 200, headers: { "Cache-Control": "no-store" } }
  );
}
