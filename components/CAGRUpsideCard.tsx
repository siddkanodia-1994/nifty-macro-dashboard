"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TimeWindow } from "@/lib/types";

const WINDOW_YEARS: Record<TimeWindow, number | null> = {
  "3M": 0.25,
  "6M": 0.5,
  "1Y": 1,
  "2Y": 2,
  "3Y": 3,
  "4Y": 4,
  "ALL": null, // computed from startDate
};

function computeYears(timeWindow: TimeWindow, startDate: string): number {
  const fixed = WINDOW_YEARS[timeWindow];
  if (fixed !== null) return fixed;
  // MAX: derive from actual start date
  const start = new Date(startDate).getTime();
  const now   = Date.now();
  return Math.max((now - start) / (365.25 * 24 * 60 * 60 * 1000), 0.01);
}

function formatStartDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

interface CAGRUpsideCardProps {
  startValue: number;
  startDate: string;
  currentValue: number | null;
  timeWindow: TimeWindow;
  valueFormatter: (v: number | null) => string;
  invertSign?: boolean; // true for USD/INR: lower rate = INR upside = positive
  label: string;
}

export function CAGRUpsideCard({
  startValue,
  startDate,
  currentValue,
  timeWindow,
  valueFormatter,
  invertSign = false,
  label,
}: CAGRUpsideCardProps) {
  // 3M and 6M show absolute % change (no annualisation); 1Y+ show CAGR
  const isAbsolute = timeWindow === "3M" || timeWindow === "6M";

  // Guard: cannot compute without valid inputs
  const canCompute =
    startValue > 0 &&
    currentValue != null &&
    currentValue > 0 &&
    startDate !== "";

  let cagrPct: number | null = null;

  if (canCompute && currentValue != null) {
    const years = isAbsolute ? 1 : computeYears(timeWindow, startDate);
    if (years >= 0.08) { // at least ~1 month of data
      const ratio = invertSign
        ? startValue / currentValue   // lower current = INR strengthened = positive
        : currentValue / startValue;  // higher current = metric rose = positive
      cagrPct = (Math.pow(ratio, 1 / years) - 1) * 100;
    }
  }

  const isPositive = cagrPct != null && cagrPct > 0.005;
  const isNegative = cagrPct != null && cagrPct < -0.005;

  // Direction label — absolute windows say "over 3M", CAGR windows say "/yr"
  let directionLabel = "";
  if (cagrPct != null) {
    const abs = Math.abs(cagrPct).toFixed(2);
    const suffix = isAbsolute ? ` over ${timeWindow}` : "/yr";
    if (invertSign) {
      directionLabel = isPositive
        ? `INR appreciated ${abs}%${suffix}`
        : isNegative
        ? `INR depreciated ${abs}%${suffix}`
        : "INR unchanged";
    } else {
      directionLabel = isPositive
        ? `${label} rising ${abs}%${suffix}`
        : isNegative
        ? `${label} falling ${abs}%${suffix}`
        : `${label} unchanged`;
    }
  }

  const cagrDisplay =
    cagrPct == null
      ? "—"
      : `${cagrPct >= 0 ? "+" : ""}${cagrPct.toFixed(2)}%`;

  return (
    <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            {isAbsolute ? "Absolute Change" : "CAGR Upside"}
          </span>
          <span className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
            {timeWindow} window
          </span>
        </div>

        {/* CAGR value */}
        <div>
          <p
            className={cn(
              "text-2xl font-bold tabular-nums leading-none",
              isPositive
                ? "text-emerald-600 dark:text-emerald-400"
                : isNegative
                ? "text-red-500 dark:text-red-400"
                : "text-zinc-700 dark:text-zinc-300"
            )}
          >
            {cagrDisplay}
          </p>
          {directionLabel && (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {directionLabel}
            </p>
          )}
        </div>

        {/* Start → Current */}
        {canCompute && currentValue != null && (
          <div className="text-xs text-zinc-500 dark:text-zinc-400 space-y-0.5 border-t border-zinc-100 dark:border-zinc-800 pt-2.5">
            <div className="flex items-center gap-1 tabular-nums">
              <span className="text-zinc-400 dark:text-zinc-500">From</span>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {valueFormatter(startValue)}
              </span>
              <span className="text-zinc-400">→</span>
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                {valueFormatter(currentValue)}
              </span>
            </div>
            <div className="text-zinc-400 dark:text-zinc-500">
              {formatStartDate(startDate)} → today
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
