import { subMonths, subYears, parseISO, isAfter, isEqual } from "date-fns";
import type {
  BYEYRow,
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
    const v = row[indexKey][metric];
    if (v != null && isFinite(v)) result.push(v);
  }
  return result;
}

// ─── Time window filtering ────────────────────────────────────────────────────

export function filterByWindow(rows: HistoricalRow[], window: TimeWindow): HistoricalRow[] {
  if (window === "ALL") return rows;

  const now = rows.length > 0 ? parseISO(rows[rows.length - 1].date) : new Date();
  let cutoff: Date;
  switch (window) {
    case "3M": cutoff = subMonths(now, 3);  break;
    case "6M": cutoff = subMonths(now, 6);  break;
    case "1Y": cutoff = subYears(now, 1);   break;
    case "2Y": cutoff = subYears(now, 2);   break;
    case "3Y": cutoff = subYears(now, 3);   break;
    case "5Y": cutoff = subYears(now, 5);   break;
    default:   return rows;
  }

  return rows.filter((r) => {
    const d = parseISO(r.date);
    return isAfter(d, cutoff) || isEqual(d, cutoff);
  });
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
    .filter((r) => r[indexKey][metric] != null)
    .map((r) => ({
      date:  r.date,
      value: r[indexKey][metric] as number,
    }));
}

// ─── BY-EY Spread calculations ────────────────────────────────────────────────

/** Filters BYEYRow[] to the selected time window (mirrors filterByWindow). */
export function filterBYEYByWindow(rows: BYEYRow[], window: TimeWindow): BYEYRow[] {
  if (window === "ALL") return rows;

  const now = rows.length > 0 ? parseISO(rows[rows.length - 1].date) : new Date();
  let cutoff: Date;
  switch (window) {
    case "3M": cutoff = subMonths(now, 3);  break;
    case "6M": cutoff = subMonths(now, 6);  break;
    case "1Y": cutoff = subYears(now, 1);   break;
    case "2Y": cutoff = subYears(now, 2);   break;
    case "3Y": cutoff = subYears(now, 3);   break;
    case "5Y": cutoff = subYears(now, 5);   break;
    default:   return rows;
  }

  return rows.filter((r) => {
    const d = parseISO(r.date);
    return isAfter(d, cutoff) || isEqual(d, cutoff);
  });
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

// ─── Forward ratio series ──────────────────────────────────────────────────────

/**
 * Computes forward PE/PB series for an index.
 * For each row at date D, looks up the row at D+365 days (next available trading day).
 * If found, uses that row's impliedEPS/impliedBV as the forward value.
 * If not found (too recent), extrapolates using baseGrowthPct.
 */
export function buildForwardRatioSeries(
  rows: HistoricalRow[],
  indexKey: IndexKey,
  baseGrowthPct: number
): { date: string; fwdPE: number | null; fwdPB: number | null }[] {
  return rows.map((row) => {
    const m = row[indexKey];
    const close = m.close;
    if (close == null) return { date: row.date, fwdPE: null, fwdPB: null };

    const targetISO = new Date(parseISO(row.date).getTime() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const fwdRow = rows.find((r) => r.date >= targetISO);

    let fwdEPS: number | null;
    let fwdBV: number | null;

    if (fwdRow) {
      fwdEPS = fwdRow[indexKey].impliedEPS;
      fwdBV  = fwdRow[indexKey].impliedBV;
    } else {
      fwdEPS = m.impliedEPS != null ? m.impliedEPS * (1 + baseGrowthPct / 100) : null;
      fwdBV  = m.impliedBV  != null ? m.impliedBV  * (1 + baseGrowthPct / 100) : null;
    }

    const fwdPE = fwdEPS != null && fwdEPS !== 0 ? close / fwdEPS : null;
    const fwdPB = fwdBV  != null && fwdBV  !== 0 ? close / fwdBV  : null;

    return { date: row.date, fwdPE, fwdPB };
  });
}
