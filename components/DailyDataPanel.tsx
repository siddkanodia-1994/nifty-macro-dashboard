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
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("4Y");
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

  const indexLabel = INDEX_META.find((m) => m.key === selectedIndex)?.label ?? selectedIndex;
  const metricLabel = METRIC_LABELS[selectedMetric];

  function getDownloadRows() {
    const rows = newestFirst ? [...windowRows].reverse() : [...windowRows];
    return rows.map((row) => {
      const m = row[selectedIndex];
      const rowVal = m?.[selectedMetric] ?? null;
      const rowZ = rowVal != null ? zScore(rowVal, windowMean, windowSD) : null;
      return { date: row.date, rowVal, rowZ };
    });
  }

  function downloadCSV() {
    const headers = ["Date", metricLabel, `Mean (${timeWindow})`, "+2σ", "+1σ", "−1σ", "−2σ", "SD", "Z-Score"];
    const dataRows = getDownloadRows().map(({ date, rowVal, rowZ }) =>
      [
        date,
        rowVal ?? "",
        windowMean.toFixed(4),
        sd2U.toFixed(4),
        sd1U.toFixed(4),
        sd1L.toFixed(4),
        sd2L.toFixed(4),
        windowSD.toFixed(4),
        rowZ != null ? rowZ.toFixed(2) : "",
      ].join(",")
    );
    const csv = [headers.join(","), ...dataRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${indexLabel}_${metricLabel}_${timeWindow}.csv`.replace(/\s+/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPDF() {
    const dataRows = getDownloadRows()
      .map(
        ({ date, rowVal, rowZ }) =>
          `<tr>
            <td>${formatDate(date)}</td>
            <td>${rowVal != null ? fmtBand(rowVal) : "—"}</td>
            <td>${fmtBand(windowMean)}</td>
            <td style="color:#b91c1c">${fmtBand(sd2U)}</td>
            <td style="color:#b45309">${fmtBand(sd1U)}</td>
            <td style="color:#047857">${fmtBand(sd1L)}</td>
            <td style="color:#047857">${fmtBand(sd2L)}</td>
            <td>${fmtBand(windowSD)}</td>
            <td>${rowZ != null ? rowZ.toFixed(2) : "—"}</td>
          </tr>`
      )
      .join("");
    const html = `<!DOCTYPE html><html><head><title>${indexLabel} — ${metricLabel} — ${timeWindow}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:10px;margin:20px}
  h2{font-size:13px;margin-bottom:6px}
  p{font-size:9px;color:#666;margin-bottom:10px}
  table{border-collapse:collapse;width:100%}
  th{background:#f0f0f0;border:1px solid #ccc;padding:5px 8px;text-align:left;font-size:9px;white-space:nowrap}
  td{border:1px solid #e5e5e5;padding:3px 8px;white-space:nowrap}
  tr:nth-child(even){background:#fafafa}
  @media print{@page{size:landscape}}
</style></head><body>
<h2>${indexLabel} — ${metricLabel}</h2>
<p>Time Window: ${timeWindow} · Mean: ${fmtBand(windowMean)} · SD: ${fmtBand(windowSD)} · +2σ: ${fmtBand(sd2U)} · −2σ: ${fmtBand(sd2L)}</p>
<table><thead><tr>
  <th>Date</th><th>${metricLabel}</th><th>Mean (${timeWindow})</th>
  <th>+2σ</th><th>+1σ</th><th>−1σ</th><th>−2σ</th><th>SD</th><th>Z-Score</th>
</tr></thead><tbody>${dataRows}</tbody></table>
</body></html>`;
    const win = window.open("", "_blank");
    if (win) { win.document.write(html); win.document.close(); win.print(); }
  }

  return (
    <div className="space-y-4 pt-2">
      {/* ── Controls row ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Index selector */}
        <select
          value={selectedIndex}
          onChange={(e) => setSelectedIndex(e.target.value as IndexKey)}
          className="text-xs font-medium border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600"
        >
          {INDEX_META.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>

        {/* Metric selector */}
        <div className="flex items-center gap-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-1">
          {metrics.map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMetric(m)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                selectedMetric === m
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
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
          className="flex items-center gap-1.5 px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          {newestFirst ? "↓ Newest first" : "↑ Oldest first"}
        </button>

        {/* Download buttons */}
        <div className="flex items-center gap-1.5 ml-auto">
          <button
            onClick={downloadCSV}
            className="flex items-center gap-1.5 px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400 transition-colors"
            title={`Download ${indexLabel} ${metricLabel} ${timeWindow} as CSV`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            CSV
          </button>
          <button
            onClick={downloadPDF}
            className="flex items-center gap-1.5 px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-900 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 dark:hover:bg-blue-900/20 dark:hover:text-blue-400 transition-colors"
            title={`Download ${indexLabel} ${metricLabel} ${timeWindow} as PDF`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            PDF
          </button>
        </div>
      </div>

      {/* ── Stats summary strip ── */}
      {windowStats && (
        <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
          <CardContent className="px-5 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {METRIC_LABELS[selectedMetric]} — {timeWindow} Window
              </span>
              <span className="text-zinc-600 dark:text-zinc-400">
                Mean:<span className="font-medium text-zinc-900 dark:text-zinc-100">{fmtBand(windowMean)}</span>
              </span>
              <span className="text-zinc-600 dark:text-zinc-400">
                SD:<span className="font-medium text-zinc-900 dark:text-zinc-100">{fmtBand(windowSD)}</span>
              </span>
              {windowStats.current != null && (
                <>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    Current:<span className="font-medium text-zinc-900 dark:text-zinc-100">{fmtBand(windowStats.current)}</span>
                  </span>
                  <span className={cn("font-semibold", zScoreColor(windowStats.zScore))}>
                    Z: {formatZScore(windowStats.zScore)}
                  </span>
                </>
              )}
              <span className="text-zinc-500 dark:text-zinc-400">+2σ: <span className="font-medium">{fmtBand(sd2U)}</span></span>
              <span className="text-zinc-500 dark:text-zinc-400">+1σ: <span className="font-medium">{fmtBand(sd1U)}</span></span>
              <span className="text-zinc-500 dark:text-zinc-400">−1σ: <span className="font-medium">{fmtBand(sd1L)}</span></span>
              <span className="text-zinc-500 dark:text-zinc-400">−2σ: <span className="font-medium">{fmtBand(sd2L)}</span></span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Table card ── */}
      <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <CardHeader className="px-5 pt-4 pb-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {sortedRows.length.toLocaleString()} rows · Page {page}/{totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-2.5 py-1 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-700 dark:text-zinc-300 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
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
                className="w-14 text-center text-xs border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
              />
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-2.5 py-1 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md text-zinc-700 dark:text-zinc-300 disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
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
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
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
                      className="px-4 py-2.5 text-left font-semibold text-zinc-800 dark:text-zinc-300 uppercase tracking-wide whitespace-nowrap"
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
                    <tr key={row.date} className="border-b border-zinc-50 dark:border-zinc-800 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="px-4 py-2 text-zinc-800 dark:text-zinc-200 whitespace-nowrap font-medium">
                        {formatDate(row.date)}
                      </td>
                      {/* Close */}
                      <td className={cn("px-4 py-2 tabular-nums text-zinc-800 dark:text-zinc-200", highlightCol === 1 && "bg-zinc-50 dark:bg-zinc-800")}>
                        {formatMetric("close", m?.close)}
                      </td>
                      {/* PE */}
                      <td className={cn("px-4 py-2 tabular-nums text-zinc-800 dark:text-zinc-200", highlightCol === 2 && "bg-zinc-50 dark:bg-zinc-800")}>
                        {formatMetric("pe", m?.pe)}
                      </td>
                      {/* PB */}
                      <td className={cn("px-4 py-2 tabular-nums text-zinc-800 dark:text-zinc-200", highlightCol === 3 && "bg-zinc-50 dark:bg-zinc-800")}>
                        {formatMetric("pb", m?.pb)}
                      </td>
                      {/* Implied EPS */}
                      <td className={cn("px-4 py-2 tabular-nums text-zinc-800 dark:text-zinc-200", highlightCol === 4 && "bg-zinc-50 dark:bg-zinc-800")}>
                        {formatMetric("impliedEPS", m?.impliedEPS)}
                      </td>
                      {/* Implied BV */}
                      <td className={cn("px-4 py-2 tabular-nums text-zinc-800 dark:text-zinc-200", highlightCol === 5 && "bg-zinc-50 dark:bg-zinc-800")}>
                        {formatMetric("impliedBV", m?.impliedBV)}
                      </td>
                      {/* Stats columns (same for all rows in this window) */}
                      <td className="px-4 py-2 tabular-nums text-zinc-700 dark:text-zinc-300">{fmtBand(windowMean)}</td>
                      <td className={cn("px-4 py-2 tabular-nums font-medium", zScoreColor(rowZ))}>
                        {formatZScore(rowZ)}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-red-700 dark:text-red-400">{fmtBand(sd2U)}</td>
                      <td className="px-4 py-2 tabular-nums text-amber-700 dark:text-amber-400">{fmtBand(sd1U)}</td>
                      <td className="px-4 py-2 tabular-nums text-emerald-700 dark:text-emerald-400">{fmtBand(sd1L)}</td>
                      <td className="px-4 py-2 tabular-nums text-emerald-700 dark:text-emerald-400">{fmtBand(sd2L)}</td>
                      <td className="px-4 py-2 tabular-nums text-zinc-600 dark:text-zinc-400">{fmtBand(windowSD)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>

        {/* Bottom pagination */}
        <div className="px-5 pb-4 flex items-center justify-between">
          <p className="text-xs text-zinc-600">
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
