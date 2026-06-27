"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type EpsGrowthState = {
  currentBase: string; // Col 1 — current implied EPS or BV
  year1Growth: string; // Col 2 — Year 1 growth %
  year2Growth: string; // Col 4 — Year 2 growth %
};

interface EpsGrowthCardProps {
  state: EpsGrowthState;
  onChange: (s: EpsGrowthState) => void;
  isPE: boolean; // true = EPS labels, false = BV labels
}

function fmt(n: number | null, decimals = 2): string {
  if (n == null || !isFinite(n)) return "—";
  return n.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const inputCls =
  "w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 " +
  "px-2 py-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100 text-right " +
  "focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 " +
  "placeholder-zinc-400 dark:placeholder-zinc-500";

export function EpsGrowthCard({ state, onChange, isPE }: EpsGrowthCardProps) {
  const base = parseFloat(state.currentBase) || 0;
  const g1   = parseFloat(state.year1Growth)  || 0;
  const g2   = parseFloat(state.year2Growth)  || 0;

  const yr1  = base > 0 ? base * (1 + g1 / 100) : null;
  const yr2  = yr1 != null ? yr1 * (1 + g2 / 100) : null;
  const abs2 = yr2 != null && base > 0 ? (yr2 / base - 1) * 100 : null;

  const tag = isPE ? "EPS" : "BV";

  const abs2Positive = abs2 != null && abs2 > 0.005;
  const abs2Negative = abs2 != null && abs2 < -0.005;

  const set = (field: keyof EpsGrowthState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...state, [field]: e.target.value });

  const headerCls = "px-3 py-2 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide text-right whitespace-nowrap";
  const cellCls   = "px-3 py-2";
  const readonlyCls = "w-full text-right text-sm font-semibold text-zinc-800 dark:text-zinc-200 tabular-nums py-1.5";

  return (
    <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
      <CardContent className="p-0">
        <div className="px-5 pt-4 pb-1">
          <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
            2-Year {tag} Growth Projection
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-zinc-100 dark:border-zinc-800">
                <th className={cn(headerCls, "text-left")}>Current Implied {tag}</th>
                <th className={headerCls}>Year 1 {tag} Growth %</th>
                <th className={headerCls}>Target Year 1 {tag}</th>
                <th className={headerCls}>Year 2 {tag} Growth %</th>
                <th className={headerCls}>Target Year 2 {tag}</th>
                <th className={headerCls}>Abs. 2-Year {tag} Growth %</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                {/* Col 1 — Current Implied EPS/BV (editable) */}
                <td className={cellCls}>
                  <input
                    type="number"
                    className={inputCls}
                    value={state.currentBase}
                    onChange={set("currentBase")}
                    placeholder="—"
                    step="0.01"
                  />
                </td>

                {/* Col 2 — Year 1 Growth % (editable) */}
                <td className={cellCls}>
                  <div className="relative">
                    <input
                      type="number"
                      className={cn(inputCls, "pr-6")}
                      value={state.year1Growth}
                      onChange={set("year1Growth")}
                      placeholder="0"
                      step="0.1"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400 pointer-events-none">%</span>
                  </div>
                </td>

                {/* Col 3 — Target Year 1 EPS (auto-computed) */}
                <td className={cellCls}>
                  <p className={readonlyCls}>{fmt(yr1)}</p>
                </td>

                {/* Col 4 — Year 2 Growth % (editable) */}
                <td className={cellCls}>
                  <div className="relative">
                    <input
                      type="number"
                      className={cn(inputCls, "pr-6")}
                      value={state.year2Growth}
                      onChange={set("year2Growth")}
                      placeholder="0"
                      step="0.1"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400 pointer-events-none">%</span>
                  </div>
                </td>

                {/* Col 5 — Target Year 2 EPS (auto-computed) */}
                <td className={cellCls}>
                  <p className={readonlyCls}>{fmt(yr2)}</p>
                </td>

                {/* Col 6 — Absolute 2-Year Growth % (always auto-computed) */}
                <td className={cellCls}>
                  <p className={cn(
                    readonlyCls,
                    abs2Positive ? "text-emerald-600 dark:text-emerald-400"
                    : abs2Negative ? "text-red-500 dark:text-red-400"
                    : ""
                  )}>
                    {abs2 != null
                      ? `${abs2 >= 0 ? "+" : ""}${fmt(abs2)}%`
                      : "—"}
                  </p>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="px-5 pb-3 pt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
          Target Yr 1 = Current {tag} × (1 + Yr 1 Growth%) · Target Yr 2 = Target Yr 1 × (1 + Yr 2 Growth%) · 2Y Growth = (Target Yr 2 ÷ Current {tag} − 1)
        </p>
      </CardContent>
    </Card>
  );
}
