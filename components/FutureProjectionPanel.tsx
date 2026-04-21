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
import { TimeWindowSelector } from "@/components/TimeWindowSelector";
import { filterByWindow, extractValues, mean, stdDev, buildForwardRatioSeries } from "@/lib/calculations";
import { useRatioMode } from "@/lib/ratioMode";
import type { HistoricalRow, IndexKey, TimeWindow } from "@/lib/types";

type ProjectionPath = "pe_eps" | "pb_bv";

interface ScenarioRow {
  multiple: number;
  growthPct: number;
}

interface IndexProjection {
  path: ProjectionPath;
  baseEPS?: number | null;
  baseBV?:  number | null;
  savedPE?: { bear: number; base: number; bull: number };
  savedPB?: { bear: number; base: number; bull: number };
  bear: ScenarioRow;
  base: ScenarioRow;
  bull: ScenarioRow;
}

type ProjectionsMap = Record<IndexKey, IndexProjection>;

type VisitorDiff = Partial<Record<IndexKey, {
  path?: ProjectionPath;
  bear?: Partial<ScenarioRow>;
  base?: Partial<ScenarioRow>;
  bull?: Partial<ScenarioRow>;
  baseEPS?: number;
  baseBV?: number;
}>>;

function mergeWithDiff(base: ProjectionsMap, diff: VisitorDiff): ProjectionsMap {
  const merged = { ...base };
  for (const ik of Object.keys(base) as IndexKey[]) {
    const d = diff[ik];
    if (!d) continue;
    merged[ik] = {
      ...base[ik],
      ...(d.path   != null ? { path:   d.path   } : {}),
      ...(d.baseEPS != null ? { baseEPS: d.baseEPS } : {}),
      ...(d.baseBV  != null ? { baseBV:  d.baseBV  } : {}),
      bear: { ...base[ik].bear, ...d.bear },
      base: { ...base[ik].base, ...d.base },
      bull: { ...base[ik].bull, ...d.bull },
    };
  }
  return merged;
}

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

const VISITOR_STORAGE_KEY = "nifty-projections-visitor-v2";

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
  timeWindow: TimeWindow;
  onTimeWindowChange: (w: TimeWindow) => void;
}

export function FutureProjectionPanel({ historicalData, liveData, timeWindow, onTimeWindowChange }: FutureProjectionPanelProps) {
  const [selectedIndex, setSelectedIndex] = useState<IndexKey>("NIFTY_50");
  const [projections, setProjections] = useState<ProjectionsMap>(() =>
    buildDefaults(historicalData)
  );
  const [ownerDefaults, setOwnerDefaults] = useState<ProjectionsMap | null>(null);
  const [manualCells, setManualCells] = useState<Set<string>>(new Set());
  const [ownerMode, setOwnerMode] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const { ratioMode } = useRatioMode();
  const userHasEdited = useRef(false);
  const cronSecret = useRef<string | null>(null);
  const visitorDiff = useRef<VisitorDiff>({});
  const isMounted = useRef(false);

  // Detect owner mode immediately (synchronous, separate from async init)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("key");
    if (key) { cronSecret.current = key; setOwnerMode(true); }
    // Migrate: clear old v1 snapshot so it doesn't interfere
    try { localStorage.removeItem("nifty-projections-visitor-v1"); } catch {}
  }, []);

  // On mount: fetch owner defaults from API, then load visitor overrides
  useEffect(() => {
    async function init() {
      const key = cronSecret.current;

      let kv: ProjectionsMap | null = null;
      try {
        const res = await fetch("/api/projection-defaults", { cache: "no-store" });
        if (res.ok) {
          const json = await res.json();
          if (json) { kv = json as ProjectionsMap; setOwnerDefaults(kv); }
        }
      } catch {}

      // Owner mode: always use Blob defaults (skip localStorage)
      if (key) { setProjections(kv ?? buildDefaults(historicalData)); return; }

      // Visitor mode: Blob is base; apply visitor's sparse override diff on top
      const base = kv ?? buildDefaults(historicalData);
      try {
        const stored = localStorage.getItem(VISITOR_STORAGE_KEY);
        if (stored) {
          const diff = JSON.parse(stored) as VisitorDiff;
          visitorDiff.current = diff;
          setProjections(mergeWithDiff(base, diff));
        } else {
          setProjections(base);
        }
      } catch {
        setProjections(base);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist only visitor's explicit override diff (not full state)
  useEffect(() => {
    if (ownerMode) return;
    if (!userHasEdited.current) return;
    try {
      localStorage.setItem(VISITOR_STORAGE_KEY, JSON.stringify(visitorDiff.current));
    } catch {}
  }, [projections, ownerMode]);

  // Auto-save to Blob in owner mode (debounced 600ms)
  useEffect(() => {
    if (!ownerMode || !cronSecret.current) return;
    if (!userHasEdited.current) return;
    setSaveStatus("saving");
    const id = setTimeout(async () => {
      try {
        const res = await fetch("/api/projection-defaults", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${cronSecret.current}`,
          },
          body: JSON.stringify(projections),
        });
        setSaveStatus(res.ok ? "saved" : "error");
      } catch {
        setSaveStatus("error");
      }
    }, 600);
    return () => clearTimeout(id);
  }, [projections, ownerMode]);

  // Auto-fill Target PE/PB from mean ± 1SD of the selected time window and ratio mode
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return; }
    const windowRows = filterByWindow(historicalData, timeWindow);
    setProjections((prev) => {
      const next = { ...prev };
      for (const meta of INDEX_META) {
        const key = meta.key;
        const isPEPath = next[key].path === "pe_eps";
        let vals: number[];

        if (ratioMode === "FWD") {
          const growthPct = next[key].base.growthPct;
          const fwdSeries = buildForwardRatioSeries(historicalData, key, growthPct);
          const windowDateSet = new Set(windowRows.map((r) => r.date));
          vals = fwdSeries
            .filter((r) => windowDateSet.has(r.date))
            .map((r) => (isPEPath ? r.fwdPE : r.fwdPB))
            .filter((v): v is number => v != null);
        } else {
          vals = extractValues(windowRows, key, isPEPath ? "pe" : "pb");
        }

        if (vals.length < 2) continue;
        const m = mean(vals);
        const sd = stdDev(vals);
        next[key] = {
          ...next[key],
          bear: { ...next[key].bear, multiple: parseFloat((m - sd).toFixed(2)) },
          base: { ...next[key].base, multiple: parseFloat(m.toFixed(2)) },
          bull: { ...next[key].bull, multiple: parseFloat((m + sd).toFixed(2)) },
        };
      }
      return next;
    });
    setManualCells(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeWindow, ratioMode]);

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

    // Compute period-based multiples for the new path
    const windowRows = filterByWindow(historicalData, timeWindow);
    const field = newPath === "pe_eps" ? "pe" : "pb";
    const vals = extractValues(windowRows, selectedIndex, field);
    const hasPeriod = vals.length >= 2;

    setProjections((prev) => {
      const cur = prev[selectedIndex];
      if (cur.path === newPath) return prev;

      userHasEdited.current = true;
      const leavingKey  = cur.path === "pe_eps" ? "savedPE" : "savedPB";

      const currentMultiples = { bear: cur.bear.multiple, base: cur.base.multiple, bull: cur.bull.multiple };

      let newMultiples: { bear: number; base: number; bull: number };
      if (hasPeriod) {
        const mv = mean(vals);
        const sd = stdDev(vals);
        newMultiples = {
          bear: parseFloat((mv - sd).toFixed(2)),
          base: parseFloat(mv.toFixed(2)),
          bull: parseFloat((mv + sd).toFixed(2)),
        };
      } else {
        const mkt = newPath === "pe_eps" ? (m.pe ?? 20) : (m.pb ?? 3);
        newMultiples = {
          bear: parseFloat((mkt * 0.85).toFixed(2)),
          base: parseFloat(mkt.toFixed(2)),
          bull: parseFloat((mkt * 1.15).toFixed(2)),
        };
      }

      // Record path switch and new multiples in visitor diff
      const curDiff = visitorDiff.current[selectedIndex] ?? {};
      visitorDiff.current = {
        ...visitorDiff.current,
        [selectedIndex]: {
          ...curDiff,
          path: newPath,
          bear: { ...(curDiff.bear ?? {}), multiple: newMultiples.bear },
          base: { ...(curDiff.base ?? {}), multiple: newMultiples.base },
          bull: { ...(curDiff.bull ?? {}), multiple: newMultiples.bull },
        },
      };

      return {
        ...prev,
        [selectedIndex]: {
          ...cur,
          path: newPath,
          [leavingKey]: currentMultiples,
          bear: { ...cur.bear, multiple: newMultiples.bear },
          base: { ...cur.base, multiple: newMultiples.base },
          bull: { ...cur.bull, multiple: newMultiples.bull },
        },
      };
    });
    setManualCells((prev) => {
      const next = new Set(prev);
      SCENARIOS.forEach((s) => next.delete(`${selectedIndex}_${s}`));
      return next;
    });
  }, [lastRow, selectedIndex, historicalData, timeWindow]);

  const updateScenario = useCallback(
    (scenario: Scenario, field: keyof ScenarioRow, raw: string) => {
      const value = parseFloat(raw);
      if (isNaN(value)) return;
      userHasEdited.current = true;
      const cur = visitorDiff.current[selectedIndex] ?? {};
      visitorDiff.current = {
        ...visitorDiff.current,
        [selectedIndex]: { ...cur, [scenario]: { ...(cur[scenario] ?? {}), [field]: value } },
      };
      setProjections((prev) => ({
        ...prev,
        [selectedIndex]: {
          ...prev[selectedIndex],
          [scenario]: { ...prev[selectedIndex][scenario], [field]: value },
        },
      }));
      if (field === "multiple") {
        setManualCells((prev) => new Set(prev).add(`${selectedIndex}_${scenario}`));
      }
    },
    [selectedIndex]
  );

  const updateBase = useCallback((raw: string) => {
    const value = parseFloat(raw);
    if (isNaN(value)) return;
    userHasEdited.current = true;
    setProjections((prev) => {
      const field = prev[selectedIndex].path === "pe_eps" ? "baseEPS" : "baseBV";
      const cur = visitorDiff.current[selectedIndex] ?? {};
      visitorDiff.current = { ...visitorDiff.current, [selectedIndex]: { ...cur, [field]: value } };
      return {
        ...prev,
        [selectedIndex]: { ...prev[selectedIndex], [field]: value },
      };
    });
  }, [selectedIndex]);

  const handleReset = useCallback(() => {
    try { localStorage.removeItem(VISITOR_STORAGE_KEY); } catch {}
    visitorDiff.current = {};
    userHasEdited.current = false;
    setManualCells(new Set());
    setProjections(ownerDefaults ?? buildDefaults(historicalData));
  }, [ownerDefaults, historicalData]);

  const computed = useMemo(() => {
    if (!current) return null;
    const isPE = proj.path === "pe_eps";
    const currentBase = isPE
      ? (proj.baseEPS ?? current.impliedEPS)
      : (proj.baseBV  ?? current.impliedBV);
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
  const multipleLabel  = isPE ? "Target P/E" : "Target P/B";
  const growthLabel    = isPE ? "EPS Growth %" : "BV Growth %";
  const forwardLabel   = isPE ? "Forward EPS" : "Forward BV";
  const rawBase        = current ? (isPE ? current.impliedEPS : current.impliedBV) : null;
  const effectiveBase  = current ? (isPE ? (proj.baseEPS ?? current.impliedEPS) : (proj.baseBV ?? current.impliedBV)) : null;
  const currentMult = !current ? null
    : ratioMode === "FWD" && isPE && current.impliedEPS
      ? current.close / (current.impliedEPS * (1 + proj.base.growthPct / 100))
    : ratioMode === "FWD" && !isPE && current.impliedBV
      ? current.close / (current.impliedBV  * (1 + proj.base.growthPct / 100))
    : isPE ? current.pe : current.pb;

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
              <CardTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                {INDEX_META.find((m) => m.key === selectedIndex)?.label} — Forward Projections
                {ownerMode && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">● Owner</span>
                )}
                {ownerMode && saveStatus === "saving" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">Saving…</span>
                )}
                {ownerMode && saveStatus === "saved" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">Saved ✓</span>
                )}
                {ownerMode && saveStatus === "error" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">Save failed ✗</span>
                )}
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
                      {isPE ? formatEPS(rawBase) : formatPrice(rawBase)}
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

            <div className="flex items-center gap-2 flex-wrap">
              {/* Time window selector */}
              <TimeWindowSelector value={timeWindow} onChange={onTimeWindowChange} />

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
                          className={cn(
                            "w-20 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 text-sm tabular-nums bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500",
                            manualCells.has(`${selectedIndex}_${s}`)
                              ? "text-zinc-900 dark:text-zinc-100 font-semibold"
                              : "text-zinc-400 dark:text-zinc-500"
                          )}
                        />
                      </td>

                      <td className="px-5 py-3">
                        <input
                          type="number"
                          step="0.01"
                          value={effectiveBase ?? ""}
                          onChange={(e) => updateBase(e.target.value)}
                          className="w-24 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 text-sm tabular-nums text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                        />
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
    </div>
  );
}
