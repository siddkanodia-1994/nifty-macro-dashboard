"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/MetricCard";
import { CAGRUpsideCard } from "@/components/CAGRUpsideCard";
import { IndexChart } from "@/components/IndexChart";
import { TimeWindowSelector } from "@/components/TimeWindowSelector";
import type { ChartPoint } from "@/lib/calculations";
import { cn, formatZScore, formatPercentile, zScoreColor } from "@/lib/utils";
import type { ControlLines, TimeWindow, WindowStats } from "@/lib/types";
import { Eye, EyeOff } from "lucide-react";

/**
 * Shared layout for single-series macro tabs (Bond Yield, USD/INR):
 * metric + CAGR cards, chart with control lines, and a one-row stats table.
 * Series-specific maths and formatting are injected by thin wrappers.
 */
interface MacroSeriesPanelProps<Row extends { date: string }> {
  rows: Row[];
  timeWindow: TimeWindow;
  onTimeWindowChange: (w: TimeWindow) => void;
  liveValue: number | null;
  liveMarketOpen: boolean;
  /** Raw stored value for a row (same units as liveValue) */
  getValue: (row: Row) => number | null;
  /** Multiplier from raw units to display units (e.g. 100 for decimal → %) */
  displayScale: number;
  filterByWindow: (rows: Row[], w: TimeWindow) => Row[];
  computeStats: (rows: Row[], current: number | null) => WindowStats | null;
  computeControlLines: (rows: Row[]) => ControlLines | null;
  buildChartData: (rows: Row[]) => ChartPoint[];
  /** Formats a display-unit value for cards, chart and stats table */
  valueFormatter: (v: number | null | undefined) => string;
  /** Used for the metric card, CAGR card and stats-table row */
  label: string;
  chartLabel: string;
  invertSign: boolean;
}

export function MacroSeriesPanel<Row extends { date: string }>({
  rows,
  timeWindow,
  onTimeWindowChange,
  liveValue,
  liveMarketOpen,
  getValue,
  displayScale,
  filterByWindow,
  computeStats,
  computeControlLines,
  buildChartData,
  valueFormatter,
  label,
  chartLabel,
  invertSign,
}: MacroSeriesPanelProps<Row>) {
  const [showControlLines, setShowControlLines] = useState(true);

  const windowRows = useMemo(
    () => filterByWindow(rows, timeWindow),
    [filterByWindow, rows, timeWindow]
  );

  // Latest EOD value, overridden by live value during market hours
  const eodValue = useMemo(() => {
    const last = windowRows[windowRows.length - 1];
    return last ? getValue(last) : null;
  }, [windowRows, getValue]);

  const effectiveValue = liveValue ?? eodValue;

  const stats = useMemo(
    () => computeStats(windowRows, effectiveValue),
    [computeStats, windowRows, effectiveValue]
  );

  const controlLines = useMemo(
    () => computeControlLines(windowRows),
    [computeControlLines, windowRows]
  );

  const chartData = useMemo(
    () => buildChartData(windowRows),
    [buildChartData, windowRows]
  );

  // Append today's live value to chart if available
  const liveChartData = useMemo(() => {
    if (!liveValue || !liveMarketOpen) return chartData;
    const todayISO = new Date().toISOString().slice(0, 10);
    if (chartData.length > 0 && chartData[chartData.length - 1].date === todayISO) return chartData;
    return [...chartData, { date: todayISO, value: liveValue * displayScale }];
  }, [chartData, liveValue, liveMarketOpen, displayScale]);

  const cagrStart = useMemo(() => {
    const first = windowRows.find((r) => getValue(r) != null);
    return first ? { value: getValue(first)! * displayScale, date: first.date } : null;
  }, [windowRows, getValue, displayScale]);

  const isLive = liveValue != null && liveMarketOpen;
  const z = stats?.zScore ?? null;

  return (
    <div className="space-y-5 pt-2">
      {/* ── Metric cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MetricCard
          label={label}
          metric="pe"
          stats={stats}
          isLive={isLive}
          valueFormatter={valueFormatter}
        />
        <CAGRUpsideCard
          startValue={cagrStart?.value ?? 0}
          startDate={cagrStart?.date ?? ""}
          currentValue={effectiveValue != null ? effectiveValue * displayScale : null}
          timeWindow={timeWindow}
          valueFormatter={valueFormatter}
          invertSign={invertSign}
          label={label}
        />
      </div>

      {/* ── Chart card ── */}
      <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <CardHeader className="px-5 pt-4 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex items-center gap-1 flex-wrap">
              <button
                disabled
                className="px-3 py-1 rounded-md text-xs font-medium bg-blue-600 text-white opacity-90"
              >
                {chartLabel}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <TimeWindowSelector value={timeWindow} onChange={onTimeWindowChange} />
              <button
                onClick={() => setShowControlLines((v) => !v)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border transition-colors",
                  showControlLines
                    ? "border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                )}
                title="Toggle control lines (Mean ± 1σ/2σ)"
              >
                {showControlLines ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                Control Lines
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-2 pb-4">
          <IndexChart
            data={liveChartData}
            metric="pe"
            controlLines={controlLines}
            showControlLines={showControlLines}
            valueFormatter={valueFormatter}
          />
        </CardContent>
      </Card>

      {/* ── Stats table ── */}
      <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Statistics — {timeWindow} Window
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                  {["Metric", "Mean", "Std Dev", "Current", "Z-Score", "Percentile"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-2 text-left text-xs font-semibold text-zinc-800 dark:text-zinc-300 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/50 transition-colors">
                  <td className="px-5 py-2.5 font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                    {label}
                  </td>
                  <td className="px-5 py-2.5 text-zinc-900 dark:text-zinc-200 tabular-nums">
                    {stats ? valueFormatter(stats.mean) : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-zinc-900 dark:text-zinc-200 tabular-nums">
                    {stats ? valueFormatter(stats.sd) : "—"}
                  </td>
                  <td className="px-5 py-2.5 font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {stats ? valueFormatter(stats.current) : "—"}
                  </td>
                  <td className={cn("px-5 py-2.5 font-medium tabular-nums", zScoreColor(z))}>
                    {stats ? formatZScore(z) : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-zinc-900 dark:text-zinc-200 tabular-nums">
                    {stats ? formatPercentile(stats.percentile) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
