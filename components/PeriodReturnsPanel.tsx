"use client";

import { useMemo, useState } from "react";
import { INDEX_META, formatPrice, cn } from "@/lib/utils";
import type { HistoricalRow } from "@/lib/types";

function findRowOnOrBefore(rows: HistoricalRow[], target: string): HistoricalRow | null {
  let best: HistoricalRow | null = null;
  for (const row of rows) {
    if (row.date <= target) best = row;
    else break;
  }
  return best;
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

interface Props {
  historicalData: HistoricalRow[];
}

type SortCol = "indexReturn" | "epsGrowth" | null;
type SortDir = "asc" | "desc";

export function PeriodReturnsPanel({ historicalData }: Props) {
  const lastDate = historicalData.at(-1)?.date ?? new Date().toISOString().slice(0, 10);
  const defaultStart = new Date(new Date(lastDate).getTime() - 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const firstDate = historicalData[0]?.date ?? defaultStart;

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate]     = useState(lastDate);
  const [sortCol, setSortCol]     = useState<SortCol>(null);
  const [sortDir, setSortDir]     = useState<SortDir>("desc");

  function handleSort(col: SortCol) {
    if (sortCol !== col) { setSortCol(col); setSortDir("desc"); }
    else if (sortDir === "desc") setSortDir("asc");
    else setSortCol(null);
  }

  const { startRow, endRow } = useMemo(() => ({
    startRow: findRowOnOrBefore(historicalData, startDate),
    endRow:   findRowOnOrBefore(historicalData, endDate),
  }), [historicalData, startDate, endDate]);

  const numDays = startRow && endRow
    ? Math.round(
        (new Date(endRow.date).getTime() - new Date(startRow.date).getTime()) /
        (1000 * 60 * 60 * 24)
      )
    : null;
  const years = numDays != null ? (numDays / 365.25).toFixed(1) : null;

  const rows = useMemo(() => {
    const base = INDEX_META.map((meta) => {
      const sc = startRow?.[meta.key]?.close      ?? null;
      const ec = endRow?.[meta.key]?.close        ?? null;
      const se = startRow?.[meta.key]?.impliedEPS ?? null;
      const ee = endRow?.[meta.key]?.impliedEPS   ?? null;
      return {
        meta,
        startClose:  sc,
        endClose:    ec,
        indexReturn: sc != null && ec != null && sc !== 0 ? (ec / sc - 1) * 100 : null,
        startEPS:    se,
        endEPS:      ee,
        epsGrowth:   se != null && ee != null && se !== 0 ? (ee / se - 1) * 100 : null,
      };
    });

    if (!sortCol) return base;
    return [...base].sort((a, b) => {
      const av = a[sortCol] ?? (sortDir === "desc" ? -Infinity : Infinity);
      const bv = b[sortCol] ?? (sortDir === "desc" ? -Infinity : Infinity);
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [startRow, endRow, sortCol, sortDir]);

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col)
      return <span className="ml-0.5 text-zinc-300 dark:text-zinc-600">↕</span>;
    return <span className="ml-0.5">{sortDir === "desc" ? "▼" : "▲"}</span>;
  };

  const inputCls =
    "border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600";

  const thCls = "text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 whitespace-nowrap";

  return (
    <div className="space-y-5">
      {/* Date pickers */}
      <div className="flex flex-wrap items-end gap-6 px-1">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Start Date</label>
          <input
            type="date"
            value={startDate}
            min={firstDate}
            max={endDate}
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
            value={endDate}
            min={startDate}
            max={lastDate}
            onChange={(e) => setEndDate(e.target.value)}
            className={inputCls}
          />
          {endRow && (
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
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-200 dark:border-zinc-700">
              <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                Index
              </th>
              <th className={thCls}>Start Price</th>
              <th className={thCls}>End Price</th>
              <th
                className={cn(thCls, "cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-200")}
                onClick={() => handleSort("indexReturn")}
              >
                Return % <SortIcon col="indexReturn" />
              </th>
              <th className={thCls}>Start EPS</th>
              <th className={thCls}>End EPS</th>
              <th
                className={cn(thCls, "cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-200")}
                onClick={() => handleSort("epsGrowth")}
              >
                EPS Growth % <SortIcon col="epsGrowth" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map(({ meta, startClose, endClose, indexReturn, startEPS, endEPS, epsGrowth }) => {
              const ret = formatPct(indexReturn);
              const eps = formatPct(epsGrowth);
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
