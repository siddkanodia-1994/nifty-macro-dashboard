#!/usr/bin/env python3
"""
fetch-usdinr.py

Fetches USD/INR closing exchange rate and appends missing rows to data/usdinr.json.

Data sources:
  - Daily cron (no flags): investing.com via Playwright (~22 most recent trading days)
  - One-time backfill (--from-date): Yahoo Finance v8 API via requests (full history)

Usage:
    python scripts/fetch-usdinr.py                        # today (Playwright)
    python scripts/fetch-usdinr.py --date 2026-04-14      # specific date (Playwright)
    python scripts/fetch-usdinr.py --backfill 10          # last 10 calendar days (Playwright)
    python scripts/fetch-usdinr.py --from-date 2022-04-01 # full backfill via Yahoo Finance
"""

from __future__ import annotations

import json
import os
import sys
import argparse
import time
from datetime import datetime, date, timedelta

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
USDINR_PATH  = os.path.join(PROJECT_ROOT, "data", "usdinr.json")

INVESTING_URL = "https://in.investing.com/currencies/usd-inr-historical-data"
TE_URL        = "https://tradingeconomics.com/india/currency"


def fetch_usdinr_te() -> float | None:
    """
    Fallback: fetch the current USD/INR rate from Trading Economics via HTTP.
    Returns rate as float (e.g. 84.25) or None on failure.
    Same source used by the live prices API (/api/refresh-live-prices).
    """
    import urllib.request
    import re
    req = urllib.request.Request(
        TE_URL,
        headers={"User-Agent": "Mozilla/5.0 (compatible; fetch-usdinr/1.0)"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        match = re.search(r'"value"\s*:\s*([0-9.]+)', html)
        if match:
            rate = float(match.group(1))
            if 50 < rate < 150:
                return round(rate * 100) / 100   # e.g. 84.2543 → 84.25
    except Exception as e:
        print(f"  WARNING: Trading Economics fallback failed: {e}")
    return None


def parse_investing_date(raw: str) -> str | None:
    """Try multiple date formats investing.com uses for currency pages."""
    raw = raw.strip()
    for fmt in ("%b %d, %Y", "%m/%d/%Y", "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def fetch_usdinr_playwright() -> dict[str, float]:
    """
    Scrape USD/INR historical data from investing.com via Playwright.
    Returns {ISO_date: rate}; typically covers the last ~22 trading days.

    Column layout (investing.com currency historical table):
        col[0] = date string  (various formats)
        col[1] = close price  (e.g. "84.25")
    """
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("ERROR: playwright not installed. Run: pip install playwright && playwright install chromium")
        sys.exit(1)

    rate_map: dict[str, float] = {}

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
            page.goto(INVESTING_URL, timeout=90_000, wait_until="domcontentloaded")
            page.wait_for_selector("table tr td", timeout=45_000, state="attached")
            page.wait_for_timeout(1500)
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
                d_str = parse_investing_date(cells[0])
                if not d_str:
                    continue
                raw_val = cells[1].replace(",", "").replace(" ", "").strip()
                rate = round(float(raw_val), 4)
                if rate > 0:
                    rate_map[d_str] = rate
            except (ValueError, IndexError):
                continue

        browser.close()

    return rate_map


def fetch_usdinr_yahoo(from_date: str, to_date: str | None = None) -> dict[str, float]:
    """
    Fetch USD/INR historical daily closing rates from Yahoo Finance v8 API.
    Ticker: USDINR=X  (raw INR per 1 USD, e.g. 84.25)
    Returns {ISO_date: rate}.
    """
    import requests

    if to_date is None:
        to_date = date.today().isoformat()

    from_dt = datetime.strptime(from_date, "%Y-%m-%d")
    to_dt   = datetime.strptime(to_date,   "%Y-%m-%d") + timedelta(days=1)
    p1 = int(from_dt.timestamp())
    p2 = int(to_dt.timestamp())

    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/USDINR%3DX"
        f"?period1={p1}&period2={p2}&interval=1d&includeAdjustedClose=true"
    )
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "application/json",
    }

    rate_map: dict[str, float] = {}
    try:
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        result = data.get("chart", {}).get("result", [])
        if not result:
            print(f"  WARNING: Yahoo Finance returned empty result for USDINR=X")
            return {}
        timestamps = result[0].get("timestamp", [])
        closes     = result[0].get("indicators", {}).get("quote", [{}])[0].get("close", [])
        for ts, close in zip(timestamps, closes):
            if close is None:
                continue
            d_str = datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")
            rate_map[d_str] = round(float(close), 4)
    except Exception as e:
        print(f"  WARNING: Yahoo Finance fetch failed: {e}")

    return rate_map


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Fetch USD/INR closing rate and append rows to usdinr.json"
    )
    parser.add_argument("--date",      default=None,
                        help="Specific date to fetch (YYYY-MM-DD)")
    parser.add_argument("--backfill",  type=int, default=0,
                        help="Fetch last N calendar days (0 = today only)")
    parser.add_argument("--from-date", default=None, dest="from_date",
                        help="Backfill from this date to today via Yahoo Finance (YYYY-MM-DD)")
    args = parser.parse_args()

    # Load existing data
    if os.path.exists(USDINR_PATH):
        with open(USDINR_PATH) as f:
            usdinr_data: list[dict] = json.load(f)
    else:
        usdinr_data = []

    existing_dates = {r["date"] for r in usdinr_data}

    # ── Path A: one-time historical backfill via Yahoo Finance ──────────────
    if args.from_date:
        print(f"Fetching USD/INR history from Yahoo Finance (USDINR=X): {args.from_date} → today...")
        rate_map = fetch_usdinr_yahoo(args.from_date)
        if not rate_map:
            print("  No data returned from Yahoo Finance — aborting.")
            sys.exit(1)
        print(f"  Received {len(rate_map)} dates: {min(rate_map)} → {max(rate_map)}")
        target_dates = sorted(rate_map.keys())
        added = 0
        for d_str in target_dates:
            if d_str in existing_dates:
                continue
            usdinr_data.append({"date": d_str, "rate": rate_map[d_str]})
            existing_dates.add(d_str)
            added += 1
        if added == 0:
            print("No new rows added.")
            sys.exit(0)
        usdinr_data.sort(key=lambda r: r["date"])
        with open(USDINR_PATH, "w") as f:
            json.dump(usdinr_data, f, indent=2)
        last = usdinr_data[-1]
        print(f"\nWritten {added} new row(s) → {USDINR_PATH}")
        print(f"Date range: {usdinr_data[0]['date']} → {last['date']}")
        print(f"Last row: rate={last['rate']}")
        return

    # ── Path B: daily cron or short backfill via Playwright ─────────────────
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

    print(f"Fetching USD/INR rates from investing.com (Playwright)...")
    rate_map = fetch_usdinr_playwright()

    if rate_map:
        print(f"  Received {len(rate_map)} dates: {min(rate_map)} → {max(rate_map)}")
    else:
        print("  No USD/INR data from investing.com — will try Trading Economics fallback for recent dates.")

    # On default daily runs, auto-backfill any recently missed dates.
    # Gaps are detected from usdinr.json itself (not from rate_map) so we catch
    # misses even when Playwright returns an empty result.
    if not args.date and args.backfill == 0:
        cutoff = (date.today() - timedelta(days=35)).isoformat()
        missed = sorted(d for d in existing_dates if False)  # seed empty list
        # Dates present in rate_map but not in usdinr.json
        missed_from_map = sorted(d for d in rate_map if d >= cutoff and d not in existing_dates)
        # Dates between last known entry and today that are absent from usdinr.json
        if usdinr_data:
            last_known = max(existing_dates)
            check = (date.fromisoformat(last_known) + timedelta(days=1))
            today_dt = date.today()
            while check <= today_dt:
                d_str = check.isoformat()
                if d_str not in existing_dates and d_str not in missed_from_map:
                    missed_from_map.append(d_str)
                check += timedelta(days=1)
            missed_from_map = sorted(set(missed_from_map))
        if missed_from_map:
            print(f"  Auto-backfill: {len(missed_from_map)} missed date(s) detected: {missed_from_map}")
        target_dates = missed_from_map + target_dates

    # Trading Economics fallback: fetched once, reused for all recent missing dates.
    te_rate: float | None = None
    te_fetched = False
    recent_cutoff = (date.today() - timedelta(days=7)).isoformat()

    added = 0
    for target_date_str in target_dates:
        if target_date_str in existing_dates:
            print(f"  {target_date_str}: already in usdinr.json — skip")
            continue
        rate = rate_map.get(target_date_str)

        # Fall back to Trading Economics for recent dates not in Playwright result
        if rate is None and target_date_str >= recent_cutoff:
            if not te_fetched:
                print("  investing.com missing recent date(s) — trying Trading Economics fallback...")
                te_rate = fetch_usdinr_te()
                te_fetched = True
            if te_rate is not None:
                rate = te_rate
                print(f"  {target_date_str}: using Trading Economics fallback rate={rate}")

        if rate is None:
            print(f"  {target_date_str}: rate not available from investing.com or Trading Economics — skip")
            continue
        usdinr_data.append({"date": target_date_str, "rate": rate})
        existing_dates.add(target_date_str)
        added += 1
        print(f"  {target_date_str}: rate={rate}")

    if added == 0:
        print("No new rows added.")
        sys.exit(0)

    usdinr_data.sort(key=lambda r: r["date"])
    with open(USDINR_PATH, "w") as f:
        json.dump(usdinr_data, f, indent=2)

    last = usdinr_data[-1]
    print(f"\nWritten {added} new row(s) → {USDINR_PATH}")
    print(f"Date range: {usdinr_data[0]['date']} → {last['date']}")
    print(f"Last row: rate={last['rate']}")


if __name__ == "__main__":
    main()
