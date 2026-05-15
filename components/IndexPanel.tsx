"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { MetricCard } from "@/components/MetricCard";
import { IndexChart } from "@/components/IndexChart";
import { StatsTable } from "@/components/StatsTable";
import { TimeWindowSelector } from "@/components/TimeWindowSelector";
import {
  computeControlLines,
  computeIndexStats,
  filterByWindow,
  buildChartData,
  buildForwardRatioSeries,
  computeEpsCagr,
  mean,
  stdDev,
  zScore,
  percentileRank,
} from "@/lib/calculations";
import { METRIC_LABELS, METRIC_SHORT_LABELS } from "@/lib/utils";
import { useRatioMode } from "@/lib/ratioMode";
import type { HistoricalRow, IndexKey, MetricKey, TimeWindow, WindowStats, ControlLines } from "@/lib/types";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface IndexPanelProps {
  indexKey: IndexKey;
  historicalData: HistoricalRow[];
  timeWindow: TimeWindow;
  onTimeWindowChange: (w: TimeWindow) => void;
  liveClose?: number | null;
  liveMarketOpen?: boolean;
  indexGrowthPct?: number;
}

const CHART_METRICS: { key: MetricKey; label: string }[] = [
  { key: "pe",    label: "P/E" },
  { key: "pb",    label: "P/B" },
  { key: "close", label: "Price" },
  { key: "impliedEPS", label: "Implied EPS" },
  { key: "impliedBV",  label: "Implied BV"  },
];

function EpsCagrCard({ data }: {
  data: { cagr: number; startEPS: number; endEPS: number; years: number } | null;
}) {
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

  return (
    <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
            EPS CAGR
          </p>
        </div>
        {data == null ? (
          <p className="text-2xl font-semibold text-zinc-400 dark:text-zinc-600 leading-none">—</p>
        ) : (
          <>
            <p className={cn(
              "text-2xl font-semibold mb-1 leading-none",
              data.cagr >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
            )}>
              {data.cagr >= 0 ? "+" : ""}{(data.cagr * 100).toFixed(1)}%
            </p>
            <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-0.5">
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                {fmt(data.startEPS)} → {fmt(data.endEPS)}
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-500">
                Over {data.years.toFixed(1)} years
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function buildWindowStatsFromVals(vals: number[], current: number | null): WindowStats | null {
  if (vals.length < 2) return null;
  const m = mean(vals);
  const sd = stdDev(vals);
  return {
    mean: m, sd, current,
    zScore: current != null ? zScore(current, m, sd) : null,
    percentile: current != null ? percentileRank(current, vals) : null,
    min: Math.min(...vals),
    max: Math.max(...vals),
    count: vals.length,
  };
}

export function IndexPanel({
  indexKey,
  historicalData,
  timeWindow,
  onTimeWindowChange,
  liveClose = null,
  liveMarketOpen = false,
  indexGrowthPct = 0,
}: IndexPanelProps) {
  const [showControlLines, setShowControlLines] = useState(true);
  const [chartMetric, setChartMetric] = useState<MetricKey>("pe");
  const { ratioMode } = useRatioMode();

  // Current metrics = last row of historical data (EOD)
  const currentMetrics = useMemo(() => {
    if (historicalData.length === 0) return null;
    return historicalData[historicalData.length - 1][indexKey] ?? null;
  }, [historicalData, indexKey]);

  // Override with live close price during market hours
  const effectiveMetrics = useMemo(() => {
    if (!liveClose || !currentMetrics) return currentMetrics;
    const prevImpliedEPS = currentMetrics.impliedEPS;
    const prevImpliedBV  = currentMetrics.impliedBV;
    return {
      close:      liveClose,
      pe:         prevImpliedEPS ? Math.round((liveClose / prevImpliedEPS) * 100) / 100 : currentMetrics.pe,
      pb:         prevImpliedBV  ? Math.round((liveClose / prevImpliedBV)  * 100) / 100 : currentMetrics.pb,
      impliedEPS: prevImpliedEPS,
      impliedBV:  prevImpliedBV,
    };
  }, [liveClose, currentMetrics]);

  // Windowed rows for stats table & chart
  const windowRows = useMemo(
    () => filterByWindow(historicalData, timeWindow),
    [historicalData, timeWindow]
  );

  // EPS CAGR — always uses raw historical impliedEPS, window-aware
  const epsCagr = useMemo(
    () => computeEpsCagr(windowRows, indexKey),
    [windowRows, indexKey]
  );

  // Forward PE/PB series (only computed in FWD mode)
  const fwdSeries = useMemo(() => {
    if (ratioMode !== "FWD") return null;
    return buildForwardRatioSeries(historicalData, indexKey, indexGrowthPct);
  }, [ratioMode, historicalData, indexKey, indexGrowthPct]);

  const isFwdRatioChart = ratioMode === "FWD" && fwdSeries != null && (chartMetric === "pe" || chartMetric === "pb");

  // Chart data — use forward series for pe/pb in FWD mode
  const chartData = useMemo(() => {
    if (isFwdRatioChart) {
      const windowDateSet = new Set(windowRows.map((r) => r.date));
      const field = chartMetric === "pe" ? "fwdPE" : "fwdPB";
      return fwdSeries!
        .filter((r) => windowDateSet.has(r.date) && r[field] != null)
        .map((r) => ({ date: r.date, value: r[field] as number }));
    }
    return buildChartData(windowRows, indexKey, chartMetric);
  }, [windowRows, indexKey, chartMetric, isFwdRatioChart, fwdSeries]);

  // Control lines — use forward series for pe/pb in FWD mode
  const controlLines = useMemo((): ControlLines | null => {
    if (isFwdRatioChart) {
      const windowDateSet = new Set(windowRows.map((r) => r.date));
      const field = chartMetric === "pe" ? "fwdPE" : "fwdPB";
      const vals = fwdSeries!
        .filter((r) => windowDateSet.has(r.date))
        .map((r) => r[field])
        .filter((v): v is number => v != null);
      if (vals.length < 10) return null;
      const m = mean(vals);
      const sd = stdDev(vals);
      return { mean: m, sd1Upper: m + sd, sd1Lower: m - sd, sd2Upper: m + 2 * sd, sd2Lower: m - 2 * sd };
    }
    return computeControlLines(windowRows, indexKey, chartMetric);
  }, [windowRows, indexKey, chartMetric, isFwdRatioChart, fwdSeries]);

  // Index stats — override pe/pb with forward values in FWD mode
  const indexStats = useMemo(() => {
    const trailing = computeIndexStats(windowRows, indexKey, effectiveMetrics);
    if (ratioMode !== "FWD" || !fwdSeries) return trailing;

    const windowDateSet = new Set(windowRows.map((r) => r.date));
    const lastFwdEntry = fwdSeries[fwdSeries.length - 1];
    const lastFwdPE = lastFwdEntry?.fwdPE ?? null;
    const lastFwdPB = lastFwdEntry?.fwdPB ?? null;

    const fwdPEVals = fwdSeries
      .filter((r) => windowDateSet.has(r.date))
      .map((r) => r.fwdPE)
      .filter((v): v is number => v != null);
    const fwdPBVals = fwdSeries
      .filter((r) => windowDateSet.has(r.date))
      .map((r) => r.fwdPB)
      .filter((v): v is number => v != null);

    return {
      ...trailing,
      pe: buildWindowStatsFromVals(fwdPEVals, lastFwdPE) ?? trailing.pe,
      pb: buildWindowStatsFromVals(fwdPBVals, lastFwdPB) ?? trailing.pb,
    };
  }, [windowRows, indexKey, effectiveMetrics, ratioMode, fwdSeries]);

  // Append today's live point to the chart for metrics derived from live close
  const LIVE_METRICS: MetricKey[] = ["close", "pe", "pb"];
  const liveChartData = useMemo(() => {
    if (!liveClose || !effectiveMetrics || !LIVE_METRICS.includes(chartMetric)) {
      return chartData;
    }
    // Skip live point for forward pe/pb — the series already has the most recent point
    if (isFwdRatioChart) return chartData;

    const todayISO = new Date().toISOString().slice(0, 10);
    if (chartData.length > 0 && chartData[chartData.length - 1].date === todayISO) {
      return chartData;
    }
    const liveValue = effectiveMetrics[chartMetric];
    if (liveValue == null) return chartData;
    return [...chartData, { date: todayISO, value: liveValue }];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData, liveClose, effectiveMetrics, chartMetric, isFwdRatioChart]);

  return (
    <div className="space-y-5 pt-2">
      {/* ── Metric cards row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {(["close", "pe", "pb", "impliedEPS", "impliedBV"] as MetricKey[]).map((m) => (
          <MetricCard
            key={m}
            label={METRIC_LABELS[m]}
            metric={m}
            stats={indexStats[m]}
            isLive={(m === "close" || m === "pe" || m === "pb") && liveClose != null && liveMarketOpen}
          />
        ))}
        <EpsCagrCard data={epsCagr} />
      </div>

      {/* ── Chart card ── */}
      <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <CardHeader className="px-5 pt-4 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            {/* Left: metric selector buttons */}
            <div className="flex items-center gap-1 flex-wrap">
              {CHART_METRICS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setChartMetric(key)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                    chartMetric === key
                      ? "bg-blue-600 text-white"
                      : "text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Right: window selector + control lines toggle */}
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
            metric={chartMetric}
            controlLines={controlLines}
            showControlLines={showControlLines}
          />
        </CardContent>
      </Card>

      {/* ── Stats table ── */}
      <StatsTable stats={indexStats} timeWindow={timeWindow} />
    </div>
  );
}
