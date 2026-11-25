"use client";

import { useMemo, useState } from "react";
import { INDEX_META, formatPrice, formatRatio, cn, latestValid } from "@/lib/utils";
import { useLivePrices } from "@/lib/livePrices";
import { istDate } from "@/lib/marketHours";
import type { HistoricalRow, IndexKey } from "@/lib/types";

function findRowOnOrBefore(rows: HistoricalRow[], target: string): HistoricalRow | null {
  let best: HistoricalRow | null = null;
  for (const row of rows) {
    if (row.date <= target) best = row;
    else break;
  }
  return best;
}

function avgOverRange(
  rows: HistoricalRow[],
  from: string,
  to: string,
  key: IndexKey,
  field: "close" | "impliedEPS" | "pe",
  extra: number | null = null // today's live value, when the range runs to today
): number | null {
  const vals: number[] = extra != null ? [extra] : [];
  for (const row of rows) {
    if (row.date < from) continue;
    if (row.date > to) break;
    const v = row[key]?.[field] ?? null;
    if (v != null) vals.push(v);
  }
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function countInRange(rows: HistoricalRow[], from: string, to: string): number {
  let count = 0;
  for (const row of rows) {
    if (row.date < from) continue;
    if (row.date > to) break;
    count++;
  }
  return count;
}

function formatPct(v: number | null): { label: string; color: string } {
  if (v == null) return { label: "—", color: "text-zinc-400" };
  const label = (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
  const color =
    v > 0 ? "text-emerald-700 dark:text-emerald-400"
    : v < 0 ? "text-red-700 dark:text-red-400"
    : "text-zinc-500 dark:text-zinc-400";
  return { label, color };
}

function formatEPS(v: number | null): string {
  if (v == null) return "—";
  return v.toFixed(2);
}

function formatDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const PRESETS = [
  { label: "1M", months: 1  },
  { label: "3M", months: 3  },
  { label: "6M", months: 6  },
  { label: "1Y", months: 12 },
  { label: "2Y", months: 24 },
  { label: "4Y", months: 48 },
] as const;

/**
 * Calendar date `months` before fromDate, clamped to month end (31 Mar − 1M →
 * 28 Feb). Pure date arithmetic: going through local-time Date + toISOString()
 * shifted every preset a day early in IST.
 */
function shiftBack(fromDate: string, months: number): string {
  const [y, m, d] = fromDate.split("-").map(Number);
  const total = y * 12 + (m - 1) - months;
  const ty = Math.floor(total / 12);
  const tm = total - ty * 12; // 0–11
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  return `${ty}-${String(tm + 1).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

interface Props {
  historicalData: HistoricalRow[];
}

type SortCol = "indexReturn" | "epsGrowth" | null;
type SortDir = "asc" | "desc";

function SortIcon({ col, sortCol, sortDir }: { col: SortCol; sortCol: SortCol; sortDir: SortDir }) {
  if (sortCol !== col)
    return <span className="ml-0.5 text-zinc-300 dark:text-zinc-600">↕</span>;
  return <span className="ml-0.5">{sortDir === "desc" ? "▼" : "▲"}</span>;
}

export function PeriodReturnsPanel({ historicalData }: Props) {
  const lastDate = historicalData.at(-1)?.date ?? new Date().toISOString().slice(0, 10);

  // While the market is open, periods that run to the latest day end at the live
  // price, dated today (IST) — so presets like 1M mean "1 month to right now".
  const { prices: livePrices, marketOpen, asOf } = useLivePrices();
  const liveDate = useMemo(() => {
    if (!marketOpen || !livePrices || !asOf) return null;
    const d = istDate(new Date(asOf));
    return d > lastDate ? d : null;
  }, [marketOpen, livePrices, asOf, lastDate]);
  const latestDate = liveDate ?? lastDate;
  const liveTime = liveDate && asOf
    ? new Date(asOf).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false })
    : null;
  const defaultStart = new Date(new Date(lastDate).getTime() - 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const firstDate = historicalData[0]?.date ?? defaultStart;

  // Normal mode
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate,   setEndDate]   = useState(lastDate);
  const [sortCol,   setSortCol]   = useState<SortCol>(null);
  const [sortDir,   setSortDir]   = useState<SortDir>("desc");
  const [showPE,    setShowPE]    = useState(false);

  // Average Return mode
  const [avgMode,        setAvgMode]        = useState(false);
  const [startPriceFrom, setStartPriceFrom] = useState(defaultStart);
  const [startPriceTo,   setStartPriceTo]   = useState(defaultStart);
  const [endPriceFrom,   setEndPriceFrom]   = useState(lastDate);
  const [endPriceTo,     setEndPriceTo]     = useState(lastDate);

  // End values set to the latest EOD day follow the live day while the market is open.
  const effEndDate      = endDate      >= lastDate ? latestDate : endDate;
  const effEndPriceFrom = endPriceFrom >= lastDate ? latestDate : endPriceFrom;
  const effEndPriceTo   = endPriceTo   >= lastDate ? latestDate : endPriceTo;
  const liveEnd    = liveDate != null && !avgMode && effEndDate === liveDate;
  // Indices without a live quote fall back to their last EOD close.
  const eodFallbackCount = liveDate ? INDEX_META.filter((m) => livePrices?.[m.key] == null).length : 0;
  const liveAvgEnd = liveDate != null && avgMode && effEndPriceTo === liveDate;

  function handleAvgToggle() {
    if (!avgMode) {
      // Sync avg periods to current normal dates so the numbers don't jump
      setStartPriceFrom(startDate);
      setStartPriceTo(startDate);
      setEndPriceFrom(effEndDate);
      setEndPriceTo(effEndDate);
    }
    setAvgMode(v => !v);
  }

  function handleSort(col: SortCol) {
    if (sortCol !== col) { setSortCol(col); setSortDir("desc"); }
    else if (sortDir === "desc") setSortDir("asc");
    else setSortCol(null);
  }

  const { startRow, endRow } = useMemo(() => ({
    startRow: findRowOnOrBefore(historicalData, startDate),
    endRow:   findRowOnOrBefore(historicalData, endDate),
  }), [historicalData, startDate, endDate]);

  const endUsedDate = liveEnd ? liveDate : endRow?.date ?? null;
  const numDays = startRow && endUsedDate
    ? Math.round(
        (new Date(endUsedDate).getTime() - new Date(startRow.date).getTime()) /
        (1000 * 60 * 60 * 24)
      )
    : null;
  const years = numDays != null ? (numDays / 365.25).toFixed(1) : null;

  const activePreset = avgMode
    ? PRESETS.find((p) => shiftBack(effEndPriceTo, p.months) === effEndPriceFrom)?.label ?? null
    : PRESETS.find((p) => shiftBack(effEndDate,    p.months) === startDate)?.label       ?? null;

  const startPeriodDays = avgMode ? countInRange(historicalData, startPriceFrom, startPriceTo) : 0;
  const endPeriodDays   = avgMode ? countInRange(historicalData, effEndPriceFrom, effEndPriceTo) + (liveAvgEnd ? 1 : 0) : 0;

  const rows = useMemo(() => {
    const base = INDEX_META.map((meta) => {
      let sc: number | null, ec: number | null;
      let se: number | null, ee: number | null;
      let sp: number | null, ep: number | null;

      // Live point for this index: live price on the latest EOD earnings base
      // (implied EPS only changes with results, so the live P/E is price ÷ that EPS).
      const liveClose = liveDate ? livePrices?.[meta.key] ?? null : null;
      const liveEPS   = liveClose != null ? latestValid(historicalData, meta.key)?.impliedEPS ?? null : null;
      const livePE    = liveClose != null && liveEPS ? liveClose / liveEPS : null;

      if (avgMode) {
        const addLive = liveAvgEnd && liveClose != null;
        sc = avgOverRange(historicalData, startPriceFrom,  startPriceTo,  meta.key, "close");
        ec = avgOverRange(historicalData, effEndPriceFrom, effEndPriceTo, meta.key, "close",      addLive ? liveClose : null);
        se = avgOverRange(historicalData, startPriceFrom,  startPriceTo,  meta.key, "impliedEPS");
        ee = avgOverRange(historicalData, effEndPriceFrom, effEndPriceTo, meta.key, "impliedEPS", addLive ? liveEPS : null);
        sp = avgOverRange(historicalData, startPriceFrom,  startPriceTo,  meta.key, "pe");
        ep = avgOverRange(historicalData, effEndPriceFrom, effEndPriceTo, meta.key, "pe",         addLive ? livePE : null);
      } else if (liveEnd && liveClose != null) {
        sc = startRow?.[meta.key]?.close      ?? null;
        ec = liveClose;
        se = startRow?.[meta.key]?.impliedEPS ?? null;
        ee = liveEPS;
        sp = startRow?.[meta.key]?.pe         ?? null;
        ep = livePE;
      } else {
        sc = startRow?.[meta.key]?.close      ?? null;
        ec = endRow?.[meta.key]?.close        ?? null;
        se = startRow?.[meta.key]?.impliedEPS ?? null;
        ee = endRow?.[meta.key]?.impliedEPS   ?? null;
        sp = startRow?.[meta.key]?.pe         ?? null;
        ep = endRow?.[meta.key]?.pe           ?? null;
      }

      return {
        meta,
        startClose:  sc,
        endClose:    ec,
        indexReturn: sc != null && ec != null && sc !== 0 ? (ec / sc - 1) * 100 : null,
        startEPS:    se,
        endEPS:      ee,
        epsGrowth:   se != null && ee != null && se !== 0 ? (ee / se - 1) * 100 : null,
        startPE:     sp,
        endPE:       ep,
        peGrowth:    sp != null && ep != null && sp !== 0 ? (ep / sp - 1) * 100 : null,
      };
    });

    if (!sortCol) return base;
    return [...base].sort((a, b) => {
      const av = a[sortCol] ?? (sortDir === "desc" ? -Infinity : Infinity);
      const bv = b[sortCol] ?? (sortDir === "desc" ? -Infinity : Infinity);
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [startRow, endRow, sortCol, sortDir, avgMode, startPriceFrom, startPriceTo, effEndPriceFrom, effEndPriceTo, historicalData, liveDate, livePrices, liveEnd, liveAvgEnd]);

  const inputCls =
    "border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600";

  const thCls = "text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 whitespace-nowrap";

  return (
    <div className="space-y-5">
      {/* Controls row */}
      <div className="flex flex-wrap items-end gap-6 px-1">

        {avgMode ? (
          // ── Average Return mode: two period pickers ──────────────────────────
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Start Price Period</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startPriceFrom}
                  min={firstDate}
                  max={startPriceTo}
                  onChange={(e) => setStartPriceFrom(e.target.value)}
                  className={inputCls}
                />
                <span className="text-zinc-400 dark:text-zinc-500 text-sm select-none">→</span>
                <input
                  type="date"
                  value={startPriceTo}
                  min={startPriceFrom}
                  max={latestDate}
                  onChange={(e) => setStartPriceTo(e.target.value)}
                  className={inputCls}
                />
              </div>
              <span className="text-xs text-zinc-400 mt-0.5">
                {startPeriodDays > 0 ? `${startPeriodDays} trading days avg` : "—"}
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">End Price Period</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={effEndPriceFrom}
                  min={firstDate}
                  max={effEndPriceTo}
                  onChange={(e) => setEndPriceFrom(e.target.value)}
                  className={inputCls}
                />
                <span className="text-zinc-400 dark:text-zinc-500 text-sm select-none">→</span>
                <input
                  type="date"
                  value={effEndPriceTo}
                  min={effEndPriceFrom}
                  max={latestDate}
                  onChange={(e) => setEndPriceTo(e.target.value)}
                  className={inputCls}
                />
              </div>
              <span className="text-xs text-zinc-400 mt-0.5">
                {endPeriodDays > 0 ? `${endPeriodDays} trading days avg${liveAvgEnd ? ` (incl. live ${liveTime})` : ""}` : "—"}
              </span>
            </div>
          </>
        ) : (
          // ── Normal mode: single start / end date ──────────────────────────────
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Start Date</label>
              <input
                type="date"
                value={startDate}
                min={firstDate}
                max={effEndDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
              />
              {startRow && (
                <span className="text-xs text-zinc-400 mt-0.5">Using: {formatDate(startRow.date)}</span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">End Date</label>
              <input
                type="date"
                value={effEndDate}
                min={startDate}
                max={latestDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputCls}
              />
              {liveEnd ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
                  Using: live price · {liveTime} IST
                  {eodFallbackCount > 0 && <span className="text-zinc-400"> (last close for {eodFallbackCount} without a live quote)</span>}
                </span>
              ) : endRow && (
                <span className="text-xs text-zinc-400 mt-0.5">Using: {formatDate(endRow.date)}</span>
              )}
            </div>

            {numDays != null && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Duration</span>
                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums">
                  {numDays.toLocaleString()} days
                </span>
                <span className="text-xs text-zinc-400 mt-0.5">({years} yrs)</span>
              </div>
            )}
          </>
        )}

        <div className="hidden sm:block self-stretch w-px bg-zinc-200 dark:bg-zinc-700 mx-1" />

        {/* Avg Return toggle */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Mode</span>
          <button
            onClick={handleAvgToggle}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap",
              avgMode
                ? "bg-blue-600 dark:bg-blue-500 text-white border-blue-600 dark:border-blue-500"
                : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-600 hover:bg-zinc-50 dark:hover:bg-zinc-700"
            )}
          >
            {avgMode ? "● Avg Return" : "○ Avg Return"}
          </button>
        </div>

        <div className="hidden sm:block self-stretch w-px bg-zinc-200 dark:bg-zinc-700 mx-1" />

        {/* Quick Select */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Quick Select</span>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map(({ label, months }) => (
              <button
                key={label}
                onClick={() => {
                  if (avgMode) {
                    setEndPriceFrom(shiftBack(effEndPriceTo, months));
                    setStartPriceFrom(shiftBack(startPriceTo, months));
                  } else {
                    setStartDate(shiftBack(effEndDate, months));
                  }
                }}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  activePreset === label
                    ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                    : "border border-zinc-300 dark:border-zinc-600 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-700">
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                Index
              </th>
              <th className={thCls}>{avgMode ? "Avg Start Price" : "Start Price"}</th>
              <th className={thCls}>{avgMode ? "Avg End Price"   : "End Price"}</th>
              <th
                className={cn(thCls, "cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-200")}
                onClick={() => handleSort("indexReturn")}
              >
                Return % <SortIcon col="indexReturn" sortCol={sortCol} sortDir={sortDir} />
              </th>
              <th className={thCls}>{avgMode ? "Avg Start EPS" : "Start EPS"}</th>
              <th className={thCls}>{avgMode ? "Avg End EPS"   : "End EPS"}</th>
              <th
                className={cn(thCls, "cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-200")}
                onClick={() => handleSort("epsGrowth")}
              >
                EPS Growth % <SortIcon col="epsGrowth" sortCol={sortCol} sortDir={sortDir} />
              </th>
              {!showPE ? (
                <th
                  onClick={() => setShowPE(true)}
                  className="px-4 py-3 text-xs font-medium text-zinc-400 dark:text-zinc-500 whitespace-nowrap cursor-pointer select-none hover:text-zinc-600 dark:hover:text-zinc-300 border-l border-zinc-200 dark:border-zinc-700 text-right"
                >
                  P/E Details ▶
                </th>
              ) : (
                <>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 whitespace-nowrap text-right border-l border-zinc-200 dark:border-zinc-700">
                    {avgMode ? "Avg P/E Start" : "P/E Start"}
                  </th>
                  <th className={thCls}>{avgMode ? "Avg P/E End" : "P/E End"}</th>
                  <th
                    onClick={() => setShowPE(false)}
                    className={cn(thCls, "cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-200")}
                  >
                    P/E Growth % ◀
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map(({ meta, startClose, endClose, indexReturn, startEPS, endEPS, epsGrowth, startPE, endPE, peGrowth }) => {
              const ret = formatPct(indexReturn);
              const eps = formatPct(epsGrowth);
              const pe  = formatPct(peGrowth);
              return (
                <tr
                  key={meta.key}
                  className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors"
                >
                  <td className="px-4 py-3 font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                    {meta.label}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {startClose != null ? formatPrice(startClose) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {endClose != null ? formatPrice(endClose) : "—"}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums font-semibold ${ret.color}`}>
                    {ret.label}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatEPS(startEPS)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                    {formatEPS(endEPS)}
                  </td>
                  <td className={`px-4 py-3 text-right tabular-nums font-semibold ${eps.color}`}>
                    {eps.label}
                  </td>
                  {!showPE ? (
                    <td className="border-l border-zinc-100 dark:border-zinc-800" />
                  ) : (
                    <>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300 border-l border-zinc-100 dark:border-zinc-800">
                        {startPE != null ? formatRatio(startPE) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                        {endPE != null ? formatRatio(endPE) : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums font-semibold ${pe.color}`}>
                        {pe.label}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
