/**
 * Returns true if NSE market is currently open (9:15 AM – 3:30 PM IST, Mon–Fri).
 * Excludes weekends and the NSE trading holiday calendar below.
 *
 * Update NSE_HOLIDAYS at the start of each year from the official NSE circular:
 * https://www.nseindia.com/resources/exchange-communication-holidays
 */

// ISO "YYYY-MM-DD" strings (in IST) on which NSE is closed despite being a weekday.
// Fixed-date holidays are reliable. Lunar/festival dates shift each year — verify
// the approximate dates below against the official NSE circular before each year begins.
const NSE_HOLIDAYS: Set<string> = new Set([
  // ── 2026 ─────────────────────────────────────────────────────────────────
  "2026-01-26", // Republic Day
  "2026-02-16", // Mahashivratri          ← verify from NSE circular
  "2026-02-19", // Chhatrapati Shivaji Maharaj Jayanti
  "2026-03-03", // Holi                   ← verify from NSE circular
  "2026-04-03", // Good Friday
  "2026-04-14", // Dr. Baba Saheb Ambedkar Jayanti
  "2026-05-01", // Maharashtra Day / May Day
  "2026-08-18", // Ganesh Chaturthi       ← verify from NSE circular
  "2026-10-02", // Gandhi Jayanti
  "2026-10-09", // Diwali — Laxmi Puja    ← verify from NSE circular
  "2026-10-10", // Diwali — Balipratipada ← verify from NSE circular
  "2026-10-26", // Guru Nanak Jayanti     ← verify from NSE circular
  "2026-12-25", // Christmas
]);

export function isMarketOpen(now: Date = new Date()): boolean {
  const utcHour    = now.getUTCHours();
  const utcMinute  = now.getUTCMinutes();
  const utcMinutes = utcHour * 60 + utcMinute;

  // IST = UTC + 5:30 = UTC + 330 minutes
  const istTotalMinutes = utcMinutes + 330;
  // Normalise to [0, 1440)
  const istMinutes = istTotalMinutes % 1440;

  // Compute IST day-of-week (0=Sun, 1=Mon … 6=Sat)
  const utcDay = now.getUTCDay();
  const istDay = istTotalMinutes >= 1440 ? (utcDay + 1) % 7 : utcDay;

  const isWeekday   = istDay >= 1 && istDay <= 5;
  const afterOpen   = istMinutes >= 9 * 60 + 15;   // >= 9:15 AM IST
  const beforeClose = istMinutes <= 15 * 60 + 30;  // <= 3:30 PM IST

  if (!isWeekday || !afterOpen || !beforeClose) return false;

  // Derive the IST calendar date and check against the holiday list
  const istDate = new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
  return !NSE_HOLIDAYS.has(istDate);
}
