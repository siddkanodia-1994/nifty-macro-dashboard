// GitHub Actions: fetches live prices from niftyindices.com blob and writes to Vercel Blob.
// Runs every 5 min during market hours (3:00–10:59 UTC Mon–Fri).
import { put } from "@vercel/blob";

const LIVE_URL = "https://iislliveblob.niftyindices.com/jsonfiles/LiveIndicesWatch.json";

const INDEX_NAME_MAP = {
  "NIFTY 50":        "NIFTY_50",
  "NIFTY BANK":      "NIFTY_BANK",
  "NIFTY IT":        "NIFTY_IT",
  "NIFTY MIDCAP 150":"NIFTY_MIDCAP_150",
  "NIFTY PSU BANK":  "NIFTY_PSU_BANK",
  "NIFTY MICROCAP250":"NIFTY_MICROCAP_250",
  "NIFTY SMLCAP 250":"NIFTY_SMALLCAP_250",
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

const res = await fetch(LIVE_URL, {
  headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
});
if (!res.ok) {
  console.error(`Failed to fetch live data: ${res.status}`);
  process.exit(1);
}

const json = await res.json();
const prices = {};

for (const entry of json.data ?? []) {
  const key = INDEX_NAME_MAP[entry.indexName];
  if (!key) continue;
  const price = parseFloat(String(entry.last).replace(/,/g, ""));
  prices[key] = isNaN(price) ? null : price;
  console.log(`${key}: ${prices[key]}`);
}

const anyValid = Object.values(prices).some((p) => p !== null);
if (!anyValid) {
  console.error("All prices null — skipping blob write.");
  process.exit(1);
}

await put(
  "live-prices.json",
  JSON.stringify({ ...prices, marketOpen: true, asOf: new Date().toISOString() }),
  { access: "public", allowOverwrite: true, contentType: "application/json" }
);

console.log("Written to Vercel Blob.");
