"use client";

import { useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";

export type BrokerageDataType = "eps" | "profit" | "eps_growth";

export type BrokerageRow = {
  id: string;
  brokerage: string;
  reportDate: string;
  addedAt: string;
  dataType: BrokerageDataType;
  baseVal: string;
  year1Val: string;
  year2Val: string;
  sourceLink?: string;
};

interface BrokerageEstimatesCardProps {
  rows: BrokerageRow[];
  onAdd: (row: Omit<BrokerageRow, "id" | "addedAt">) => Promise<void>;
  onDelete: (rowId: string) => Promise<void>;
  ownerMode: boolean;
}

type FormState = {
  brokerage: string;
  reportDate: string;
  dataType: BrokerageDataType;
  baseVal: string;
  year1Val: string;
  year2Val: string;
  sourceLink: string;
};

const emptyForm: FormState = {
  brokerage: "",
  reportDate: new Date().toISOString().slice(0, 10),
  dataType: "eps",
  baseVal: "",
  year1Val: "",
  year2Val: "",
  sourceLink: "",
};

function computeGrowth(row: BrokerageRow): { yr1: number | null; yr2: number | null; abs2y: number | null } {
  if (row.dataType === "eps_growth") {
    const yr1 = parseFloat(row.year1Val);
    const yr2 = parseFloat(row.year2Val);
    return {
      yr1: isNaN(yr1) ? null : yr1,
      yr2: isNaN(yr2) ? null : yr2,
      abs2y: !isNaN(yr1) && !isNaN(yr2) ? ((1 + yr1 / 100) * (1 + yr2 / 100) - 1) * 100 : null,
    };
  }
  const base = parseFloat(row.baseVal);
  const v1 = parseFloat(row.year1Val);
  const v2 = parseFloat(row.year2Val);
  if (isNaN(base) || base === 0) return { yr1: null, yr2: null, abs2y: null };
  const yr1 = isNaN(v1) ? null : (v1 / base - 1) * 100;
  const yr2 = isNaN(v2) ? null : (v2 / base - 1) * 100;
  return { yr1, yr2, abs2y: yr2 };
}

function PctPill({ val }: { val: number | null }) {
  if (val === null) return <span className="text-zinc-300 dark:text-zinc-700">—</span>;
  const pos = val >= 0;
  return (
    <span className={cn(
      "inline-block px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums",
      pos
        ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"
        : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400"
    )}>
      {pos ? "+" : ""}{val.toFixed(2)}%
    </span>
  );
}

const TYPE_LABELS: Record<BrokerageDataType, string> = { eps: "EPS", profit: "Profit", eps_growth: "Gr%" };
const TYPE_COLORS: Record<BrokerageDataType, string> = {
  eps: "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
  profit: "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
  eps_growth: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400",
};

function formatDate(iso: string) {
  try {
    return new Date(iso + (iso.length === 10 ? "T00:00:00" : ""))
      .toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch { return iso; }
}

export function BrokerageEstimatesCard({ rows, onAdd, onDelete, ownerMode }: BrokerageEstimatesCardProps) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [addedVisible, setAddedVisible] = useState(false);

  const setField = useCallback(<K extends keyof FormState>(field: K, val: FormState[K]) => {
    setForm(prev => ({ ...prev, [field]: val }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!form.brokerage.trim()) return;
    setSaving(true);
    try {
      await onAdd({
        brokerage: form.brokerage.trim(),
        reportDate: form.reportDate,
        dataType: form.dataType,
        baseVal: form.dataType === "eps_growth" ? "" : form.baseVal,
        year1Val: form.year1Val,
        year2Val: form.year2Val,
        ...(form.sourceLink.trim() ? { sourceLink: form.sourceLink.trim() } : {}),
      });
      setForm(emptyForm);
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }, [form, onAdd]);

  const averages = useMemo(() => {
    let yr1Sum = 0, yr1Count = 0, yr2Sum = 0, yr2Count = 0, abs2ySum = 0, abs2yCount = 0;
    for (const row of rows) {
      const { yr1, yr2, abs2y } = computeGrowth(row);
      if (yr1 !== null) { yr1Sum += yr1; yr1Count++; }
      if (yr2 !== null) { yr2Sum += yr2; yr2Count++; }
      if (abs2y !== null) { abs2ySum += abs2y; abs2yCount++; }
    }
    return {
      yr1: yr1Count > 0 ? yr1Sum / yr1Count : null,
      yr2: yr2Count > 0 ? yr2Sum / yr2Count : null,
      abs2y: abs2yCount > 0 ? abs2ySum / abs2yCount : null,
    };
  }, [rows]);

  const isGrowthForm = form.dataType === "eps_growth";

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-zinc-100 dark:border-zinc-800 flex-wrap gap-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Brokerage EPS / Profit Estimates
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 italic">Any user can add</span>
          <button
            onClick={() => { setShowForm(v => !v); setForm(emptyForm); }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700 hover:opacity-80 transition-opacity"
          >
            {showForm ? "✕ Cancel" : "＋ Add Row"}
          </button>
        </div>
      </div>

      {/* Add Row Form */}
      {showForm && (
        <div className="border-b border-zinc-100 dark:border-zinc-800 bg-blue-50/30 dark:bg-blue-900/10 px-5 py-4">
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">＋ New Row</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-zinc-400 dark:text-zinc-500">Type:</span>
              {(["eps", "profit", "eps_growth"] as BrokerageDataType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setField("dataType", t)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all",
                    form.dataType === t
                      ? t === "eps"
                        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-400 dark:border-blue-600"
                        : t === "profit"
                        ? "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-400 dark:border-amber-600"
                        : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-500 dark:border-emerald-700"
                      : "bg-white dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-zinc-700"
                  )}
                >
                  {t === "eps" ? "EPS" : t === "profit" ? "Profit ₹ cr" : "EPS Growth %"}
                </button>
              ))}
            </div>
          </div>

          <div className={cn(
            "grid gap-3 items-end",
            isGrowthForm
              ? "grid-cols-[2fr_1.2fr_1fr_1fr_1fr_auto]"
              : "grid-cols-[2fr_1.2fr_1fr_1fr_1fr_1fr_auto]"
          )}>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Brokerage Name</label>
              <input
                type="text"
                value={form.brokerage}
                onChange={e => setField("brokerage", e.target.value)}
                placeholder="e.g. Goldman Sachs"
                className="border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 text-xs bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-600"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                Source Link <span className="font-normal normal-case">(optional)</span>
              </label>
              <input
                type="url"
                value={form.sourceLink}
                onChange={e => setField("sourceLink", e.target.value)}
                placeholder="https://..."
                className="border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 text-xs bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-600"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Report Date</label>
              <input
                type="date"
                value={form.reportDate}
                onChange={e => setField("reportDate", e.target.value)}
                className="border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 text-xs bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-600"
              />
            </div>
            {!isGrowthForm && (
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {form.dataType === "eps" ? "Base EPS" : "Base Profit ₹ cr"}
                </label>
                <input
                  type="number"
                  value={form.baseVal}
                  onChange={e => setField("baseVal", e.target.value)}
                  placeholder="—"
                  className="border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 text-xs bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-600 tabular-nums"
                />
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {isGrowthForm ? "Yr 1 Growth %" : form.dataType === "eps" ? "Yr 1 EPS" : "Yr 1 Profit ₹ cr"}
              </label>
              <input
                type="number"
                value={form.year1Val}
                onChange={e => setField("year1Val", e.target.value)}
                placeholder="—"
                className="border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 text-xs bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-600 tabular-nums"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                {isGrowthForm ? "Yr 2 Growth %" : form.dataType === "eps" ? "Yr 2 EPS" : "Yr 2 Profit ₹ cr"}
              </label>
              <input
                type="number"
                value={form.year2Val}
                onChange={e => setField("year2Val", e.target.value)}
                placeholder="—"
                className="border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1.5 text-xs bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-600 tabular-nums"
              />
            </div>
            <div className="flex items-end pb-0.5">
              <button
                onClick={handleSubmit}
                disabled={saving || !form.brokerage.trim()}
                className="px-4 py-1.5 rounded-lg text-[11px] font-semibold bg-blue-600 dark:bg-blue-500 text-white disabled:opacity-50 hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors whitespace-nowrap"
              >
                {saving ? "…" : "Save Row"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="px-5 py-10 text-center text-xs text-zinc-400 dark:text-zinc-600">
          No brokerage estimates added yet. Click ＋ Add Row to begin.
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: 1020 }}>
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40">
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Brokerage</th>
                <th className="px-2 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Src</th>
                <th className="px-3 py-2.5 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Type</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Report Date</th>
                <th
                  className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  onClick={() => setAddedVisible(v => !v)}
                  title={addedVisible ? "Click to hide" : "Click to show"}
                >
                  Added {addedVisible ? "▲" : "▼"}
                </th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Base Value</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Yr 1 Value</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Yr 1 Growth</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Yr 2 Value</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Yr 2 Growth</th>
                <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 whitespace-nowrap">Abs. 2Y</th>
                {ownerMode && <th className="px-3 py-2.5 text-center text-[10px] text-zinc-300 dark:text-zinc-700">—</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const { yr1, yr2, abs2y } = computeGrowth(row);
                const isGrType = row.dataType === "eps_growth";
                const isProfit = row.dataType === "profit";
                return (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-zinc-50 dark:border-zinc-800 hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition-colors",
                      isGrType && "bg-emerald-50/20 dark:bg-emerald-900/10"
                    )}
                  >
                    <td className="px-5 py-2.5 text-left font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap">{row.brokerage}</td>
                    <td className="px-2 py-2.5 text-center">
                      {row.sourceLink ? (
                        <a
                          href={row.sourceLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={row.sourceLink}
                          className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-sm leading-none"
                        >
                          🔗
                        </a>
                      ) : (
                        <span className="text-zinc-300 dark:text-zinc-700 text-[10px]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={cn("inline-block px-1.5 py-0.5 rounded-full text-[9px] font-bold", TYPE_COLORS[row.dataType])}>
                        {TYPE_LABELS[row.dataType]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-zinc-500 dark:text-zinc-400 whitespace-nowrap tabular-nums">
                      {formatDate(row.reportDate)}
                    </td>
                    <td className={cn("px-3 py-2.5 text-right text-[10px] italic tabular-nums text-zinc-400 dark:text-zinc-600 whitespace-nowrap", !addedVisible && "hidden")}>
                      {formatDate(row.addedAt)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {isGrType ? (
                        <span className="text-zinc-300 dark:text-zinc-700">—</span>
                      ) : (
                        <>
                          {row.baseVal || <span className="text-zinc-300 dark:text-zinc-700">—</span>}
                          {isProfit && row.baseVal && <span className="block text-[9px] text-zinc-400 dark:text-zinc-600 italic">₹ cr</span>}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {isGrType ? (
                        <span className="text-zinc-300 dark:text-zinc-700">—</span>
                      ) : (
                        <>
                          {row.year1Val || <span className="text-zinc-300 dark:text-zinc-700">—</span>}
                          {isProfit && row.year1Val && <span className="block text-[9px] text-zinc-400 dark:text-zinc-600 italic">₹ cr</span>}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right"><PctPill val={yr1} /></td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                      {isGrType ? (
                        <span className="text-zinc-300 dark:text-zinc-700">—</span>
                      ) : (
                        <>
                          {row.year2Val || <span className="text-zinc-300 dark:text-zinc-700">—</span>}
                          {isProfit && row.year2Val && <span className="block text-[9px] text-zinc-400 dark:text-zinc-600 italic">₹ cr</span>}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right"><PctPill val={yr2} /></td>
                    <td className="px-3 py-2.5 text-right"><PctPill val={abs2y} /></td>
                    {ownerMode && (
                      <td className="px-3 py-2.5 text-center">
                        <button
                          onClick={() => onDelete(row.id)}
                          className="text-red-400 dark:text-red-500 opacity-40 hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 rounded px-1.5 py-0.5 text-sm transition-all"
                          title="Delete row"
                        >
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}

              {/* Average row */}
              <tr className="border-t-2 border-zinc-200 dark:border-zinc-700 bg-blue-50/30 dark:bg-blue-900/10">
                <td className="px-5 py-2.5 text-left">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                    Average ({rows.length})
                  </span>
                </td>
                <td className="px-2 py-2.5" />
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5" />
                <td className={cn("px-3 py-2.5", !addedVisible && "hidden")} />
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-right"><PctPill val={averages.yr1} /></td>
                <td className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-right"><PctPill val={averages.yr2} /></td>
                <td className="px-3 py-2.5 text-right"><PctPill val={averages.abs2y} /></td>
                {ownerMode && <td className="px-3 py-2.5" />}
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <p className="px-5 py-2.5 text-[10px] text-zinc-400 dark:text-zinc-600 border-t border-zinc-100 dark:border-zinc-800 leading-relaxed">
        EPS / Profit rows: Growth = (Value ÷ Base − 1) × 100 &nbsp;·&nbsp;
        EPS Growth % rows: Abs. 2Y = (1 + Yr1%) × (1 + Yr2%) − 1 compounded &nbsp;·&nbsp;
        Average skips rows with no valid value &nbsp;·&nbsp;
        Click &ldquo;Added&rdquo; header to show/hide that column
      </p>
    </div>
  );
}
