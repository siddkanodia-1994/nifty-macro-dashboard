#!/usr/bin/env python3
"""
fetch-byey.py

Fetches India 10Y government bond yield from investing.com (via Playwright) for one or
more dates, reads Nifty 50 close + PE from data/historical.json, computes
Earnings Yield (EY = 1/PE) and BY-EY spread (bondYield − EY), then appends
missing rows to data/byey.json.

This script is designed to run AFTER fetch-eod.py so that historical.json
already contains the day's Nifty 50 PE before this script reads it.

Usage:
    python scripts/fetch-byey.py                    # today
    python scripts/fetch-byey.py --date 2026-04-14  # specific date
    python scripts/fetch-byey.py --backfill 10      # last 10 calendar days
"""

from __future__ import annotations

import json
import os
import sys
import argparse
from datetime import datetime, date, timedelta

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
BYEY_PATH    = os.path.join(PROJECT_ROOT, "data", "byey.json")
HIST_PATH    = os.path.join(PROJECT_ROOT, "data", "historical.json")

INVESTING_URL = (
    "https://in.investing.com/rates-bonds/india-10-year-bond-yield-historical-data"
)


def fetch_bond_yields(days: int = 60) -> dict[str, float]:
    """
    Scrape India 10Y bond yield from investing.com via Playwright.
    Returns {ISO_date: yield_as_decimal} e.g. {"2026-04-16": 0.068990}.

    The page loads ~25 rows by default (≈1 trading month).
    Column layout:  col[0] = date as DD-MM-YYYY
                    col[1] = closing yield as a percentage string (e.g. "6.899")
    Divide col[1] by 100 to get the decimal yield (0.068990).
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERROR: playwright not installed. Run: pip install playwright && playwright install chromium")
        sys.exit(1)

    yield_map: dict[str, float] = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_extra_http_headers({
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        })
        try:
            page.goto(INVESTING_URL, timeout=30_000)
            page.wait_for_selector("table", timeout=15_000)
        except Exception as e:
            print(f"WARNING: Playwright page load failed: {e}")
            browser.close()
            return {}

        rows = page.query_selector_all("table tr")
        for row in rows:
            cells = [c.inner_text().strip() for c in row.query_selector_all("td")]
            if len(cells) < 2:
                continue
            try:
                d_str = datetime.strptime(cells[0], "%d-%m-%Y").strftime("%Y-%m-%d")
                raw_val = cells[1].replace(",", "").replace("%", "").strip()
                yield_map[d_str] = round(float(raw_val) / 100, 6)
            except (ValueError, IndexError):
                continue

        browser.close()

    if days > 25 and len(yield_map) < days:
        print(
            f"  NOTE: Requested {days} days of yield history but only {len(yield_map)} rows "
            f"available from the default page load (~25 rows). "
            f"Dates further back may be missing."
        )

    return yield_map


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch India 10Y bond yield and append BY-EY rows to byey.json"
    )
    parser.add_argument("--date", default=None,
                        help="Specific date to fetch (YYYY-MM-DD)")
    parser.add_argument("--backfill", type=int, default=0,
                        help="Fetch last N calendar days (0 = today only)")
    args = parser.parse_args()

    # Build list of target dates (ascending)
    if args.backfill > 0:
        today = date.today()
        target_dates = [
            (today - timedelta(days=i)).isoformat()
            for i in range(args.backfill, -1, -1)
        ]
    elif args.date:
        target_dates = [args.date]
    else:
        target_dates = [date.today().isoformat()]

    # Load existing data files
    with open(BYEY_PATH) as f:
        byey_data: list[dict] = json.load(f)
    with open(HIST_PATH) as f:
        hist_data: list[dict] = json.load(f)

    existing_dates = {r["date"] for r in byey_data}
    hist_map       = {r["date"]: r for r in hist_data}

    # Fetch bond yield history (page shows ~25 rows; covers daily automation + short backfills)
    fetch_days = max(args.backfill + 15, 30)
    print(f"Fetching India 10Y bond yield from investing.com (Playwright)...")
    yield_map = fetch_bond_yields(days=fetch_days)

    if yield_map:
        print(f"  Received {len(yield_map)} dates: {min(yield_map)} → {max(yield_map)}")
    else:
        print("  No bond yield data returned — cannot proceed.")
        sys.exit(1)

    added = 0
    for target_date in target_dates:
        if target_date in existing_dates:
            print(f"  {target_date}: already in byey.json — skip")
            continue

        hist_row = hist_map.get(target_date)
        if hist_row is None:
            print(f"  {target_date}: not in historical.json — skip (weekend/holiday or EOD not yet fetched)")
            continue

        bond_yield = yield_map.get(target_date)
        if bond_yield is None:
            print(f"  {target_date}: bond yield not available from investing.com — skip")
            continue

        n50   = hist_row.get("NIFTY_50") or {}
        close = n50.get("close")
        pe    = n50.get("pe")

        # Derive PE from close ÷ impliedEPS if not stored directly
        if pe is None and close and n50.get("impliedEPS"):
            pe = round(close / n50["impliedEPS"], 6)

        ey     = round(1.0 / pe, 6)        if pe         else None
        spread = round(bond_yield - ey, 6) if ey is not None else None

        byey_data.append({
            "date":      target_date,
            "close":     close,
            "pe":        round(pe, 6) if pe else None,
            "ey":        ey,
            "bondYield": bond_yield,
            "spread":    spread,
        })
        existing_dates.add(target_date)
        added += 1

        print(
            f"  {target_date}: close={close}, pe={round(pe, 3) if pe else None}, "
            f"ey={round(ey * 100, 3) if ey else None}%, "
            f"bondYield={round(bond_yield * 100, 3)}%, "
            f"spread={round(spread * 100, 4) if spread is not None else None}%"
        )

    if added == 0:
        print("No new rows added.")
        sys.exit(0)

    # Sort by date and write back
    byey_data.sort(key=lambda r: r["date"])
    with open(BYEY_PATH, "w") as f:
        json.dump(byey_data, f, indent=2)

    last = byey_data[-1]
    print(f"\nWritten {added} new row(s) → {BYEY_PATH}")
    print(f"Date range: {byey_data[0]['date']} → {last['date']}")
    print(
        f"Last row: pe={last['pe']}, ey={last['ey']}, "
        f"bondYield={last['bondYield']}, spread={last['spread']}"
    )


if __name__ == "__main__":
    main()
