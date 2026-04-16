"use client";

import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IndexPanel } from "@/components/IndexPanel";
import { BYEYPanel } from "@/components/BYEYPanel";
import { INDEX_META } from "@/lib/utils";
import { isMarketOpen } from "@/lib/marketHours";
import type { BYEYRow, HistoricalRow, IndexKey, TimeWindow } from "@/lib/types";

type ActiveTab = IndexKey | "BYEY";

interface IndexTabsProps {
  historicalData: HistoricalRow[];
  byeyData: BYEYRow[];
}

export function IndexTabs({ historicalData, byeyData }: IndexTabsProps) {
  const [activeTab, setActiveTab]     = useState<ActiveTab>("NIFTY_50");
  const [timeWindow, setTimeWindow]   = useState<TimeWindow>("1Y");
  const [liveData, setLiveData]       = useState<Partial<Record<IndexKey, number>> | null>(null);
  const [liveBondYield, setLiveBondYield] = useState<number | null>(null);

  const fetchLive = useCallback(async () => {
    if (!isMarketOpen()) return;
    try {
      const res = await fetch("/api/live-prices");
      if (!res.ok) return;
      const json = await res.json();
      if (!json.marketOpen) return;
      // Extract numeric prices keyed by IndexKey
      const prices: Partial<Record<IndexKey, number>> = {};
      for (const meta of INDEX_META) {
        const val = json[meta.key];
        if (typeof val === "number") prices[meta.key] = val;
      }
      setLiveData(prices);
      // Extract bond yield (decimal, e.g. 0.0687)
      if (typeof json.bondYield === "number") {
        setLiveBondYield(json.bondYield);
      }
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
      onValueChange={(v) => setActiveTab(v as ActiveTab)}
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
        <TabsTrigger
          value="BYEY"
          className="flex-1 rounded-lg px-4 py-2 text-xs font-medium data-active:bg-zinc-900 data-active:text-white text-zinc-700 hover:text-zinc-900 transition-colors"
        >
          <span className="hidden sm:inline">BY-EY Spread</span>
          <span className="sm:hidden">BY-EY</span>
        </TabsTrigger>
      </TabsList>

      {INDEX_META.map((meta) => (
        <TabsContent
          key={meta.key}
          value={meta.key}
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

      <TabsContent value="BYEY" keepMounted>
        <BYEYPanel
          byeyData={byeyData}
          historicalData={historicalData}
          timeWindow={timeWindow}
          onTimeWindowChange={setTimeWindow}
          liveNifty50Close={liveData?.["NIFTY_50"] ?? null}
          liveBondYield={liveBondYield}
        />
      </TabsContent>
    </Tabs>
  );
}
