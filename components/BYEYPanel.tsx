"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/MetricCard";
import { IndexChart } from "@/components/IndexChart";
import { TimeWindowSelector } from "@/components/TimeWindowSelector";
import {
  filterBYEYByWindow,
  computeBYEYControlLines,
  computeBYEYWindowStats,
  buildBYEYChartData,
} from "@/lib/calculations";
import { formatPct, formatRatio, formatZScore, formatPercentile, formatDate, zScoreColor, zScoreBgColor, cn } from "@/lib/utils";
import type { BYEYRow, HistoricalRow, TimeWindow } from "@/lib/types";
import { Eye, EyeOff } from "lucide-react";

interface BYEYPanelProps {
  byeyData: BYEYRow[];
  historicalData: HistoricalRow[];  // for lastRow.NIFTY_50.impliedEPS → live PE
  timeWindow: TimeWindow;
  onTimeWindowChange: (w: TimeWindow) => void;
  liveNifty50Close: number | null;
  liveBondYield: number | null;     // decimal (e.g. 0.0687)
}

export function BYEYPanel({
  byeyData,
  historicalData,
  timeWindow,
  onTimeWindowChange,
  liveNifty50Close,
  liveBondYield,
}: BYEYPanelProps) {
  const [showControlLines, setShowControlLines] = useState(true);

  // Last row from BY-EY data (most recent historical point)
  const lastByeyRow = byeyData[byeyData.length - 1] ?? null;

  // Implied EPS from latest historical row for live PE derivation
  const prevImpliedEPS = useMemo(() => {
    if (historicalData.length === 0) return null;
    return historicalData[historicalData.length - 1].NIFTY_50.impliedEPS;
  }, [historicalData]);

  // Live derived values
  const livePE = liveNifty50Close && prevImpliedEPS
    ? liveNifty50Close / prevImpliedEPS
    : null;
  const liveEY = livePE ? 1 / livePE : null;

  // For live spread: use live bond yield when available; fall back to latest daily value.
  // Bond yield changes only a few basis points intraday — the spread is effectively live
  // because it updates every 60s as PE changes.
  const effectiveLiveBondYield = liveBondYield ?? lastByeyRow?.bondYield ?? null;
  const liveSpread = liveEY != null && effectiveLiveBondYield != null
    ? effectiveLiveBondYield - liveEY
    : null;

  // Current values (live when available, else last historical)
  const currentSpread    = liveSpread    ?? lastByeyRow?.spread    ?? null;
  const currentPE        = livePE        ?? lastByeyRow?.pe        ?? null;
  const currentBondYield = liveBondYield ?? lastByeyRow?.bondYield ?? null;
  const currentEY        = liveEY        ?? lastByeyRow?.ey        ?? null;

  // PE/EY/Spread are live when Nifty price is live (EY = 1/PE tracks live price).
  // Bond yield uses daily EOD data — no LIVE badge on that card.
  const isPELive        = liveNifty50Close != null;
  const isSpreadLive    = isPELive && effectiveLiveBondYield != null;

  // Window-filtered data
  const windowRows = useMemo(
    () => filterBYEYByWindow(byeyData, timeWindow),
    [byeyData, timeWindow]
  );

  // Control lines + stats for spread (in %-points)
  const controlLines = useMemo(
    () => computeBYEYControlLines(windowRows),
    [windowRows]
  );

  const spreadStats = useMemo(
    () => computeBYEYWindowStats(windowRows, currentSpread),
    [windowRows, currentSpread]
  );

  // Chart data for selected window
  const chartData = useMemo(
    () => buildBYEYChartData(windowRows),
    [windowRows]
  );

  // Append live spread point to chart if available and not already today
  const liveChartData = useMemo(() => {
    if (liveSpread == null) return chartData;
    const todayISO = new Date().toISOString().slice(0, 10);
    if (chartData.length > 0 && chartData[chartData.length - 1].date === todayISO) {
      return chartData;
    }
    return [...chartData, { date: todayISO, value: liveSpread * 100 }];
  }, [chartData, liveSpread]);

  const spreadFmt = (v: number | null) => formatPct(v);
  const peFmt     = (v: number | null) => formatRatio(v);

  return (
    <div className="space-y-5 pt-2">
      {/* ── Metric cards row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* BY-EY Spread % — full stats */}
        <MetricCard
          label="BY-EY Spread"
          metric="pe"
          stats={spreadStats}
          isLive={isSpreadLive}
          valueFormatter={spreadFmt}
        />

        {/* Nifty 50 P/E — current value only */}
        <MetricCard
          label="Nifty 50 P/E"
          metric="pe"
          stats={null}
          value={currentPE}
          isLive={isPELive}
          valueFormatter={peFmt}
        />

        {/* India 10Y Bond Yield % — daily EOD value, no LIVE badge */}
        <MetricCard
          label={`India 10Y Yield${lastByeyRow ? ` · ${formatDate(lastByeyRow.date)}` : ""}`}
          metric="pe"
          stats={null}
          value={currentBondYield != null ? currentBondYield * 100 : null}
          isLive={false}
          valueFormatter={spreadFmt}
        />

        {/* Earnings Yield % — live (derived from live PE) */}
        <MetricCard
          label="Earnings Yield"
          metric="pe"
          stats={null}
          value={currentEY != null ? currentEY * 100 : null}
          isLive={isPELive}
          valueFormatter={spreadFmt}
        />
      </div>

      {/* ── Chart card ── */}
      <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <CardHeader className="px-5 pt-4 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">BY-EY Spread (%)</p>

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

      {/* ── Spread statistics row ── */}
      {spreadStats && (
        <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Spread Statistics — {timeWindow} Window
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
                        className="px-5 py-2 text-left text-xs font-medium text-zinc-700 dark:text-zinc-300 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/50 transition-colors">
                    <td className="px-5 py-2.5 font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                      BY-EY Spread
                    </td>
                    <td className="px-5 py-2.5 text-zinc-800 dark:text-zinc-200 tabular-nums">
                      {formatPct(spreadStats.mean)}
                    </td>
                    <td className="px-5 py-2.5 text-zinc-800 dark:text-zinc-200 tabular-nums">
                      {formatPct(spreadStats.sd)}
                    </td>
                    <td className="px-5 py-2.5 font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                      {formatPct(spreadStats.current)}
                    </td>
                    <td className={cn("px-5 py-2.5 font-medium tabular-nums", zScoreColor(spreadStats.zScore))}>
                      {formatZScore(spreadStats.zScore)}
                    </td>
                    <td className="px-5 py-2.5 text-zinc-800 dark:text-zinc-200 tabular-nums">
                      {formatPercentile(spreadStats.percentile)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
