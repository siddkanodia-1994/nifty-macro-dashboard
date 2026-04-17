"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  zScoreColor,
  cn,
} from "@/lib/utils";
import type { HistoricalRow, IndexKey, TimeWindow } from "@/lib/types";

interface IndexOverviewProps {
  historicalData: HistoricalRow[];
  liveData: Partial<Record<IndexKey, number>> | null;
  onSelectIndex: (key: IndexKey) => void;
}

export function IndexOverview({ historicalData, liveData, onSelectIndex }: IndexOverviewProps) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("1Y");

  const lastRow = historicalData[historicalData.length - 1] ?? null;

  const windowRows = useMemo(
    () => filterByWindow(historicalData, timeWindow),
    [historicalData, timeWindow]
  );

  // Per-index stats computed from the selected window
  const stats = useMemo(() => {
    return INDEX_META.map((meta) => {
      const key = meta.key;

      // Live-aware current values
      const liveClose = liveData?.[key] ?? null;
      const hist = lastRow?.[key];
      const isLive = liveClose != null;

      const close      = liveClose ?? hist?.close ?? null;
      const currentPE  = isLive && hist?.impliedEPS ? liveClose! / hist.impliedEPS : hist?.pe ?? null;
      const currentPB  = isLive && hist?.impliedBV  ? liveClose! / hist.impliedBV  : hist?.pb ?? null;

      // Window mean/SD for PE
      const peVals  = extractValues(windowRows, key, "pe");
      const peMean  = peVals.length >= 2 ? mean(peVals)   : null;
      const peSD    = peVals.length >= 2 ? stdDev(peVals) : null;
      const peZ     = currentPE != null && peMean != null && peSD != null
        ? zScore(currentPE, peMean, peSD)
        : null;

      // Window mean/SD for PB
      const pbVals  = extractValues(windowRows, key, "pb");
      const pbMean  = pbVals.length >= 2 ? mean(pbVals)   : null;
      const pbSD    = pbVals.length >= 2 ? stdDev(pbVals) : null;
      const pbZ     = currentPB != null && pbMean != null && pbSD != null
        ? zScore(currentPB, pbMean, pbSD)
        : null;

      return {
        meta, key, close, isLive,
        pe: currentPE, peMean, peSD, peZ,
        pb: currentPB, pbMean, pbSD, pbZ,
      };
    });
  }, [windowRows, lastRow, liveData]);

  // Color for current PE/PB cell — red if > mean+1SD, green if < mean-1SD
  function ratioColor(current: number | null, m: number | null, sd: number | null) {
    if (current == null || m == null || sd == null || sd === 0) return "text-zinc-900";
    if (current > m + sd)  return "text-red-700";
    if (current < m - sd)  return "text-emerald-700";
    return "text-zinc-900";
  }

  const headers = [
    { label: "Index",     span: 1, right: false },
    { label: "Close",     span: 1, right: true  },
    { label: "P/E",       span: 1, right: true  },
    { label: "PE Mean",   span: 1, right: true  },
    { label: "PE SD",     span: 1, right: true  },
    { label: "PE Z",      span: 1, right: true  },
    { label: "P/B",       span: 1, right: true  },
    { label: "PB Mean",   span: 1, right: true  },
    { label: "PB SD",     span: 1, right: true  },
    { label: "PB Z",      span: 1, right: true  },
    { label: "",          span: 1, right: false },  // Details CTA
  ];

  return (
    <div className="space-y-4 pt-2">
      <Card className="bg-white border border-zinc-200 shadow-sm">
        <CardHeader className="px-6 pt-5 pb-3">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-zinc-900">
              All Indices — {timeWindow} Window Statistics
            </p>
            <TimeWindowSelector value={timeWindow} onChange={setTimeWindow} />
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-200">
                  {headers.map((h, i) => (
                    <th
                      key={i}
                      className={cn(
                        "px-5 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-600 whitespace-nowrap",
                        h.right ? "text-right" : "text-left"
                      )}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.map(({ meta, close, isLive, pe, peMean, peSD, peZ, pb, pbMean, pbSD, pbZ }) => (
                  <tr
                    key={meta.key}
                    className="border-b border-zinc-50 hover:bg-zinc-50/70 transition-colors"
                  >
                    {/* Index name */}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-zinc-900 whitespace-nowrap">
                          {meta.label}
                        </span>
                        {isLive && (
                          <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 whitespace-nowrap">
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                            </span>
                            LIVE
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Close price */}
                    <td className="px-5 py-4 text-right">
                      <span className="text-base font-semibold text-zinc-900 tabular-nums whitespace-nowrap">
                        {formatPrice(close)}
                      </span>
                    </td>

                    {/* P/E */}
                    <td className="px-5 py-4 text-right">
                      <span className={cn("text-base font-semibold tabular-nums", ratioColor(pe, peMean, peSD))}>
                        {formatRatio(pe)}
                      </span>
                    </td>

                    {/* PE Mean */}
                    <td className="px-5 py-4 text-right">
                      <span className="text-sm text-zinc-700 tabular-nums">
                        {formatRatio(peMean)}
                      </span>
                    </td>

                    {/* PE SD */}
                    <td className="px-5 py-4 text-right">
                      <span className="text-sm text-zinc-600 tabular-nums">
                        {formatRatio(peSD)}
                      </span>
                    </td>

                    {/* PE Z-Score */}
                    <td className="px-5 py-4 text-right">
                      <span className={cn("text-sm font-semibold tabular-nums", zScoreColor(peZ))}>
                        {formatZScore(peZ)}
                      </span>
                    </td>

                    {/* P/B */}
                    <td className="px-5 py-4 text-right">
                      <span className={cn("text-base font-semibold tabular-nums", ratioColor(pb, pbMean, pbSD))}>
                        {formatRatio(pb)}
                      </span>
                    </td>

                    {/* PB Mean */}
                    <td className="px-5 py-4 text-right">
                      <span className="text-sm text-zinc-700 tabular-nums">
                        {formatRatio(pbMean)}
                      </span>
                    </td>

                    {/* PB SD */}
                    <td className="px-5 py-4 text-right">
                      <span className="text-sm text-zinc-600 tabular-nums">
                        {formatRatio(pbSD)}
                      </span>
                    </td>

                    {/* PB Z-Score */}
                    <td className="px-5 py-4 text-right">
                      <span className={cn("text-sm font-semibold tabular-nums", zScoreColor(pbZ))}>
                        {formatZScore(pbZ)}
                      </span>
                    </td>

                    {/* Details link */}
                    <td className="px-5 py-4 text-right">
                      <button
                        onClick={() => onSelectIndex(meta.key)}
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors whitespace-nowrap"
                      >
                        Details →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="mt-3 px-6 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-zinc-500">
            <span><span className="text-red-700 font-medium">Red</span> = current &gt; mean + 1SD (expensive)</span>
            <span><span className="text-emerald-700 font-medium">Green</span> = current &lt; mean − 1SD (cheap)</span>
            <span>Z-Score: deviation from {timeWindow} window mean in SD units</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
