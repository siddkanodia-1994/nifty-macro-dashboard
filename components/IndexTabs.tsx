"use client";

import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IndexPanel } from "@/components/IndexPanel";
import { INDEX_META } from "@/lib/utils";
import { isMarketOpen } from "@/lib/marketHours";
import type { HistoricalRow, IndexKey, TimeWindow } from "@/lib/types";

interface IndexTabsProps {
  historicalData: HistoricalRow[];
}

export function IndexTabs({ historicalData }: IndexTabsProps) {
  const [activeTab, setActiveTab]   = useState<IndexKey>("NIFTY_50");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("1Y");
  const [liveData, setLiveData]     = useState<Partial<Record<IndexKey, number>> | null>(null);

  const fetchLive = useCallback(async () => {
    if (!isMarketOpen()) return;
    try {
      const res = await fetch("/api/live-prices");
      if (!res.ok) return;
      const json = await res.json();
      if (!json.marketOpen) return;
      // Extract only numeric prices keyed by IndexKey
      const prices: Partial<Record<IndexKey, number>> = {};
      for (const meta of INDEX_META) {
        const val = json[meta.key];
        if (typeof val === "number") prices[meta.key] = val;
      }
      setLiveData(prices);
    } catch {
      // Network error — keep last known live data
    }
  }, []);

  useEffect(() => {
    if (!isMarketOpen()) return;
    fetchLive();
    const id = setInterval(fetchLive, 60_000);
    return () => clearInterval(id);
  }, [fetchLive]);

  return (
    <Tabs
      value={activeTab}
      onValueChange={(v) => setActiveTab(v as IndexKey)}
    >
      <TabsList className="flex h-auto gap-1 bg-white border border-zinc-200 rounded-xl p-1 w-full mb-5">
        {INDEX_META.map((meta) => (
          <TabsTrigger
            key={meta.key}
            value={meta.key}
            className="flex-1 rounded-lg px-4 py-2 text-xs font-medium data-active:bg-zinc-900 data-active:text-white text-zinc-700 hover:text-zinc-900 transition-colors"
          >
            <span className="hidden sm:inline">{meta.label}</span>
            <span className="sm:hidden">{meta.shortLabel}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {INDEX_META.map((meta) => (
        <TabsContent
          key={meta.key}
          value={meta.key}
          // Base UI keeps panels in DOM when keepMounted is set
          keepMounted
        >
          <IndexPanel
            indexKey={meta.key}
            historicalData={historicalData}
            timeWindow={timeWindow}
            onTimeWindowChange={setTimeWindow}
            liveClose={liveData?.[meta.key] ?? null}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
