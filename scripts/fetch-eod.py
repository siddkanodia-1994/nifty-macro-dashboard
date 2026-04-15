#!/usr/bin/env python3
"""
fetch-eod.py
Uses Playwright to navigate niftyindices.com, download the "Daily Snapshot" CSV
for a given date, parse it, and append the row to data/historical.json.

Usage:
    python scripts/fetch-eod.py [--date YYYY-MM-DD]

If --date is omitted, today's date is used.

Called by GitHub Actions at 12:30 UTC (6:00 PM IST) on weekdays.
The workflow commits any change to data/historical.json → Vercel redeploys.

Dependencies:
    pip install playwright
    playwright install chromium --with-deps
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
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
except ImportError:
    print("ERROR: playwright not installed. Run: pip install playwright && playwright install chromium --with-deps")
    sys.exit(1)

# ─── Index name → key mapping ────────────────────────────────────────────────
# These are the exact strings that appear in Column A of the Daily Snapshot CSV.
# Names to be confirmed against actual CSV output; common variations listed here.

CSV_NAME_MAP: dict[str, str] = {
    # Primary names
    "Nifty 50":            "NIFTY_50",
    "Nifty Bank":          "NIFTY_BANK",
    "Nifty IT":            "NIFTY_IT",
    "Nifty Midcap 150":    "NIFTY_MIDCAP_150",
    "Nifty Smallcap 250":  "NIFTY_SMALLCAP_250",
    "Nifty PSU Bank":      "NIFTY_PSU_BANK",
    "Nifty Microcap 250":  "NIFTY_MICROCAP_250",
    # Alternate capitalizations
    "NIFTY 50":            "NIFTY_50",
    "NIFTY BANK":          "NIFTY_BANK",
    "NIFTY IT":            "NIFTY_IT",
    "Nifty MidCap 150":    "NIFTY_MIDCAP_150",
    "Nifty SmallCap 250":  "NIFTY_SMALLCAP_250",
    "NIFTY PSU Bank":      "NIFTY_PSU_BANK",
    "NIFTY Microcap 250":  "NIFTY_MICROCAP_250",
}

TARGET_KEYS = {
    "NIFTY_50", "NIFTY_BANK", "NIFTY_IT",
    "NIFTY_MIDCAP_150", "NIFTY_SMALLCAP_250",
    "NIFTY_PSU_BANK", "NIFTY_MICROCAP_250",
}

# CSV column indices (0-based):
# Col 0 (A): Index name
# Col 1 (B): Date
# Col 5 (F): Closing price
# Col 10 (K): P/E
# Col 11 (L): P/B
COL_NAME  = 0
COL_DATE  = 1
COL_CLOSE = 5
COL_PE    = 10
COL_PB    = 11


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


def format_date_for_site(d: date) -> str:
    """Format date as DD/MM/YYYY for the niftyindices date picker."""
    return d.strftime("%d/%m/%Y")


def download_csv_playwright(target_date: date) -> Optional[str]:
    """
    Navigate niftyindices.com, select Daily Snapshot for target_date,
    download the CSV, and return its text content.
    Returns None on failure.
    """
    date_str = format_date_for_site(target_date)
    print(f"Launching Playwright browser for {target_date.isoformat()}…")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            accept_downloads=True,
        )
        page = context.new_page()

        try:
            # Step 1: Navigate to Historical Data page
            print("  Navigating to niftyindices.com/reports/historical-data…")
            page.goto("https://www.niftyindices.com/reports/historical-data", timeout=60_000)
            page.wait_for_load_state("networkidle", timeout=30_000)
            time.sleep(3)

            # Step 2: Click "Historical Index Data" dropdown → "Archives of Daily/Monthly Reports"
            print("  Clicking 'Historical Index Data' dropdown…")
            # The dropdown typically has text matching this
            page.get_by_text("Historical Index Data", exact=False).first.click()
            time.sleep(2)

            print("  Selecting 'Archives of Daily/Monthly Reports'…")
            page.get_by_text("Archives of Daily/Monthly Reports", exact=False).first.click()
            page.wait_for_load_state("networkidle", timeout=20_000)
            time.sleep(3)

            # Step 3: Select "Daily Snapshot" from "Select Report" dropdown
            print("  Selecting 'Daily Snapshot' report type…")
            # Try common selector patterns for the report dropdown
            try:
                page.locator("select#ddlReports, select[name*='Report'], select[id*='Report']").first.select_option(
                    label="Daily Snapshot"
                )
            except Exception:
                # Fallback: click a dropdown element and find by text
                page.get_by_role("combobox").first.select_option(label="Daily Snapshot")
            time.sleep(2)

            # Step 4: Set the date input
            print(f"  Setting date to {date_str}…")
            date_input = page.locator(
                "input[type='text'][id*='date' i], input[type='text'][name*='date' i], "
                "input[id*='Date'], input[name*='Date']"
            ).first
            date_input.fill(date_str)
            time.sleep(1)

            # Step 5: Click Submit
            print("  Clicking Submit…")
            page.get_by_role("button", name="Submit").first.click()
            time.sleep(5)

            # Step 6: Download the CSV
            print("  Waiting for CSV download link…")
            with page.expect_download(timeout=30_000) as download_info:
                # Look for a CSV/Excel download link or button
                page.get_by_role("link", name=lambda n: "csv" in n.lower() or "download" in n.lower()).first.click()

            download = download_info.value
            csv_path = download.path()
            with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()

            print("  CSV downloaded successfully.")
            return content

        except PlaywrightTimeoutError as e:
            print(f"  Timeout error: {e}")
            # Save a screenshot for debugging in CI
            try:
                page.screenshot(path="/tmp/niftyindices_error.png")
                print("  Screenshot saved to /tmp/niftyindices_error.png")
            except Exception:
                pass
            return None
        except Exception as e:
            print(f"  Unexpected error: {e}")
            try:
                page.screenshot(path="/tmp/niftyindices_error.png")
                print("  Screenshot saved to /tmp/niftyindices_error.png")
            except Exception:
                pass
            return None
        finally:
            browser.close()


def parse_daily_snapshot_csv(csv_text: str, target_date: date) -> dict[str, dict]:
    """
    Parse the Daily Snapshot CSV and extract metrics for all target indices.
    Returns a dict keyed by IndexKey.
    """
    target_iso = target_date.isoformat()
    found: dict[str, dict] = {}

    reader = csv.reader(io.StringIO(csv_text))
    for row in reader:
        if len(row) <= max(COL_NAME, COL_DATE, COL_CLOSE, COL_PE, COL_PB):
            continue

        name = row[COL_NAME].strip()
        key = CSV_NAME_MAP.get(name)
        if not key or key not in TARGET_KEYS:
            continue

        # Validate the date in the CSV matches what we requested
        date_cell = row[COL_DATE].strip()
        # Parse DD-Mon-YYYY, DD/MM/YYYY, YYYY-MM-DD formats
        parsed_date = None
        for fmt in ("%d-%b-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
            try:
                parsed_date = datetime.strptime(date_cell, fmt).date().isoformat()
                break
            except ValueError:
                continue

        if parsed_date and parsed_date != target_iso:
            print(f"  WARNING: {name} date in CSV ({parsed_date}) != requested ({target_iso}), skipping")
            continue

        close = safe_float(row[COL_CLOSE])
        pe    = safe_float(row[COL_PE])
        pb    = safe_float(row[COL_PB])

        found[key] = build_metrics(close, pe, pb)
        print(f"  Parsed {name} ({key}): close={close}, pe={pe}, pb={pb}")

    return found


def main():
    parser = argparse.ArgumentParser(description="Fetch EOD Daily Snapshot → historical.json")
    parser.add_argument("--date", default=None, help="Date to fetch (YYYY-MM-DD). Defaults to today.")
    args = parser.parse_args()

    # Resolve target date
    if args.date:
        target_date = datetime.strptime(args.date, "%Y-%m-%d").date()
    else:
        target_date = date.today()

    target_iso = target_date.isoformat()
    print(f"Fetching EOD Daily Snapshot for: {target_iso}")

    # Resolve paths
    script_dir   = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    output_path  = os.path.join(project_root, "data", "historical.json")

    # Load existing JSON
    with open(output_path) as f:
        rows: list[dict] = json.load(f)

    # Check if this date is already present (idempotent)
    existing_dates = {r["date"] for r in rows}
    if target_iso in existing_dates:
        print(f"Date {target_iso} already exists in historical.json — nothing to do.")
        return

    # Download CSV via Playwright
    csv_text = download_csv_playwright(target_date)
    if not csv_text:
        print("ERROR: Failed to download CSV from niftyindices.com")
        sys.exit(1)

    # Parse CSV
    print(f"\nParsing CSV for {target_iso}…")
    metrics = parse_daily_snapshot_csv(csv_text, target_date)

    if not metrics:
        print("ERROR: No target indices found in CSV. Check CSV_NAME_MAP and column indices.")
        print("First 500 chars of CSV:")
        print(csv_text[:500])
        sys.exit(1)

    # Build new row — use null for any missing indices
    new_row: dict = {"date": target_iso}
    all_ok = True
    for key in TARGET_KEYS:
        if key in metrics:
            new_row[key] = metrics[key]
        else:
            print(f"  WARNING: {key} not found in CSV — using null values")
            new_row[key] = {"close": None, "pe": None, "pb": None, "impliedEPS": None, "impliedBV": None}
            all_ok = False

    # Append, sort, deduplicate, write
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

    status = "OK" if all_ok else "PARTIAL"
    print(f"\n[{status}] Written {len(deduped)} rows → {output_path}")

    # Exit non-zero if any fetch failed, so CI can alert
    if not all_ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
