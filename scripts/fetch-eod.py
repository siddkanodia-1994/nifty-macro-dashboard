#!/usr/bin/env python3
"""
fetch-eod.py
Fetches today's (or a specified date's) EOD close + P/E + P/B for all 7 indices.

Strategy (in order):
  1. HTTP API approach  — POST to niftyindices.com Backpage.aspx endpoint.
                          Fast, no browser required. Works as long as the
                          undocumented endpoint remains available.
  2. Playwright fallback — If the API approach fails for any index, launch
                           Chromium and download the Daily Snapshot CSV from
                           the niftyindices.com reports page.

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

# ─── niftyindices.com HTTP endpoint ──────────────────────────────────────────

NIFTY_INDICES_HOME = "https://www.niftyindices.com/"
NIFTY_INDICES_DATA = (
    "https://www.niftyindices.com/Backpage.aspx/getHistoricaldatatabletoString"
)

NIFTYINDICES_NAMES: dict[str, str] = {
    "NIFTY_50":           "NIFTY 50",
    "NIFTY_BANK":         "NIFTY BANK",
    "NIFTY_IT":           "NIFTY IT",
    "NIFTY_MIDCAP_150":   "Nifty Midcap 150",
    "NIFTY_SMALLCAP_250": "Nifty Smallcap 250",
    "NIFTY_PSU_BANK":     "Nifty PSU Bank",
    "NIFTY_MICROCAP_250": "Nifty Microcap 250",
}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/json; charset=UTF-8",
    "Referer": "https://www.niftyindices.com/reports/historical-data",
    "X-Requested-With": "XMLHttpRequest",
    "Origin": "https://www.niftyindices.com",
}

# ─── CSV column indices for Daily Snapshot (0-based) ─────────────────────────
# Col 0 (A): Index name  Col 1 (B): Date  Col 5 (F): Close  Col 10 (K): P/E  Col 11 (L): P/B
COL_NAME  = 0
COL_DATE  = 1
COL_CLOSE = 5
COL_PE    = 10
COL_PB    = 11

CSV_NAME_MAP: dict[str, str] = {
    "Nifty 50":           "NIFTY_50",
    "Nifty Bank":         "NIFTY_BANK",
    "Nifty IT":           "NIFTY_IT",
    "Nifty Midcap 150":   "NIFTY_MIDCAP_150",
    "Nifty Smallcap 250": "NIFTY_SMALLCAP_250",
    "Nifty PSU Bank":     "NIFTY_PSU_BANK",
    "Nifty Microcap 250": "NIFTY_MICROCAP_250",
    # Alternate capitalizations
    "NIFTY 50":           "NIFTY_50",
    "NIFTY BANK":         "NIFTY_BANK",
    "NIFTY IT":           "NIFTY_IT",
    "Nifty MidCap 150":   "NIFTY_MIDCAP_150",
    "Nifty SmallCap 250": "NIFTY_SMALLCAP_250",
    "NIFTY PSU Bank":     "NIFTY_PSU_BANK",
    "NIFTY Microcap 250": "NIFTY_MICROCAP_250",
}

TARGET_KEYS = set(NIFTYINDICES_NAMES.keys())

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


def format_date_for_api(d: date) -> str:
    """DD-Mon-YYYY (e.g. '15-Apr-2026') for niftyindices.com API."""
    return d.strftime("%-d-%b-%Y")


def format_date_for_site(d: date) -> str:
    """DD/MM/YYYY for the niftyindices date picker."""
    return d.strftime("%d/%m/%Y")


# ─── Strategy 1: HTTP API ─────────────────────────────────────────────────────

def get_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(HEADERS)
    try:
        resp = session.get(NIFTY_INDICES_HOME, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  WARNING: Could not establish niftyindices.com session: {e}")
    return session


def fetch_index_api(
    session: requests.Session,
    index_key: str,
    target_date: date,
    retries: int = 3,
) -> Optional[dict]:
    index_name = NIFTYINDICES_NAMES[index_key]
    date_str = format_date_for_api(target_date)
    payload = {"name": index_name, "startDate": date_str, "endDate": date_str}

    for attempt in range(retries):
        try:
            resp = session.post(NIFTY_INDICES_DATA, json=payload, timeout=20)
            resp.raise_for_status()
            data = resp.json()
            raw = data.get("d", data)
            if isinstance(raw, str):
                raw = json.loads(raw)
            if not raw:
                return None
            record = raw[0] if isinstance(raw, list) else raw
            close = safe_float(
                record.get("Closing Index Value") or record.get("Close")
            )
            pe = safe_float(record.get("P/E") or record.get("pe"))
            pb = safe_float(record.get("P/B") or record.get("pb"))
            if close is None:
                return None
            return build_metrics(close, pe, pb)
        except requests.RequestException as e:
            print(f"    Attempt {attempt+1}/{retries} failed: {e}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    return None


def fetch_all_api(target_date: date) -> dict[str, Optional[dict]]:
    """Fetch all indices via HTTP API. Returns {key: metrics|None}."""
    print("Strategy 1: HTTP API…")
    session = get_session()
    time.sleep(1)
    results: dict[str, Optional[dict]] = {}
    for key in TARGET_KEYS:
        print(f"  {key}…", end=" ", flush=True)
        metrics = fetch_index_api(session, key, target_date)
        results[key] = metrics
        if metrics:
            print(f"close={metrics['close']}, pe={metrics['pe']}, pb={metrics['pb']}")
        else:
            print("no data")
        time.sleep(0.5)
    return results


# ─── Strategy 2: Playwright CSV ──────────────────────────────────────────────

def fetch_all_playwright(target_date: date) -> dict[str, Optional[dict]]:
    """Download the Daily Snapshot CSV via Playwright browser automation."""
    print("Strategy 2: Playwright browser…")

    try:
        from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
    except ImportError:
        print("  Playwright not installed — skipping.")
        return {}

    date_str = format_date_for_site(target_date)

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
            print("  Loading niftyindices.com/reports/historical-data…")
            page.goto(
                "https://www.niftyindices.com/reports/historical-data",
                timeout=60_000,
            )
            page.wait_for_load_state("networkidle", timeout=30_000)
            time.sleep(3)

            # Print page title for debugging
            print(f"  Page title: {page.title()}")
            print(f"  Page URL:   {page.url}")

            # Navigate to Archives / Daily Snapshot
            # Try multiple locator strategies for the dropdown
            nav_selectors = [
                "text=Archives of Daily/Monthly Reports",
                "a:has-text('Archives')",
                "text=Daily/Monthly",
                "[href*='archives']",
                "[href*='Archives']",
            ]
            clicked_nav = False
            for sel in nav_selectors:
                try:
                    page.locator(sel).first.click(timeout=5_000)
                    clicked_nav = True
                    print(f"  Clicked nav via: {sel}")
                    break
                except Exception:
                    continue

            if not clicked_nav:
                # Try menu items
                try:
                    page.get_by_role("link", name=lambda n: "archive" in n.lower() or "daily" in n.lower()).first.click(timeout=5_000)
                    clicked_nav = True
                    print("  Clicked nav via role/name match")
                except Exception:
                    pass

            if not clicked_nav:
                print("  Could not find navigation — dumping visible links for debug")
                links = page.locator("a").all_text_contents()
                print(f"  Links on page: {links[:30]}")
                raise RuntimeError("Navigation to Archives section failed")

            page.wait_for_load_state("networkidle", timeout=20_000)
            time.sleep(3)

            # Select "Daily Snapshot" report
            report_selectors = [
                "select#ddlReports",
                "select[name*='Report']",
                "select[id*='Report']",
                "select",
            ]
            for sel in report_selectors:
                try:
                    page.locator(sel).first.select_option(label="Daily Snapshot")
                    print(f"  Selected Daily Snapshot via: {sel}")
                    break
                except Exception:
                    continue
            time.sleep(2)

            # Set date
            date_input_selectors = [
                "input[id*='date' i]",
                "input[name*='date' i]",
                "input[id*='Date']",
                "input[name*='Date']",
                "input[type='text']",
            ]
            for sel in date_input_selectors:
                try:
                    inp = page.locator(sel).first
                    inp.triple_click()
                    inp.fill(date_str)
                    print(f"  Set date {date_str} via: {sel}")
                    break
                except Exception:
                    continue
            time.sleep(1)

            # Click Submit
            page.get_by_role("button", name="Submit").first.click(timeout=10_000)
            time.sleep(5)

            # Download CSV
            with page.expect_download(timeout=30_000) as dl_info:
                try:
                    page.get_by_role("link", name=lambda n: "csv" in n.lower() or "download" in n.lower()).first.click(timeout=10_000)
                except Exception:
                    page.locator("a[href*='.csv'], a[href*='download' i], button:has-text('Download')").first.click(timeout=10_000)

            csv_path = dl_info.value.path()
            with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
                csv_text = f.read()

            return parse_daily_snapshot_csv(csv_text, target_date)

        except (PWTimeout, RuntimeError, Exception) as e:
            print(f"  Playwright error: {e}")
            try:
                page.screenshot(path="/tmp/niftyindices_error.png")
                print("  Screenshot: /tmp/niftyindices_error.png")
            except Exception:
                pass
            return {}
        finally:
            browser.close()


def parse_daily_snapshot_csv(csv_text: str, target_date: date) -> dict[str, Optional[dict]]:
    target_iso = target_date.isoformat()
    found: dict[str, Optional[dict]] = {}
    reader = csv.reader(io.StringIO(csv_text))
    for row in reader:
        if len(row) <= max(COL_NAME, COL_DATE, COL_CLOSE, COL_PE, COL_PB):
            continue
        name = row[COL_NAME].strip()
        key = CSV_NAME_MAP.get(name)
        if not key or key not in TARGET_KEYS:
            continue
        # Validate date
        date_cell = row[COL_DATE].strip()
        parsed_date = None
        for fmt in ("%d-%b-%Y", "%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
            try:
                parsed_date = datetime.strptime(date_cell, fmt).date().isoformat()
                break
            except ValueError:
                continue
        if parsed_date and parsed_date != target_iso:
            continue
        close = safe_float(row[COL_CLOSE])
        pe    = safe_float(row[COL_PE])
        pb    = safe_float(row[COL_PB])
        found[key] = build_metrics(close, pe, pb)
    return found


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Fetch EOD data → historical.json")
    parser.add_argument("--date", default=None, help="Date to fetch (YYYY-MM-DD). Defaults to today.")
    args = parser.parse_args()

    target_date = datetime.strptime(args.date, "%Y-%m-%d").date() if args.date else date.today()
    target_iso  = target_date.isoformat()
    print(f"Fetching EOD data for: {target_iso}")

    # Resolve paths
    script_dir   = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    output_path  = os.path.join(project_root, "data", "historical.json")

    with open(output_path) as f:
        rows: list[dict] = json.load(f)

    existing_dates = {r["date"] for r in rows}
    if target_iso in existing_dates:
        print(f"Date {target_iso} already exists — nothing to do.")
        return

    # ── Strategy 1: HTTP API ──────────────────────────────────────────────────
    api_results = fetch_all_api(target_date)

    # Determine which keys still need data
    missing_keys = [k for k in TARGET_KEYS if not api_results.get(k)]

    # ── Strategy 2: Playwright fallback for any missing indices ───────────────
    playwright_results: dict[str, Optional[dict]] = {}
    if missing_keys:
        print(f"\n  {len(missing_keys)} indices missing from API — trying Playwright…")
        playwright_results = fetch_all_playwright(target_date)

    # ── Merge results ─────────────────────────────────────────────────────────
    new_row: dict = {"date": target_iso}
    all_ok = True
    null_entry = {"close": None, "pe": None, "pb": None, "impliedEPS": None, "impliedBV": None}

    for key in TARGET_KEYS:
        metrics = api_results.get(key) or playwright_results.get(key)
        if metrics:
            new_row[key] = metrics
        else:
            print(f"  FAILED: {key} — using null values")
            new_row[key] = dict(null_entry)
            all_ok = False

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

    status = "OK" if all_ok else "PARTIAL"
    print(f"\n[{status}] Written {len(deduped)} rows → {output_path}")
    if not all_ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
