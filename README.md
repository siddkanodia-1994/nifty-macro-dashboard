# Nifty Macro Dashboard

A clean, light-mode financial dashboard showing P/E, P/B, Implied EPS, and Implied Book Value for 5 NSE India indices with 4 years of historical context, statistical Z-scores, and fixed Mean ± 1σ/2σ control bands.

**Indices covered:** NIFTY 50 · NIFTY BANK · NIFTY MIDCAP 150 · NIFTY SMALLCAP 250 · NIFTY IT

---

## Features

- 4+ years of daily EOD data (April 2022 → present)
- Per-index tabs with metric cards, interactive chart, and stats table
- Selectable time windows: 3M / 6M / 1Y / 2Y / 3Y / 5Y / ALL
- **Fixed control lines** — Mean, ±1σ, ±2σ computed from the *entire* dataset, constant across all time windows
- Z-score and percentile rank vs. the selected window
- Zero backend / no database — pure static JSON rebuilt daily by GitHub Actions

---

## Quick Start (Local)

### Prerequisites
- Node.js 18+
- Python 3.8+ with `pip`

### 1. Install dependencies
```bash
npm install
pip install openpyxl requests
```

### 2. Parse the Excel source data
The Excel file (`20260128 Index Levels- Adjusted Data vF.xlsx`) should be in the **parent** directory of this project. Run:
```bash
python scripts/parse-excel.py
```
This writes `data/historical.json` with all 999+ trading days.

To point at a different Excel path:
```bash
python scripts/parse-excel.py --excel /path/to/file.xlsx
```

### 3. Run the dev server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

---

## Deployment (Vercel)

1. Push this folder to a GitHub repository (as the repo root).
2. Connect the repo to [Vercel](https://vercel.com) — it auto-detects Next.js.
3. Deploy. No environment variables required.
4. Enable daily auto-updates (see below).

---

## Daily EOD Data Updates

Data lives in `data/historical.json`. GitHub Actions fetches new EOD data from **niftyindices.com** every weekday at **4:00 PM IST** (10:30 UTC), commits the updated JSON, and pushes — triggering an automatic Vercel redeploy.

### Setup
1. Ensure **Actions** are enabled in your GitHub repo (Settings → Actions → Allow all).
2. The workflow is at `.github/workflows/update-eod.yml` — no secrets needed.
3. In Vercel project settings, confirm "Auto deploy on push to main" is enabled.

### Manual trigger
Go to your repo → **Actions** → **Update EOD Data** → **Run workflow**.
Optionally specify a past date (YYYY-MM-DD) to backfill a missed trading day.

### Manual local update
```bash
python scripts/fetch-eod.py                    # today
python scripts/fetch-eod.py --date 2026-04-15  # specific date
git add data/historical.json
git commit -m "chore: update EOD data 2026-04-15"
git push
```

---

## Data Sources

| Data | Source | Script |
|------|--------|--------|
| Historical (Apr 2022 – Apr 2026) | Excel "Ace Formula" tab | `scripts/parse-excel.py` |
| EOD updates (from Apr 15, 2026) | niftyindices.com | `scripts/fetch-eod.py` |

### niftyindices.com API details

The EOD script POSTs to:
```
POST https://www.niftyindices.com/Backpage.aspx/getHistoricaldatatabletoString
{"name": "NIFTY 50", "startDate": "15-Apr-2026", "endDate": "15-Apr-2026"}
```

The script first GETs the homepage to establish a session cookie, then POSTs for each index. Index name strings:

| Key | niftyindices.com name |
|-----|----------------------|
| NIFTY_50 | `NIFTY 50` |
| NIFTY_BANK | `NIFTY BANK` |
| NIFTY_IT | `NIFTY IT` |
| NIFTY_MIDCAP_150 | `Nifty Midcap 150` |
| NIFTY_SMALLCAP_250 | `Nifty Smallcap 250` |

> If niftyindices.com changes their API, verify current field names via your browser's Network tab on [niftyindices.com/reports/historical-data](https://www.niftyindices.com/reports/historical-data) and update `scripts/fetch-eod.py` accordingly.

---

## historical.json Format

```json
[
  {
    "date": "2026-04-13",
    "NIFTY_50":           { "close": 23842.65, "pe": 20.93, "pb": 3.26, "impliedEPS": 1139.19, "impliedBV": 7313.70 },
    "NIFTY_BANK":         { "close": ..., "pe": ..., "pb": ..., "impliedEPS": ..., "impliedBV": ... },
    "NIFTY_MIDCAP_150":   { ... },
    "NIFTY_SMALLCAP_250": { ... },
    "NIFTY_IT":           { ... }
  }
]
```

`pe`, `pb`, `impliedEPS`, `impliedBV` may be `null` for early rows (Midcap 150 and Smallcap 250 lacked PE/PB data before mid-2022).

---

## Tech Stack

- **Next.js 15** (App Router, SSG) + TypeScript
- **Tailwind CSS** + **shadcn/ui** (light-only theme, zinc base)
- **Recharts** — ComposedChart with ReferenceLine control bands
- **date-fns** — window filtering
- **Python + openpyxl + requests** — data pipeline

---

## Project Structure

```
app/
  layout.tsx            Root layout (light mode locked)
  page.tsx              Server component — reads historical.json at build time
components/
  DashboardHeader       Sticky header with "Data as of" date
  IndexTabs             Tab bar + shared time window state
  IndexPanel            Cards + chart + stats per index
  MetricCard            KPI card: value, vs-mean delta, Z-score badge
  IndexChart            Recharts chart with fixed Mean ± 1σ/2σ bands
  StatsTable            Mean / SD / Current / Z-Score / Percentile grid
  TimeWindowSelector    3M 6M 1Y 2Y 3Y 5Y ALL buttons
lib/
  types.ts              TypeScript interfaces
  utils.ts              Formatters, constants
  calculations.ts       Pure stats (mean, SD, z-score, percentile, control lines)
data/
  historical.json       Generated by parse-excel.py; updated daily
scripts/
  parse-excel.py        One-time Excel → JSON converter
  fetch-eod.py          Daily EOD fetcher (GitHub Actions)
.github/workflows/
  update-eod.yml        Cron at 10:30 UTC weekdays
```
