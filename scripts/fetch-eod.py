#!/usr/bin/env python3
"""
fetch-eod.py
Fetches today's (or a specified date's) EOD close + P/E + P/B for all 5 indices
from niftyindices.com and appends the row to data/historical.json.

Usage:
    python scripts/fetch-eod.py [--date YYYY-MM-DD]

If --date is omitted, today's date is used.

Called by GitHub Actions at 10:30 UTC (4:00 PM IST) on weekdays.
The workflow commits any change to data/historical.json → Vercel redeploys.
"""

from __future__ import annotations

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

# ─── niftyindices.com endpoint ────────────────────────────────────────────────

NIFTY_INDICES_HOME = "https://www.niftyindices.com/"
NIFTY_INDICES_DATA = (
    "https://www.niftyindices.com/Backpage.aspx/getHistoricaldatatabletoString"
)

# Exact index name strings as accepted by the niftyindices.com POST endpoint.
# Verify these by checking the Network tab on niftyindices.com/reports/historical-data
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


def get_session() -> requests.Session:
    """Establish a session with niftyindices.com to obtain cookies."""
    session = requests.Session()
    session.headers.update(HEADERS)
    try:
        resp = session.get(NIFTY_INDICES_HOME, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f"WARNING: Could not establish niftyindices.com session: {e}")
    return session


def format_date_for_api(d: date) -> str:
    """Format date as DD-Mon-YYYY (e.g. '14-Apr-2026')."""
    return d.strftime("%-d-%b-%Y")  # Linux/Mac; Windows needs %#d


def fetch_index_eod(
    session: requests.Session,
    index_key: str,
    target_date: date,
    retries: int = 3,
) -> Optional[dict]:
    """
    Fetch EOD data for a single index on target_date from niftyindices.com.
    Returns a dict with close, pe, pb (may be None if not available).
    """
    index_name = NIFTYINDICES_NAMES[index_key]
    date_str = format_date_for_api(target_date)

    payload = {
        "name":      index_name,
        "startDate": date_str,
        "endDate":   date_str,
    }

    for attempt in range(retries):
        try:
            resp = session.post(NIFTY_INDICES_DATA, json=payload, timeout=20)
            resp.raise_for_status()
            data = resp.json()

            # The response wraps data in a "d" key which is itself a JSON string
            raw = data.get("d", data)
            if isinstance(raw, str):
                raw = json.loads(raw)

            if not raw:
                print(f"  {index_key}: No data returned for {date_str}")
                return None

            # Each record has these keys (field names may vary slightly):
            # "Index Name", "Index Date", "Closing Index Value", "P/E", "P/B"
            record = raw[0] if isinstance(raw, list) else raw

            def safe_float(val) -> Optional[float]:
                try:
                    f = float(str(val).replace(",", ""))
                    return None if math.isnan(f) or math.isinf(f) else round(f, 4)
                except (TypeError, ValueError):
                    return None

            close = safe_float(
                record.get("Closing Index Value")
                or record.get("Close")
                or record.get("closing_index_value")
            )
            pe = safe_float(record.get("P/E") or record.get("pe"))
            pb = safe_float(record.get("P/B") or record.get("pb"))

            implied_eps = round(close / pe, 2) if (close and pe and pe != 0) else None
            implied_bv  = round(close / pb, 2) if (close and pb and pb != 0) else None

            return {
                "close":      close,
                "pe":         pe,
                "pb":         pb,
                "impliedEPS": implied_eps,
                "impliedBV":  implied_bv,
            }

        except requests.RequestException as e:
            print(f"  {index_key}: Attempt {attempt+1}/{retries} failed: {e}")
            if attempt < retries - 1:
                time.sleep(2 ** attempt)

    return None


def main():
    parser = argparse.ArgumentParser(description="Fetch EOD data → historical.json")
    parser.add_argument("--date", default=None, help="Date to fetch (YYYY-MM-DD). Defaults to today.")
    args = parser.parse_args()

    # Resolve target date
    if args.date:
        target_date = datetime.strptime(args.date, "%Y-%m-%d").date()
    else:
        target_date = date.today()

    target_iso = target_date.isoformat()
    print(f"Fetching EOD data for: {target_iso}")

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

    # Establish session
    print("Establishing niftyindices.com session…")
    session = get_session()
    time.sleep(1)  # polite pause after session init

    # Fetch all 5 indices
    new_row: dict = {"date": target_iso}
    all_ok = True

    for key in NIFTYINDICES_NAMES:
        print(f"  Fetching {key}…", end=" ")
        metrics = fetch_index_eod(session, key, target_date)
        if metrics is None:
            print("FAILED — using null values")
            new_row[key] = {"close": None, "pe": None, "pb": None, "impliedEPS": None, "impliedBV": None}
            all_ok = False
        else:
            new_row[key] = metrics
            print(f"close={metrics['close']}, pe={metrics['pe']}, pb={metrics['pb']}")
        time.sleep(0.5)  # rate limiting

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
