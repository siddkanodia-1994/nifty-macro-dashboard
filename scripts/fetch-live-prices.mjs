// GitHub Actions fallback: fetches Yahoo Finance prices and writes to Vercel Blob.
// Runs every 5 min during market hours (cron-job.org handles the 1-min primary).
import { put } from "@vercel/blob";

const SYMBOLS = {
  NIFTY_50:           "^NSEI",
  NIFTY_BANK:         "^NSEBANK",
  NIFTY_IT:           "^CNXIT",
  NIFTY_MIDCAP_150:   "NIFTYMIDCAP150.NS",
  NIFTY_PSU_BANK:     "^CNXPSUBANK",
  NIFTY_MICROCAP_250: "NIFTY_MICROCAP250.NS",
  NIFTY_SMALLCAP_250: "NIFTYSMLCAP250.NS",
};

function isMarketOpen() {
  const now = new Date();
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const istTotal = utcMin + 330;
  const istMin = istTotal % 1440;
  const istDay = istTotal >= 1440 ? (now.getUTCDay() + 1) % 7 : now.getUTCDay();
  return istDay >= 1 && istDay <= 5 && istMin >= 555 && istMin <= 930;
}

if (!isMarketOpen()) {
  console.log("Market closed — skipping.");
  process.exit(0);
}

async function fetchPrice(symbol) {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "application/json,text/plain,*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "Referer": "https://finance.yahoo.com",
          "Origin": "https://finance.yahoo.com",
        },
      }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const p = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return typeof p === "number" ? p : null;
  } catch {
    return null;
  }
}

const prices = {};
for (const [key, sym] of Object.entries(SYMBOLS)) {
  prices[key] = await fetchPrice(sym);
  console.log(`${key}: ${prices[key]}`);
}

await put(
  "live-prices.json",
  JSON.stringify({ ...prices, marketOpen: true, asOf: new Date().toISOString() }),
  { access: "public", allowOverwrite: true, contentType: "application/json" }
);

console.log("Written to Vercel Blob.");
