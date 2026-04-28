// ─── Index Keys ──────────────────────────────────────────────────────────────

export type IndexKey =
  | "NIFTY_50"
  | "NIFTY_BANK"
  | "NIFTY_MIDCAP_150"
  | "NIFTY_SMALLCAP_250"
  | "NIFTY_IT"
  | "NIFTY_PSU_BANK"
  | "NIFTY_MICROCAP_250";

// ─── Metric Keys ─────────────────────────────────────────────────────────────

export type MetricKey = "close" | "pe" | "pb" | "impliedEPS" | "impliedBV";

// ─── Time Windows ────────────────────────────────────────────────────────────

export type TimeWindow = "3M" | "6M" | "1Y" | "2Y" | "3Y" | "4Y" | "ALL";

// ─── Per-index metrics for one trading day ───────────────────────────────────

export interface IndexMetrics {
  close: number | null;
  pe: number | null;
  pb: number | null;
  impliedEPS: number | null;
  impliedBV: number | null;
}

// ─── One row of historical.json ───────────────────────────────────────────────

export interface HistoricalRow {
  date: string; // ISO "YYYY-MM-DD"
  NIFTY_50: IndexMetrics;
  NIFTY_BANK: IndexMetrics;
  NIFTY_MIDCAP_150: IndexMetrics;
  NIFTY_SMALLCAP_250: IndexMetrics;
  NIFTY_IT: IndexMetrics;
  NIFTY_PSU_BANK: IndexMetrics;
  NIFTY_MICROCAP_250: IndexMetrics;
}

// ─── Statistics over a selected window ───────────────────────────────────────

export interface WindowStats {
  mean: number;
  sd: number;
  current: number | null;
  zScore: number | null;
  percentile: number | null;
  min: number;
  max: number;
  count: number;
}

// ─── Full stats for one index (across all metrics) ───────────────────────────

export interface IndexStats {
  close: WindowStats | null;
  pe: WindowStats | null;
  pb: WindowStats | null;
  impliedEPS: WindowStats | null;
  impliedBV: WindowStats | null;
}

// ─── Fixed control lines computed from ALL historical data ───────────────────
// These remain constant regardless of the selected time window.

export interface ControlLines {
  mean: number;
  sd1Upper: number; // mean + 1σ
  sd1Lower: number; // mean − 1σ
  sd2Upper: number; // mean + 2σ
  sd2Lower: number; // mean − 2σ
}

// ─── Index display metadata ───────────────────────────────────────────────────

export interface IndexMeta {
  key: IndexKey;
  label: string;
  shortLabel: string;
}

// ─── Macro Score ─────────────────────────────────────────────────────────────

export type MacroParamId =
  | "EPS_GROWTH"
  | "ROE"
  | "CREDIT_GROWTH"
  | "BOND_YIELD"
  | "MKTCAP_DEBT"
  | "GEO_POLITICS"
  | "DOMESTIC_POLICIES";

export interface RubricBand {
  max: number;
  score: number;
}

export interface AnalysisOverrides {
  peAvg?: number | null;       // stored as-is (e.g. 21.0)
  niftyReturn?: number | null; // stored as percent (e.g. 28.6 for 28.6%)
  scoreGrowthYoY?: number | null; // stored as percent (e.g. 8.3 for 8.3%)
}

export interface MacroYearData {
  fy: string;
  isEstimate: boolean;
  rawData: Partial<Record<MacroParamId, number>>;
  qualLabels: { GEO_POLITICS?: string; DOMESTIC_POLICIES?: string };
  manualScores: Partial<Record<MacroParamId, number>>;
  analysisOverrides?: AnalysisOverrides;
}

export interface MacroScoreData {
  rubric: Partial<Record<MacroParamId, RubricBand[]>>;
  weightages: Record<MacroParamId, number>;
  years: MacroYearData[];
}

// ─── BY-EY Spread data (one row of byey.json) ────────────────────────────────

export interface BYEYRow {
  date: string;          // "YYYY-MM-DD"
  close: number | null;
  pe: number | null;
  ey: number | null;        // Earnings Yield, decimal (e.g. 0.0476)
  bondYield: number | null; // decimal (e.g. 0.0690)
  spread: number | null;    // bondYield − ey, decimal (e.g. 0.0217)
}
