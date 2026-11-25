import { INDEX_META } from "@/lib/utils";
import type { HistoricalRow, IndexKey, IndexMetrics } from "@/lib/types";

/**
 * Column-oriented form of historical.json for the page payload. Row objects repeat
 * every index and field name ~1,150 times and carry up to 15 decimals; columns of
 * 2-dp numbers serialise to roughly a third of the size. The page encodes on the
 * server, IndexTabs decodes once in the browser.
 */
const FIELDS = ["close", "pe", "pb", "impliedEPS", "impliedBV"] as const satisfies readonly (keyof IndexMetrics)[];

export interface CompactHistory {
  dates: string[];
  series: Record<IndexKey, Record<(typeof FIELDS)[number], (number | null)[]>>;
}

const round2 = (v: number | null | undefined): number | null =>
  typeof v === "number" && isFinite(v) ? Math.round(v * 100) / 100 : null;

export function encodeHistory(rows: HistoricalRow[]): CompactHistory {
  const series = {} as CompactHistory["series"];
  for (const { key } of INDEX_META) {
    const cols = {} as CompactHistory["series"][IndexKey];
    for (const f of FIELDS) cols[f] = rows.map((r) => round2(r[key]?.[f]));
    series[key] = cols;
  }
  return { dates: rows.map((r) => r.date), series };
}

export function decodeHistory({ dates, series }: CompactHistory): HistoricalRow[] {
  return dates.map((date, i) => {
    const row = { date } as HistoricalRow;
    for (const { key } of INDEX_META) {
      const cols = series[key];
      const m = {} as IndexMetrics;
      let any = false;
      for (const f of FIELDS) {
        m[f] = cols[f][i];
        if (m[f] != null) any = true;
      }
      // An index with no data that day (not yet launched, or a failed fetch) is null.
      row[key] = any ? m : null;
    }
    return row;
  });
}
