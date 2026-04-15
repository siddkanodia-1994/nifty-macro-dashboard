"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { IndexPanel } from "@/components/IndexPanel";
import { INDEX_META } from "@/lib/utils";
import type { HistoricalRow, IndexKey, TimeWindow } from "@/lib/types";

interface IndexTabsProps {
  historicalData: HistoricalRow[];
}

export function IndexTabs({ historicalData }: IndexTabsProps) {
  const [activeTab, setActiveTab]   = useState<IndexKey>("NIFTY_50");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("1Y");

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
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
