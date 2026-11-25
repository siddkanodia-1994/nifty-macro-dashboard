import { format, subMonths, parseISO, differenceInDays } from "date-fns";
import type {
  BYEYRow,
  USDINRRow,
  HistoricalRow,
  IndexKey,
  IndexMetrics,
  IndexStats,
  MetricKey,
  TimeWindow,
  WindowStats,
  ControlLines,
} from "./types";

// ─── Basic statistics ─────────────────────────────────────────────────────────

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Population standard deviation */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function zScore(value: number, m: number, sd: number): number | null {
  if (sd === 0) return null;
  return (value - m) / sd;
}

/**
 * Percentile rank of `value` within `values` (0–100).
 * Counts proportion of values strictly less than current value.
 */
export function percentileRank(value: number, values: number[]): number {
  if (values.length === 0) return 0;
  const below = values.filter((v) => v < value).length;
  return (below / values.length) * 100;
}

// ─── Data extraction ──────────────────────────────────────────────────────────

/**
 * Returns a flat array of non-null numeric values for a given metric+index.
 */
export function extractValues(
  rows: HistoricalRow[],
  indexKey: IndexKey,
  metric: MetricKey
): number[] {
  const result: number[] = [];
  for (const row of rows) {
    const entry = row[indexKey];
    if (!entry) continue;
    const v = entry[metric];
    if (v != null && isFinite(v)) result.push(v);
  }
  return result;
}

// ─── Time window filtering ────────────────────────────────────────────────────

const WINDOW_MONTHS: Partial<Record<TimeWindow, number>> = {
  "3M": 3, "6M": 6, "1Y": 12, "2Y": 24, "3Y": 36, "4Y": 48,
};

/**
 * Rows on or after (last row's date − window), for any date-sorted series.
 * Compares ISO strings and binary-searches the start, so it's O(log n) plus a
 * slice instead of parsing every row's date.
 */
function filterRowsByWindow<T extends { date: string }>(rows: T[], window: TimeWindow): T[] {
  const months = WINDOW_MONTHS[window];
  if (months == null || rows.length === 0) return rows;

  const cutoff = format(subMonths(parseISO(rows[rows.length - 1].date), months), "yyyy-MM-dd");
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid].date < cutoff) lo = mid + 1;
    else hi = mid;
  }
  return rows.slice(lo);
}

export function filterByWindow(rows: HistoricalRow[], window: TimeWindow): HistoricalRow[] {
  return filterRowsByWindow(rows, window);
}

// ─── Control lines — computed from the selected window ───────────────────────

/**
 * Computes Mean ± 1σ/2σ from the currently selected window rows.
 * Called with windowRows (not full dataset) so bands update whenever
 * the user switches time window or metric.
 * React's useMemo in IndexPanel handles caching — no module-level cache needed.
 * Returns null if fewer than 10 data points.
 */
export function computeControlLines(
  rows: HistoricalRow[],
  indexKey: IndexKey,
  metric: MetricKey
): ControlLines | null {
  const values = extractValues(rows, indexKey, metric);
  if (values.length < 10) return null;

  const m = mean(values);
  const sd = stdDev(values);

  return {
    mean:     m,
    sd1Upper: m + sd,
    sd1Lower: m - sd,
    sd2Upper: m + 2 * sd,
    sd2Lower: m - 2 * sd,
  };
}

// ─── Windowed statistics ──────────────────────────────────────────────────────

/**
 * Computes statistics over the selected window rows.
 * `currentValue` is the latest value to compute z-score/percentile against.
 */
export function computeWindowStats(
  windowRows: HistoricalRow[],
  indexKey: IndexKey,
  metric: MetricKey,
  currentValue: number | null
): WindowStats | null {
  const values = extractValues(windowRows, indexKey, metric);
  if (values.length === 0) return null;

  const m = mean(values);
  const sd = stdDev(values);

  return {
    mean: m,
    sd,
    current: currentValue,
    zScore: currentValue != null ? zScore(currentValue, m, sd) : null,
    percentile: currentValue != null ? percentileRank(currentValue, values) : null,
    min: Math.min(...values),
    max: Math.max(...values),
    count: values.length,
  };
}

// ─── Full index stats ─────────────────────────────────────────────────────────

/**
 * Computes WindowStats for all 5 metrics for one index.
 * `currentMetrics` is typically the last row's data (EOD).
 */
export function computeIndexStats(
  windowRows: HistoricalRow[],
  indexKey: IndexKey,
  currentMetrics: IndexMetrics | null
): IndexStats {
  const cur = currentMetrics;
  return {
    close:      computeWindowStats(windowRows, indexKey, "close",      cur?.close      ?? null),
    pe:         computeWindowStats(windowRows, indexKey, "pe",         cur?.pe         ?? null),
    pb:         computeWindowStats(windowRows, indexKey, "pb",         cur?.pb         ?? null),
    impliedEPS: computeWindowStats(windowRows, indexKey, "impliedEPS", cur?.impliedEPS ?? null),
    impliedBV:  computeWindowStats(windowRows, indexKey, "impliedBV",  cur?.impliedBV  ?? null),
  };
}

// ─── Chart data preparation ───────────────────────────────────────────────────

export interface ChartPoint {
  date: string;
  value: number;
}

export function buildChartData(
  rows: HistoricalRow[],
  indexKey: IndexKey,
  metric: MetricKey
): ChartPoint[] {
  return rows
    .filter((r) => r[indexKey]?.[metric] != null)
    .map((r) => ({
      date:  r.date,
      value: r[indexKey]![metric] as number,
    }));
}

// ─── BY-EY Spread calculations ────────────────────────────────────────────────

/** Filters BYEYRow[] to the selected time window (mirrors filterByWindow). */
export function filterBYEYByWindow(rows: BYEYRow[], window: TimeWindow): BYEYRow[] {
  return filterRowsByWindow(rows, window);
}

/**
 * Computes Mean ± 1σ/2σ for the BY-EY spread within the provided rows.
 * Values are in %-points (spread × 100) for display consistency with the chart.
 * Returns null if fewer than 10 non-null spread points.
 */
export function computeBYEYControlLines(rows: BYEYRow[]): ControlLines | null {
  const values = rows
    .map((r) => r.spread)
    .filter((v): v is number => v != null && isFinite(v))
    .map((v) => v * 100);

  if (values.length < 10) return null;

  const m  = mean(values);
  const sd = stdDev(values);

  return {
    mean:     m,
    sd1Upper: m + sd,
    sd1Lower: m - sd,
    sd2Upper: m + 2 * sd,
    sd2Lower: m - 2 * sd,
  };
}

/**
 * Computes window statistics for the BY-EY spread.
 * `currentSpread` should be the raw decimal value (e.g. 0.0217);
 * internally it is converted to %-points (×100) to match chart display.
 */
export function computeBYEYWindowStats(
  rows: BYEYRow[],
  currentSpread: number | null
): WindowStats | null {
  const values = rows
    .map((r) => r.spread)
    .filter((v): v is number => v != null && isFinite(v))
    .map((v) => v * 100);

  if (values.length === 0) return null;

  const m  = mean(values);
  const sd = stdDev(values);
  const cur = currentSpread != null ? currentSpread * 100 : null;

  return {
    mean: m,
    sd,
    current: cur,
    zScore:     cur != null ? zScore(cur, m, sd) : null,
    percentile: cur != null ? percentileRank(cur, values) : null,
    min: Math.min(...values),
    max: Math.max(...values),
    count: values.length,
  };
}

/**
 * Builds chart data for the BY-EY spread.
 * Values are multiplied by 100 so the chart displays %-points (e.g. 2.17).
 */
export function buildBYEYChartData(rows: BYEYRow[]): ChartPoint[] {
  return rows
    .filter((r) => r.spread != null)
    .map((r) => ({
      date:  r.date,
      value: (r.spread as number) * 100,
    }));
}

// ─── Bond Yield calculations ──────────────────────────────────────────────────

/** Computes Mean ± 1σ/2σ for the India 10Y bond yield within the provided rows (×100 = %-points). */
export function computeBondYieldControlLines(rows: BYEYRow[]): ControlLines | null {
  const values = rows
    .map((r) => r.bondYield)
    .filter((v): v is number => v != null && isFinite(v))
    .map((v) => v * 100);
  if (values.length < 10) return null;
  const m  = mean(values);
  const sd = stdDev(values);
  return { mean: m, sd1Upper: m + sd, sd1Lower: m - sd, sd2Upper: m + 2 * sd, sd2Lower: m - 2 * sd };
}

/**
 * Computes window statistics for the India 10Y bond yield.
 * `currentYield` should be the raw decimal value (e.g. 0.0689);
 * internally it is converted to %-points (×100) to match chart display.
 */
export function computeBondYieldWindowStats(
  rows: BYEYRow[],
  currentYield: number | null
): WindowStats | null {
  const values = rows
    .map((r) => r.bondYield)
    .filter((v): v is number => v != null && isFinite(v))
    .map((v) => v * 100);
  if (values.length === 0) return null;
  const m   = mean(values);
  const sd  = stdDev(values);
  const cur = currentYield != null ? currentYield * 100 : null;
  return {
    mean: m, sd, current: cur,
    zScore:     cur != null ? zScore(cur, m, sd) : null,
    percentile: cur != null ? percentileRank(cur, values) : null,
    min: Math.min(...values), max: Math.max(...values), count: values.length,
  };
}

/** Builds chart data for the India 10Y bond yield (values ×100 = %-points). */
export function buildBondYieldChartData(rows: BYEYRow[]): ChartPoint[] {
  return rows
    .filter((r) => r.bondYield != null)
    .map((r) => ({ date: r.date, value: (r.bondYield as number) * 100 }));
}

// ─── Forward ratio series ──────────────────────────────────────────────────────

/**
 * Computes forward PE/PB series for an index.
 * For each row at date D, looks up the row at D+365 days (next available trading day).
 * If found, uses that row's impliedEPS/impliedBV as the forward value.
 * If not found (too recent), extrapolates using baseGrowthPct.
 * Rows are date-sorted, so the D+365 row is found with a single forward-moving
 * pointer — O(n) per call rather than a search per row.
 */
export function buildForwardRatioSeries(
  rows: HistoricalRow[],
  indexKey: IndexKey,
  baseGrowthPct: number
): { date: string; fwdPE: number | null; fwdPB: number | null }[] {
  let j = 0;
  return rows.map((row) => {
    const targetDate = new Date(row.date + "T00:00:00Z");
    targetDate.setUTCDate(targetDate.getUTCDate() + 365);
    const targetISO = targetDate.toISOString().slice(0, 10);
    while (j < rows.length && rows[j].date < targetISO) j++;

    const m = row[indexKey];
    if (!m) return { date: row.date, fwdPE: null, fwdPB: null };
    const close = m.close;
    if (close == null) return { date: row.date, fwdPE: null, fwdPB: null };

    const fwdRow = j < rows.length ? rows[j] : undefined;

    let fwdEPS: number | null;
    let fwdBV: number | null;

    if (fwdRow) {
      fwdEPS = fwdRow[indexKey]?.impliedEPS ?? null;
      fwdBV  = fwdRow[indexKey]?.impliedBV  ?? null;
    } else {
      fwdEPS = m.impliedEPS != null ? m.impliedEPS * (1 + baseGrowthPct / 100) : null;
      fwdBV  = m.impliedBV  != null ? m.impliedBV  * (1 + baseGrowthPct / 100) : null;
    }

    const fwdPE = fwdEPS != null && fwdEPS !== 0 ? close / fwdEPS : null;
    const fwdPB = fwdBV  != null && fwdBV  !== 0 ? close / fwdBV  : null;

    return { date: row.date, fwdPE, fwdPB };
  });
}

// ─── EPS CAGR ────────────────────────────────────────────────────────────────

/**
 * Builds a BYEYRow-compatible series for any index.
 * For NIFTY_50 returns the pre-computed byeyData as-is.
 * For other indices, derives PE/EY from historicalData and joins bond yield from byeyData by date.
 */
export function buildByeyForIndex(
  historicalData: HistoricalRow[],
  byeyData: BYEYRow[],
  indexKey: IndexKey
): BYEYRow[] {
  if (indexKey === "NIFTY_50") return byeyData;

  const bondYieldMap = new Map<string, number | null>();
  for (const row of byeyData) {
    bondYieldMap.set(row.date, row.bondYield);
  }

  return historicalData.map((r) => {
    const m = r[indexKey] as IndexMetrics | null;
    const bondYield = bondYieldMap.get(r.date) ?? null;
    const pe = m?.pe ?? null;
    const ey = pe != null && pe > 0 ? 1 / pe : null;
    const spread = bondYield != null && ey != null ? bondYield - ey : null;
    return {
      date:      r.date,
      close:     m?.close     ?? null,
      pe,
      ey,
      bondYield,
      spread,
    };
  });
}

// ─── USD/INR exchange rate calculations ──────────────────────────────────────

/** Filters USDINRRow[] to the selected time window (mirrors filterBYEYByWindow). */
export function filterUSDINRByWindow(rows: USDINRRow[], window: TimeWindow): USDINRRow[] {
  return filterRowsByWindow(rows, window);
}

/** Computes Mean ± 1σ/2σ for the USD/INR rate within the provided rows. */
export function computeUSDINRControlLines(rows: USDINRRow[]): ControlLines | null {
  const values = rows
    .map((r) => r.rate)
    .filter((v): v is number => v != null && isFinite(v));
  if (values.length < 10) return null;
  const m  = mean(values);
  const sd = stdDev(values);
  return { mean: m, sd1Upper: m + sd, sd1Lower: m - sd, sd2Upper: m + 2 * sd, sd2Lower: m - 2 * sd };
}

/**
 * Computes window statistics for the USD/INR exchange rate.
 * Rate is stored and displayed directly (e.g. 84.25), no unit conversion.
 */
export function computeUSDINRWindowStats(
  rows: USDINRRow[],
  currentRate: number | null
): WindowStats | null {
  const values = rows
    .map((r) => r.rate)
    .filter((v): v is number => v != null && isFinite(v));
  if (values.length === 0) return null;
  const m  = mean(values);
  const sd = stdDev(values);
  return {
    mean: m, sd, current: currentRate,
    zScore:     currentRate != null ? zScore(currentRate, m, sd) : null,
    percentile: currentRate != null ? percentileRank(currentRate, values) : null,
    min: Math.min(...values), max: Math.max(...values), count: values.length,
  };
}

/** Builds chart data for the USD/INR rate (value = raw rate, no conversion). */
export function buildUSDINRChartData(rows: USDINRRow[]): ChartPoint[] {
  return rows
    .filter((r) => r.rate != null)
    .map((r) => ({ date: r.date, value: r.rate as number }));
}

export function computeEpsCagr(
  rows: HistoricalRow[],
  indexKey: IndexKey
): { cagr: number; startEPS: number; endEPS: number; years: number } | null {
  let startEntry: { date: string; eps: number } | null = null;
  let endEntry:   { date: string; eps: number } | null = null;

  for (const row of rows) {
    const eps = (row[indexKey] as IndexMetrics | null)?.impliedEPS;
    if (eps != null && eps > 0) {
      if (!startEntry) startEntry = { date: row.date, eps };
      endEntry = { date: row.date, eps };
    }
  }

  if (!startEntry || !endEntry || startEntry.date === endEntry.date) return null;

  const years = differenceInDays(parseISO(endEntry.date), parseISO(startEntry.date)) / 365.25;
  if (years < 0.25) return null;

  const cagr = Math.pow(endEntry.eps / startEntry.eps, 1 / years) - 1;
  return { cagr, startEPS: startEntry.eps, endEPS: endEntry.eps, years };
}
