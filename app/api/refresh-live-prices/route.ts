import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { isMarketOpen } from "@/lib/marketHours";
import type { IndexKey } from "@/lib/types";

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";

const YAHOO_SYMBOLS: Record<IndexKey, string> = {
  NIFTY_50:           "^NSEI",
  NIFTY_BANK:         "^NSEBANK",
  NIFTY_IT:           "^CNXIT",
  NIFTY_MIDCAP_150:   "NIFTYMIDCAP150.NS",
  NIFTY_PSU_BANK:     "^CNXPSUBANK",
  NIFTY_MICROCAP_250: "NIFTY_MICROCAP250.NS",
  NIFTY_SMALLCAP_250: "NIFTYSMLCAP250.NS",
};

async function fetchPrice(symbol: string): Promise<number | null> {
  try {
    const res = await fetch(
      `${YAHOO_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json,text/plain,*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://finance.yahoo.com",
          "Origin": "https://finance.yahoo.com",
        },
        next: { revalidate: 0 },
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" ? price : null;
  } catch {
    return null;
  }
}

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

  const entries = Object.entries(YAHOO_SYMBOLS) as [IndexKey, string][];
  const results = await Promise.all(
    entries.map(async ([key, symbol]) => [key, await fetchPrice(symbol)] as const)
  );

  const prices: Partial<Record<IndexKey, number | null>> = {};
  for (const [key, price] of results) prices[key] = price;

  await put(
    "live-prices.json",
    JSON.stringify({ ...prices, marketOpen: true, asOf: now.toISOString() }),
    { access: "public", allowOverwrite: true, contentType: "application/json" }
  );

  return NextResponse.json({ ok: true, asOf: now.toISOString(), prices });
}
