import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { isMarketOpen } from "@/lib/marketHours";
import type { IndexKey } from "@/lib/types";

const LIVE_URL = "https://iislliveblob.niftyindices.com/jsonfiles/LiveIndicesWatch.json";

const INDEX_NAME_MAP: Record<string, IndexKey> = {
  "NIFTY 50":         "NIFTY_50",
  "NIFTY BANK":       "NIFTY_BANK",
  "NIFTY IT":         "NIFTY_IT",
  "NIFTY MIDCAP 150": "NIFTY_MIDCAP_150",
  "NIFTY PSU BANK":   "NIFTY_PSU_BANK",
  "NIFTY MICROCAP250":"NIFTY_MICROCAP_250",
  "NIFTY SMLCAP 250": "NIFTY_SMALLCAP_250",
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : new URL(request.url).searchParams.get("token");

  if (!secret || token !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  if (!isMarketOpen(now)) {
    return NextResponse.json({ skipped: true, reason: "market closed" });
  }

  try {
    const res = await fetch(LIVE_URL, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      next: { revalidate: 0 },
    });
    if (!res.ok) throw new Error(`niftyindices fetch failed: ${res.status}`);

    const json = await res.json();
    const prices: Partial<Record<IndexKey, number | null>> = {};

    for (const entry of json.data ?? []) {
      const key = INDEX_NAME_MAP[entry.indexName];
      if (!key) continue;
      const price = parseFloat(String(entry.last).replace(/,/g, ""));
      prices[key] = isNaN(price) ? null : price;
    }

    const anyValid = Object.values(prices).some((p) => p !== null);
    if (!anyValid) {
      return NextResponse.json({ skipped: true, reason: "all prices null" });
    }

    await put(
      "live-prices.json",
      JSON.stringify({ ...prices, marketOpen: true, asOf: now.toISOString() }),
      { access: "public", allowOverwrite: true, contentType: "application/json" }
    );

    return NextResponse.json({ ok: true, asOf: now.toISOString(), prices });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
}
