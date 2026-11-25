"""
nse_calendar.py
IST clock + NSE trading-day helpers shared by the fetch-*.py scripts.
Holidays live in data/nse-holidays.json, which lib/marketHours.ts also reads.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import date, datetime, time, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
MARKET_CLOSE = time(15, 30)

_HOLIDAYS_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                              "data", "nse-holidays.json")

with open(_HOLIDAYS_PATH) as _f:
    HOLIDAYS: set[str] = {k for k in json.load(_f) if not k.startswith("_")}


def now_ist() -> datetime:
    return datetime.now(IST)


def is_trading_day(d: date) -> bool:
    return d.weekday() < 5 and d.isoformat() not in HOLIDAYS


def last_completed_session(now: datetime | None = None) -> date:
    """Most recent trading day whose 3:30 PM IST close has already happened."""
    now = (now or now_ist()).astimezone(IST)
    d = now.date()
    if not (is_trading_day(d) and now.time() >= MARKET_CLOSE):
        d -= timedelta(days=1)
        while not is_trading_day(d):
            d -= timedelta(days=1)
    return d


def check_calendar(now: datetime | None = None) -> int:
    """Exit code for CI: 1 if the current IST year has no holidays listed."""
    now = (now or now_ist()).astimezone(IST)
    year = str(now.year)
    if not any(h.startswith(year) for h in HOLIDAYS):
        print(f"ERROR: data/nse-holidays.json has no {year} holidays. "
              "Add them from the NSE circular, or live/EOD date logic will treat holidays as trading days.")
        return 1
    if now.month == 12 and now.day >= 15 and not any(h.startswith(str(now.year + 1)) for h in HOLIDAYS):
        print(f"::warning::data/nse-holidays.json has no {now.year + 1} holidays yet — add them before 1 January.")
    print(f"NSE holiday calendar OK for {year}.")
    return 0


if __name__ == "__main__":
    sys.exit(check_calendar())
