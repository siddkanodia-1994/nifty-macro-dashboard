"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  INDEX_META,
  formatPrice,
  formatRatio,
  formatEPS,
  cn,
} from "@/lib/utils";
import { Settings } from "lucide-react";
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
  bear: "text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-400",
  base: "text-zinc-800 bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-200",
  bull: "text-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400",
};

const VISITOR_STORAGE_KEY = "nifty-projections-visitor-v1";

function buildDefaults(historicalData: HistoricalRow[]): ProjectionsMap {
  const lastRow = historicalData[historicalData.length - 1];
  const defaults = {} as ProjectionsMap;

  for (const meta of INDEX_META) {
    const m = lastRow?.[meta.key];
    const pe = m?.pe ?? 20;

    defaults[meta.key] = {
      path: "pe_eps",
      bear: { multiple: parseFloat((pe * 0.85).toFixed(2)), growthPct: -5 },
      base: { multiple: parseFloat(pe.toFixed(2)),           growthPct:  0 },
      bull: { multiple: parseFloat((pe * 1.15).toFixed(2)), growthPct: 10 },
    };
  }

  return defaults;
}

interface FutureProjectionPanelProps {
  historicalData: HistoricalRow[];
  liveData: Partial<Record<IndexKey, number>> | null;
}

export function FutureProjectionPanel({ historicalData, liveData }: FutureProjectionPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState<IndexKey>("NIFTY_50");
  const [projections, setProjections] = useState<ProjectionsMap>(() =>
    buildDefaults(historicalData)
  );
  const [ownerDefaults, setOwnerDefaults] = useState<ProjectionsMap | null>(null);
  const [showPinDialog, setShowPinDialog] = useState(false);
  const autoSaveReady = useRef(false);
  const ownerPinRef   = useRef<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");

  // On mount: fetch owner defaults from blob, then load visitor overrides if any
  useEffect(() => {
    async function init() {
      let kv: ProjectionsMap | null = null;
      try {
        const res = await fetch("/api/projection-defaults");
        if (res.ok) {
          const json = await res.json();
          if (json) { kv = json as ProjectionsMap; setOwnerDefaults(kv); }
        }
      } catch {
        // no blob in local dev — fall through
      }

      // Restore cached owner PIN if previously saved via gear icon
      try {
        const cachedPin = localStorage.getItem("nifty-owner-pin");
        if (cachedPin) ownerPinRef.current = cachedPin;
      } catch {}

      // Visitor localStorage > blob > hardcoded
      let loaded = false;
      try {
        const stored = localStorage.getItem(VISITOR_STORAGE_KEY);
        if (stored) {
          setProjections(JSON.parse(stored) as ProjectionsMap);
          loaded = true;
        }
      } catch {}

      if (!loaded) {
        setProjections(kv ?? buildDefaults(historicalData));
      }

      // Mark ready — prevents auto-save firing on the initial projections set
      autoSaveReady.current = true;
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist visitor edits to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(VISITOR_STORAGE_KEY, JSON.stringify(projections));
    } catch {
      // ignore quota errors
    }
  }, [projections]);

  // Auto-save to blob when owner PIN is cached (silent — no dialog needed after first save)
  useEffect(() => {
    if (!autoSaveReady.current) return;
    const cachedPin = ownerPinRef.current;
    if (!cachedPin) return;
    fetch("/api/projection-defaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: cachedPin, defaults: projections }),
    }).catch(() => {});
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

  const handleReset = useCallback(() => {
    localStorage.removeItem(VISITOR_STORAGE_KEY);
    if (ownerDefaults) {
      setProjections(ownerDefaults);
    } else {
      setProjections(buildDefaults(historicalData));
    }
  }, [ownerDefaults, historicalData]);

  const handleSaveGlobal = useCallback(async () => {
    setPinError(false);
    try {
      const res = await fetch("/api/projection-defaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, defaults: projections }),
      });
      if (res.ok) {
        setOwnerDefaults(projections);
        try {
          localStorage.setItem("nifty-owner-pin", pin);
          ownerPinRef.current = pin;
        } catch {}
        setSaveStatus("saved");
        setShowPinDialog(false);
        setPin("");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setPinError(true);
      }
    } catch {
      setSaveStatus("error");
    }
  }, [pin, projections]);

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
  const currentBase   = current ? (isPE ? current.impliedEPS : current.impliedBV) : null;
  const currentMult   = current ? (isPE ? current.pe : current.pb) : null;

  return (
    <div className="space-y-4 pt-2">
      {/* ── Index selector ── */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1 min-w-max">
          {INDEX_META.map((meta) => (
            <button
              key={meta.key}
              onClick={() => setSelectedIndex(meta.key)}
              className={cn(
                "px-4 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap border",
                selectedIndex === meta.key
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                  : "bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100 hover:border-zinc-300 dark:hover:border-zinc-600"
              )}
            >
              {meta.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main card ── */}
      <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <CardHeader className="px-5 pt-4 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {INDEX_META.find((m) => m.key === selectedIndex)?.label} — Forward Projections
              </CardTitle>
              {current && (
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 flex flex-wrap gap-x-4">
                  <span>
                    Current Price:{" "}
                    <span className={cn("font-semibold text-zinc-900 dark:text-zinc-100", isLive && "text-emerald-700 dark:text-emerald-400")}>
                      {formatPrice(current.close)}
                      {isLive && <span className="ml-1 text-[10px]">● LIVE</span>}
                    </span>
                  </span>
                  <span>
                    {isPE ? "Implied EPS" : "Implied BV"}:{" "}
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {isPE ? formatEPS(currentBase) : formatPrice(currentBase)}
                    </span>
                  </span>
                  <span>
                    {isPE ? "Current P/E" : "Current P/B"}:{" "}
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {formatRatio(currentMult)}
                    </span>
                  </span>
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Path toggle */}
              <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
                <button
                  onClick={() => switchPath("pe_eps")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                    proj.path === "pe_eps"
                      ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                  )}
                >
                  PE × EPS
                </button>
                <button
                  onClick={() => switchPath("pb_bv")}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                    proj.path === "pb_bv"
                      ? "bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
                  )}
                >
                  PB × BV
                </button>
              </div>

              {/* Reset */}
              <button
                onClick={handleReset}
                className="px-3 py-1.5 text-xs font-medium border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Reset
              </button>

              {/* Save as global default (gear icon) */}
              <button
                onClick={() => { setShowPinDialog(true); setPinError(false); }}
                title="Save as global default"
                className="p-1.5 text-zinc-400 dark:text-zinc-600 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>

              {saveStatus === "saved" && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">✓ Saved</span>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                  {["Scenario", multipleLabel, isPE ? "Implied EPS" : "Implied BV", growthLabel, forwardLabel, "Projected Price", "vs Current"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-2.5 text-left text-xs font-medium text-zinc-700 dark:text-zinc-300 uppercase tracking-wide whitespace-nowrap"
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
                    <tr key={s} className="border-b border-zinc-50 dark:border-zinc-800 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition-colors">
                      <td className="px-5 py-3">
                        <span className={cn("inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold", SCENARIO_COLORS[s])}>
                          {SCENARIO_LABELS[s]}
                        </span>
                      </td>

                      <td className="px-5 py-3">
                        <input
                          type="number"
                          step="0.5"
                          value={row.multiple}
                          onChange={(e) => updateScenario(s, "multiple", e.target.value)}
                          className="w-20 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 text-sm tabular-nums text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                        />
                      </td>

                      <td className="px-5 py-3 tabular-nums text-zinc-800 dark:text-zinc-200 font-medium whitespace-nowrap">
                        {currentBase != null
                          ? (isPE ? formatEPS(currentBase) : formatPrice(currentBase))
                          : "—"}
                      </td>

                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            step="1"
                            value={row.growthPct}
                            onChange={(e) => updateScenario(s, "growthPct", e.target.value)}
                            className="w-20 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 text-sm tabular-nums text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                          />
                          <span className="text-xs text-zinc-500 dark:text-zinc-400">%</span>
                        </div>
                      </td>

                      <td className="px-5 py-3 tabular-nums text-zinc-800 dark:text-zinc-200 font-medium">
                        {calc?.forward != null
                          ? (isPE ? formatEPS(calc.forward) : formatPrice(calc.forward))
                          : "—"}
                      </td>

                      <td className="px-5 py-3 tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                        {calc?.projected != null ? formatPrice(calc.projected) : "—"}
                      </td>

                      <td className={cn(
                        "px-5 py-3 tabular-nums font-semibold",
                        upside == null ? "text-zinc-400 dark:text-zinc-600"
                          : upside > 0 ? "text-emerald-700 dark:text-emerald-400"
                          : upside < 0 ? "text-red-700 dark:text-red-400"
                          : "text-zinc-600 dark:text-zinc-400"
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

          <p className="mt-3 px-5 text-[11px] text-zinc-400 dark:text-zinc-500">
            Forward {isPE ? "EPS" : "BV"} = Current {isPE ? "EPS" : "BV"} × (1 + Growth %) · Projected Price = Forward {isPE ? "EPS" : "BV"} × Target {isPE ? "P/E" : "P/B"}
          </p>
        </CardContent>
      </Card>

      {/* ── PIN dialog ── */}
      {showPinDialog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-zinc-900 rounded-xl p-6 shadow-2xl w-80 border border-zinc-200 dark:border-zinc-700">
            <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Save as Global Default</h3>
            <input
              type="password"
              placeholder="Enter PIN"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveGlobal()}
              className="w-full border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-sm mb-2 bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
            />
            {pinError && <p className="text-xs text-red-600 dark:text-red-400 mb-2">Incorrect PIN</p>}
            <div className="flex gap-2">
              <button
                onClick={handleSaveGlobal}
                className="flex-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg py-2 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-200 transition-colors"
              >
                Save
              </button>
              <button
                onClick={() => { setShowPinDialog(false); setPin(""); setPinError(false); }}
                className="flex-1 border border-zinc-200 dark:border-zinc-700 rounded-lg py-2 text-sm text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
