"use client";

import { useMemo, useState, useEffect } from "react";
import { TimeWindowSelector } from "@/components/TimeWindowSelector";
import {
  filterByWindow,
  extractValues,
  mean,
  stdDev,
  zScore,
  buildForwardRatioSeries,
} from "@/lib/calculations";
import {
  INDEX_META,
  formatRatio,
  formatPrice,
  formatZScore,
  cn,
} from "@/lib/utils";
import { useRatioMode } from "@/lib/ratioMode";
import type { HistoricalRow, IndexKey, TimeWindow } from "@/lib/types";

type MultipleTarget = "mean" | "sd1u" | "sd1l" | "sd2u" | "sd2l";

const MULTIPLE_OPTIONS: { value: MultipleTarget; label: string }[] = [
  { value: "mean",  label: "Mean"  },
  { value: "sd1u",  label: "+1σ"   },
  { value: "sd2u",  label: "+2σ"   },
  { value: "sd1l",  label: "−1σ"   },
  { value: "sd2l",  label: "−2σ"   },
];

const VISITOR_STORAGE_KEY = "nifty-projections-visitor-v2";

interface IndexOverviewProps {
  historicalData: HistoricalRow[];
  liveData: Partial<Record<IndexKey, number>> | null;
  liveMarketOpen?: boolean;
  onSelectIndex: (key: IndexKey) => void;
  timeWindow: TimeWindow;
  onTimeWindowChange: (w: TimeWindow) => void;
  projectionDefaults?: Partial<Record<IndexKey, { base?: { growthPct?: number } }>> | null;
}

function ZBadge({ z }: { z: number | null }) {
  if (z == null) return <span className="text-zinc-400 text-sm">—</span>;
  const abs = Math.abs(z);
  const label = formatZScore(z);

  if (abs >= 1.5) {
    return z > 0
      ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 tabular-nums">{label}</span>
      : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 tabular-nums">{label}</span>;
  }
  if (abs >= 0.5) {
    return z > 0
      ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 tabular-nums">{label}</span>
      : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 tabular-nums">{label}</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 tabular-nums">{label}</span>;
}

function UpsideBadge({ pct }: { pct: number | null }) {
  if (pct == null) return <span className="text-zinc-400 text-sm">—</span>;
  const label = (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
  if (pct > 0)
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{label}</span>;
  if (pct < 0)
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tabular-nums text-red-700 dark:text-red-400">{label}</span>;
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-400">{label}</span>;
}

export function IndexOverview({ historicalData, liveData, liveMarketOpen, onSelectIndex, timeWindow, onTimeWindowChange, projectionDefaults }: IndexOverviewProps) {
  const [multipleTarget, setMultipleTarget] = useState<MultipleTarget>("mean");
  const [forwardMode, setForwardMode] = useState(false);
  const [forwardBases, setForwardBases] = useState<Record<string, any> | null>(null);
  const { ratioMode } = useRatioMode();

  // Load forward bases when "Forward EPS/BV" toggle is active
  useEffect(() => {
    if (!forwardMode) { setForwardBases(null); return; }
    (async () => {
      let blob: Record<string, any> | null = null;
      try {
        const r = await fetch("/api/projection-defaults", { cache: "no-store" });
        if (r.ok) blob = await r.json();
      } catch {}

      let diff: Record<string, any> | null = null;
      try {
        const s = localStorage.getItem(VISITOR_STORAGE_KEY);
        if (s) diff = JSON.parse(s);
      } catch {}

      if (!blob && !diff) { setForwardBases(null); return; }

      const merged: Record<string, any> = { ...(blob ?? {}) };
      if (diff) {
        for (const ik of Object.keys(diff)) {
          const d = diff[ik];
          const b = blob?.[ik] ?? {};
          merged[ik] = {
            ...b,
            ...(d.path    != null ? { path:    d.path    } : {}),
            ...(d.baseEPS != null ? { baseEPS: d.baseEPS } : {}),
            ...(d.baseBV  != null ? { baseBV:  d.baseBV  } : {}),
            bear: { ...b.bear, ...d.bear },
            base: { ...b.base, ...d.base },
            bull: { ...b.bull, ...d.bull },
          };
        }
      }
      setForwardBases(Object.keys(merged).length ? merged : null);
    })();
  }, [forwardMode]);

  // Forward PE/PB series for all indices (only computed in FWD mode)
  const fwdSeriesMap = useMemo(() => {
    if (ratioMode !== "FWD") return null;
    const result = {} as Record<IndexKey, { date: string; fwdPE: number | null; fwdPB: number | null }[]>;
    for (const meta of INDEX_META) {
      const growthPct = projectionDefaults?.[meta.key]?.base?.growthPct ?? 0;
      result[meta.key] = buildForwardRatioSeries(historicalData, meta.key, growthPct);
    }
    return result;
  }, [ratioMode, historicalData, projectionDefaults]);

  const lastRow = historicalData[historicalData.length - 1] ?? null;

  const windowRows = useMemo(
    () => filterByWindow(historicalData, timeWindow),
    [historicalData, timeWindow]
  );

  function applyTarget(m: number | null, sd: number | null): number | null {
    if (m == null || sd == null) return null;
    switch (multipleTarget) {
      case "mean": return m;
      case "sd1u": return m + sd;
      case "sd1l": return m - sd;
      case "sd2u": return m + 2 * sd;
      case "sd2l": return m - 2 * sd;
    }
  }

  const stats = useMemo(() => {
    const windowDateSet = new Set(windowRows.map((r) => r.date));

    return INDEX_META.map((meta) => {
      const key = meta.key;
      const liveClose = liveData?.[key] ?? null;
      const hist = lastRow?.[key];
      const isLive = liveClose != null;

      const close = liveClose ?? hist?.close ?? null;

      // PE/PB current values and mean/SD — use forward series in FWD mode
      const fwdSeries = fwdSeriesMap?.[key];

      let currentPE: number | null;
      let peMean: number | null;
      let peSD: number | null;
      let currentPB: number | null;
      let pbMean: number | null;
      let pbSD: number | null;

      if (ratioMode === "FWD" && fwdSeries) {
        const lastFwdEntry = fwdSeries[fwdSeries.length - 1];
        currentPE = lastFwdEntry?.fwdPE ?? null;
        currentPB = lastFwdEntry?.fwdPB ?? null;

        const fwdPEVals = fwdSeries
          .filter((r) => windowDateSet.has(r.date))
          .map((r) => r.fwdPE)
          .filter((v): v is number => v != null);
        const fwdPBVals = fwdSeries
          .filter((r) => windowDateSet.has(r.date))
          .map((r) => r.fwdPB)
          .filter((v): v is number => v != null);

        peMean = fwdPEVals.length >= 2 ? mean(fwdPEVals) : null;
        peSD   = fwdPEVals.length >= 2 ? stdDev(fwdPEVals) : null;
        pbMean = fwdPBVals.length >= 2 ? mean(fwdPBVals) : null;
        pbSD   = fwdPBVals.length >= 2 ? stdDev(fwdPBVals) : null;
      } else {
        currentPE = isLive && hist?.impliedEPS ? liveClose! / hist.impliedEPS : hist?.pe ?? null;
        currentPB = isLive && hist?.impliedBV  ? liveClose! / hist.impliedBV  : hist?.pb ?? null;

        const peVals = extractValues(windowRows, key, "pe");
        peMean = peVals.length >= 2 ? mean(peVals)   : null;
        peSD   = peVals.length >= 2 ? stdDev(peVals) : null;

        const pbVals = extractValues(windowRows, key, "pb");
        pbMean = pbVals.length >= 2 ? mean(pbVals)   : null;
        pbSD   = pbVals.length >= 2 ? stdDev(pbVals) : null;
      }

      const peZ = currentPE != null && peMean != null && peSD != null ? zScore(currentPE, peMean, peSD) : null;
      const pbZ = currentPB != null && pbMean != null && pbSD != null ? zScore(currentPB, pbMean, pbSD) : null;

      // Base EPS/BV — trailing from lastRow, or forward (base scenario) from projections
      const projEntry = forwardBases?.[key] ?? null;
      const trailingEPS = hist?.impliedEPS ?? null;
      const trailingBV  = hist?.impliedBV  ?? null;

      let baseEPS: number | null = trailingEPS;
      let baseBV:  number | null = trailingBV;

      if (forwardMode) {
        const rawEPS = projEntry?.baseEPS ?? trailingEPS;
        const rawBV  = projEntry?.baseBV  ?? trailingBV;
        const growthPct = projEntry?.base?.growthPct ?? 0;
        baseEPS = rawEPS != null ? rawEPS * (1 + growthPct / 100) : null;
        baseBV  = rawBV  != null ? rawBV  * (1 + growthPct / 100) : null;
      }

      const peTarget = applyTarget(peMean, peSD);
      const pbTarget = applyTarget(pbMean, pbSD);

      const peTargetPrice = peTarget != null && baseEPS != null ? peTarget * baseEPS : null;
      const pbTargetPrice = pbTarget != null && baseBV  != null ? pbTarget * baseBV  : null;

      const peUpside = peTargetPrice != null && close != null
        ? ((peTargetPrice - close) / close) * 100 : null;
      const pbUpside = pbTargetPrice != null && close != null
        ? ((pbTargetPrice - close) / close) * 100 : null;

      return { meta, key, close, isLive, pe: currentPE, peMean, peSD, peZ, peTargetPrice, peUpside, pb: currentPB, pbMean, pbSD, pbZ, pbTargetPrice, pbUpside };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowRows, lastRow, liveData, multipleTarget, forwardMode, forwardBases, ratioMode, fwdSeriesMap]);

  function ratioColor(current: number | null, m: number | null, sd: number | null) {
    if (current == null || m == null || sd == null || sd === 0) return "text-zinc-900 dark:text-zinc-100";
    if (current > m + sd)  return "text-red-700 dark:text-red-400";
    if (current < m - sd)  return "text-emerald-700 dark:text-emerald-400";
    return "text-zinc-900 dark:text-zinc-100";
  }

  const multipleLabel = MULTIPLE_OPTIONS.find((o) => o.value === multipleTarget)?.label ?? "Mean";

  return (
    <div className="pt-2">
      <div data-compact-text className="rounded-xl border border-zinc-200 dark:border-zinc-700 shadow-sm bg-white dark:bg-zinc-900 overflow-hidden">

        {/* Header strip */}
        <div className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100 tracking-tight">
              All Indices — {timeWindow} Window Statistics
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
              Mean &amp; SD computed from {timeWindow} rolling window · Live prices during market hours
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Multiple target dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Upside via</span>
              <select
                value={multipleTarget}
                onChange={(e) => setMultipleTarget(e.target.value as MultipleTarget)}
                className="text-xs font-medium border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-300 dark:focus:ring-zinc-600"
              >
                {MULTIPLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Forward EPS/BV toggle */}
            <button
              onClick={() => setForwardMode((v) => !v)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap",
                forwardMode
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                  : "bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
            >
              Forward EPS/BV
            </button>

            <TimeWindowSelector value={timeWindow} onChange={onTimeWindowChange} />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              {/* Group headers */}
              <tr className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                <th className="px-6 py-2 text-left" rowSpan={2} />
                <th
                  className="px-5 py-2 text-right text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-300 align-bottom"
                  rowSpan={2}
                >
                  Close
                </th>
                {/* P/E group — 6 cols */}
                <th
                  colSpan={6}
                  className="px-5 py-2 text-center text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-200 border-l border-zinc-200 dark:border-zinc-700"
                >
                  P / E  R A T I O
                </th>
                {/* P/B group — 6 cols */}
                <th
                  colSpan={6}
                  className="px-5 py-2 text-center text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-200 border-l border-zinc-200 dark:border-zinc-700"
                >
                  P / B  R A T I O
                </th>
              </tr>

              {/* Column headers */}
              <tr className="bg-zinc-50 dark:bg-zinc-800 border-b-2 border-zinc-200 dark:border-zinc-700">
                {/* PE cols */}
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-300 border-l border-zinc-200 dark:border-zinc-700">Current</th>
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-300">Mean</th>
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-300">SD</th>
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-300">Z-Score</th>
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-300 max-w-[56px]">Target<br />Price</th>
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-300 max-w-[72px]">
                  Upside % <span className="text-zinc-500 dark:text-zinc-500 font-normal">({multipleLabel})</span>
                </th>
                {/* PB cols */}
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-300 border-l border-zinc-200 dark:border-zinc-700">Current</th>
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-300">Mean</th>
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-300">SD</th>
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-300">Z-Score</th>
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-300 max-w-[56px]">Target<br />Price</th>
                <th className="px-5 pb-2.5 pt-1 text-right text-xs font-bold uppercase tracking-wide text-zinc-900 dark:text-zinc-300 max-w-[72px]">
                  Upside % <span className="text-zinc-500 dark:text-zinc-500 font-normal">({multipleLabel})</span>
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {stats.map(({ meta, close, isLive, pe, peMean, peSD, peZ, peTargetPrice, peUpside, pb, pbMean, pbSD, pbZ, pbTargetPrice, pbUpside }, idx) => (
                <tr
                  key={meta.key}
                  className={cn(
                    "transition-colors hover:bg-blue-50/30 dark:hover:bg-blue-900/10",
                    idx % 2 === 1 ? "bg-zinc-50/40 dark:bg-zinc-800/40" : "bg-white dark:bg-zinc-900"
                  )}
                >
                  {/* Index name */}
                  <td className="px-6 py-4 cursor-pointer" onClick={() => onSelectIndex(meta.key)}>
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-bold text-[#118ab2] dark:text-zinc-100 whitespace-nowrap tracking-tight hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                        {meta.label}
                      </span>
                      {isLive && liveMarketOpen && (
                        <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 whitespace-nowrap bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                          </span>
                          LIVE
                        </span>
                      )}
                      {isLive && !liveMarketOpen && (
                        <span className="flex items-center gap-1 text-[9px] font-bold text-zinc-500 whitespace-nowrap bg-zinc-100 px-1.5 py-0.5 rounded-full border border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700">
                          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-zinc-400" />
                          CLO
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Close */}
                  <td className="px-5 py-4 text-right">
                    <span className="text-base font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
                      {close != null ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(close)) : "—"}
                    </span>
                  </td>

                  {/* PE Current */}
                  <td className="px-5 py-4 text-right border-l border-zinc-100 dark:border-zinc-800">
                    <span className={cn("text-base font-bold tabular-nums", ratioColor(pe, peMean, peSD))}>
                      {formatRatio(pe)}
                    </span>
                  </td>
                  {/* PE Mean */}
                  <td className="px-5 py-4 text-right">
                    <span className="text-sm text-zinc-700 dark:text-zinc-400 tabular-nums">{formatRatio(peMean)}</span>
                  </td>
                  {/* PE SD */}
                  <td className="px-5 py-4 text-right">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400 tabular-nums">{formatRatio(peSD)}</span>
                  </td>
                  {/* PE Z */}
                  <td className="px-5 py-4 text-right">
                    <ZBadge z={peZ} />
                  </td>
                  {/* PE Target Price */}
                  <td className="px-5 py-4 text-right">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 tabular-nums">
                      {peTargetPrice != null ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(peTargetPrice)) : "—"}
                    </span>
                  </td>
                  {/* PE Upside % */}
                  <td className="px-5 py-4 text-right">
                    <UpsideBadge pct={peUpside} />
                  </td>

                  {/* PB Current */}
                  <td className="px-5 py-4 text-right border-l border-zinc-100 dark:border-zinc-800">
                    <span className={cn("text-base font-bold tabular-nums", ratioColor(pb, pbMean, pbSD))}>
                      {formatRatio(pb)}
                    </span>
                  </td>
                  {/* PB Mean */}
                  <td className="px-5 py-4 text-right">
                    <span className="text-sm text-zinc-700 dark:text-zinc-400 tabular-nums">{formatRatio(pbMean)}</span>
                  </td>
                  {/* PB SD */}
                  <td className="px-5 py-4 text-right">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400 tabular-nums">{formatRatio(pbSD)}</span>
                  </td>
                  {/* PB Z */}
                  <td className="px-5 py-4 text-right">
                    <ZBadge z={pbZ} />
                  </td>
                  {/* PB Target Price */}
                  <td className="px-5 py-4 text-right">
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 tabular-nums">
                      {pbTargetPrice != null ? new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(pbTargetPrice)) : "—"}
                    </span>
                  </td>
                  {/* PB Upside % */}
                  <td className="px-5 py-4 text-right">
                    <UpsideBadge pct={pbUpside} />
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer legend */}
        <div className="border-t border-zinc-100 dark:border-zinc-800 px-6 py-3 bg-zinc-50/60 dark:bg-zinc-800/60 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-zinc-600 dark:text-zinc-400">
          <span>
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-300 mr-1.5 align-middle" />
            Current &gt; Mean + 1SD — expensive vs {timeWindow} history
          </span>
          <span>
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-300 mr-1.5 align-middle" />
            Current &lt; Mean − 1SD — cheap vs {timeWindow} history
          </span>
          <span className="text-zinc-600">Z-Score = (Current − Mean) ÷ SD</span>
          <span className="text-zinc-600">Target Price = {multipleLabel} multiple × {forwardMode ? "Forward" : "Implied"} EPS/BV · Upside % = (Target Price − Close) ÷ Close</span>
        </div>
      </div>
    </div>
  );
}
