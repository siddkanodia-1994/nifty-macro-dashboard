import { NextResponse } from "next/server";
import { isMarketOpen } from "@/lib/marketHours";
import type { IndexKey } from "@/lib/types";

// Yahoo Finance v8 chart endpoint
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
  const url = `${YAHOO_BASE}/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
      },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const price = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof price === "number" ? price : null;
  } catch {
    return null;
  }
}

// India 10Y Government Bond Yield — Yahoo Finance returns value as % (e.g. 6.87)
const BOND_YIELD_SYMBOL = "IN10YT=RR";

export async function GET() {
  const now = new Date();
  const marketOpen = isMarketOpen(now);

  if (!marketOpen) {
    return NextResponse.json(
      { marketOpen: false },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  // Fetch all 7 indices + bond yield in parallel
  const entries = Object.entries(YAHOO_SYMBOLS) as [IndexKey, string][];
  const [results, bondYieldRaw] = await Promise.all([
    Promise.all(
      entries.map(async ([key, symbol]) => {
        const price = await fetchPrice(symbol);
        return [key, price] as const;
      })
    ),
    fetchPrice(BOND_YIELD_SYMBOL),
  ]);

  const prices: Partial<Record<IndexKey, number | null>> = {};
  for (const [key, price] of results) {
    prices[key] = price;
  }

  // Yahoo returns bond yield as a percentage (e.g. 6.87) — convert to decimal (0.0687)
  const bondYield = bondYieldRaw != null ? bondYieldRaw / 100 : null;

  const asOf = now.toISOString();

  return NextResponse.json(
    { ...prices, bondYield, marketOpen: true, asOf },
    { headers: { "Cache-Control": "no-store" } }
  );
}
