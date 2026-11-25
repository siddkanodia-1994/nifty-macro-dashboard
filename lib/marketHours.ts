/**
 * NSE market-hours helpers (9:15 AM – 3:30 PM IST, Mon–Fri, excluding holidays).
 *
 * Holidays live in data/nse-holidays.json, shared with the Python fetch scripts.
 * Add each new year from the official NSE circular (published every December):
 * https://www.nseindia.com/resources/exchange-communication-holidays
 * The EOD workflow fails from 1 January if the current year is missing.
 */
import holidaysJson from "@/data/nse-holidays.json";

const NSE_HOLIDAYS = new Set(Object.keys(holidaysJson).filter((k) => !k.startsWith("_")));

const IST_OFFSET_MS = 330 * 60 * 1000;
const OPEN_MIN  = 9 * 60 + 15;  // 9:15 AM IST
const CLOSE_MIN = 15 * 60 + 30; // 3:30 PM IST

/** Live quotes older than this during market hours are treated as stale. */
export const LIVE_STALE_MS = 10 * 60 * 1000;

/** IST calendar date "YYYY-MM-DD" for an instant. */
export function istDate(now: Date = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

function istMinutes(now: Date): number {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

/** True for an NSE trading day ("YYYY-MM-DD", read as a plain calendar date). */
export function isTradingDay(date: string): boolean {
  const day = new Date(date + "T00:00:00Z").getUTCDay();
  return day >= 1 && day <= 5 && !NSE_HOLIDAYS.has(date);
}

function prevDay(date: string): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function isMarketOpen(now: Date = new Date()): boolean {
  const mins = istMinutes(now);
  return isTradingDay(istDate(now)) && mins >= OPEN_MIN && mins <= CLOSE_MIN;
}

/** The trading day before `date` ("YYYY-MM-DD"). */
export function previousTradingDay(date: string): string {
  let d = date;
  do d = prevDay(d); while (!isTradingDay(d));
  return d;
}

/** Most recent trading day whose 3:30 PM IST close has already happened. */
export function lastCompletedSession(now: Date = new Date()): string {
  const d = istDate(now);
  if (isTradingDay(d) && istMinutes(now) > CLOSE_MIN) return d;
  return previousTradingDay(d);
}
