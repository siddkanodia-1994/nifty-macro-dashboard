#!/usr/bin/env python3
"""
fetch-usdinr.py

Syncs USD/INR daily closing rates into data/usdinr.json from the Yahoo Finance v8
chart API (ticker USDINR=X), which returns dated daily closes.

Every run re-syncs the last month: missing weekdays are added and any stored rate
that differs from Yahoo's close is corrected. Weekends and the still-open current
UTC day are never written. (The old investing.com scrape blocked CI runners, and its
Trading Economics fallback copied one undated live quote across several days.)

Usage:
    python scripts/fetch-usdinr.py                         # re-sync the last month
    python scripts/fetch-usdinr.py --from-date 2022-04-01  # re-sync from a date
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone

import requests

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
USDINR_PATH  = os.path.join(PROJECT_ROOT, "data", "usdinr.json")

YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/USDINR=X"


def fetch_usdinr_yahoo(from_date: str) -> dict[str, float]:
    """{ISO_date: close} for completed weekday bars from from_date onward."""
    from_ts = int(datetime.strptime(from_date, "%Y-%m-%d").replace(tzinfo=timezone.utc).timestamp())
    to_ts   = int(datetime.now(timezone.utc).timestamp())
    resp = requests.get(
        YAHOO_URL,
        params={"period1": from_ts, "period2": to_ts, "interval": "1d"},
        headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                 "Accept": "application/json"},
        timeout=30,
    )
    resp.raise_for_status()
    result = resp.json().get("chart", {}).get("result") or []
    if not result:
        return {}

    # Yahoo dates each daily bar at 00:00 UTC; today's bar is still trading.
    today_utc = datetime.now(timezone.utc).date()
    timestamps = result[0].get("timestamp", [])
    closes     = result[0].get("indicators", {}).get("quote", [{}])[0].get("close", [])
    rate_map: dict[str, float] = {}
    for ts, close in zip(timestamps, closes):
        d = datetime.fromtimestamp(ts, timezone.utc).date()
        if close is None or d >= today_utc or d.weekday() >= 5:
            continue
        rate_map[d.isoformat()] = round(float(close), 4)
    return rate_map


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync USD/INR daily closes into usdinr.json")
    parser.add_argument("--from-date", default=None, dest="from_date",
                        help="Re-sync from this date (YYYY-MM-DD). Default: last 35 days.")
    args = parser.parse_args()
    from_date = args.from_date or (date.today() - timedelta(days=35)).isoformat()

    print(f"Fetching USD/INR closes from Yahoo Finance (USDINR=X) since {from_date}...")
    try:
        rate_map = fetch_usdinr_yahoo(from_date)
    except Exception as e:
        print(f"  WARNING: Yahoo Finance fetch failed: {e} — leaving usdinr.json unchanged.")
        return 0
    if not rate_map:
        print("  No data returned — leaving usdinr.json unchanged.")
        return 0
    print(f"  Received {len(rate_map)} dates: {min(rate_map)} → {max(rate_map)}")

    with open(USDINR_PATH) as f:
        rows: dict[str, dict] = {r["date"]: r for r in json.load(f)}

    added = corrected = 0
    for d_str, rate in sorted(rate_map.items()):
        old = rows.get(d_str)
        if old is None:
            added += 1
            print(f"  {d_str}: added rate={rate}")
        elif old.get("rate") != rate:
            corrected += 1
            print(f"  {d_str}: corrected {old.get('rate')} → {rate}")
        else:
            continue
        rows[d_str] = {"date": d_str, "rate": rate}

    if added == 0 and corrected == 0:
        print("usdinr.json already matches Yahoo — no changes.")
        return 0

    out = [rows[d] for d in sorted(rows)]
    with open(USDINR_PATH, "w") as f:
        json.dump(out, f, indent=2)
    print(f"\nWritten {added} new and {corrected} corrected row(s) → {USDINR_PATH}")
    print(f"Last row: {out[-1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
