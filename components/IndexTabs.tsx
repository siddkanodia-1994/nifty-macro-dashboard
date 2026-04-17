"use client";

import { useState, useEffect, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IndexPanel } from "@/components/IndexPanel";
import { IndexOverview } from "@/components/IndexOverview";
import { BYEYPanel } from "@/components/BYEYPanel";
import { FutureProjectionPanel } from "@/components/FutureProjectionPanel";
import { DailyDataPanel } from "@/components/DailyDataPanel";
import { INDEX_META } from "@/lib/utils";
import { isMarketOpen } from "@/lib/marketHours";
import type { BYEYRow, HistoricalRow, IndexKey, TimeWindow } from "@/lib/types";

type MainTab = "INDEX_LEVELS" | "FUTURE_PROJECTION" | "BYEY" | "DAILY_DATA";
type IndexSubTab = IndexKey | "OVERVIEW";

interface IndexTabsProps {
  historicalData: HistoricalRow[];
  byeyData: BYEYRow[];
}

export function IndexTabs({ historicalData, byeyData }: IndexTabsProps) {
  const [activeMainTab, setActiveMainTab]   = useState<MainTab>("INDEX_LEVELS");
  const [activeIndexTab, setActiveIndexTab] = useState<IndexSubTab>("OVERVIEW");
  const [timeWindow, setTimeWindow]         = useState<TimeWindow>("1Y");
  const [liveData, setLiveData]             = useState<Partial<Record<IndexKey, number>> | null>(null);
  const [liveBondYield, setLiveBondYield]   = useState<number | null>(null);

  const fetchLive = useCallback(async () => {
    if (!isMarketOpen()) return;
    try {
      const res = await fetch("/api/live-prices");
      if (!res.ok) return;
      const json = await res.json();
      if (!json.marketOpen) return;
      const prices: Partial<Record<IndexKey, number>> = {};
      for (const meta of INDEX_META) {
        const val = json[meta.key];
        if (typeof val === "number") prices[meta.key] = val;
      }
      setLiveData(prices);
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
      value={activeMainTab}
      onValueChange={(v) => setActiveMainTab(v as MainTab)}
    >
      {/* ── Main tab bar ── */}
      <TabsList className="flex h-auto gap-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-1 w-full mb-5">
        <TabsTrigger
          value="INDEX_LEVELS"
          className="flex-1 rounded-lg px-4 py-2 text-xs font-medium data-active:bg-zinc-900 dark:data-active:bg-zinc-100 data-active:text-white dark:data-active:text-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <span className="hidden sm:inline">Index Levels</span>
          <span className="sm:hidden">Indices</span>
        </TabsTrigger>
        <TabsTrigger
          value="FUTURE_PROJECTION"
          className="flex-1 rounded-lg px-4 py-2 text-xs font-medium data-active:bg-zinc-900 dark:data-active:bg-zinc-100 data-active:text-white dark:data-active:text-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <span className="hidden sm:inline">Future Projection</span>
          <span className="sm:hidden">Projection</span>
        </TabsTrigger>
        <TabsTrigger
          value="BYEY"
          className="flex-1 rounded-lg px-4 py-2 text-xs font-medium data-active:bg-zinc-900 dark:data-active:bg-zinc-100 data-active:text-white dark:data-active:text-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <span className="hidden sm:inline">BY-EY Spread</span>
          <span className="sm:hidden">BY-EY</span>
        </TabsTrigger>
        <TabsTrigger
          value="DAILY_DATA"
          className="flex-1 rounded-lg px-4 py-2 text-xs font-medium data-active:bg-zinc-900 dark:data-active:bg-zinc-100 data-active:text-white dark:data-active:text-zinc-900 text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <span className="hidden sm:inline">Daily Data</span>
          <span className="sm:hidden">Daily</span>
        </TabsTrigger>
      </TabsList>

      {/* ── Tab 1: Index Levels ── */}
      <TabsContent value="INDEX_LEVELS" keepMounted>
        <Tabs
          value={activeIndexTab}
          onValueChange={(v) => setActiveIndexTab(v as IndexSubTab)}
        >
          {/* Sub-tab bar: scrollable on mobile */}
          <div className="overflow-x-auto mb-4">
            <TabsList className="flex h-auto gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 w-max min-w-full">
              <TabsTrigger
                value="OVERVIEW"
                className="rounded-md px-4 py-1.5 text-xs font-medium data-active:bg-white dark:data-active:bg-zinc-900 data-active:text-zinc-900 dark:data-active:text-zinc-100 data-active:shadow-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors whitespace-nowrap"
              >
                Overview
              </TabsTrigger>
              {INDEX_META.map((meta) => (
                <TabsTrigger
                  key={meta.key}
                  value={meta.key}
                  className="rounded-md px-4 py-1.5 text-xs font-medium data-active:bg-white dark:data-active:bg-zinc-900 data-active:text-zinc-900 dark:data-active:text-zinc-100 data-active:shadow-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors whitespace-nowrap"
                >
                  <span className="hidden sm:inline">{meta.label}</span>
                  <span className="sm:hidden">{meta.shortLabel}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Overview sub-tab */}
          <TabsContent value="OVERVIEW" keepMounted>
            <IndexOverview
              historicalData={historicalData}
              liveData={liveData}
              onSelectIndex={(key) => setActiveIndexTab(key)}
            />
          </TabsContent>

          {/* Individual index sub-tabs */}
          {INDEX_META.map((meta) => (
            <TabsContent key={meta.key} value={meta.key} keepMounted>
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
      </TabsContent>

      {/* ── Tab 2: Future Projection ── */}
      <TabsContent value="FUTURE_PROJECTION" keepMounted>
        <FutureProjectionPanel
          historicalData={historicalData}
          liveData={liveData}
        />
      </TabsContent>

      {/* ── Tab 3: BY-EY Spread ── */}
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

      {/* ── Tab 4: Daily Data ── */}
      <TabsContent value="DAILY_DATA" keepMounted>
        <DailyDataPanel
          historicalData={historicalData}
          liveData={liveData}
        />
      </TabsContent>
    </Tabs>
  );
}
