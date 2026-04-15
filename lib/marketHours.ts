/**
 * Returns true if NSE market is currently open (9:15 AM – 3:30 PM IST, Mon–Fri).
 * All calculation is in UTC to avoid local-timezone surprises on the server.
 */
export function isMarketOpen(now: Date = new Date()): boolean {
  const utcHour    = now.getUTCHours();
  const utcMinute  = now.getUTCMinutes();
  const utcMinutes = utcHour * 60 + utcMinute;

  // IST = UTC + 5:30 = UTC + 330 minutes
  // Total minutes since UTC midnight, projected into IST
  const istTotalMinutes = utcMinutes + 330;
  // Normalise to [0, 1440)
  const istMinutes = istTotalMinutes % 1440;

  // Compute IST day-of-week (0=Sun, 1=Mon … 6=Sat)
  // If istTotalMinutes >= 1440, the IST day is ahead of the UTC day
  const utcDay  = now.getUTCDay();
  const istDay  = istTotalMinutes >= 1440 ? (utcDay + 1) % 7 : utcDay;

  const isWeekday = istDay >= 1 && istDay <= 5;         // Mon–Fri
  const afterOpen = istMinutes >= 9 * 60 + 15;          // >= 9:15 AM IST
  const beforeClose = istMinutes <= 15 * 60 + 30;       // <= 3:30 PM IST

  return isWeekday && afterOpen && beforeClose;
}
