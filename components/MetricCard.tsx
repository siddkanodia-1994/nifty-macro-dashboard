"use client";

import { cn, formatMetric, formatZScore, formatPercentile, zScoreBgColor } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { MetricKey, WindowStats } from "@/lib/types";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  label: string;
  metric: MetricKey;
  stats: WindowStats | null;
  isLive?: boolean;
  /** Override stats.current — use when showing a derived value without full stats */
  value?: number | null;
  /** Override formatMetric for both current value and mean display */
  valueFormatter?: (v: number | null) => string;
}

export function MetricCard({ label, metric, stats, isLive = false, value, valueFormatter }: MetricCardProps) {
  const current = (value !== undefined ? value : stats?.current) ?? null;
  const zScore  = stats?.zScore  ?? null;
  const pct     = stats?.percentile ?? null;

  // Change vs window mean
  const changePct =
    stats && stats.mean > 0 && current != null
      ? ((current - stats.mean) / stats.mean) * 100
      : null;

  const isPositive = changePct != null && changePct > 0;
  const isNegative = changePct != null && changePct < 0;

  return (
    <Card className="bg-white border border-zinc-200 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        {/* Label + LIVE badge */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-zinc-700 uppercase tracking-wide">
            {label}
          </p>
          {isLive && (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              LIVE
            </span>
          )}
        </div>

        {/* Current value */}
        <p className="text-2xl font-semibold text-zinc-900 mb-1 leading-none">
          {valueFormatter ? valueFormatter(current) : formatMetric(metric, current)}
        </p>

        {/* Change vs mean */}
        {changePct != null && (
          <div className="flex items-center gap-1 mb-3">
            {isPositive ? (
              <TrendingUp className="h-3 w-3 text-red-500" />
            ) : isNegative ? (
              <TrendingDown className="h-3 w-3 text-emerald-500" />
            ) : (
              <Minus className="h-3 w-3 text-zinc-600" />
            )}
            <span
              className={cn(
                "text-xs font-medium",
                isPositive ? "text-red-500" : isNegative ? "text-emerald-600" : "text-zinc-600"
              )}
            >
              {changePct >= 0 ? "+" : ""}
              {changePct.toFixed(1)}% vs mean
            </span>
          </div>
        )}

        {/* Mean */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100">
          <span className="text-xs text-[#1d3557]">
            Mean: {valueFormatter ? valueFormatter(stats?.mean ?? null) : formatMetric(metric, stats?.mean ?? null)}
          </span>
          {zScore != null && (
            <span className={cn("text-xs font-medium px-1.5 py-0.5 rounded", zScoreBgColor(zScore))}>
              Z {formatZScore(zScore)}
            </span>
          )}
        </div>

        {/* Percentile badge */}
        {pct != null && (
          <p className="text-xs text-[#1d3557] mt-1">
            {formatPercentile(pct)} percentile
          </p>
        )}
      </CardContent>
    </Card>
  );
}
