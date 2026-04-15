import { subMonths, subYears, parseISO, isAfter, isEqual } from "date-fns";
import type {
  HistoricalRow,
  IndexKey,
  IndexMetrics,
  IndexStats,
  MetricKey,
  TimeWindow,
  WindowStats,
  ControlLines,
} from "./types";

// ─── Module-level memoization cache for fixed control lines ──────────────────
// Control lines are computed from the FULL dataset once and never change.
const controlLinesCache = new Map<string, ControlLines | null>();

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

// ─── Control lines (fixed — computed from ALL data) ───────────────────────────

/**
 * Computes and caches mean ± 1σ/2σ from the FULL historical dataset.
 * Returns null if there are fewer than 10 data points.
 */
export function computeControlLines(
  allRows: HistoricalRow[],
  indexKey: IndexKey,
  metric: MetricKey
): ControlLines | null {
  const cacheKey = `${indexKey}_${metric}`;
  if (controlLinesCache.has(cacheKey)) {
    return controlLinesCache.get(cacheKey) ?? null;
  }

  const values = extractValues(allRows, indexKey, metric);
  if (values.length < 10) {
    controlLinesCache.set(cacheKey, null);
    return null;
  }

  const m = mean(values);
  const sd = stdDev(values);

  const lines: ControlLines = {
    mean:     m,
    sd1Upper: m + sd,
    sd1Lower: m - sd,
    sd2Upper: m + 2 * sd,
    sd2Lower: m - 2 * sd,
  };

  controlLinesCache.set(cacheKey, lines);
  return lines;
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
