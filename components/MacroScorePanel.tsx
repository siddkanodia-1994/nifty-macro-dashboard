"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  parseFY,
  computeEPSGrowth,
  computeFYBondYield,
  computeNiftyPEAvg,
  computeNiftyReturn,
  applyRubric,
  computeFinalScore,
  loadMacroScoreData,
  saveMacroScoreData,
  resetMacroScoreData,
} from "@/lib/macroScore";
import type {
  HistoricalRow,
  BYEYRow,
  MacroScoreData,
  MacroParamId,
  MacroYearData,
  RubricBand,
} from "@/lib/types";
import defaultJson from "@/data/macro-score.json";
import { ChevronDown, ChevronUp, RotateCcw } from "lucide-react";

interface MacroScorePanelProps {
  historicalData: HistoricalRow[];
  byeyData: BYEYRow[];
}

const QUANT_PARAMS: MacroParamId[] = [
  "EPS_GROWTH",
  "ROE",
  "CREDIT_GROWTH",
  "BOND_YIELD",
  "MKTCAP_DEBT",
];
const QUAL_PARAMS: MacroParamId[] = ["GEO_POLITICS", "DOMESTIC_POLICIES"];
const ALL_PARAMS: MacroParamId[] = [...QUANT_PARAMS, ...QUAL_PARAMS];

const PARAM_LABELS: Record<MacroParamId, string> = {
  EPS_GROWTH:        "Nifty EPS Growth %",
  ROE:               "ROE %",
  CREDIT_GROWTH:     "Bank Credit Growth %",
  BOND_YIELD:        "India Bond Yield %",
  MKTCAP_DEBT:       "Market Cap / Debt",
  GEO_POLITICS:      "Geo Politics",
  DOMESTIC_POLICIES: "Domestic Policies",
};

// Params whose raw value is auto-computed from data files (when no override in rawData)
const AUTO_RAW_PARAMS: MacroParamId[] = ["EPS_GROWTH", "BOND_YIELD"];

function scoreColor(score: number | null): string {
  if (score == null) return "";
  if (score < 1)  return "bg-red-50    dark:bg-red-950/40    text-red-700    dark:text-red-400";
  if (score < 2)  return "bg-amber-50  dark:bg-amber-950/40  text-amber-700  dark:text-amber-400";
  if (score < 3)  return "bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-500";
  if (score < 4)  return "bg-green-50  dark:bg-green-950/40  text-green-700  dark:text-green-400";
  return              "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400";
}

function fmt(n: number | null, decimals = 2): string {
  if (n == null) return "—";
  return n.toFixed(decimals);
}
function fmtPct(n: number | null, decimals = 1): string {
  if (n == null) return "—";
  return n.toFixed(decimals) + "%";
}

// ── Inline editable cell ──────────────────────────────────────────────────────
interface EditCellProps {
  value: string;
  isAuto?: boolean;
  isEstimate?: boolean;
  isManualOverride?: boolean;
  displayText: string;
  inputType?: "number" | "text";
  step?: string;
  wrap?: boolean;
  onSave: (val: string) => void;
  onRestore?: () => void;
  className?: string;
}

function EditCell({
  isAuto,
  isEstimate,
  isManualOverride,
  displayText,
  inputType = "number",
  step,
  wrap,
  onSave,
  onRestore,
  className,
}: EditCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayText);
  const inputRef = useRef<HTMLInputElement>(null);

  function commit() {
    setEditing(false);
    onSave(draft);
  }

  function handleContextMenu(e: React.MouseEvent) {
    if (!isAuto || !onRestore) return;
    e.preventDefault();
    onRestore();
  }

  if (editing) {
    return (
      <td className={cn("px-2 py-1", className)}>
        <input
          ref={inputRef}
          autoFocus
          type={inputType}
          step={step ?? (inputType === "number" ? "0.01" : undefined)}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          className="w-full min-w-[60px] rounded border border-blue-400 bg-white dark:bg-zinc-800 px-1 py-0.5 text-xs text-right outline-none"
        />
      </td>
    );
  }

  return (
    <td
      className={cn(
        "px-2 py-1 text-right text-xs font-medium text-zinc-800 dark:text-zinc-200 cursor-pointer select-none",
        wrap ? "whitespace-normal break-words" : "whitespace-nowrap",
        isEstimate && "italic opacity-60",
        className
      )}
      onClick={() => { setDraft(displayText === "—" ? "" : displayText.replace("%", "")); setEditing(true); }}
      onContextMenu={handleContextMenu}
      title={isAuto && isManualOverride ? "Right-click to restore auto value" : isAuto ? "Auto-computed — click to override" : "Click to edit"}
    >
      {displayText}
      {isAuto && !isManualOverride && (
        <span className="ml-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">≈</span>
      )}
      {isAuto && isManualOverride && onRestore && (
        <button
          className="ml-1 text-[10px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          onClick={(e) => { e.stopPropagation(); onRestore(); }}
          title="Restore auto value"
        >×</button>
      )}
    </td>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function MacroScorePanel({ historicalData, byeyData }: MacroScorePanelProps) {
  const [data, setData] = useState<MacroScoreData>(() =>
    loadMacroScoreData(defaultJson as MacroScoreData)
  );
  const [showRubric, setShowRubric] = useState(false);

  // Persist to localStorage on every change
  useEffect(() => { saveMacroScoreData(data); }, [data]);

  const years = data.years;

  // ── Auto-computed raw values ─────────────────────────────────────────────
  const autoEPS = useMemo(
    () => Object.fromEntries(years.map((y) => [y.fy, computeEPSGrowth(historicalData, y.fy)])),
    [years, historicalData]
  );
  const autoBondYield = useMemo(
    () => Object.fromEntries(years.map((y) => [y.fy, computeFYBondYield(byeyData, y.fy)])),
    [years, byeyData]
  );
  const autoPEAvg = useMemo(
    () => Object.fromEntries(years.map((y) => [y.fy, computeNiftyPEAvg(historicalData, y.fy)])),
    [years, historicalData]
  );
  const autoReturn = useMemo(
    () => Object.fromEntries(years.map((y) => [y.fy, computeNiftyReturn(historicalData, y.fy)])),
    [years, historicalData]
  );

  // ── Effective raw data (auto ?? stored) ──────────────────────────────────
  function getEffectiveRaw(y: MacroYearData, param: MacroParamId): number | null {
    if (param === "EPS_GROWTH") {
      return y.rawData.EPS_GROWTH != null ? y.rawData.EPS_GROWTH : (autoEPS[y.fy] ?? null);
    }
    if (param === "BOND_YIELD") {
      return y.rawData.BOND_YIELD != null ? y.rawData.BOND_YIELD : (autoBondYield[y.fy] ?? null);
    }
    return y.rawData[param] ?? null;
  }

  function isAutoRaw(y: MacroYearData, param: MacroParamId): boolean {
    if (param === "EPS_GROWTH") return y.rawData.EPS_GROWTH == null && autoEPS[y.fy] != null;
    if (param === "BOND_YIELD") return y.rawData.BOND_YIELD == null && autoBondYield[y.fy] != null;
    return false;
  }

  // ── Effective score (manualScores ?? rubric) ──────────────────────────────
  function getEffectiveScore(y: MacroYearData, param: MacroParamId): number | null {
    if (y.manualScores[param] != null) return y.manualScores[param]!;
    if (QUAL_PARAMS.includes(param)) return null; // qualitative — always manual
    const raw = getEffectiveRaw(y, param);
    if (raw == null) return null;
    const bands = data.rubric[param];
    if (!bands || bands.length === 0) return null;
    return applyRubric(raw, bands);
  }

  // ── Final score per year ──────────────────────────────────────────────────
  const finalScores = useMemo(() =>
    Object.fromEntries(
      years.map((y) => {
        const scores = Object.fromEntries(
          ALL_PARAMS.map((p) => [p, getEffectiveScore(y, p)])
        ) as Record<MacroParamId, number | null>;
        return [y.fy, computeFinalScore(scores, data.weightages)];
      })
    ),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [years, data.rubric, data.weightages, autoEPS, autoBondYield]);

  const weightSum = Object.values(data.weightages).reduce((s, v) => s + v, 0);

  // ── Mutation helpers ──────────────────────────────────────────────────────
  function updateYear(fy: string, updater: (y: MacroYearData) => MacroYearData) {
    setData((prev) => ({
      ...prev,
      years: prev.years.map((y) => (y.fy === fy ? updater(y) : y)),
    }));
  }

  function setRawData(fy: string, param: MacroParamId, val: string) {
    const n = parseFloat(val);
    updateYear(fy, (y) => ({
      ...y,
      rawData: { ...y.rawData, [param]: isNaN(n) ? undefined : n },
    }));
  }

  function restoreAutoRaw(fy: string, param: MacroParamId) {
    updateYear(fy, (y) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [param]: _removed, ...rest } = y.rawData as Record<MacroParamId, number | undefined>;
      return { ...y, rawData: rest as typeof y.rawData };
    });
  }

  function setQualLabel(fy: string, param: "GEO_POLITICS" | "DOMESTIC_POLICIES", val: string) {
    updateYear(fy, (y) => ({
      ...y,
      qualLabels: { ...y.qualLabels, [param]: val },
    }));
  }

  function setManualScore(fy: string, param: MacroParamId, val: string) {
    const n = parseFloat(val);
    updateYear(fy, (y) => ({
      ...y,
      manualScores: { ...y.manualScores, [param]: isNaN(n) ? undefined : n },
    }));
  }

  function restoreAutoScore(fy: string, param: MacroParamId) {
    if (QUAL_PARAMS.includes(param)) return;
    updateYear(fy, (y) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [param]: _removed, ...rest } = y.manualScores as Record<MacroParamId, number | undefined>;
      return { ...y, manualScores: rest as typeof y.manualScores };
    });
  }

  function setWeightage(param: MacroParamId, val: string) {
    const n = parseFloat(val);
    if (isNaN(n)) return;
    setData((prev) => ({ ...prev, weightages: { ...prev.weightages, [param]: n } }));
  }

  function updateRubricBand(param: MacroParamId, idx: number, field: keyof RubricBand, val: string) {
    const n = parseFloat(val);
    if (isNaN(n)) return;
    setData((prev) => {
      const bands = [...(prev.rubric[param] ?? [])];
      bands[idx] = { ...bands[idx], [field]: n };
      return { ...prev, rubric: { ...prev.rubric, [param]: bands } };
    });
  }

  function changeSlabCount(param: MacroParamId, newCount: number) {
    setData((prev) => {
      const bands = [...(prev.rubric[param] ?? [])];
      if (newCount > bands.length) {
        while (bands.length < newCount) {
          const last = bands[bands.length - 1];
          bands.push({ max: (last?.max ?? 10) + 10, score: last?.score ?? 1.0 });
        }
      } else {
        bands.splice(newCount);
      }
      return { ...prev, rubric: { ...prev.rubric, [param]: bands } };
    });
  }

  function handleReset() {
    if (!confirm("Reset all data to defaults? This cannot be undone.")) return;
    resetMacroScoreData();
    setData(defaultJson as MacroScoreData);
  }

  const tableHeaderCls = "sticky left-0 z-10 bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-left text-xs font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap w-[164px] min-w-[164px] max-w-[164px]";
  const thCls = "px-2 py-1.5 text-right text-xs font-semibold text-zinc-700 dark:text-zinc-300 whitespace-nowrap w-[72px] min-w-[72px] max-w-[72px]";
  const separatorRow = "border-t-2 border-zinc-300 dark:border-zinc-600";

  return (
    <div className="space-y-5 pt-2">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Macro Score</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            FY-wise macro health scoring. Click any cell to edit. Changes persist in your browser.
          </p>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          Reset to defaults
        </button>
      </div>

      {/* ── Card 1: Raw Data ── */}
      <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <CardHeader className="px-5 pt-4 pb-2">
          <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
            Raw Data
          </h3>
        </CardHeader>
        <CardContent className="px-0 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse table-fixed">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className={tableHeaderCls}>Parameter</th>
                  {years.map((y) => (
                    <th key={y.fy} className={cn(thCls, y.isEstimate && "italic opacity-60")}>
                      {y.fy}
                      {y.isEstimate && <span className="block text-[10px] font-normal opacity-70">est.</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Quantitative rows */}
                {QUANT_PARAMS.map((param) => (
                  <tr key={param} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className={tableHeaderCls}>{PARAM_LABELS[param]}</td>
                    {years.map((y) => {
                      const effVal = getEffectiveRaw(y, param);
                      const isAuto = AUTO_RAW_PARAMS.includes(param) && isAutoRaw(y, param);
                      const hasOverride = AUTO_RAW_PARAMS.includes(param) && y.rawData[param] != null;
                      const isPct = param === "EPS_GROWTH" || param === "BOND_YIELD" || param === "CREDIT_GROWTH" || param === "ROE";
                      const display = effVal != null ? (isPct ? fmtPct(effVal) : fmt(effVal)) : "—";
                      return (
                        <EditCell
                          key={y.fy}
                          value={effVal != null ? String(effVal) : ""}
                          displayText={display}
                          isAuto={isAuto}
                          isEstimate={y.isEstimate}
                          isManualOverride={hasOverride}
                          onSave={(v) => setRawData(y.fy, param, v)}
                          onRestore={isAuto || hasOverride ? () => restoreAutoRaw(y.fy, param) : undefined}
                        />
                      );
                    })}
                  </tr>
                ))}

                {/* Qualitative label rows */}
                {QUAL_PARAMS.map((param) => (
                  <tr key={param} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className={tableHeaderCls}>{PARAM_LABELS[param]}</td>
                    {years.map((y) => {
                      const label = y.qualLabels[param as keyof typeof y.qualLabels] ?? "";
                      return (
                        <EditCell
                          key={y.fy}
                          value={label}
                          displayText={label || "—"}
                          inputType="text"
                          wrap
                          isEstimate={y.isEstimate}
                          onSave={(v) => setQualLabel(y.fy, param as "GEO_POLITICS" | "DOMESTIC_POLICIES", v)}
                          className="text-left"
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Card 2: Scoring Sheet ── */}
      <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <CardHeader className="px-5 pt-4 pb-2">
          <h3 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
            Scoring Sheet
          </h3>
        </CardHeader>
        <CardContent className="px-0 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse table-fixed">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className={tableHeaderCls}>Parameter</th>
                  {years.map((y) => (
                    <th key={y.fy} className={cn(thCls, y.isEstimate && "italic opacity-60")}>
                      {y.fy}
                    </th>
                  ))}
                  <th className={cn(thCls, "bg-zinc-50 dark:bg-zinc-800 border-l border-zinc-200 dark:border-zinc-700 w-[88px] min-w-[88px] max-w-[88px]")}>
                    Weight
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Score rows per param */}
                {ALL_PARAMS.map((param) => (
                  <tr key={param} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                    <td className={tableHeaderCls}>{PARAM_LABELS[param]}</td>
                    {years.map((y) => {
                      const manual = y.manualScores[param];
                      const autoScore = (() => {
                        if (QUAL_PARAMS.includes(param)) return null;
                        const raw = getEffectiveRaw(y, param);
                        if (raw == null) return null;
                        const bands = data.rubric[param];
                        if (!bands?.length) return null;
                        return applyRubric(raw, bands);
                      })();
                      const effective = manual ?? autoScore;
                      const isAutoScored = manual == null && autoScore != null;
                      const display = effective != null ? fmt(effective) : "—";
                      return (
                        <EditCell
                          key={y.fy}
                          value={manual != null ? String(manual) : ""}
                          displayText={display}
                          isAuto={isAutoScored}
                          isEstimate={y.isEstimate}
                          isManualOverride={manual != null && !QUAL_PARAMS.includes(param) && autoScore != null}
                          onSave={(v) => setManualScore(y.fy, param, v)}
                          onRestore={
                            !QUAL_PARAMS.includes(param) && manual != null
                              ? () => restoreAutoScore(y.fy, param)
                              : undefined
                          }
                          className={cn(scoreColor(effective))}
                        />
                      );
                    })}
                    {/* Weightage cell */}
                    <td className="px-2 py-1 text-right text-xs bg-zinc-50 dark:bg-zinc-800 border-l border-zinc-200 dark:border-zinc-700">
                      <input
                        type="number"
                        step="1"
                        value={data.weightages[param]}
                        onChange={(e) => setWeightage(param, e.target.value)}
                        className="w-14 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-1 py-0.5 text-xs text-right outline-none focus:border-blue-400"
                      />
                      <span className="ml-0.5 text-zinc-400">%</span>
                    </td>
                  </tr>
                ))}

                {/* Final Score row */}
                <tr className={cn(separatorRow, "font-semibold bg-zinc-50 dark:bg-zinc-800/60")}>
                  <td className={cn(tableHeaderCls, "font-semibold text-zinc-800 dark:text-zinc-200")}>
                    FINAL SCORE
                  </td>
                  {years.map((y) => {
                    const fs = finalScores[y.fy] ?? null;
                    return (
                      <td
                        key={y.fy}
                        className={cn(
                          "px-2 py-1.5 text-right text-xs font-semibold",
                          y.isEstimate && "italic opacity-70",
                          scoreColor(fs)
                        )}
                      >
                        {fs != null ? fmt(fs) : "—"}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-right text-xs bg-zinc-50 dark:bg-zinc-800 border-l border-zinc-200 dark:border-zinc-700">
                    <span className={cn("font-semibold", Math.abs(weightSum - 100) > 0.5 ? "text-red-600" : "text-zinc-600 dark:text-zinc-400")}>
                      {weightSum.toFixed(0)}%
                    </span>
                  </td>
                </tr>

                {/* Analysis rows */}
                <tr className={cn(separatorRow)}>
                  <td className={cn(tableHeaderCls, "text-zinc-700 dark:text-zinc-300")}>Nifty PE AVG</td>
                  {years.map((y) => (
                    <td key={y.fy} className={cn("px-2 py-1.5 text-right text-xs font-medium text-zinc-700 dark:text-zinc-300", y.isEstimate && "italic opacity-60")}>
                      {autoPEAvg[y.fy] != null ? fmt(autoPEAvg[y.fy], 1) : "—"}
                    </td>
                  ))}
                  <td className="px-2 py-1 bg-zinc-50 dark:bg-zinc-800 border-l border-zinc-200 dark:border-zinc-700" />
                </tr>
                <tr>
                  <td className={cn(tableHeaderCls, "text-zinc-700 dark:text-zinc-300")}>Nifty Returns</td>
                  {years.map((y) => {
                    const r = autoReturn[y.fy];
                    return (
                      <td key={y.fy} className={cn(
                        "px-2 py-1.5 text-right text-xs",
                        y.isEstimate && "italic opacity-60",
                        r != null ? (r >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400") : "text-zinc-400"
                      )}>
                        {r != null ? fmtPct(r * 100, 1) : "—"}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 bg-zinc-50 dark:bg-zinc-800 border-l border-zinc-200 dark:border-zinc-700" />
                </tr>
                <tr>
                  <td className={cn(tableHeaderCls, "text-zinc-700 dark:text-zinc-300")}>Score Growth YoY</td>
                  {years.map((y, i) => {
                    const curr = finalScores[y.fy];
                    const prev = i > 0 ? finalScores[years[i - 1].fy] : null;
                    const g = curr != null && prev != null && prev !== 0 ? ((curr - prev) / prev) * 100 : null;
                    return (
                      <td key={y.fy} className={cn(
                        "px-2 py-1.5 text-right text-xs",
                        y.isEstimate && "italic opacity-60",
                        g != null ? (g >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400") : "text-zinc-400"
                      )}>
                        {g != null ? fmtPct(g, 1) : "—"}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 bg-zinc-50 dark:bg-zinc-800 border-l border-zinc-200 dark:border-zinc-700" />
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Collapsible Rubric Editor ── */}
      <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <button
          onClick={() => setShowRubric((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors rounded-xl"
        >
          <span className="uppercase tracking-wide">Scoring Rubric & Weightages</span>
          {showRubric ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showRubric && (
          <CardContent className="px-5 pb-5">
            <div className="space-y-6 mt-2">
              {QUANT_PARAMS.map((param) => {
                const bands = data.rubric[param] ?? [];
                return (
                  <div key={param}>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {PARAM_LABELS[param]}
                      </h4>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">Slabs:</span>
                        <select
                          value={bands.length}
                          onChange={(e) => changeSlabCount(param, parseInt(e.target.value))}
                          className="rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-1.5 py-0.5 text-xs text-zinc-700 dark:text-zinc-300 outline-none focus:border-blue-400"
                        >
                          {[3, 4, 5, 6, 7, 8].map((n) => (
                            <option key={n} value={n}>{n} slabs</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <table className="text-xs border-collapse">
                      <thead>
                        <tr className="text-zinc-500 dark:text-zinc-400">
                          <th className="pr-4 pb-1 text-left font-medium">Value ≤</th>
                          <th className="pr-4 pb-1 text-left font-medium">Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bands.map((band, idx) => (
                          <tr key={idx}>
                            <td className="pr-4 py-0.5">
                              <input
                                type="number"
                                step="0.1"
                                value={band.max}
                                onChange={(e) => updateRubricBand(param, idx, "max", e.target.value)}
                                className="w-20 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-1 py-0.5 text-xs outline-none focus:border-blue-400"
                              />
                            </td>
                            <td className="pr-4 py-0.5">
                              <input
                                type="number"
                                step="0.25"
                                value={band.score}
                                onChange={(e) => updateRubricBand(param, idx, "score", e.target.value)}
                                className={cn(
                                  "w-16 rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-900 px-1 py-0.5 text-xs outline-none focus:border-blue-400",
                                  scoreColor(band.score)
                                )}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
