#!/usr/bin/env python3
"""
fetch-eod.py
Fetches today's (or a specified date's) EOD close + P/E + P/B for all 14 indices
from niftyindices.com.

Strategy (in order):
  1. Direct CSV fetch  — Constructs the URL directly from the date:
                         /Daily_Snapshot/ind_close_all_DDMMYYYY.csv
                         Bypasses the HTML page which is UA-gated in CI.
  2. Playwright browser — Navigates to /reports/daily-reports in a headless
                          browser and clicks the "Daily Snapshot (csv)" links.
                          Fallback if the direct URL is unavailable.

If all strategies fail, the script exits 0 without writing — the next cron run
will retry. No Yahoo Finance fallback (approximated PE/PB is not acceptable).

Usage:
    python scripts/fetch-eod.py [--date YYYY-MM-DD]

If --date is omitted, today's date is used.
Called by GitHub Actions at 12:30 UTC (6:00 PM IST) on weekdays.
"""

from __future__ import annotations

import csv
import io
import json
import math
import os
import sys
import argparse
import time
from datetime import datetime, date
from typing import Optional

try:
    import requests
except ImportError:
    print("ERROR: requests not installed. Run: pip install requests")
    sys.exit(1)

# ─── Index maps ───────────────────────────────────────────────────────────────

NIFTYINDICES_NAMES: dict[str, str] = {
    "NIFTY_50":              "NIFTY 50",
    "NIFTY_BANK":            "NIFTY BANK",
    "NIFTY_IT":              "NIFTY IT",
    "NIFTY_MIDCAP_150":      "Nifty Midcap 150",
    "NIFTY_SMALLCAP_250":    "Nifty Smallcap 250",
    "NIFTY_PSU_BANK":        "Nifty PSU Bank",
    "NIFTY_PVT_BANK":        "Nifty Private Bank",
    "NIFTY_MICROCAP_250":    "Nifty Microcap 250",
    "NIFTY_AUTO":            "Nifty Auto",
    "NIFTY_FIN_SERVICE":     "Nifty Financial Services",
    "NIFTY_REALTY":          "Nifty Realty",
    "NIFTY_METAL":           "Nifty Metal",
    "NIFTY_CAPITAL_MARKETS": "Nifty Capital Markets",
    "NIFTY_INDIA_DEFENCE":   "Nifty India Defence",
}

TARGET_KEYS = list(NIFTYINDICES_NAMES.keys())

# Daily Snapshot CSV column indices (0-based)
COL_NAME  = 0
COL_DATE  = 1
COL_CLOSE = 5
COL_PE    = 10
COL_PB    = 11

CSV_NAME_MAP: dict[str, str] = {
    "Nifty 50":                 "NIFTY_50",
    "Nifty Bank":               "NIFTY_BANK",
    "Nifty IT":                 "NIFTY_IT",
    "Nifty Midcap 150":         "NIFTY_MIDCAP_150",
    "Nifty Smallcap 250":       "NIFTY_SMALLCAP_250",
    "Nifty PSU Bank":           "NIFTY_PSU_BANK",
    "Nifty Private Bank":       "NIFTY_PVT_BANK",
    "Nifty Pvt Bank":           "NIFTY_PVT_BANK",
    "Nifty Microcap 250":       "NIFTY_MICROCAP_250",
    "NIFTY 50":                 "NIFTY_50",
    "NIFTY BANK":               "NIFTY_BANK",
    "NIFTY IT":                 "NIFTY_IT",
    "Nifty MidCap 150":         "NIFTY_MIDCAP_150",
    "Nifty SmallCap 250":       "NIFTY_SMALLCAP_250",
    "NIFTY PSU Bank":           "NIFTY_PSU_BANK",
    "NIFTY PRIVATE BANK":       "NIFTY_PVT_BANK",
    "NIFTY PVT BANK":           "NIFTY_PVT_BANK",
    "NIFTY Microcap 250":       "NIFTY_MICROCAP_250",
    "Nifty Auto":               "NIFTY_AUTO",
    "NIFTY AUTO":               "NIFTY_AUTO",
    "Nifty Financial Services": "NIFTY_FIN_SERVICE",
    "NIFTY FIN SERVICE":        "NIFTY_FIN_SERVICE",
    "Nifty Realty":             "NIFTY_REALTY",
    "NIFTY REALTY":             "NIFTY_REALTY",
    "Nifty Metal":              "NIFTY_METAL",
    "NIFTY METAL":              "NIFTY_METAL",
    "Nifty Capital Markets":    "NIFTY_CAPITAL_MARKETS",
    "NIFTY CAPITAL MARKETS":    "NIFTY_CAPITAL_MARKETS",
    "Nifty India Defence":      "NIFTY_INDIA_DEFENCE",
    "NIFTY INDIA DEFENCE":      "NIFTY_INDIA_DEFENCE",
}

DAILY_REPORTS_URL = "https://www.niftyindices.com/reports/daily-reports"
BROWSER_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)

# ─── Shared helpers ───────────────────────────────────────────────────────────

def safe_float(val) -> Optional[float]:
    if val is None:
        return None
    try:
        f = float(str(val).replace(",", "").strip())
        return None if math.isnan(f) or math.isinf(f) else round(f, 4)
    except (TypeError, ValueError):
        return None


def build_metrics(close: Optional[float], pe: Optional[float], pb: Optional[float]) -> dict:
    implied_eps = round(close / pe, 2) if (close and pe and pe != 0) else None
    implied_bv  = round(close / pb, 2) if (close and pb and pb != 0) else None
    return {
        "close":      close,
        "pe":         pe,
        "pb":         pb,
        "impliedEPS": implied_eps,
        "impliedBV":  implied_bv,
    }


def missing_keys(results: dict) -> list[str]:
    return [k for k in TARGET_KEYS if not results.get(k)]


def parse_daily_snapshot_csv(csv_text: str, target_date: date) -> dict:
    target_iso = target_date.isoformat()
    found: dict = {}
    for row in csv.reader(io.StringIO(csv_text)):
        if len(row) <= max(COL_NAME, COL_DATE, COL_CLOSE, COL_PE, COL_PB):
            continue
        key = CSV_NAME_MAP.get(row[COL_NAME].strip())
        if not key or key not in TARGET_KEYS:
            continue
        date_cell = row[COL_DATE].strip()
        parsed = None
        for fmt in ("%d-%b-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
            try:
                parsed = datetime.strptime(date_cell, fmt).date().isoformat()
                break
            except ValueError:
                continue
        if parsed and parsed != target_iso:
            continue
        found[key] = build_metrics(safe_float(row[COL_CLOSE]), safe_float(row[COL_PE]), safe_float(row[COL_PB]))
    return found


# ─── Strategy 1: Direct CSV URL (date-based, no HTML page) ───────────────────

def fetch_all_daily_reports(target_date: date) -> dict:
    """
    Directly fetch the Daily Snapshot CSV using the known date-based URL.
    Bypasses /reports/daily-reports HTML page which is UA-gated and times out
    from CI environments. URL: /Daily_Snapshot/ind_close_all_DDMMYYYY.csv
    """
    print("Strategy 1: niftyindices.com Direct CSV fetch…")
    date_str = target_date.strftime("%d%m%Y")
    url = f"https://www.niftyindices.com/Daily_Snapshot/ind_close_all_{date_str}.csv"

    session = requests.Session()
    session.headers.update({
        "User-Agent": BROWSER_UA,
        "Accept": "text/csv,text/plain,*/*",
        "Referer": "https://www.niftyindices.com/",
    })

    try:
        resp = session.get(url, timeout=20)
        resp.raise_for_status()
        csv_text = resp.content.decode("utf-8", errors="replace")
        found = parse_daily_snapshot_csv(csv_text, target_date)
        print(f"  Got {sorted(found.keys())}")
        return found
    except requests.RequestException as e:
        print(f"  Direct CSV fetch failed: {e}")
        return {}


# ─── Strategy 2: Playwright (Daily Reports page) ─────────────────────────────

def fetch_all_playwright(target_date: date) -> dict:
    print("Strategy 2: Playwright browser (Daily Reports)…")
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("  Playwright not installed — skipping.")
        return {}

    with sync_playwright() as p:
        try:
            browser = p.chromium.launch(headless=True)
        except Exception as e:
            print(f"  Playwright browser unavailable (run 'playwright install'): {e}")
            return {}
        context = browser.new_context(user_agent=BROWSER_UA, accept_downloads=True)
        page = context.new_page()
        try:
            print("  Navigating to Daily Reports…")
            page.goto(DAILY_REPORTS_URL, timeout=60_000, wait_until="domcontentloaded")
            time.sleep(5)
            print(f"  Page: {page.title()} | {page.url}")

            found: dict = {}
            links = page.get_by_text("Daily Snapshot (csv)").all()
            print(f"  Found {len(links)} Daily Snapshot link(s)")

            for link_el in links[:2]:
                try:
                    with page.expect_download(timeout=30_000) as dl_info:
                        link_el.click()
                    csv_path = dl_info.value.path()
                    with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
                        csv_text = f.read()
                    parsed = parse_daily_snapshot_csv(csv_text, target_date)
                    for k, v in parsed.items():
                        if k not in found and v:
                            found[k] = v
                    print(f"  Parsed download: got {list(parsed.keys())}")
                except Exception as e:
                    print(f"  Download error: {e}")
                    continue

            return found

        except Exception as e:
            print(f"  Playwright error: {e}")
            try:
                page.screenshot(path="/tmp/niftyindices_error.png")
                print("  Screenshot: /tmp/niftyindices_error.png")
            except Exception:
                pass
            return {}
        finally:
            browser.close()


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Fetch EOD data → historical.json")
    parser.add_argument("--date", default=None, help="Date to fetch (YYYY-MM-DD). Defaults to today.")
    args = parser.parse_args()

    target_date = datetime.strptime(args.date, "%Y-%m-%d").date() if args.date else date.today()
    target_iso  = target_date.isoformat()
    print(f"Fetching EOD data for: {target_iso}")

    script_dir   = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    output_path  = os.path.join(project_root, "data", "historical.json")

    with open(output_path) as f:
        rows: list[dict] = json.load(f)

    existing = next((r for r in rows if r["date"] == target_iso), None)
    extra_data: dict = {}
    if existing:
        n50 = existing.get("NIFTY_50") or {}
        n50_close = n50.get("close") if isinstance(n50, dict) else None
        is_clean = n50_close is not None and round(n50_close, 2) == n50_close
        if is_clean:
            print(f"Date {target_iso} already has clean niftyindices.com data — nothing to do.")
            return
        for k, v in existing.items():
            if k != "date" and k not in TARGET_KEYS:
                extra_data[k] = v
        print(f"Date {target_iso} has incomplete data — removing and re-fetching…")
        rows = [r for r in rows if r["date"] != target_iso]

    # ── Strategy 1: Direct CSV URL ───────────────────────────────────────────
    results = fetch_all_daily_reports(target_date)

    # ── Strategy 2: Playwright (for any remaining) ────────────────────────────
    still_missing = missing_keys(results)
    if still_missing:
        print(f"\n{len(still_missing)} indices missing — trying Playwright…")
        pw = fetch_all_playwright(target_date)
        for k, v in pw.items():
            if v and not results.get(k):
                results[k] = v

    # ── No more strategies — if nothing fetched, skip and retry next run ──────
    if not results:
        print("\nNo data from any niftyindices.com strategy — skipping write (will retry next cron run).")
        return

    # ── Build new row ─────────────────────────────────────────────────────────
    new_row: dict = {"date": target_iso, **extra_data}
    null_entry = {"close": None, "pe": None, "pb": None, "impliedEPS": None, "impliedBV": None}
    for key in TARGET_KEYS:
        m = results.get(key)
        if m and m.get("close"):
            new_row[key] = m
        else:
            print(f"  WARNING: {key} — no data, writing null")
            new_row[key] = dict(null_entry)

    # ── Write ─────────────────────────────────────────────────────────────────
    rows.append(new_row)
    rows.sort(key=lambda r: r["date"])
    seen: set[str] = set()
    deduped = []
    for r in rows:
        if r["date"] not in seen:
            seen.add(r["date"])
            deduped.append(r)

    with open(output_path, "w") as f:
        json.dump(deduped, f, indent=2)

    print(f"\n[OK] Written {len(deduped)} rows → {output_path}")


if __name__ == "__main__":
    main()
