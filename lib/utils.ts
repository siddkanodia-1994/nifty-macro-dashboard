import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { IndexKey, IndexMeta, MetricKey, TimeWindow } from "./types";

// ─── shadcn/ui helper ─────────────────────────────────────────────────────────

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Index metadata ───────────────────────────────────────────────────────────

export const INDEX_META: IndexMeta[] = [
  { key: "NIFTY_50",             label: "NIFTY 50",             shortLabel: "N50"    },
  { key: "NIFTY_BANK",           label: "NIFTY BANK",           shortLabel: "BANK"   },
  { key: "NIFTY_PSU_BANK",       label: "NIFTY PSU BANK",       shortLabel: "PSU"    },
  { key: "NIFTY_PVT_BANK",       label: "NIFTY PVT BANK",       shortLabel: "PVT BNK"},
  { key: "NIFTY_MIDCAP_150",     label: "NIFTY MIDCAP 150",     shortLabel: "MID150" },
  { key: "NIFTY_MICROCAP_250",   label: "NIFTY MICROCAP 250",   shortLabel: "MIC250" },
  { key: "NIFTY_SMALLCAP_250",   label: "NIFTY SMALLCAP 250",   shortLabel: "SML250" },
  { key: "NIFTY_IT",             label: "NIFTY IT",             shortLabel: "IT"     },
  { key: "NIFTY_AUTO",           label: "NIFTY AUTO",           shortLabel: "AUTO"   },
  { key: "NIFTY_FIN_SERVICE",    label: "NIFTY FIN SERVICE",    shortLabel: "FIN SVC"},
  { key: "NIFTY_REALTY",         label: "NIFTY REALTY",         shortLabel: "REALTY" },
  { key: "NIFTY_METAL",          label: "NIFTY METAL",          shortLabel: "METAL"  },
  { key: "NIFTY_CAPITAL_MARKETS",label: "NIFTY CAPITAL MARKETS",shortLabel: "CAP MKT"},
  { key: "NIFTY_INDIA_DEFENCE",  label: "NIFTY INDIA DEFENCE",  shortLabel: "DEFENCE"},
];

// ─── Metric display labels ─────────────────────────────────────────────────────

export const METRIC_LABELS: Record<MetricKey, string> = {
  close:      "Close Price",
  pe:         "P/E Ratio",
  pb:         "P/B Ratio",
  impliedEPS: "Implied EPS",
  impliedBV:  "Implied Book Value",
};

export const METRIC_SHORT_LABELS: Record<MetricKey, string> = {
  close:      "Close",
  pe:         "P/E",
  pb:         "P/B",
  impliedEPS: "Implied EPS",
  impliedBV:  "Implied BV",
};

// ─── Number formatters ────────────────────────────────────────────────────────

export function formatPrice(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatRatio(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toFixed(2) + "x";
}

export function formatEPS(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatZScore(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return sign + n.toFixed(2);
}

export function formatPercentile(n: number | null | undefined): string {
  if (n == null) return "—";
  const rounded = Math.round(n);
  const suffix =
    rounded === 1 || rounded === 21 || rounded === 31 || rounded === 41 ||
    rounded === 51 || rounded === 61 || rounded === 71 || rounded === 81 ||
    rounded === 91
      ? "st"
      : rounded === 2 || rounded === 22 || rounded === 32 || rounded === 42 ||
        rounded === 52 || rounded === 62 || rounded === 72 || rounded === 82 ||
        rounded === 92
      ? "nd"
      : rounded === 3 || rounded === 23 || rounded === 33 || rounded === 43 ||
        rounded === 53 || rounded === 63 || rounded === 73 || rounded === 83 ||
        rounded === 93
      ? "rd"
      : "th";
  return `${rounded}${suffix}`;
}

export function formatChange(n: number | null | undefined, showSign = true): string {
  if (n == null) return "—";
  const sign = showSign && n >= 0 ? "+" : "";
  return sign + n.toFixed(2);
}

export function formatPercent(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return sign + n.toFixed(2) + "%";
}

/** Plain percentage without sign prefix — for displaying yields, spreads, etc. */
export function formatPct(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return n.toFixed(decimals) + "%";
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

export function formatDateShort(iso: string): string {
  const [y, m] = iso.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m, 10) - 1]} '${y.slice(2)}`;
}

// ─── Metric formatter dispatcher ─────────────────────────────────────────────

export function formatMetric(metric: MetricKey, value: number | null | undefined): string {
  if (value == null) return "—";
  switch (metric) {
    case "close":      return formatPrice(value);
    case "pe":         return formatRatio(value);
    case "pb":         return formatRatio(value);
    case "impliedEPS": return formatEPS(value);
    case "impliedBV":  return formatPrice(value);
  }
}

// ─── Time window utilities ────────────────────────────────────────────────────

export const TIME_WINDOWS: TimeWindow[] = ["3M", "6M", "1Y", "2Y", "3Y", "4Y", "ALL"];

export function getWindowLabel(w: TimeWindow): string {
  return w;
}

// ─── Z-score → colour ─────────────────────────────────────────────────────────

export function zScoreColor(z: number | null): string {
  if (z == null) return "text-zinc-400";
  if (z < -1.5) return "text-emerald-600";
  if (z < -0.5) return "text-emerald-500";
  if (z > 1.5)  return "text-red-600";
  if (z > 0.5)  return "text-red-500";
  return "text-zinc-500";
}

export function zScoreBgColor(z: number | null): string {
  if (z == null) return "bg-zinc-100 text-zinc-500";
  if (z < -1)   return "bg-emerald-50 text-emerald-700";
  if (z > 1)    return "bg-red-50 text-red-700";
  return "bg-zinc-100 text-zinc-600";
}

// ─── Index key guard ─────────────────────────────────────────────────────────

export function isIndexKey(s: string): s is IndexKey {
  return [
    "NIFTY_50","NIFTY_BANK","NIFTY_MIDCAP_150","NIFTY_SMALLCAP_250","NIFTY_IT","NIFTY_PSU_BANK","NIFTY_MICROCAP_250",
    "NIFTY_AUTO","NIFTY_FIN_SERVICE","NIFTY_REALTY","NIFTY_METAL","NIFTY_CAPITAL_MARKETS","NIFTY_INDIA_DEFENCE",
    "NIFTY_PVT_BANK",
  ].includes(s);
}
