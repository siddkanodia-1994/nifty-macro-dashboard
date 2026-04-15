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
} from "@/lib/calculations";
import { METRIC_LABELS, METRIC_SHORT_LABELS } from "@/lib/utils";
import type { HistoricalRow, IndexKey, MetricKey, TimeWindow } from "@/lib/types";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface IndexPanelProps {
  indexKey: IndexKey;
  historicalData: HistoricalRow[];
  timeWindow: TimeWindow;
  onTimeWindowChange: (w: TimeWindow) => void;
}

const CHART_METRICS: { key: MetricKey; label: string }[] = [
  { key: "pe",    label: "P/E" },
  { key: "pb",    label: "P/B" },
  { key: "close", label: "Price" },
  { key: "impliedEPS", label: "Implied EPS" },
  { key: "impliedBV",  label: "Implied BV"  },
];

export function IndexPanel({
  indexKey,
  historicalData,
  timeWindow,
  onTimeWindowChange,
}: IndexPanelProps) {
  const [showControlLines, setShowControlLines] = useState(true);
  const [chartMetric, setChartMetric] = useState<MetricKey>("pe");

  // Current metrics = last row of historical data (EOD)
  const currentMetrics = useMemo(() => {
    if (historicalData.length === 0) return null;
    return historicalData[historicalData.length - 1][indexKey];
  }, [historicalData, indexKey]);

  // Windowed rows for stats table & chart
  const windowRows = useMemo(
    () => filterByWindow(historicalData, timeWindow),
    [historicalData, timeWindow]
  );

  // Control lines from the selected window — recalculate when window or metric changes
  const controlLines = useMemo(
    () => computeControlLines(windowRows, indexKey, chartMetric),
    [windowRows, indexKey, chartMetric]
  );

  // Stats for all metrics in selected window
  const indexStats = useMemo(
    () => computeIndexStats(windowRows, indexKey, currentMetrics),
    [windowRows, indexKey, currentMetrics]
  );

  // Chart data for selected metric in selected window
  const chartData = useMemo(
    () => buildChartData(windowRows, indexKey, chartMetric),
    [windowRows, indexKey, chartMetric]
  );

  return (
    <div className="space-y-5 pt-2">
      {/* ── Metric cards row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {(["close", "pe", "pb", "impliedEPS", "impliedBV"] as MetricKey[]).map((m) => (
          <MetricCard
            key={m}
            label={METRIC_LABELS[m]}
            metric={m}
            stats={indexStats[m]}
          />
        ))}
      </div>

      {/* ── Chart card ── */}
      <Card className="bg-white border border-zinc-200 shadow-sm">
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
                      : "text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100"
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
                    ? "border-zinc-300 bg-zinc-50 text-zinc-800"
                    : "border-zinc-200 text-zinc-600 hover:text-zinc-800"
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
            data={chartData}
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
