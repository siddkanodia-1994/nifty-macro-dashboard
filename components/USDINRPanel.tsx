"use client";

import { MacroSeriesPanel } from "@/components/MacroSeriesPanel";
import {
  filterUSDINRByWindow,
  computeUSDINRControlLines,
  computeUSDINRWindowStats,
  buildUSDINRChartData,
} from "@/lib/calculations";
import type { USDINRRow, TimeWindow } from "@/lib/types";

interface USDINRPanelProps {
  usdinrData: USDINRRow[];
  timeWindow: TimeWindow;
  onTimeWindowChange: (w: TimeWindow) => void;
  liveUSDINR?: number | null;
  liveMarketOpen?: boolean;
}

function fmtRate(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toFixed(2);
}

// Rate is stored and displayed directly (e.g. 84.25), no unit conversion
const getRate = (r: USDINRRow) => r.rate;

export function USDINRPanel({
  usdinrData,
  timeWindow,
  onTimeWindowChange,
  liveUSDINR = null,
  liveMarketOpen = false,
}: USDINRPanelProps) {
  return (
    <MacroSeriesPanel
      rows={usdinrData}
      timeWindow={timeWindow}
      onTimeWindowChange={onTimeWindowChange}
      liveValue={liveUSDINR}
      liveMarketOpen={liveMarketOpen}
      getValue={getRate}
      displayScale={1}
      filterByWindow={filterUSDINRByWindow}
      computeStats={computeUSDINRWindowStats}
      computeControlLines={computeUSDINRControlLines}
      buildChartData={buildUSDINRChartData}
      valueFormatter={fmtRate}
      label="USD/INR"
      chartLabel="USD/INR Rate"
      invertSign={true}
    />
  );
}
