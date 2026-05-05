// GitHub Actions: fetches live prices from NSE India API and writes to Upstash Redis.
// Runs every 5 min during market hours (3:00–10:59 UTC Mon–Fri).
import { Redis } from "@upstash/redis";

const INDEX_NAME_MAP = {
  "NIFTY 50":            "NIFTY_50",
  "NIFTY BANK":          "NIFTY_BANK",
  "NIFTY IT":            "NIFTY_IT",
  "NIFTY MIDCAP 150":    "NIFTY_MIDCAP_150",
  "NIFTY PSU BANK":      "NIFTY_PSU_BANK",
  "NIFTY MICROCAP 250":  "NIFTY_MICROCAP_250",
  "NIFTY SMALLCAP 250":  "NIFTY_SMALLCAP_250",
  "NIFTY AUTO":          "NIFTY_AUTO",
  "NIFTY FIN SERVICE":   "NIFTY_FIN_SERVICE",
  "NIFTY REALTY":        "NIFTY_REALTY",
  "NIFTY METAL":         "NIFTY_METAL",
  "NIFTY CAPITAL MARKETS": "NIFTY_CAPITAL_MARKETS",
  "NIFTY INDIA DEFENCE": "NIFTY_INDIA_DEFENCE",
};

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "application/json,text/plain,*/*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.nseindia.com",
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

// Establish NSE session to get cookies
const sessionRes = await fetch("https://www.nseindia.com", { headers: HEADERS });
const rawCookies = sessionRes.headers.getSetCookie?.() ?? [];
const cookieHeader = rawCookies.map((c) => c.split(";")[0]).join("; ");

// Fetch live index data
const dataRes = await fetch("https://www.nseindia.com/api/allIndices", {
  headers: { ...HEADERS, Cookie: cookieHeader },
});
if (!dataRes.ok) {
  console.error(`NSE API failed: ${dataRes.status}`);
  process.exit(1);
}

const json = await dataRes.json();
const prices = {};

for (const entry of json.data ?? []) {
  const key = INDEX_NAME_MAP[entry.index];
  if (!key) continue;
  const price = parseFloat(String(entry.last).replace(/,/g, ""));
  prices[key] = isNaN(price) ? null : price;
  console.log(`${key}: ${prices[key]}`);
}

const anyValid = Object.values(prices).some((p) => p !== null);
if (!anyValid) {
  console.error("All prices null — skipping write.");
  process.exit(1);
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

await redis.set("live-prices", { ...prices, marketOpen: true, asOf: new Date().toISOString() });

console.log("Written to Upstash Redis.");
