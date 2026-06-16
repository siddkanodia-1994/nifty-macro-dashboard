"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/MetricCard";
import { CAGRUpsideCard } from "@/components/CAGRUpsideCard";
import { IndexChart } from "@/components/IndexChart";
import { TimeWindowSelector } from "@/components/TimeWindowSelector";
import {
  filterBYEYByWindow,
  computeBondYieldControlLines,
  computeBondYieldWindowStats,
  buildBondYieldChartData,
} from "@/lib/calculations";
import { cn, formatZScore, formatPercentile, zScoreColor, zScoreBgColor } from "@/lib/utils";
import type { BYEYRow, TimeWindow } from "@/lib/types";
import { Eye, EyeOff } from "lucide-react";

interface BondYieldPanelProps {
  byeyData: BYEYRow[];
  timeWindow: TimeWindow;
  onTimeWindowChange: (w: TimeWindow) => void;
  liveBondYield?: number | null;
  liveMarketOpen?: boolean;
}

function fmtYield(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toFixed(2) + "%";
}

export function BondYieldPanel({
  byeyData,
  timeWindow,
  onTimeWindowChange,
  liveBondYield = null,
  liveMarketOpen = false,
}: BondYieldPanelProps) {
  const [showControlLines, setShowControlLines] = useState(true);

  const windowRows = useMemo(
    () => filterBYEYByWindow(byeyData, timeWindow),
    [byeyData, timeWindow]
  );

  // Latest EOD yield, overridden by live value during market hours
  const eodYield = useMemo(() => {
    const last = windowRows[windowRows.length - 1];
    return last?.bondYield ?? null;
  }, [windowRows]);

  const effectiveYield = liveBondYield ?? eodYield;

  const bondYieldStats = useMemo(
    () => computeBondYieldWindowStats(windowRows, effectiveYield),
    [windowRows, effectiveYield]
  );

  const controlLines = useMemo(
    () => computeBondYieldControlLines(windowRows),
    [windowRows]
  );

  const chartData = useMemo(
    () => buildBondYieldChartData(windowRows),
    [windowRows]
  );

  // Append today's live yield to chart if available
  const liveChartData = useMemo(() => {
    if (!liveBondYield || !liveMarketOpen) return chartData;
    const todayISO = new Date().toISOString().slice(0, 10);
    if (chartData.length > 0 && chartData[chartData.length - 1].date === todayISO) return chartData;
    return [...chartData, { date: todayISO, value: liveBondYield * 100 }];
  }, [chartData, liveBondYield, liveMarketOpen]);

  const cagrStart = useMemo(() => {
    const first = windowRows.find((r) => r.bondYield != null);
    return first ? { value: first.bondYield! * 100, date: first.date } : null;
  }, [windowRows]);

  const isLive = liveBondYield != null && liveMarketOpen;
  const z = bondYieldStats?.zScore ?? null;

  return (
    <div className="space-y-5 pt-2">
      {/* ── Metric cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MetricCard
          label="Bond Yield"
          metric="pe"
          stats={bondYieldStats}
          isLive={isLive}
          valueFormatter={fmtYield}
        />
        <CAGRUpsideCard
          startValue={cagrStart?.value ?? 0}
          startDate={cagrStart?.date ?? ""}
          currentValue={effectiveYield != null ? effectiveYield * 100 : null}
          timeWindow={timeWindow}
          valueFormatter={fmtYield}
          invertSign={false}
          label="Bond Yield"
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
                Bond Yield %
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
            valueFormatter={(v) => v.toFixed(2) + "%"}
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
                    Bond Yield
                  </td>
                  <td className="px-5 py-2.5 text-zinc-900 dark:text-zinc-200 tabular-nums">
                    {bondYieldStats ? fmtYield(bondYieldStats.mean) : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-zinc-900 dark:text-zinc-200 tabular-nums">
                    {bondYieldStats ? fmtYield(bondYieldStats.sd) : "—"}
                  </td>
                  <td className="px-5 py-2.5 font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {bondYieldStats ? fmtYield(bondYieldStats.current) : "—"}
                  </td>
                  <td className={cn("px-5 py-2.5 font-medium tabular-nums", zScoreColor(z))}>
                    {bondYieldStats ? formatZScore(z) : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-zinc-900 dark:text-zinc-200 tabular-nums">
                    {bondYieldStats ? formatPercentile(bondYieldStats.percentile) : "—"}
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
