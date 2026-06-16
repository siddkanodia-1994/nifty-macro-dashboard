"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/MetricCard";
import { CAGRUpsideCard } from "@/components/CAGRUpsideCard";
import { IndexChart } from "@/components/IndexChart";
import { TimeWindowSelector } from "@/components/TimeWindowSelector";
import {
  filterUSDINRByWindow,
  computeUSDINRControlLines,
  computeUSDINRWindowStats,
  buildUSDINRChartData,
} from "@/lib/calculations";
import { cn, formatZScore, formatPercentile, zScoreColor } from "@/lib/utils";
import type { USDINRRow, TimeWindow } from "@/lib/types";
import { Eye, EyeOff } from "lucide-react";

interface USDINRPanelProps {
  usdinrData: USDINRRow[];
  timeWindow: TimeWindow;
  onTimeWindowChange: (w: TimeWindow) => void;
  liveUSDINR?: number | null;
  liveMarketOpen?: boolean;
}

function fmtRate(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toFixed(2);
}

export function USDINRPanel({
  usdinrData,
  timeWindow,
  onTimeWindowChange,
  liveUSDINR = null,
  liveMarketOpen = false,
}: USDINRPanelProps) {
  const [showControlLines, setShowControlLines] = useState(true);

  const windowRows = useMemo(
    () => filterUSDINRByWindow(usdinrData, timeWindow),
    [usdinrData, timeWindow]
  );

  const eodRate = useMemo(() => {
    const last = windowRows[windowRows.length - 1];
    return last?.rate ?? null;
  }, [windowRows]);

  const effectiveRate = liveUSDINR ?? eodRate;

  const rateStats = useMemo(
    () => computeUSDINRWindowStats(windowRows, effectiveRate),
    [windowRows, effectiveRate]
  );

  const controlLines = useMemo(
    () => computeUSDINRControlLines(windowRows),
    [windowRows]
  );

  const chartData = useMemo(
    () => buildUSDINRChartData(windowRows),
    [windowRows]
  );

  // Append today's live rate to chart if available
  const liveChartData = useMemo(() => {
    if (!liveUSDINR || !liveMarketOpen) return chartData;
    const todayISO = new Date().toISOString().slice(0, 10);
    if (chartData.length > 0 && chartData[chartData.length - 1].date === todayISO) return chartData;
    return [...chartData, { date: todayISO, value: liveUSDINR }];
  }, [chartData, liveUSDINR, liveMarketOpen]);

  const cagrStart = useMemo(() => {
    const first = windowRows.find((r) => r.rate != null);
    return first ? { value: first.rate!, date: first.date } : null;
  }, [windowRows]);

  const isLive = liveUSDINR != null && liveMarketOpen;
  const z = rateStats?.zScore ?? null;

  return (
    <div className="space-y-5 pt-2">
      {/* ── Metric cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <MetricCard
          label="USD/INR"
          metric="pe"
          stats={rateStats}
          isLive={isLive}
          valueFormatter={fmtRate}
        />
        <CAGRUpsideCard
          startValue={cagrStart?.value ?? 0}
          startDate={cagrStart?.date ?? ""}
          currentValue={effectiveRate}
          timeWindow={timeWindow}
          valueFormatter={fmtRate}
          invertSign={true}
          label="USD/INR"
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
                USD/INR Rate
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
            valueFormatter={(v) => v.toFixed(2)}
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
                    USD/INR
                  </td>
                  <td className="px-5 py-2.5 text-zinc-900 dark:text-zinc-200 tabular-nums">
                    {rateStats ? fmtRate(rateStats.mean) : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-zinc-900 dark:text-zinc-200 tabular-nums">
                    {rateStats ? fmtRate(rateStats.sd) : "—"}
                  </td>
                  <td className="px-5 py-2.5 font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                    {rateStats ? fmtRate(rateStats.current) : "—"}
                  </td>
                  <td className={cn("px-5 py-2.5 font-medium tabular-nums", zScoreColor(z))}>
                    {rateStats ? formatZScore(z) : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-zinc-900 dark:text-zinc-200 tabular-nums">
                    {rateStats ? formatPercentile(rateStats.percentile) : "—"}
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
