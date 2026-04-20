import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { isMarketOpen } from "@/lib/marketHours";
import type { IndexKey } from "@/lib/types";

const INDEX_NAME_MAP: Record<string, IndexKey> = {
  "NIFTY 50":           "NIFTY_50",
  "NIFTY BANK":         "NIFTY_BANK",
  "NIFTY IT":           "NIFTY_IT",
  "NIFTY MIDCAP 150":   "NIFTY_MIDCAP_150",
  "NIFTY PSU BANK":     "NIFTY_PSU_BANK",
  "NIFTY MICROCAP 250": "NIFTY_MICROCAP_250",
  "NIFTY SMALLCAP 250": "NIFTY_SMALLCAP_250",
};

const NSE_HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.nseindia.com",
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
    // Establish NSE session to get cookies
    const sessionRes = await fetch("https://www.nseindia.com", {
      headers: NSE_HEADERS,
      next: { revalidate: 0 },
    });
    const rawCookies = sessionRes.headers.getSetCookie?.() ?? [];
    const cookieHeader = rawCookies.map((c: string) => c.split(";")[0]).join("; ");

    // Fetch live index data
    const dataRes = await fetch("https://www.nseindia.com/api/allIndices", {
      headers: { ...NSE_HEADERS, Cookie: cookieHeader },
      next: { revalidate: 0 },
    });
    if (!dataRes.ok) throw new Error(`NSE API failed: ${dataRes.status}`);

    const json = await dataRes.json();
    const prices: Partial<Record<IndexKey, number | null>> = {};

    for (const entry of json.data ?? []) {
      const key = INDEX_NAME_MAP[entry.index];
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
