#!/usr/bin/env python3
"""
fetch-eod.py
Fetches today's (or a specified date's) EOD close + P/E + P/B for all 7 indices.

Strategy (in order — stops as soon as all 7 indices have data):
  1. niftyindices.com HTTP API — POST to Backpage.aspx endpoint.
                                  Fast when available; often blocked from CI.
  2. Playwright browser         — Downloads Daily Snapshot CSV from
                                  niftyindices.com UI. Slower, same IP issue.
  3. Yahoo Finance fallback     — Fetches official EOD close via Yahoo Finance
                                  v8 chart API (same source as live-prices route).
                                  PE/PB approximated as close ÷ prev impliedEPS/BV.
                                  Always works from GitHub Actions.

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

# ─── Index symbol maps ────────────────────────────────────────────────────────

NIFTYINDICES_NAMES: dict[str, str] = {
    "NIFTY_50":           "NIFTY 50",
    "NIFTY_BANK":         "NIFTY BANK",
    "NIFTY_IT":           "NIFTY IT",
    "NIFTY_MIDCAP_150":   "Nifty Midcap 150",
    "NIFTY_SMALLCAP_250": "Nifty Smallcap 250",
    "NIFTY_PSU_BANK":     "Nifty PSU Bank",
    "NIFTY_MICROCAP_250": "Nifty Microcap 250",
}

YAHOO_SYMBOLS: dict[str, str] = {
    "NIFTY_50":           "^NSEI",
    "NIFTY_BANK":         "^NSEBANK",
    "NIFTY_IT":           "^CNXIT",
    "NIFTY_MIDCAP_150":   "NIFTYMIDCAP150.NS",
    "NIFTY_PSU_BANK":     "^CNXPSUBANK",
    "NIFTY_MICROCAP_250": "NIFTY_MICROCAP250.NS",
    "NIFTY_SMALLCAP_250": "NIFTYSMLCAP250.NS",
}

TARGET_KEYS = list(NIFTYINDICES_NAMES.keys())

# Daily Snapshot CSV column indices (0-based)
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
    "NIFTY 50":           "NIFTY_50",
    "NIFTY BANK":         "NIFTY_BANK",
    "NIFTY IT":           "NIFTY_IT",
    "Nifty MidCap 150":   "NIFTY_MIDCAP_150",
    "Nifty SmallCap 250": "NIFTY_SMALLCAP_250",
    "NIFTY PSU Bank":     "NIFTY_PSU_BANK",
    "NIFTY Microcap 250": "NIFTY_MICROCAP_250",
}

NIFTY_INDICES_HOME = "https://www.niftyindices.com/"
NIFTY_INDICES_DATA = (
    "https://www.niftyindices.com/Backpage.aspx/getHistoricaldatatabletoString"
)

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
    return d.strftime("%-d-%b-%Y")


def format_date_for_site(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def missing_keys(results: dict) -> list[str]:
    return [k for k in TARGET_KEYS if not results.get(k)]


# ─── Strategy 1: niftyindices.com HTTP API ───────────────────────────────────

def get_session() -> requests.Session:
    session = requests.Session()
    session.headers.update(HEADERS)
    try:
        resp = session.get(NIFTY_INDICES_HOME, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"  WARNING: Could not establish niftyindices.com session: {e}")
    return session


def fetch_index_api(session, index_key: str, target_date: date, retries: int = 3) -> Optional[dict]:
    date_str = format_date_for_api(target_date)
    payload = {
        "name": NIFTYINDICES_NAMES[index_key],
        "startDate": date_str,
        "endDate": date_str,
    }
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
            close = safe_float(record.get("Closing Index Value") or record.get("Close"))
            pe    = safe_float(record.get("P/E") or record.get("pe"))
            pb    = safe_float(record.get("P/B") or record.get("pb"))
            if close is None:
                return None
            return build_metrics(close, pe, pb)
        except requests.RequestException as e:
            print(f"    Attempt {attempt+1}/{retries} failed: {e}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    return None


def fetch_all_api(target_date: date) -> dict:
    print("Strategy 1: niftyindices.com HTTP API…")
    results: dict = {}
    try:
        session = get_session()
        time.sleep(1)
    except Exception as e:
        print(f"  Session failed: {e}")
        return results
    for key in TARGET_KEYS:
        print(f"  {key}…", end=" ", flush=True)
        m = fetch_index_api(session, key, target_date)
        results[key] = m
        if m:
            print(f"close={m['close']}, pe={m['pe']}, pb={m['pb']}")
        else:
            print("no data")
        time.sleep(0.5)
    return results


# ─── Strategy 2: Playwright CSV ──────────────────────────────────────────────

def fetch_all_playwright(target_date: date) -> dict:
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
            print(f"  Page title: {page.title()}")
            print(f"  Page URL:   {page.url}")

            nav_selectors = [
                "text=Archives of Daily/Monthly Reports",
                "a:has-text('Archives')",
                "text=Daily/Monthly",
                "[href*='archives']",
                "[href*='Archives']",
            ]
            clicked = False
            for sel in nav_selectors:
                try:
                    page.locator(sel).first.click(timeout=5_000)
                    clicked = True
                    print(f"  Clicked nav: {sel}")
                    break
                except Exception:
                    continue
            if not clicked:
                links = page.locator("a").all_text_contents()
                print(f"  Visible links: {links[:30]}")
                raise RuntimeError("Could not find Archives nav element")

            page.wait_for_load_state("networkidle", timeout=20_000)
            time.sleep(3)

            for sel in ["select#ddlReports", "select[name*='Report']", "select[id*='Report']", "select"]:
                try:
                    page.locator(sel).first.select_option(label="Daily Snapshot")
                    print(f"  Selected Daily Snapshot via: {sel}")
                    break
                except Exception:
                    continue
            time.sleep(2)

            for sel in ["input[id*='date' i]", "input[name*='date' i]", "input[id*='Date']", "input[type='text']"]:
                try:
                    inp = page.locator(sel).first
                    inp.triple_click()
                    inp.fill(date_str)
                    print(f"  Set date {date_str}")
                    break
                except Exception:
                    continue
            time.sleep(1)

            page.get_by_role("button", name="Submit").first.click(timeout=10_000)
            time.sleep(5)

            with page.expect_download(timeout=30_000) as dl_info:
                try:
                    page.get_by_role("link", name=lambda n: "csv" in n.lower() or "download" in n.lower()).first.click(timeout=10_000)
                except Exception:
                    page.locator("a[href*='.csv'], button:has-text('Download')").first.click(timeout=10_000)

            csv_path = dl_info.value.path()
            with open(csv_path, "r", encoding="utf-8", errors="replace") as f:
                csv_text = f.read()
            return parse_daily_snapshot_csv(csv_text, target_date)

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


# ─── Strategy 3: Yahoo Finance EOD close + implied PE/PB ─────────────────────

YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"
YAHOO_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json",
}


def fetch_yahoo_close(symbol: str, target_date: date, retries: int = 3) -> Optional[float]:
    """
    Fetch the closing price for target_date from Yahoo Finance.
    Uses a 5-day range around the date to handle weekends/holidays.
    """
    # Use a 7-day window to ensure target_date is covered
    from datetime import timedelta
    start_ts = int(datetime(target_date.year, target_date.month, target_date.day).timestamp())
    end_ts   = int((datetime(target_date.year, target_date.month, target_date.day) + timedelta(days=1)).timestamp())

    url = (
        f"{YAHOO_BASE}/{requests.utils.quote(symbol)}"
        f"?interval=1d&period1={start_ts}&period2={end_ts}"
    )

    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=YAHOO_HEADERS, timeout=15)
            resp.raise_for_status()
            data = resp.json()
            result = data.get("chart", {}).get("result")
            if not result:
                return None
            closes = result[0].get("indicators", {}).get("quote", [{}])[0].get("close", [])
            closes = [c for c in closes if c is not None]
            if not closes:
                # Fallback: use regularMarketPrice (live/most recent close)
                price = result[0].get("meta", {}).get("regularMarketPrice")
                return safe_float(price)
            return safe_float(closes[-1])
        except requests.RequestException as e:
            print(f"    Yahoo attempt {attempt+1}/{retries} failed: {e}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
    return None


def fetch_all_yahoo(
    target_date: date,
    keys_needed: list[str],
    existing_rows: list[dict],
) -> dict:
    """
    Fetch EOD close from Yahoo Finance for the given keys.
    PE and PB are approximated: close ÷ prev_impliedEPS and close ÷ prev_impliedBV.
    The previous day's impliedEPS/BV values are read from existing_rows.
    """
    print("Strategy 3: Yahoo Finance EOD close + implied PE/PB…")

    # Find the most recent row before target_date for each index
    prev_metrics: dict[str, dict] = {}
    target_iso = target_date.isoformat()
    for row in reversed(existing_rows):
        if row["date"] >= target_iso:
            continue
        for key in keys_needed:
            if key not in prev_metrics and row.get(key):
                prev_metrics[key] = row[key]
        if len(prev_metrics) == len(keys_needed):
            break

    results: dict = {}
    for key in keys_needed:
        symbol = YAHOO_SYMBOLS.get(key)
        if not symbol:
            continue
        print(f"  {key} ({symbol})…", end=" ", flush=True)
        close = fetch_yahoo_close(symbol, target_date)
        if close is None:
            print("no data from Yahoo")
            continue

        prev = prev_metrics.get(key, {})
        prev_eps = prev.get("impliedEPS")
        prev_bv  = prev.get("impliedBV")

        pe = round(close / prev_eps, 4) if prev_eps else None
        pb = round(close / prev_bv,  4) if prev_bv  else None

        results[key] = build_metrics(close, pe, pb)
        print(f"close={close}, pe={pe} (approx), pb={pb} (approx)")

    return results


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

    if target_iso in {r["date"] for r in rows}:
        print(f"Date {target_iso} already exists — nothing to do.")
        return

    # ── Strategy 1: niftyindices.com HTTP API ─────────────────────────────────
    results = fetch_all_api(target_date)

    # ── Strategy 2: Playwright (for any remaining) ────────────────────────────
    still_missing = missing_keys(results)
    if still_missing:
        print(f"\n{len(still_missing)} indices missing — trying Playwright…")
        pw = fetch_all_playwright(target_date)
        for k, v in pw.items():
            if v and not results.get(k):
                results[k] = v

    # ── Strategy 3: Yahoo Finance fallback (for any still remaining) ──────────
    still_missing = missing_keys(results)
    if still_missing:
        print(f"\n{len(still_missing)} indices still missing — falling back to Yahoo Finance…")
        yf = fetch_all_yahoo(target_date, still_missing, rows)
        for k, v in yf.items():
            if v and not results.get(k):
                results[k] = v

    # ── Build new row ─────────────────────────────────────────────────────────
    new_row: dict = {"date": target_iso}
    null_entry = {"close": None, "pe": None, "pb": None, "impliedEPS": None, "impliedBV": None}
    all_ok = True
    for key in TARGET_KEYS:
        m = results.get(key)
        if m and m.get("close"):
            new_row[key] = m
        else:
            print(f"  FAILED: {key} — all strategies exhausted, using null")
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

    status = "OK" if all_ok else "PARTIAL (Yahoo Finance approximation used for some indices)"
    print(f"\n[{status}] Written {len(deduped)} rows → {output_path}")
    # Don't exit 1 for Yahoo approximation — we still have valid close prices
    # Only exit 1 if we have complete null rows
    truly_failed = [k for k in TARGET_KEYS if not new_row[k].get("close")]
    if truly_failed:
        print(f"Truly failed (null close): {truly_failed}")
        sys.exit(1)


if __name__ == "__main__":
    main()
