"use client";

import { MacroSeriesPanel } from "@/components/MacroSeriesPanel";
import {
  filterBYEYByWindow,
  computeBondYieldControlLines,
  computeBondYieldWindowStats,
  buildBondYieldChartData,
} from "@/lib/calculations";
import type { BYEYRow, TimeWindow } from "@/lib/types";

interface BondYieldPanelProps {
  byeyData: BYEYRow[];
  timeWindow: TimeWindow;
  onTimeWindowChange: (w: TimeWindow) => void;
  liveBondYield?: number | null;
  liveMarketOpen?: boolean;
}

function fmtYield(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toFixed(2) + "%";
}

// Stored as a decimal (e.g. 0.0689); displayed ×100 as %-points
const getBondYield = (r: BYEYRow) => r.bondYield;

export function BondYieldPanel({
  byeyData,
  timeWindow,
  onTimeWindowChange,
  liveBondYield = null,
  liveMarketOpen = false,
}: BondYieldPanelProps) {
  return (
    <MacroSeriesPanel
      rows={byeyData}
      timeWindow={timeWindow}
      onTimeWindowChange={onTimeWindowChange}
      liveValue={liveBondYield}
      liveMarketOpen={liveMarketOpen}
      getValue={getBondYield}
      displayScale={100}
      filterByWindow={filterBYEYByWindow}
      computeStats={computeBondYieldWindowStats}
      computeControlLines={computeBondYieldControlLines}
      buildChartData={buildBondYieldChartData}
      valueFormatter={fmtYield}
      label="Bond Yield"
      chartLabel="Bond Yield %"
      invertSign={false}
    />
  );
}
