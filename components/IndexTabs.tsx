"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IndexPanel } from "@/components/IndexPanel";
import { IndexOverview } from "@/components/IndexOverview";
import { BYEYPanel } from "@/components/BYEYPanel";
import { FutureProjectionPanel } from "@/components/FutureProjectionPanel";
import { DailyDataPanel } from "@/components/DailyDataPanel";
import { MacroScorePanel } from "@/components/MacroScorePanel";
import { INDEX_META } from "@/lib/utils";
import { isMarketOpen } from "@/lib/marketHours";
import type { BYEYRow, HistoricalRow, IndexKey, TimeWindow } from "@/lib/types";

type MainTab = "INDEX_LEVELS" | "FUTURE_PROJECTION" | "MACRO_SCORE" | "BYEY" | "DAILY_DATA";
type IndexSubTab = IndexKey | "OVERVIEW";

type ProjectionDefaultEntry = { base?: { growthPct?: number }; baseEPS?: number | null; baseBV?: number | null };
type ProjectionDefaultsMap = Partial<Record<IndexKey, ProjectionDefaultEntry>>;

interface IndexTabsProps {
  historicalData: HistoricalRow[];
  byeyData: BYEYRow[];
}

export function IndexTabs({ historicalData, byeyData }: IndexTabsProps) {
  const [activeMainTab, setActiveMainTab]       = useState<MainTab>("INDEX_LEVELS");
  const [activeIndexTab, setActiveIndexTab]     = useState<IndexSubTab>("OVERVIEW");
  const [timeWindow, setTimeWindow]             = useState<TimeWindow>("4Y");
  const [overviewTimeWindow, setOverviewTimeWindow] = useState<TimeWindow>("4Y");
  const [liveData, setLiveData]             = useState<Partial<Record<IndexKey, number>> | null>(null);
  const [liveMarketOpen, setLiveMarketOpen] = useState(false);
  const [liveBondYield, setLiveBondYield]   = useState<number | null>(null);
  const [projectionDefaults, setProjectionDefaults] = useState<ProjectionDefaultsMap | null>(null);
  const [sharedGrowthPct, setSharedGrowthPct] = useState<Partial<Record<IndexKey, number>>>({});
  const growthPctInitialized = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/projection-defaults", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (json) {
            setProjectionDefaults(json as ProjectionDefaultsMap);
            if (!growthPctInitialized.current) {
              const initial: Partial<Record<IndexKey, number>> = {};
              for (const key of Object.keys(json) as IndexKey[]) {
                const g = (json as any)[key]?.base?.growthPct;
                if (typeof g === "number") initial[key] = g;
              }
              setSharedGrowthPct(initial);
              growthPctInitialized.current = true;
            }
          }
        }
      } catch {}
    })();
  }, []);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/live-prices");
      if (!res.ok) { setLiveData(null); return; }
      const json = await res.json();
      const prices: Partial<Record<IndexKey, number>> = {};
      for (const meta of INDEX_META) {
        const val = json[meta.key];
        if (typeof val === "number") prices[meta.key] = val;
      }
      const anyValid = Object.values(prices).some((v) => v != null);
      if (!anyValid) { setLiveData(null); return; }
      setLiveData(prices);
      setLiveMarketOpen(json.marketOpen === true);
      if (typeof json.bondYield === "number") setLiveBondYield(json.bondYield);
    } catch {
      // Network error — keep last known state
    }
  }, []);

  // Fetch once on mount (shows CLO badge after close); poll every 60s during market hours
  useEffect(() => {
    fetchLive();
    if (!isMarketOpen()) return;
    const pollId = setInterval(fetchLive, 60_000);
    return () => clearInterval(pollId);
  }, [fetchLive]);

  // Detect market close in real-time for users who stay on the page past 3:30 PM
  useEffect(() => {
    const id = setInterval(() => {
      if (!isMarketOpen()) setLiveMarketOpen(false);
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const handleGrowthPctChange = useCallback((key: IndexKey, val: number) => {
    setSharedGrowthPct(prev => ({ ...prev, [key]: val }));
  }, []);

  return (
    <Tabs
      value={activeMainTab}
      onValueChange={(v) => setActiveMainTab(v as MainTab)}
    >
      {/* ── Main tab bar ── */}
      <TabsList data-tab-nav className="flex h-auto gap-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl p-1 w-full mb-5">
        <TabsTrigger
          value="INDEX_LEVELS"
          className="flex-1 rounded-lg px-4 py-2 text-xs font-medium data-active:bg-zinc-900 dark:data-active:bg-zinc-100 data-active:text-white dark:data-active:text-zinc-900 text-zinc-800 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <span className="hidden sm:inline">Index Levels</span>
          <span className="sm:hidden">Indices</span>
        </TabsTrigger>
        <TabsTrigger
          value="FUTURE_PROJECTION"
          className="flex-1 rounded-lg px-4 py-2 text-xs font-medium data-active:bg-zinc-900 dark:data-active:bg-zinc-100 data-active:text-white dark:data-active:text-zinc-900 text-zinc-800 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <span className="hidden sm:inline">Future Projection</span>
          <span className="sm:hidden">Projection</span>
        </TabsTrigger>
        <TabsTrigger
          value="MACRO_SCORE"
          className="flex-1 rounded-lg px-4 py-2 text-xs font-medium data-active:bg-zinc-900 dark:data-active:bg-zinc-100 data-active:text-white dark:data-active:text-zinc-900 text-zinc-800 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <span className="hidden sm:inline">Macro Score</span>
          <span className="sm:hidden">Macro</span>
        </TabsTrigger>
        <TabsTrigger
          value="BYEY"
          className="flex-1 rounded-lg px-4 py-2 text-xs font-medium data-active:bg-zinc-900 dark:data-active:bg-zinc-100 data-active:text-white dark:data-active:text-zinc-900 text-zinc-800 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          <span className="hidden sm:inline">BY-EY Spread</span>
          <span className="sm:hidden">BY-EY</span>
        </TabsTrigger>
        <TabsTrigger
          value="DAILY_DATA"
          className="flex-1 rounded-lg px-4 py-2 text-xs font-medium data-active:bg-zinc-900 dark:data-active:bg-zinc-100 data-active:text-white dark:data-active:text-zinc-900 text-zinc-800 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
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
                className="rounded-md px-4 py-1.5 text-xs font-medium data-active:bg-white dark:data-active:bg-zinc-900 data-active:text-zinc-900 dark:data-active:text-zinc-100 data-active:shadow-sm text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors whitespace-nowrap"
              >
                Overview
              </TabsTrigger>
              {INDEX_META.map((meta) => (
                <TabsTrigger
                  key={meta.key}
                  value={meta.key}
                  className="rounded-md px-4 py-1.5 text-xs font-medium data-active:bg-white dark:data-active:bg-zinc-900 data-active:text-zinc-900 dark:data-active:text-zinc-100 data-active:shadow-sm text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors whitespace-nowrap"
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
              liveMarketOpen={liveMarketOpen}
              onSelectIndex={(key) => setActiveIndexTab(key)}
              timeWindow={overviewTimeWindow}
              onTimeWindowChange={setOverviewTimeWindow}
              projectionDefaults={projectionDefaults}
              epsGrowthPct={sharedGrowthPct}
              onEpsGrowthChange={handleGrowthPctChange}
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
                liveMarketOpen={liveMarketOpen}
                indexGrowthPct={projectionDefaults?.[meta.key]?.base?.growthPct ?? 0}
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
          timeWindow={overviewTimeWindow}
          onTimeWindowChange={setOverviewTimeWindow}
          externalGrowthPct={sharedGrowthPct}
          onGrowthPctChange={handleGrowthPctChange}
        />
      </TabsContent>

      {/* ── Tab 3: Macro Score ── */}
      <TabsContent value="MACRO_SCORE" keepMounted>
        <MacroScorePanel
          historicalData={historicalData}
          byeyData={byeyData}
        />
      </TabsContent>

      {/* ── Tab 4: BY-EY Spread ── */}
      <TabsContent value="BYEY" keepMounted>
        <BYEYPanel
          byeyData={byeyData}
          historicalData={historicalData}
          timeWindow={timeWindow}
          onTimeWindowChange={setTimeWindow}
          liveNifty50Close={liveData?.["NIFTY_50"] ?? null}
          liveBondYield={liveBondYield}
          nifty50BaseGrowthPct={projectionDefaults?.["NIFTY_50"]?.base?.growthPct ?? 0}
        />
      </TabsContent>

      {/* ── Tab 5: Daily Data ── */}
      <TabsContent value="DAILY_DATA" keepMounted>
        <DailyDataPanel
          historicalData={historicalData}
          liveData={liveData}
        />
      </TabsContent>
    </Tabs>
  );
}
