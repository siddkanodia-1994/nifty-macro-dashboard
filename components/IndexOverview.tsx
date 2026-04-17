"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { INDEX_META, formatPrice, formatRatio, cn } from "@/lib/utils";
import type { HistoricalRow, IndexKey } from "@/lib/types";

interface IndexOverviewProps {
  historicalData: HistoricalRow[];
  liveData: Partial<Record<IndexKey, number>> | null;
  onSelectIndex: (key: IndexKey) => void;
}

export function IndexOverview({ historicalData, liveData, onSelectIndex }: IndexOverviewProps) {
  const lastRow = historicalData[historicalData.length - 1] ?? null;

  const cards = useMemo(() => {
    if (!lastRow) return [];
    return INDEX_META.map((meta) => {
      const hist = lastRow[meta.key];
      const liveClose = liveData?.[meta.key] ?? null;
      const isLive = liveClose != null;

      const close = liveClose ?? hist.close;
      const pe = isLive && hist.impliedEPS
        ? liveClose! / hist.impliedEPS
        : hist.pe;
      const pb = isLive && hist.impliedBV
        ? liveClose! / hist.impliedBV
        : hist.pb;

      return { meta, close, pe, pb, isLive };
    });
  }, [lastRow, liveData]);

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(({ meta, close, pe, pb, isLive }) => (
          <Card
            key={meta.key}
            className="bg-white border border-zinc-200 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => onSelectIndex(meta.key)}
          >
            <CardContent className="px-4 py-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-zinc-900 uppercase tracking-wide leading-tight">
                  {meta.label}
                </p>
                {isLive && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                    LIVE
                  </span>
                )}
              </div>

              {/* Metrics */}
              <div className="space-y-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium">Close</p>
                  <p className="text-lg font-bold text-zinc-900 tabular-nums leading-tight">
                    {formatPrice(close)}
                  </p>
                </div>
                <div className="flex gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium">P/E</p>
                    <p className={cn("text-sm font-semibold tabular-nums", isLive ? "text-zinc-900" : "text-zinc-800")}>
                      {formatRatio(pe)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-zinc-500 font-medium">P/B</p>
                    <p className={cn("text-sm font-semibold tabular-nums", isLive ? "text-zinc-900" : "text-zinc-800")}>
                      {formatRatio(pb)}
                    </p>
                  </div>
                </div>
              </div>

              {/* CTA */}
              <div className="mt-3 pt-3 border-t border-zinc-100">
                <p className="text-[11px] font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
                  View Details →
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
