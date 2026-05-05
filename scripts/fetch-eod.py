#!/usr/bin/env python3
"""
fetch-eod.py
Fetches today's (or a specified date's) EOD close + P/E + P/B for all 13 indices.

Strategy (in order — stops as soon as all 7 indices have data):
  1. niftyindices.com HTTP GET — Fetches /reports/daily-reports (publicly accessible,
                                  no login/cookies needed). Extracts the two Daily
                                  Snapshot CSV download links and parses them.
                                  Fast and reliable from any IP including CI.
  2. Playwright browser         — Navigates to /reports/daily-reports in a headless
                                  browser and clicks the "Daily Snapshot (csv)" links.
                                  Fallback if HTTP is blocked.
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
import re
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
    "NIFTY_50":             "NIFTY 50",
    "NIFTY_BANK":           "NIFTY BANK",
    "NIFTY_IT":             "NIFTY IT",
    "NIFTY_MIDCAP_150":     "Nifty Midcap 150",
    "NIFTY_SMALLCAP_250":   "Nifty Smallcap 250",
    "NIFTY_PSU_BANK":       "Nifty PSU Bank",
    "NIFTY_MICROCAP_250":   "Nifty Microcap 250",
    "NIFTY_AUTO":           "Nifty Auto",
    "NIFTY_FIN_SERVICE":    "Nifty Financial Services",
    "NIFTY_REALTY":         "Nifty Realty",
    "NIFTY_METAL":          "Nifty Metal",
    "NIFTY_CAPITAL_MARKETS":"Nifty Capital Markets",
    "NIFTY_INDIA_DEFENCE":  "Nifty India Defence",
}

YAHOO_SYMBOLS: dict[str, str] = {
    "NIFTY_50":             "^NSEI",
    "NIFTY_BANK":           "^NSEBANK",
    "NIFTY_IT":             "^CNXIT",
    "NIFTY_MIDCAP_150":     "NIFTYMIDCAP150.NS",
    "NIFTY_PSU_BANK":       "^CNXPSUBANK",
    "NIFTY_MICROCAP_250":   "NIFTY_MICROCAP250.NS",
    "NIFTY_SMALLCAP_250":   "NIFTYSMLCAP250.NS",
    "NIFTY_AUTO":           "^CNXAUTO",
    "NIFTY_FIN_SERVICE":    "NIFTYFINSERVICE.NS",
    "NIFTY_REALTY":         "^CNXREALTY",
    "NIFTY_METAL":          "^CNXMETAL",
    "NIFTY_CAPITAL_MARKETS":"NIFTYCAPMKT.NS",
    "NIFTY_INDIA_DEFENCE":  "NIFTYINDIADEFENCE.NS",
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
    "Nifty Microcap 250":       "NIFTY_MICROCAP_250",
    "NIFTY 50":                 "NIFTY_50",
    "NIFTY BANK":               "NIFTY_BANK",
    "NIFTY IT":                 "NIFTY_IT",
    "Nifty MidCap 150":         "NIFTY_MIDCAP_150",
    "Nifty SmallCap 250":       "NIFTY_SMALLCAP_250",
    "NIFTY PSU Bank":           "NIFTY_PSU_BANK",
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


# ─── Strategy 1: niftyindices.com Daily Reports HTTP GET ─────────────────────

def fetch_all_daily_reports(target_date: date) -> dict:
    """
    GET /reports/daily-reports — publicly accessible, no cookies needed.
    Page has 2 CSV download links: /Daily_Snapshot/ind_close_all_DDMMYYYY.csv
    Download both, parse each for target_date rows, merge results.
    """
    print("Strategy 1: niftyindices.com Daily Reports (HTTP GET)…")

    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Referer": "https://www.niftyindices.com/",
    })

    try:
        resp = session.get(DAILY_REPORTS_URL, timeout=15)
        resp.raise_for_status()
        html = resp.text
        print(f"  Page fetched ({len(html)} bytes)")
    except requests.RequestException as e:
        print(f"  HTTP GET failed: {e}")
        return {}

    # Extract CSV hrefs — confirmed pattern: /Daily_Snapshot/ind_close_all_DDMMYYYY.csv
    csv_links = re.findall(
        r'href=["\']([^"\']*Daily_Snapshot[^"\']*\.csv[^"\']*)["\']',
        html,
        re.IGNORECASE,
    )
    if not csv_links:
        # Fallback: any .csv href
        csv_links = re.findall(r'href=["\']([^"\']+\.csv[^"\']*)["\']', html, re.IGNORECASE)

    print(f"  Found {len(csv_links)} CSV link(s): {csv_links}")

    if not csv_links:
        print("  No CSV links found — page structure may have changed")
        return {}

    found: dict = {}
    for link in csv_links[:2]:
        if not link.startswith("http"):
            link = "https://www.niftyindices.com" + link
        try:
            csv_resp = session.get(link, timeout=15)
            csv_resp.raise_for_status()
            csv_text = csv_resp.content.decode("utf-8", errors="replace")
            parsed = parse_daily_snapshot_csv(csv_text, target_date)
            for k, v in parsed.items():
                if k not in found and v:
                    found[k] = v
            print(f"  Parsed {link}: got {list(parsed.keys())}")
        except requests.RequestException as e:
            print(f"  Failed to download {link}: {e}")

    return found


# ─── Strategy 2: Playwright (Daily Reports page) ─────────────────────────────

def fetch_all_playwright(target_date: date) -> dict:
    print("Strategy 2: Playwright browser (Daily Reports)…")
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("  Playwright not installed — skipping.")
        return {}

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
            print("  Navigating to Daily Reports…")
            page.goto(
                DAILY_REPORTS_URL,
                timeout=60_000,
                wait_until="domcontentloaded",
            )
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


# ─── Strategy 3: Yahoo Finance EOD close + implied PE/PB ─────────────────────

YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart"
YAHOO_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept": "application/json",
}


def fetch_yahoo_close(symbol: str, target_date: date, retries: int = 3) -> Optional[float]:
    """
    Fetch the closing price for target_date from Yahoo Finance.
    Uses a 1-day window around the target date.
    """
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
    """
    print("Strategy 3: Yahoo Finance EOD close + implied PE/PB…")

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

    existing = next((r for r in rows if r["date"] == target_iso), None)
    if existing:
        n50_close = existing.get("NIFTY_50", {}).get("close")
        is_clean = n50_close is not None and round(n50_close, 2) == n50_close
        if is_clean:
            print(f"Date {target_iso} already has clean niftyindices.com data — nothing to do.")
            return
        print(f"Date {target_iso} has Yahoo approximation data (close={n50_close}) — removing and re-fetching…")
        rows = [r for r in rows if r["date"] != target_iso]

    # ── Strategy 1: HTTP GET to /reports/daily-reports ───────────────────────
    results = fetch_all_daily_reports(target_date)

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
    truly_failed = [k for k in TARGET_KEYS if not new_row[k].get("close")]
    if truly_failed:
        print(f"Truly failed (null close): {truly_failed}")
        sys.exit(1)


if __name__ == "__main__":
    main()
