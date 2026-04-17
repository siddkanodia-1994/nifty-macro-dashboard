"use client";

import { cn, formatMetric, formatZScore, formatPercentile, zScoreColor, METRIC_LABELS } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { IndexStats, MetricKey, TimeWindow } from "@/lib/types";

interface StatsTableProps {
  stats: IndexStats;
  timeWindow: TimeWindow;
}

const METRICS: MetricKey[] = ["close", "pe", "pb", "impliedEPS", "impliedBV"];

export function StatsTable({ stats, timeWindow }: StatsTableProps) {
  return (
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
                    className="px-5 py-2 text-left text-xs font-medium text-zinc-700 dark:text-zinc-300 uppercase tracking-wide whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {METRICS.map((metric, i) => {
                const s = stats[metric];
                return (
                  <tr
                    key={metric}
                    className={cn(
                      "border-b border-zinc-50 dark:border-zinc-800 hover:bg-zinc-50/70 dark:hover:bg-zinc-800/50 transition-colors",
                      i === METRICS.length - 1 && "border-b-0"
                    )}
                  >
                    <td className="px-5 py-2.5 font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                      {METRIC_LABELS[metric]}
                    </td>
                    <td className="px-5 py-2.5 text-zinc-800 dark:text-zinc-200 tabular-nums">
                      {s ? formatMetric(metric, s.mean) : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-zinc-800 dark:text-zinc-200 tabular-nums">
                      {s ? formatMetric(metric, s.sd) : "—"}
                    </td>
                    <td className="px-5 py-2.5 font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                      {s ? formatMetric(metric, s.current) : "—"}
                    </td>
                    <td className={cn("px-5 py-2.5 font-medium tabular-nums", zScoreColor(s?.zScore ?? null))}>
                      {s ? formatZScore(s.zScore) : "—"}
                    </td>
                    <td className="px-5 py-2.5 text-zinc-800 dark:text-zinc-200 tabular-nums">
                      {s ? formatPercentile(s.percentile) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
