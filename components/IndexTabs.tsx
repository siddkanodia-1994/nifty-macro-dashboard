"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { getOwnerKey } from "@/lib/owner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IndexOverview } from "@/components/IndexOverview";
import { INDEX_META } from "@/lib/utils";
import { useLivePrices } from "@/lib/livePrices";
import { fetchProjectionDefaults } from "@/lib/projectionDefaults";
import { decodeHistory, type CompactHistory } from "@/lib/compactHistory";
import type { BYEYRow, USDINRRow, IndexKey, TimeWindow } from "@/lib/types";

// Everything except the default Overview tab loads on first visit, so the chart
// library and the heavy panels stay out of the initial bundle.
const TabLoading = () => <div className="py-16 text-center text-xs text-zinc-500">Loading…</div>;
const IndexPanel          = dynamic(() => import("@/components/IndexPanel").then((m) => m.IndexPanel), { loading: TabLoading });
const PeriodReturnsPanel  = dynamic(() => import("@/components/PeriodReturnsPanel").then((m) => m.PeriodReturnsPanel), { loading: TabLoading });
const BondYieldPanel      = dynamic(() => import("@/components/BondYieldPanel").then((m) => m.BondYieldPanel), { loading: TabLoading });
const USDINRPanel         = dynamic(() => import("@/components/USDINRPanel").then((m) => m.USDINRPanel), { loading: TabLoading });
const FutureProjectionPanel = dynamic(() => import("@/components/FutureProjectionPanel").then((m) => m.FutureProjectionPanel), { loading: TabLoading });
const MacroScorePanel     = dynamic(() => import("@/components/MacroScorePanel").then((m) => m.MacroScorePanel), { loading: TabLoading });
const BYEYPanel           = dynamic(() => import("@/components/BYEYPanel").then((m) => m.BYEYPanel), { loading: TabLoading });
const DailyDataPanel      = dynamic(() => import("@/components/DailyDataPanel").then((m) => m.DailyDataPanel), { loading: TabLoading });

type MainTab = "INDEX_LEVELS" | "FUTURE_PROJECTION" | "MACRO_SCORE" | "BYEY" | "DAILY_DATA";
type IndexSubTab = IndexKey | "OVERVIEW" | "RETURNS" | "BOND_YIELD" | "USD_INR";

type ProjectionDefaultEntry = { base?: { growthPct?: number }; baseEPS?: number | null; baseBV?: number | null };
type ProjectionDefaultsMap = Partial<Record<IndexKey, ProjectionDefaultEntry>>;

interface IndexTabsProps {
  history: CompactHistory;
  byeyData: BYEYRow[];
  usdinrData: USDINRRow[];
}

export function IndexTabs({ history, byeyData, usdinrData }: IndexTabsProps) {
  const historicalData = useMemo(() => decodeHistory(history), [history]);
  const [activeMainTab, setActiveMainTab]       = useState<MainTab>("INDEX_LEVELS");
  const [activeIndexTab, setActiveIndexTab]     = useState<IndexSubTab>("OVERVIEW");
  // Tabs mount on first visit, then stay mounted so their state survives switching.
  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set(["INDEX_LEVELS", "OVERVIEW"]));
  const [timeWindow, setTimeWindow]             = useState<TimeWindow>("4Y");
  const [overviewTimeWindow, setOverviewTimeWindow] = useState<TimeWindow>("4Y");
  const {
    prices: liveData,
    marketOpen: liveMarketOpen,
    bondYield: liveBondYield,
    usdInr: liveUSDINR,
  } = useLivePrices();
  const [projectionDefaults, setProjectionDefaults] = useState<ProjectionDefaultsMap | null>(null);
  const [sharedGrowthPct, setSharedGrowthPct] = useState<Partial<Record<IndexKey, number>>>({});
  const [ownerEpsOverride, setOwnerEpsOverride] = useState<{ key: IndexKey; base: number; ts: number } | null>(null);
  const growthPctInitialized = useRef(false);
  const isOwnerMode = useRef(false);

  // Detect owner mode synchronously on mount (mirrors FutureProjectionPanel)
  useEffect(() => {
    if (getOwnerKey()) isOwnerMode.current = true;
  }, []);

  useEffect(() => {
    (async () => {
      const json = (await fetchProjectionDefaults()) as ProjectionDefaultsMap | null;
      if (!json) return;
      setProjectionDefaults(json);
      if (growthPctInitialized.current) return;
      const initial: Partial<Record<IndexKey, number>> = {};
      for (const key of Object.keys(json) as IndexKey[]) {
        const g = json[key]?.base?.growthPct;
        if (typeof g === "number") initial[key] = g;
      }
      // Visitor localStorage overrides take precedence over Redis defaults
      try {
        const stored = localStorage.getItem("nifty-projections-visitor-v2");
        if (stored) {
          const diff = JSON.parse(stored) as Record<string, { base?: { growthPct?: number } }>;
          for (const key of Object.keys(diff) as IndexKey[]) {
            const g = diff[key]?.base?.growthPct;
            if (typeof g === "number") initial[key] = g;
          }
        }
      } catch {}
      setSharedGrowthPct(initial);
      growthPctInitialized.current = true;
    })();
  }, []);

  const selectMainTab = useCallback((tab: MainTab) => {
    setActiveMainTab(tab);
    setVisited((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, []);

  const selectIndexTab = useCallback((tab: IndexSubTab) => {
    setActiveIndexTab(tab);
    setVisited((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  }, []);

  // Overview edits → visual sync + signal FutureProjectionPanel to save (owner mode only)
  const handleOverviewEpsChange = useCallback((key: IndexKey, val: number) => {
    setSharedGrowthPct(prev => ({ ...prev, [key]: val }));
    if (isOwnerMode.current) setOwnerEpsOverride({ key, base: val, ts: Date.now() });
  }, []);

  // FutureProjectionPanel edits → visual sync only (FPP owns its own save)
  const handleFutureProjectionGrowthChange = useCallback((key: IndexKey, val: number) => {
    setSharedGrowthPct(prev => ({ ...prev, [key]: val }));
  }, []);

  return (
    <Tabs
      value={activeMainTab}
      onValueChange={(v) => selectMainTab(v as MainTab)}
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
          onValueChange={(v) => selectIndexTab(v as IndexSubTab)}
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
              <TabsTrigger
                value="RETURNS"
                className="rounded-md px-4 py-1.5 text-xs font-medium data-active:bg-white dark:data-active:bg-zinc-900 data-active:text-zinc-900 dark:data-active:text-zinc-100 data-active:shadow-sm text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors whitespace-nowrap"
              >
                Period Returns
              </TabsTrigger>
              <TabsTrigger
                value="BOND_YIELD"
                className="rounded-md px-4 py-1.5 text-xs font-medium data-active:bg-white dark:data-active:bg-zinc-900 data-active:text-zinc-900 dark:data-active:text-zinc-100 data-active:shadow-sm text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors whitespace-nowrap"
              >
                <span className="hidden sm:inline">Bond Yield</span>
                <span className="sm:hidden">BY</span>
              </TabsTrigger>
              <TabsTrigger
                value="USD_INR"
                className="rounded-md px-4 py-1.5 text-xs font-medium data-active:bg-white dark:data-active:bg-zinc-900 data-active:text-zinc-900 dark:data-active:text-zinc-100 data-active:shadow-sm text-zinc-700 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors whitespace-nowrap"
              >
                <span className="hidden sm:inline">USD/INR</span>
                <span className="sm:hidden">₹</span>
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
              byeyData={byeyData}
              liveBondYield={liveBondYield}
              liveData={liveData}
              liveMarketOpen={liveMarketOpen}
              onSelectIndex={selectIndexTab}
              timeWindow={overviewTimeWindow}
              onTimeWindowChange={setOverviewTimeWindow}
              projectionDefaults={projectionDefaults}
              epsGrowthPct={sharedGrowthPct}
              onEpsGrowthChange={handleOverviewEpsChange}
            />
          </TabsContent>

          {/* Period Returns sub-tab */}
          <TabsContent value="RETURNS" keepMounted>
            {visited.has("RETURNS") && <PeriodReturnsPanel historicalData={historicalData} />}
          </TabsContent>

          {/* Bond Yield sub-tab */}
          <TabsContent value="BOND_YIELD" keepMounted>
            {visited.has("BOND_YIELD") && <BondYieldPanel
              byeyData={byeyData}
              timeWindow={timeWindow}
              onTimeWindowChange={setTimeWindow}
              liveBondYield={liveBondYield}
              liveMarketOpen={liveMarketOpen}
            />}
          </TabsContent>

          {/* USD/INR sub-tab */}
          <TabsContent value="USD_INR" keepMounted>
            {visited.has("USD_INR") && <USDINRPanel
              usdinrData={usdinrData}
              timeWindow={timeWindow}
              onTimeWindowChange={setTimeWindow}
              liveUSDINR={liveUSDINR}
              liveMarketOpen={liveMarketOpen}
            />}
          </TabsContent>

          {/* Individual index sub-tabs */}
          {INDEX_META.map((meta) => (
            <TabsContent key={meta.key} value={meta.key} keepMounted>
              {visited.has(meta.key) && (
                <IndexPanel
                  indexKey={meta.key}
                  historicalData={historicalData}
                  timeWindow={timeWindow}
                  onTimeWindowChange={setTimeWindow}
                  liveClose={liveData?.[meta.key] ?? null}
                  liveMarketOpen={liveMarketOpen}
                  // Same growth % as Overview / BY-EY so forward P/E matches across tabs
                  indexGrowthPct={sharedGrowthPct[meta.key] ?? projectionDefaults?.[meta.key]?.base?.growthPct ?? 0}
                />
              )}
            </TabsContent>
          ))}
        </Tabs>
      </TabsContent>

      {/* ── Tab 2: Future Projection ── */}
      <TabsContent value="FUTURE_PROJECTION" keepMounted>
        {visited.has("FUTURE_PROJECTION") && <FutureProjectionPanel
          historicalData={historicalData}
          liveData={liveData}
          timeWindow={overviewTimeWindow}
          onTimeWindowChange={setOverviewTimeWindow}
          externalGrowthPct={sharedGrowthPct}
          onGrowthPctChange={handleFutureProjectionGrowthChange}
          ownerEpsOverride={ownerEpsOverride}
        />}
      </TabsContent>

      {/* ── Tab 3: Macro Score ── */}
      <TabsContent value="MACRO_SCORE" keepMounted>
        {visited.has("MACRO_SCORE") && <MacroScorePanel
          historicalData={historicalData}
          byeyData={byeyData}
        />}
      </TabsContent>

      {/* ── Tab 4: BY-EY Spread ── */}
      <TabsContent value="BYEY" keepMounted>
        {visited.has("BYEY") && <BYEYPanel
          byeyData={byeyData}
          historicalData={historicalData}
          timeWindow={timeWindow}
          onTimeWindowChange={setTimeWindow}
          liveIndexData={liveData}
          liveBondYield={liveBondYield}
          growthPctByIndex={sharedGrowthPct}
        />}
      </TabsContent>

      {/* ── Tab 5: Daily Data ── */}
      <TabsContent value="DAILY_DATA" keepMounted>
        {visited.has("DAILY_DATA") && <DailyDataPanel
          historicalData={historicalData}
          liveData={liveData}
        />}
      </TabsContent>
    </Tabs>
  );
}
