"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  INDEX_META,
  formatPrice,
  formatRatio,
  formatEPS,
  cn,
} from "@/lib/utils";
import type { HistoricalRow, IndexKey } from "@/lib/types";

type ProjectionPath = "pe_eps" | "pb_bv";

interface ScenarioRow {
  multiple: number;
  growthPct: number;
}

interface IndexProjection {
  path: ProjectionPath;
  bear: ScenarioRow;
  base: ScenarioRow;
  bull: ScenarioRow;
}

type ProjectionsMap = Record<IndexKey, IndexProjection>;

const SCENARIOS = ["bear", "base", "bull"] as const;
type Scenario = typeof SCENARIOS[number];

const SCENARIO_LABELS: Record<Scenario, string> = {
  bear: "Bear",
  base: "Base",
  bull: "Bull",
};

const SCENARIO_COLORS: Record<Scenario, string> = {
  bear: "text-red-700 bg-red-50",
  base: "text-zinc-800 bg-zinc-50",
  bull: "text-emerald-700 bg-emerald-50",
};

function buildDefaults(historicalData: HistoricalRow[]): ProjectionsMap {
  const lastRow = historicalData[historicalData.length - 1];
  const defaults = {} as ProjectionsMap;

  for (const meta of INDEX_META) {
    const m = lastRow?.[meta.key];
    const pe = m?.pe ?? 20;
    const pb = m?.pb ?? 3;

    defaults[meta.key] = {
      path: "pe_eps",
      bear: { multiple: parseFloat((pe * 0.85).toFixed(2)), growthPct: -5 },
      base: { multiple: parseFloat(pe.toFixed(2)),           growthPct:  0 },
      bull: { multiple: parseFloat((pe * 1.15).toFixed(2)), growthPct: 10 },
    };
    // Store PB defaults inside path-specific keys by convention:
    // We store them in a hidden "_pb" prefixed manner via JSON — but instead
    // we store per-path defaults by building them when the user switches path.
    void pb; // pb defaults generated dynamically on path switch
  }

  return defaults;
}

const STORAGE_KEY = "nifty-projections-v1";

function loadFromStorage(historicalData: HistoricalRow[]): ProjectionsMap {
  if (typeof window === "undefined") return buildDefaults(historicalData);
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as ProjectionsMap;
  } catch {
    // ignore
  }
  return buildDefaults(historicalData);
}

interface FutureProjectionPanelProps {
  historicalData: HistoricalRow[];
  liveData: Partial<Record<IndexKey, number>> | null;
}

export function FutureProjectionPanel({ historicalData, liveData }: FutureProjectionPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState<IndexKey>("NIFTY_50");
  const [projections, setProjections] = useState<ProjectionsMap>(() =>
    loadFromStorage(historicalData)
  );

  // Persist to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projections));
    } catch {
      // ignore quota errors
    }
  }, [projections]);

  const lastRow = historicalData[historicalData.length - 1] ?? null;

  // Current values for selected index
  const current = useMemo(() => {
    if (!lastRow) return null;
    const m = lastRow[selectedIndex];
    const liveClose = liveData?.[selectedIndex] ?? null;
    const close = liveClose ?? m.close;
    const pe = liveClose && m.impliedEPS ? liveClose / m.impliedEPS : m.pe;
    const pb = liveClose && m.impliedBV  ? liveClose / m.impliedBV  : m.pb;
    return { close, pe, pb, impliedEPS: m.impliedEPS, impliedBV: m.impliedBV };
  }, [lastRow, selectedIndex, liveData]);

  const proj = projections[selectedIndex];
  const isLive = (liveData?.[selectedIndex] ?? null) != null;

  // Switch path for current index — regenerate defaults for the new path
  const switchPath = useCallback((newPath: ProjectionPath) => {
    if (!lastRow) return;
    const m = lastRow[selectedIndex];
    const multiple = newPath === "pe_eps" ? (m.pe ?? 20) : (m.pb ?? 3);
    setProjections((prev) => ({
      ...prev,
      [selectedIndex]: {
        ...prev[selectedIndex],
        path: newPath,
        bear: { multiple: parseFloat((multiple * 0.85).toFixed(2)), growthPct: -5 },
        base: { multiple: parseFloat(multiple.toFixed(2)),           growthPct:  0 },
        bull: { multiple: parseFloat((multiple * 1.15).toFixed(2)), growthPct: 10 },
      },
    }));
  }, [lastRow, selectedIndex]);

  const updateScenario = useCallback(
    (scenario: Scenario, field: keyof ScenarioRow, raw: string) => {
      const value = parseFloat(raw);
      if (isNaN(value)) return;
      setProjections((prev) => ({
        ...prev,
        [selectedIndex]: {
          ...prev[selectedIndex],
          [scenario]: { ...prev[selectedIndex][scenario], [field]: value },
        },
      }));
    },
    [selectedIndex]
  );

  const resetDefaults = useCallback(() => {
    if (!lastRow) return;
    const m = lastRow[selectedIndex];
    const path = proj.path;
    const multiple = path === "pe_eps" ? (m.pe ?? 20) : (m.pb ?? 3);
    setProjections((prev) => ({
      ...prev,
      [selectedIndex]: {
        path,
        bear: { multiple: parseFloat((multiple * 0.85).toFixed(2)), growthPct: -5 },
        base: { multiple: parseFloat(multiple.toFixed(2)),           growthPct:  0 },
        bull: { multiple: parseFloat((multiple * 1.15).toFixed(2)), growthPct: 10 },
      },
    }));
  }, [lastRow, selectedIndex, proj]);

  // Compute projections for each scenario
  const computed = useMemo(() => {
    if (!current) return null;
    const isPE = proj.path === "pe_eps";
    const currentBase = isPE ? current.impliedEPS : current.impliedBV;
    const currentPrice = current.close;

    return SCENARIOS.map((s) => {
      const row = proj[s];
      const forward = currentBase != null ? currentBase * (1 + row.growthPct / 100) : null;
      const projected = forward != null ? forward * row.multiple : null;
      const upside = projected != null && currentPrice != null
        ? ((projected - currentPrice) / currentPrice) * 100
        : null;
      return { scenario: s, forward, projected, upside };
    });
  }, [current, proj]);

  const isPE = proj.path === "pe_eps";
  const multipleLabel = isPE ? "Target P/E" : "Target P/B";
  const growthLabel   = isPE ? "EPS Growth %" : "BV Growth %";
  const forwardLabel  = isPE ? "Forward EPS" : "Forward BV";
  const projLabel     = "Projected Price";
  const currentBase   = current ? (isPE ? current.impliedEPS : current.impliedBV) : null;
  const currentMult   = current ? (isPE ? current.pe : current.pb) : null;

  return (
    <div className="space-y-4 pt-2">
      {/* ── Index selector (pill buttons) ── */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1 min-w-max">
          {INDEX_META.map((meta) => (
            <button
              key={meta.key}
              onClick={() => setSelectedIndex(meta.key)}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap border",
                selectedIndex === meta.key
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "bg-white text-zinc-700 border-zinc-200 hover:text-zinc-900 hover:border-zinc-300"
              )}
            >
              {meta.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main card ── */}
      <Card className="bg-white border border-zinc-200 shadow-sm">
        <CardHeader className="px-5 pt-4 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold text-zinc-900">
                {INDEX_META.find((m) => m.key === selectedIndex)?.label} — Forward Projections
              </CardTitle>
              {current && (
                <p className="mt-1 text-xs text-zinc-500 flex flex-wrap gap-x-4">
                  <span>
                    Current Price:{" "}
                    <span className={cn("font-semibold text-zinc-900", isLive && "text-emerald-700")}>
                      {formatPrice(current.close)}
                      {isLive && <span className="ml-1 text-[10px]">● LIVE</span>}
                    </span>
                  </span>
                  <span>
                    {isPE ? "Implied EPS" : "Implied BV"}:{" "}
                    <span className="font-semibold text-zinc-900">
                      {isPE ? formatEPS(currentBase) : formatPrice(currentBase)}
                    </span>
                  </span>
                  <span>
                    {isPE ? "Current P/E" : "Current P/B"}:{" "}
                    <span className="font-semibold text-zinc-900">
                      {formatRatio(currentMult)}
                    </span>
                  </span>
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Path toggle */}
              <div className="flex items-center gap-1 bg-zinc-100 rounded-lg p-1">
                <button
                  onClick={() => switchPath("pe_eps")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                    proj.path === "pe_eps" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
                  )}
                >
                  PE × EPS
                </button>
                <button
                  onClick={() => switchPath("pb_bv")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                    proj.path === "pb_bv" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-600 hover:text-zinc-900"
                  )}
                >
                  PB × BV
                </button>
              </div>

              {/* Reset */}
              <button
                onClick={resetDefaults}
                className="px-3 py-1.5 text-xs font-medium border border-zinc-200 rounded-lg text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100">
                  {["Scenario", multipleLabel, growthLabel, forwardLabel, projLabel, "vs Current"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-2.5 text-left text-xs font-medium text-zinc-700 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SCENARIOS.map((s, i) => {
                  const row = proj[s];
                  const calc = computed?.[i];
                  const upside = calc?.upside ?? null;

                  return (
                    <tr key={s} className="border-b border-zinc-50 hover:bg-zinc-50/60 transition-colors">
                      {/* Scenario label */}
                      <td className="px-5 py-3">
                        <span className={cn("inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold", SCENARIO_COLORS[s])}>
                          {SCENARIO_LABELS[s]}
                        </span>
                      </td>

                      {/* Multiple input */}
                      <td className="px-5 py-3">
                        <input
                          type="number"
                          step="0.5"
                          value={row.multiple}
                          onChange={(e) => updateScenario(s, "multiple", e.target.value)}
                          className="w-20 border border-zinc-200 rounded-md px-2 py-1 text-sm tabular-nums text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                        />
                      </td>

                      {/* Growth % input */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="1"
                            value={row.growthPct}
                            onChange={(e) => updateScenario(s, "growthPct", e.target.value)}
                            className="w-20 border border-zinc-200 rounded-md px-2 py-1 text-sm tabular-nums text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
                          />
                          <span className="text-xs text-zinc-500">%</span>
                        </div>
                      </td>

                      {/* Forward base (calculated) */}
                      <td className="px-5 py-3 tabular-nums text-zinc-800 font-medium">
                        {calc?.forward != null
                          ? (isPE ? formatEPS(calc.forward) : formatPrice(calc.forward))
                          : "—"}
                      </td>

                      {/* Projected price (calculated) */}
                      <td className="px-5 py-3 tabular-nums font-semibold text-zinc-900">
                        {calc?.projected != null ? formatPrice(calc.projected) : "—"}
                      </td>

                      {/* Upside % (calculated, color-coded) */}
                      <td className={cn(
                        "px-5 py-3 tabular-nums font-semibold",
                        upside == null ? "text-zinc-400"
                          : upside > 0 ? "text-emerald-700"
                          : upside < 0 ? "text-red-700"
                          : "text-zinc-600"
                      )}>
                        {upside != null
                          ? (upside >= 0 ? "+" : "") + upside.toFixed(1) + "%"
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-3 px-5 text-[11px] text-zinc-400">
            Forward {isPE ? "EPS" : "BV"} = Current {isPE ? "EPS" : "BV"} × (1 + Growth %) · Projected Price = Forward {isPE ? "EPS" : "BV"} × Target {isPE ? "P/E" : "P/B"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
