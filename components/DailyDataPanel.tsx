"use client";

import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { TimeWindowSelector } from "@/components/TimeWindowSelector";
import {
  filterByWindow,
  extractValues,
  mean,
  stdDev,
  zScore,
  computeWindowStats,
} from "@/lib/calculations";
import {
  INDEX_META,
  METRIC_LABELS,
  METRIC_SHORT_LABELS,
  formatMetric,
  formatZScore,
  formatDate,
  formatPct,
  zScoreColor,
  cn,
} from "@/lib/utils";
import type { HistoricalRow, IndexKey, MetricKey, TimeWindow } from "@/lib/types";

const PAGE_SIZE = 25;

interface DailyDataPanelProps {
  historicalData: HistoricalRow[];
  liveData: Partial<Record<IndexKey, number>> | null;
}

export function DailyDataPanel({ historicalData, liveData }: DailyDataPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState<IndexKey>("NIFTY_50");
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>("close");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("1Y");
  const [newestFirst, setNewestFirst] = useState(true);
  const [page, setPage] = useState(1);

  // Reset page when any selector changes
  useEffect(() => { setPage(1); }, [selectedIndex, selectedMetric, timeWindow, newestFirst]);

  // Window rows for stat computation only
  const windowRows = useMemo(
    () => filterByWindow(historicalData, timeWindow),
    [historicalData, timeWindow]
  );

  // Current value (live-aware) for stats card
  const currentValue = useMemo(() => {
    const lastRow = historicalData[historicalData.length - 1];
    if (!lastRow) return null;
    if (selectedMetric === "close") {
      return liveData?.[selectedIndex] ?? lastRow[selectedIndex]?.close ?? null;
    }
    const liveClose = liveData?.[selectedIndex];
    if (liveClose != null && lastRow[selectedIndex]) {
      const m = lastRow[selectedIndex];
      if (selectedMetric === "pe" && m.impliedEPS)
        return liveClose / m.impliedEPS;
      if (selectedMetric === "pb" && m.impliedBV)
        return liveClose / m.impliedBV;
    }
    return lastRow[selectedIndex]?.[selectedMetric] ?? null;
  }, [historicalData, selectedIndex, selectedMetric, liveData]);

  // Window statistics for summary strip
  const windowStats = useMemo(
    () => computeWindowStats(windowRows, selectedIndex, selectedMetric, currentValue),
    [windowRows, selectedIndex, selectedMetric, currentValue]
  );

  // Window mean/SD for per-row Z-score
  const { windowMean, windowSD, sd1U, sd1L, sd2U, sd2L } = useMemo(() => {
    const vals = extractValues(windowRows, selectedIndex, selectedMetric);
    const m = mean(vals);
    const sd = stdDev(vals);
    return {
      windowMean: m,
      windowSD: sd,
      sd1U: m + sd,
      sd1L: m - sd,
      sd2U: m + 2 * sd,
      sd2L: m - 2 * sd,
    };
  }, [windowRows, selectedIndex, selectedMetric]);

  // Sorted rows (full dataset) for display
  const sortedRows = useMemo(
    () => (newestFirst ? [...historicalData].reverse() : [...historicalData]),
    [historicalData, newestFirst]
  );

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageRows = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const metrics: MetricKey[] = ["close", "pe", "pb", "impliedEPS", "impliedBV"];

  // Format SD band values using same formatter as the metric
  const fmtBand = (v: number) => formatMetric(selectedMetric, v);

  return (
    <div className="space-y-4 pt-2">
      {/* ── Controls row ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Index selector */}
        <select
          value={selectedIndex}
          onChange={(e) => setSelectedIndex(e.target.value as IndexKey)}
          className="text-xs font-medium border border-zinc-200 rounded-lg px-3 py-2 bg-white text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-300"
        >
          {INDEX_META.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>

        {/* Metric selector */}
        <div className="flex items-center gap-1 bg-white border border-zinc-200 rounded-lg p-1">
          {metrics.map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMetric(m)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                selectedMetric === m
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:text-zinc-900"
              )}
            >
              {METRIC_SHORT_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Window selector */}
        <TimeWindowSelector value={timeWindow} onChange={setTimeWindow} />

        {/* Sort toggle */}
        <button
          onClick={() => setNewestFirst((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 border border-zinc-200 rounded-lg text-xs font-medium text-zinc-700 bg-white hover:text-zinc-900 transition-colors"
        >
          {newestFirst ? "↓ Newest first" : "↑ Oldest first"}
        </button>
      </div>

      {/* ── Stats summary strip ── */}
      {windowStats && (
        <Card className="bg-white border border-zinc-200 shadow-sm">
          <CardContent className="px-5 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
              <span className="font-semibold text-zinc-900">
                {METRIC_LABELS[selectedMetric]} — {timeWindow} Window
              </span>
              <span className="text-zinc-600">
                Mean: <span className="font-medium text-zinc-900">{fmtBand(windowMean)}</span>
              </span>
              <span className="text-zinc-600">
                SD: <span className="font-medium text-zinc-900">{fmtBand(windowSD)}</span>
              </span>
              {windowStats.current != null && (
                <>
                  <span className="text-zinc-600">
                    Current: <span className="font-medium text-zinc-900">{fmtBand(windowStats.current)}</span>
                  </span>
                  <span className={cn("font-semibold", zScoreColor(windowStats.zScore))}>
                    Z: {formatZScore(windowStats.zScore)}
                  </span>
                </>
              )}
              <span className="text-zinc-500">+2σ: <span className="font-medium">{fmtBand(sd2U)}</span></span>
              <span className="text-zinc-500">+1σ: <span className="font-medium">{fmtBand(sd1U)}</span></span>
              <span className="text-zinc-500">−1σ: <span className="font-medium">{fmtBand(sd1L)}</span></span>
              <span className="text-zinc-500">−2σ: <span className="font-medium">{fmtBand(sd2L)}</span></span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Table card ── */}
      <Card className="bg-white border border-zinc-200 shadow-sm">
        <CardHeader className="px-5 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              {sortedRows.length.toLocaleString()} rows · Page {page}/{totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-2.5 py-1 text-xs border border-zinc-200 rounded-md text-zinc-700 disabled:opacity-40 hover:bg-zinc-50 transition-colors"
              >
                ← Prev
              </button>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={page}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (v >= 1 && v <= totalPages) setPage(v);
                }}
                className="w-14 text-center text-xs border border-zinc-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-300"
              />
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-2.5 py-1 text-xs border border-zinc-200 rounded-md text-zinc-700 disabled:opacity-40 hover:bg-zinc-50 transition-colors"
              >
                Next →
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-100">
                  {[
                    "Date",
                    "Close",
                    "P/E",
                    "P/B",
                    "Impl. EPS",
                    "Impl. BV",
                    `Mean (${timeWindow})`,
                    "Z-Score",
                    "+2σ",
                    "+1σ",
                    "−1σ",
                    "−2σ",
                    "SD",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-2.5 text-left font-medium text-zinc-700 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => {
                  const m = row[selectedIndex];
                  const rowVal = m?.[selectedMetric] ?? null;
                  const rowZ = rowVal != null ? zScore(rowVal, windowMean, windowSD) : null;

                  // Highlight selected metric column header mapping
                  const metricColIndex: Record<MetricKey, number> = {
                    close: 1, pe: 2, pb: 3, impliedEPS: 4, impliedBV: 5,
                  };
                  const highlightCol = metricColIndex[selectedMetric];

                  return (
                    <tr key={row.date} className="border-b border-zinc-50 hover:bg-zinc-50/60 transition-colors">
                      <td className="px-4 py-2 text-zinc-800 whitespace-nowrap font-medium">
                        {formatDate(row.date)}
                      </td>
                      {/* Close */}
                      <td className={cn("px-4 py-2 tabular-nums text-zinc-800", highlightCol === 1 && "bg-zinc-50")}>
                        {formatMetric("close", m?.close)}
                      </td>
                      {/* PE */}
                      <td className={cn("px-4 py-2 tabular-nums text-zinc-800", highlightCol === 2 && "bg-zinc-50")}>
                        {formatMetric("pe", m?.pe)}
                      </td>
                      {/* PB */}
                      <td className={cn("px-4 py-2 tabular-nums text-zinc-800", highlightCol === 3 && "bg-zinc-50")}>
                        {formatMetric("pb", m?.pb)}
                      </td>
                      {/* Implied EPS */}
                      <td className={cn("px-4 py-2 tabular-nums text-zinc-800", highlightCol === 4 && "bg-zinc-50")}>
                        {formatMetric("impliedEPS", m?.impliedEPS)}
                      </td>
                      {/* Implied BV */}
                      <td className={cn("px-4 py-2 tabular-nums text-zinc-800", highlightCol === 5 && "bg-zinc-50")}>
                        {formatMetric("impliedBV", m?.impliedBV)}
                      </td>
                      {/* Stats columns (same for all rows in this window) */}
                      <td className="px-4 py-2 tabular-nums text-zinc-700">{fmtBand(windowMean)}</td>
                      <td className={cn("px-4 py-2 tabular-nums font-medium", zScoreColor(rowZ))}>
                        {formatZScore(rowZ)}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-red-700">{fmtBand(sd2U)}</td>
                      <td className="px-4 py-2 tabular-nums text-amber-700">{fmtBand(sd1U)}</td>
                      <td className="px-4 py-2 tabular-nums text-emerald-700">{fmtBand(sd1L)}</td>
                      <td className="px-4 py-2 tabular-nums text-emerald-700">{fmtBand(sd2L)}</td>
                      <td className="px-4 py-2 tabular-nums text-zinc-600">{fmtBand(windowSD)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>

        {/* Bottom pagination */}
        <div className="px-5 pb-4 flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            {sortedRows.length.toLocaleString()} rows · Page {page}/{totalPages}
          </p>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
              className="px-2.5 py-1 text-xs border border-zinc-200 rounded-md text-zinc-700 disabled:opacity-40 hover:bg-zinc-50 transition-colors"
            >
              ← Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-2.5 py-1 text-xs border border-zinc-200 rounded-md text-zinc-700 disabled:opacity-40 hover:bg-zinc-50 transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
