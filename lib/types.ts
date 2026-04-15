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

export type TimeWindow = "3M" | "6M" | "1Y" | "2Y" | "3Y" | "5Y" | "ALL";

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
