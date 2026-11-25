#!/usr/bin/env python3
"""
fetch-byey.py

Fetches the India 10Y government bond yield from Trading Economics, reads Nifty 50
close + PE from data/historical.json, computes Earnings Yield (EY = 1/PE) and the
BY-EY spread (bondYield − EY), and appends the row to data/byey.json.

Trading Economics only publishes the current yield, with no date attached. Outside
market hours that value is the close of the last completed NSE session, so it is
only ever written for that one date — never copied onto older missed dates.
(investing.com, the old dated history source, blocks CI runners and timed out on
every run from September 2026 on, so it was dropped.)

This script is designed to run AFTER fetch-eod.py so that historical.json
already contains the day's Nifty 50 PE before this script reads it.

Usage:
    python scripts/fetch-byey.py
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.request

from nse_calendar import last_completed_session, now_ist, is_trading_day, MARKET_CLOSE

SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
BYEY_PATH    = os.path.join(PROJECT_ROOT, "data", "byey.json")
HIST_PATH    = os.path.join(PROJECT_ROOT, "data", "historical.json")

TE_URL = "https://tradingeconomics.com/india/government-bond-yield"
# Anchor on the page's chart metadata for the India 10Y ticker, not the first
# "value" anywhere on the page.
TE_PATTERN = re.compile(r'TEChartsMeta\s*=\s*\[\{"value":([0-9.]+)[^}]*?"symbol":"GIND10YR:IND"')


def fetch_bond_yield_te() -> float | None:
    """Current India 10Y yield as a decimal (e.g. 0.068710), or None on failure."""
    req = urllib.request.Request(TE_URL, headers={"User-Agent": "Mozilla/5.0 (compatible; fetch-byey/2.0)"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        match = TE_PATTERN.search(html)
        if match:
            pct = float(match.group(1))
            if 1 < pct < 25:
                return round(pct / 100, 6)   # e.g. 6.871 → 0.068710
        print("  WARNING: India 10Y value not found on the Trading Economics page (layout changed?)")
    except Exception as e:
        print(f"  WARNING: Trading Economics fetch failed: {e}")
    return None


def main() -> None:
    now = now_ist()
    if is_trading_day(now.date()) and now.time() < MARKET_CLOSE and now.hour >= 9:
        print("Market session in progress — the live yield isn't a close yet. Skipping.")
        return

    session = last_completed_session(now).isoformat()

    with open(BYEY_PATH) as f:
        byey_data: list[dict] = json.load(f)
    with open(HIST_PATH) as f:
        hist_map = {r["date"]: r for r in json.load(f)}

    existing_dates = {r["date"] for r in byey_data}
    missed = sorted(d for d in hist_map if d < session and d >= "2026-01-01" and d not in existing_dates)
    if missed:
        print(f"  NOTE: no dated yield source for {missed} — left as gaps rather than guessed.")

    if session in existing_dates:
        print(f"  {session}: already in byey.json — nothing to do.")
        return
    hist_row = hist_map.get(session)
    if hist_row is None:
        print(f"  {session}: not in historical.json yet (EOD not fetched) — skip.")
        return

    print("Fetching India 10Y bond yield from Trading Economics...")
    bond_yield = fetch_bond_yield_te()
    if bond_yield is None:
        print(f"  {session}: bond yield unavailable — skip (next run retries).")
        return

    n50   = hist_row.get("NIFTY_50") or {}
    close = n50.get("close")
    pe    = n50.get("pe")

    # Derive PE from close ÷ impliedEPS if not stored directly
    if pe is None and close and n50.get("impliedEPS"):
        pe = round(close / n50["impliedEPS"], 6)

    ey     = round(1.0 / pe, 6)        if pe         else None
    spread = round(bond_yield - ey, 6) if ey is not None else None

    byey_data.append({
        "date":      session,
        "close":     close,
        "pe":        round(pe, 6) if pe else None,
        "ey":        ey,
        "bondYield": bond_yield,
        "spread":    spread,
        "source":    "tradingeconomics",
    })
    byey_data.sort(key=lambda r: r["date"])
    with open(BYEY_PATH, "w") as f:
        json.dump(byey_data, f, indent=2)

    print(
        f"  {session}: close={close}, pe={round(pe, 3) if pe else None}, "
        f"ey={round(ey * 100, 3) if ey else None}%, bondYield={round(bond_yield * 100, 3)}%, "
        f"spread={round(spread * 100, 4) if spread is not None else None}%"
    )
    print(f"\nWritten 1 new row → {BYEY_PATH}")


if __name__ == "__main__":
    sys.exit(main())
