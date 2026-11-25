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

### 2. Data
`data/historical.json`, `byey.json` and `usdinr.json` are committed and kept current by
GitHub Actions — nothing to generate. (The original Excel import scripts are in
`scripts/archive/`.)

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

## Daily Data Updates

`.github/workflows/update-eod.yml` fetches the day's data, commits any changes and
pushes — Vercel redeploys automatically.

| Data | Source | Script |
|------|--------|--------|
| Index close / P/E / P/B (EOD) | niftyindices.com Daily Snapshot CSV (`/Daily_Snapshot/ind_close_all_DDMMYYYY.csv`), Playwright fallback | `scripts/fetch-eod.py` |
| India 10Y yield → BY-EY | Trading Economics (current value, written only for the last completed session) | `scripts/fetch-byey.py` |
| USD/INR daily close | Yahoo Finance chart API `USDINR=X` (re-syncs the last month every run) | `scripts/fetch-usdinr.py` |
| Live prices (market hours) | NSE `allIndices` API via `/api/refresh-live-prices` → Upstash Redis | cron-job.org, every minute |

**Triggers.** cron-job.org calls the `workflow_dispatch` API at ~6:30 PM and ~8:00 PM
IST on weekdays. Two GitHub `schedule` crons are a backup only — GitHub routinely
fires them 8–11 hours late. Runs never overlap (`concurrency: update-eod`).

**Catch-up.** With no `--date`, `fetch-eod.py` fetches every NSE trading day in the last
7 days (IST) that is missing or incomplete, so a late or skipped run is harmless.

**Holiday calendar.** `data/nse-holidays.json` is shared by the site (`lib/marketHours.ts`)
and the scripts (`scripts/nse_calendar.py`). Add each new year from the NSE circular
published in December — from 1 January the workflow fails (and GitHub emails you) until
the current year is listed.

**Monitoring.** `GET /api/health` returns 503 when the deployed EOD data is more than 6 h
behind the last market close, or live prices are over 10 min old during market hours.
cron-job.org polls it with failure notifications on.

### Manual runs
Repo → **Actions** → **Update EOD Data** → **Run workflow** (optionally with a date), or locally:
```bash
pip install -r scripts/requirements.txt
python scripts/fetch-eod.py                    # catch up recent trading days
python scripts/fetch-eod.py --date 2026-04-15  # one specific date
python scripts/fetch-usdinr.py                 # re-sync USD/INR (last month)
```

### Owner mode
Open the site once with `?key=<CRON_SECRET>` to edit and publish projections, BY-EY
calculator inputs and Macro Score values. The key is moved into the tab's
`sessionStorage` and removed from the address bar.

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
  historical.json       Index EOD history; updated daily
  byey.json, usdinr.json  Bond yield / BY-EY spread and USD/INR history
  nse-holidays.json     NSE trading holidays (site + scripts)
scripts/
  fetch-eod.py, fetch-byey.py, fetch-usdinr.py   Daily fetchers (GitHub Actions)
  nse_calendar.py       IST / trading-day helpers; run directly to check the calendar
  archive/              One-off historical scripts (not run)
.github/workflows/
  update-eod.yml        Daily data update (dispatched by cron-job.org)
  fetch-live-prices.yml Manual live-price refresh
```
