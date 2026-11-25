/**
 * One-off script: adds the 6 new indices to the Redis projection-defaults blob.
 * Reads current Redis data via the production API, merges new entries, writes back.
 *
 * Usage:
 *   SITE_URL=https://your-app.vercel.app CRON_SECRET=your_secret node scripts/seed-new-index-projections.mjs
 */

const SITE_URL   = process.env.SITE_URL?.replace(/\/$/, "");
const CRON_SECRET = process.env.CRON_SECRET;

if (!SITE_URL || !CRON_SECRET) {
  console.error("Error: set SITE_URL and CRON_SECRET env vars before running.");
  process.exit(1);
}

// Defaults computed from the last available historical data row (May 2026)
// Format mirrors buildDefaults() in FutureProjectionPanel.tsx:
//   { path, bear: {multiple, growthPct}, base: {multiple, growthPct}, bull: {multiple, growthPct} }
// bear = base − 3, bull = base + 3 (matches ownerEpsOverride convention throughout the app)
function makeEntry(pe) {
  return {
    path: "pe_eps",
    bear: { multiple: parseFloat((pe - 3).toFixed(2)), growthPct: -3 },
    base: { multiple: parseFloat(pe.toFixed(2)),        growthPct:  0 },
    bull: { multiple: parseFloat((pe + 3).toFixed(2)), growthPct:  3 },
  };
}

const NEW_INDEX_DEFAULTS = {
  NIFTY_AUTO:           makeEntry(30.84),
  NIFTY_FIN_SERVICE:    makeEntry(16.70),
  NIFTY_REALTY:         makeEntry(37.76),
  NIFTY_METAL:          makeEntry(22.53),
  NIFTY_CAPITAL_MARKETS:makeEntry(47.38),
  NIFTY_INDIA_DEFENCE:  makeEntry(56.45),
};

// Step 1: fetch current Redis data
console.log(`Fetching current projection-defaults from ${SITE_URL}…`);
const getRes = await fetch(`${SITE_URL}/api/projection-defaults`, { cache: "no-store" });
if (!getRes.ok) {
  console.error(`GET failed: ${getRes.status} ${getRes.statusText}`);
  process.exit(1);
}
const current = (await getRes.json()) ?? {};
console.log(`Existing keys in Redis: ${Object.keys(current).join(", ")}`);

// Step 2: merge — new index defaults always win for the 6 new keys;
// existing owner-customised values win for all other keys
const merged = { ...current, ...NEW_INDEX_DEFAULTS };
console.log(`Merged keys: ${Object.keys(merged).join(", ")}`);

// Step 3: write back
console.log("Writing merged data back to Redis…");
const postRes = await fetch(`${SITE_URL}/api/projection-defaults`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${CRON_SECRET}`,
  },
  body: JSON.stringify(merged),
});

if (!postRes.ok) {
  const body = await postRes.text();
  console.error(`POST failed: ${postRes.status} — ${body}`);
  process.exit(1);
}

console.log("Done. New projection-defaults written to Redis.");
console.log("New index defaults added:");
for (const key of Object.keys(NEW_INDEX_DEFAULTS)) {
  const d = merged[key];
  console.log(`  ${key}: bear=${d.bear.multiple}x, base=${d.base.multiple}x, bull=${d.bull.multiple}x`);
}
