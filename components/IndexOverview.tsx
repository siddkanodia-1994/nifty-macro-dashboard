"use client";

import { useMemo, useState } from "react";
import { TimeWindowSelector } from "@/components/TimeWindowSelector";
import {
  filterByWindow,
  extractValues,
  mean,
  stdDev,
  zScore,
} from "@/lib/calculations";
import {
  INDEX_META,
  formatPrice,
  formatRatio,
  formatZScore,
  cn,
} from "@/lib/utils";
import type { HistoricalRow, IndexKey, TimeWindow } from "@/lib/types";

interface IndexOverviewProps {
  historicalData: HistoricalRow[];
  liveData: Partial<Record<IndexKey, number>> | null;
  onSelectIndex: (key: IndexKey) => void;
}

function ZBadge({ z }: { z: number | null }) {
  if (z == null) return <span className="text-zinc-400 text-sm">—</span>;
  const abs = Math.abs(z);
  const label = formatZScore(z);

  if (abs >= 1.5) {
    return z > 0
      ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 tabular-nums">{label}</span>
      : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 tabular-nums">{label}</span>;
  }
  if (abs >= 0.5) {
    return z > 0
      ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 tabular-nums">{label}</span>
      : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 tabular-nums">{label}</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 tabular-nums">{label}</span>;
}

export function IndexOverview({ historicalData, liveData, onSelectIndex }: IndexOverviewProps) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("2Y");

  const lastRow = historicalData[historicalData.length - 1] ?? null;

  const windowRows = useMemo(
    () => filterByWindow(historicalData, timeWindow),
    [historicalData, timeWindow]
  );

  const stats = useMemo(() => {
    return INDEX_META.map((meta) => {
      const key = meta.key;
      const liveClose = liveData?.[key] ?? null;
      const hist = lastRow?.[key];
      const isLive = liveClose != null;

      const close     = liveClose ?? hist?.close ?? null;
      const currentPE = isLive && hist?.impliedEPS ? liveClose! / hist.impliedEPS : hist?.pe ?? null;
      const currentPB = isLive && hist?.impliedBV  ? liveClose! / hist.impliedBV  : hist?.pb ?? null;

      const peVals = extractValues(windowRows, key, "pe");
      const peMean = peVals.length >= 2 ? mean(peVals)   : null;
      const peSD   = peVals.length >= 2 ? stdDev(peVals) : null;
      const peZ    = currentPE != null && peMean != null && peSD != null ? zScore(currentPE, peMean, peSD) : null;

      const pbVals = extractValues(windowRows, key, "pb");
      const pbMean = pbVals.length >= 2 ? mean(pbVals)   : null;
      const pbSD   = pbVals.length >= 2 ? stdDev(pbVals) : null;
      const pbZ    = currentPB != null && pbMean != null && pbSD != null ? zScore(currentPB, pbMean, pbSD) : null;

      return { meta, key, close, isLive, pe: currentPE, peMean, peSD, peZ, pb: currentPB, pbMean, pbSD, pbZ };
    });
  }, [windowRows, lastRow, liveData]);

  function ratioColor(current: number | null, m: number | null, sd: number | null) {
    if (current == null || m == null || sd == null || sd === 0) return "text-zinc-900 dark:text-zinc-100";
    if (current > m + sd)  return "text-red-700 dark:text-red-400";
    if (current < m - sd)  return "text-emerald-700 dark:text-emerald-400";
    return "text-zinc-900 dark:text-zinc-100";
  }

  return (
    <div className="pt-2">
      {/* Card with top accent border */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm bg-white dark:bg-zinc-900 overflow-hidden">

        {/* Header strip */}
        <div className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              All Indices — {timeWindow} Window Statistics
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Mean &amp; SD computed from {timeWindow} rolling window · Live prices during market hours
            </p>
          </div>
          <TimeWindowSelector value={timeWindow} onChange={setTimeWindow} />
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              {/* Group headers */}
              <tr className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                <th className="px-6 py-2 text-left" rowSpan={2} />
                <th
                  className="px-5 py-2 text-right text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300"
                  rowSpan={2}
                >
                  Close
                </th>
                {/* P/E group */}
                <th
                  colSpan={4}
                  className="px-5 py-2 text-center text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 border-l border-zinc-200 dark:border-zinc-700"
                >
                  P / E  R A T I O
                </th>
                {/* P/B group */}
                <th
                  colSpan={4}
                  className="px-5 py-2 text-center text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200 border-l border-zinc-200 dark:border-zinc-700"
                >
                  P / B  R A T I O
                </th>
                <th rowSpan={2} />
              </tr>

              {/* Column headers */}
              <tr className="bg-zinc-50 dark:bg-zinc-800 border-b-2 border-zinc-200 dark:border-zinc-700">
                {/* PE cols */}
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300 border-l border-zinc-200 dark:border-zinc-700">Current</th>
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">Mean</th>
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">SD</th>
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">Z-Score</th>
                {/* PB cols */}
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300 border-l border-zinc-200 dark:border-zinc-700">Current</th>
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">Mean</th>
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">SD</th>
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">Z-Score</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {stats.map(({ meta, close, isLive, pe, peMean, peSD, peZ, pb, pbMean, pbSD, pbZ }, idx) => (
                <tr
                  key={meta.key}
                  className={cn(
                    "transition-colors hover:bg-blue-50/30 dark:hover:bg-blue-900/10",
                    idx % 2 === 1 ? "bg-zinc-50/40 dark:bg-zinc-800/40" : "bg-white dark:bg-zinc-900"
                  )}
                >
                  {/* Index name */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap tracking-tight">
                        {meta.label}
                      </span>
                      {isLive && (
                        <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 whitespace-nowrap bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                          </span>
                          LIVE
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Close */}
                  <td className="px-5 py-4 text-right">
                    <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                      {close != null ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(close)) : "—"}
                    </span>
                  </td>

                  {/* PE Current */}
                  <td className="px-5 py-4 text-right border-l border-zinc-100 dark:border-zinc-800">
                    <span className={cn("text-base font-bold tabular-nums", ratioColor(pe, peMean, peSD))}>
                      {formatRatio(pe)}
                    </span>
                  </td>
                  {/* PE Mean */}
                  <td className="px-5 py-4 text-right">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400 tabular-nums">{formatRatio(peMean)}</span>
                  </td>
                  {/* PE SD */}
                  <td className="px-5 py-4 text-right">
                    <span className="text-sm text-zinc-500 dark:text-zinc-400 tabular-nums">{formatRatio(peSD)}</span>
                  </td>
                  {/* PE Z */}
                  <td className="px-5 py-4 text-right">
                    <ZBadge z={peZ} />
                  </td>

                  {/* PB Current */}
                  <td className="px-5 py-4 text-right border-l border-zinc-100 dark:border-zinc-800">
                    <span className={cn("text-base font-bold tabular-nums", ratioColor(pb, pbMean, pbSD))}>
                      {formatRatio(pb)}
                    </span>
                  </td>
                  {/* PB Mean */}
                  <td className="px-5 py-4 text-right">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400 tabular-nums">{formatRatio(pbMean)}</span>
                  </td>
                  {/* PB SD */}
                  <td className="px-5 py-4 text-right">
                    <span className="text-sm text-zinc-500 dark:text-zinc-400 tabular-nums">{formatRatio(pbSD)}</span>
                  </td>
                  {/* PB Z */}
                  <td className="px-5 py-4 text-right">
                    <ZBadge z={pbZ} />
                  </td>

                  {/* Details */}
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => onSelectIndex(meta.key)}
                      className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors whitespace-nowrap tracking-wide"
                    >
                      Details →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer legend */}
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-6 py-3 bg-zinc-50/60 dark:bg-zinc-800/60 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span>
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-300 mr-1.5 align-middle" />
            Current &gt; Mean + 1SD — expensive vs {timeWindow} history
          </span>
          <span>
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-300 mr-1.5 align-middle" />
            Current &lt; Mean − 1SD — cheap vs {timeWindow} history
          </span>
          <span className="text-zinc-400">Z-Score = (Current − Mean) ÷ SD</span>
        </div>
      </div>
    </div>
  );
}
