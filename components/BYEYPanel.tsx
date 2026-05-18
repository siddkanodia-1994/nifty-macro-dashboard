"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/MetricCard";
import { IndexChart } from "@/components/IndexChart";
import { TimeWindowSelector } from "@/components/TimeWindowSelector";
import {
  filterBYEYByWindow,
  computeBYEYControlLines,
  computeBYEYWindowStats,
  buildBYEYChartData,
  buildForwardRatioSeries,
  mean,
  stdDev,
  zScore,
  percentileRank,
} from "@/lib/calculations";
import { formatPct, formatPrice, formatRatio, formatZScore, formatPercentile, formatDate, zScoreColor, cn } from "@/lib/utils";
import { useRatioMode } from "@/lib/ratioMode";
import type { BYEYRow, HistoricalRow, TimeWindow, WindowStats, ControlLines } from "@/lib/types";
import { Eye, EyeOff } from "lucide-react";

type CalcSDOption = "mean" | "+0.25sd" | "+0.5sd" | "+1sd" | "+2sd" | "-0.25sd" | "-0.5sd" | "-1sd" | "-2sd";

const CALC_SD_OPTIONS: { value: CalcSDOption; label: string }[] = [
  { value: "+2sd",    label: "+2 σ"    },
  { value: "+1sd",    label: "+1 σ"    },
  { value: "+0.5sd",  label: "+0.5 σ"  },
  { value: "+0.25sd", label: "+0.25 σ" },
  { value: "mean",    label: "Mean"    },
  { value: "-0.25sd", label: "−0.25 σ" },
  { value: "-0.5sd",  label: "−0.5 σ"  },
  { value: "-1sd",    label: "−1 σ"    },
  { value: "-2sd",    label: "−2 σ"    },
];

function calcSDToSpread(option: CalcSDOption, m: number, sd: number): number {
  switch (option) {
    case "+2sd":    return m + 2 * sd;
    case "+1sd":    return m + sd;
    case "+0.5sd":  return m + 0.5 * sd;
    case "+0.25sd": return m + 0.25 * sd;
    case "mean":    return m;
    case "-0.25sd": return m - 0.25 * sd;
    case "-0.5sd":  return m - 0.5 * sd;
    case "-1sd":    return m - sd;
    case "-2sd":    return m - 2 * sd;
  }
}

const BYEY_CALC_LS_KEY = "nifty-byey-calc";

function buildStats(vals: (number | null)[], current: number | null): WindowStats | null {
  const clean = vals.filter((v): v is number => v != null);
  if (clean.length < 2 || current == null) return null;
  const m   = mean(clean);
  const sd  = stdDev(clean);
  const z   = zScore(current, m, sd);
  const pct = percentileRank(current, clean);
  return { mean: m, sd, current, zScore: z, percentile: pct, min: Math.min(...clean), max: Math.max(...clean), count: clean.length };
}

interface BYEYPanelProps {
  byeyData: BYEYRow[];
  historicalData: HistoricalRow[];  // for lastRow.NIFTY_50.impliedEPS → live PE
  timeWindow: TimeWindow;
  onTimeWindowChange: (w: TimeWindow) => void;
  liveNifty50Close: number | null;
  liveBondYield: number | null;     // decimal (e.g. 0.0687)
  nifty50BaseGrowthPct?: number;    // for forward PE extrapolation
}

export function BYEYPanel({
  byeyData,
  historicalData,
  timeWindow,
  onTimeWindowChange,
  liveNifty50Close,
  liveBondYield,
  nifty50BaseGrowthPct = 0,
}: BYEYPanelProps) {
  const [showControlLines, setShowControlLines] = useState(true);
  const { ratioMode } = useRatioMode();

  // ── Target Price Calculator state ──────────────────────────────────────────
  const [calcSpreadOption, setCalcSpreadOption] = useState<CalcSDOption>("mean");
  const [calcSpreadPct, setCalcSpreadPct] = useState<number | null>(null);
  const [calcBondYieldPct, setCalcBondYieldPct] = useState<number | null>(null);
  const [calcEPS, setCalcEPS] = useState<number | null>(null);
  const [calcOwnerMode, setCalcOwnerMode] = useState(false);
  const [calcSaveStatus, setCalcSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const calcOwnerDefaults = useRef<{ spreadOption: CalcSDOption; bondYieldPct: number | null; eps: number | null } | null>(null);
  const calcCronSecret = useRef<string | null>(null);
  const calcInitialised = useRef(false);
  const calcUserEdited = useRef(false);

  // Last row from BY-EY data (most recent historical point)
  const lastByeyRow = byeyData[byeyData.length - 1] ?? null;

  // Implied EPS from latest historical row for live PE derivation
  const prevImpliedEPS = useMemo(() => {
    if (historicalData.length === 0) return null;
    return historicalData[historicalData.length - 1].NIFTY_50.impliedEPS;
  }, [historicalData]);

  // Forward PE/PB series for NIFTY_50 (FWD mode only)
  const fwdSeries = useMemo(() => {
    if (ratioMode !== "FWD") return null;
    return buildForwardRatioSeries(historicalData, "NIFTY_50", nifty50BaseGrowthPct);
  }, [ratioMode, historicalData, nifty50BaseGrowthPct]);

  // Build date → fwdPE map for efficient lookup
  const fwdPEByDate = useMemo(() => {
    if (!fwdSeries) return null;
    const map = new Map<string, number>();
    for (const r of fwdSeries) {
      if (r.fwdPE != null) map.set(r.date, r.fwdPE);
    }
    return map;
  }, [fwdSeries]);

  // Trailing live values
  const trailingLivePE = liveNifty50Close && prevImpliedEPS
    ? liveNifty50Close / prevImpliedEPS
    : null;

  // Forward live PE: uses extrapolated forward EPS from live close
  const fwdLivePE = liveNifty50Close && prevImpliedEPS
    ? liveNifty50Close / (prevImpliedEPS * (1 + nifty50BaseGrowthPct / 100))
    : null;

  // Last forward PE from series (for non-live current value)
  const lastFwdPE = fwdSeries?.[fwdSeries.length - 1]?.fwdPE ?? null;

  // Effective current PE — forward in FWD mode
  const effectiveLivePE = ratioMode === "FWD"
    ? (fwdLivePE ?? (lastFwdPE != null ? lastFwdPE : trailingLivePE))
    : trailingLivePE;
  const liveEY = effectiveLivePE ? 1 / effectiveLivePE : null;

  // For live spread: use live bond yield when available
  const effectiveLiveBondYield = liveBondYield ?? lastByeyRow?.bondYield ?? null;
  const liveSpread = liveEY != null && effectiveLiveBondYield != null
    ? effectiveLiveBondYield - liveEY
    : null;

  // Current values (live when available, else last historical)
  const currentSpread    = liveSpread    ?? lastByeyRow?.spread    ?? null;
  const currentPE        = effectiveLivePE ?? lastByeyRow?.pe      ?? null;
  const currentBondYield = liveBondYield ?? lastByeyRow?.bondYield ?? null;
  const currentEY        = liveEY        ?? (ratioMode === "FWD" && lastFwdPE ? 1 / lastFwdPE : lastByeyRow?.ey) ?? null;

  const isPELive     = liveNifty50Close != null;
  const isSpreadLive = isPELive && effectiveLiveBondYield != null;

  // Window-filtered data
  const windowRows = useMemo(
    () => filterBYEYByWindow(byeyData, timeWindow),
    [byeyData, timeWindow]
  );

  // FWD mode: compute forward spread values per date in window
  const fwdWindowData = useMemo((): { date: string; value: number }[] | null => {
    if (ratioMode !== "FWD" || !fwdPEByDate) return null;
    return windowRows
      .filter((r) => r.bondYield != null && fwdPEByDate.has(r.date))
      .map((r) => ({
        date: r.date,
        value: (r.bondYield! - 1 / fwdPEByDate.get(r.date)!) * 100,
      }));
  }, [ratioMode, windowRows, fwdPEByDate]);

  // Control lines
  const controlLines = useMemo((): ControlLines | null => {
    if (ratioMode === "FWD" && fwdWindowData && fwdWindowData.length >= 10) {
      const vals = fwdWindowData.map((r) => r.value);
      const m = mean(vals);
      const sd = stdDev(vals);
      return { mean: m, sd1Upper: m + sd, sd1Lower: m - sd, sd2Upper: m + 2 * sd, sd2Lower: m - 2 * sd };
    }
    return computeBYEYControlLines(windowRows);
  }, [ratioMode, fwdWindowData, windowRows]);

  // Spread stats
  const spreadStats = useMemo((): WindowStats | null => {
    if (ratioMode === "FWD" && fwdWindowData && fwdWindowData.length >= 2) {
      const vals = fwdWindowData.map((r) => r.value);
      const cur = currentSpread != null ? currentSpread * 100 : null;
      return buildStats(vals, cur);
    }
    return computeBYEYWindowStats(windowRows, currentSpread);
  }, [ratioMode, fwdWindowData, windowRows, currentSpread]);

  // PE stats
  const peStats = useMemo((): WindowStats | null => {
    if (ratioMode === "FWD" && fwdPEByDate) {
      const vals = windowRows
        .map((r) => fwdPEByDate.get(r.date) ?? null)
        .filter((v): v is number => v != null);
      return buildStats(vals, currentPE);
    }
    return buildStats(windowRows.map((r) => r.pe), currentPE);
  }, [ratioMode, fwdPEByDate, windowRows, currentPE]);

  // Bond yield stats (unchanged)
  const bondYieldStats = useMemo(() => {
    const vals = windowRows.map((r) => (r.bondYield != null ? r.bondYield * 100 : null));
    const cur  = currentBondYield != null ? currentBondYield * 100 : null;
    return buildStats(vals, cur);
  }, [windowRows, currentBondYield]);

  // EY stats
  const eyStats = useMemo((): WindowStats | null => {
    if (ratioMode === "FWD" && fwdPEByDate) {
      const vals = windowRows
        .filter((r) => fwdPEByDate.has(r.date))
        .map((r) => (1 / fwdPEByDate.get(r.date)!) * 100);
      const cur = currentEY != null ? currentEY * 100 : null;
      return buildStats(vals, cur);
    }
    const vals = windowRows.map((r) => (r.ey != null ? r.ey * 100 : null));
    const cur  = currentEY != null ? currentEY * 100 : null;
    return buildStats(vals, cur);
  }, [ratioMode, fwdPEByDate, windowRows, currentEY]);

  // ── Detect owner mode synchronously ────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("key");
    if (key) { calcCronSecret.current = key; setCalcOwnerMode(true); }
  }, []);

  // ── Init: fetch Redis owner defaults, then apply visitor localStorage diff ─
  useEffect(() => {
    async function init() {
      let redisData: Record<string, unknown> | null = null;
      try {
        const res = await fetch("/api/projection-defaults", { cache: "no-store" });
        if (res.ok) redisData = await res.json();
      } catch {}

      const ownerSaved = redisData?.byeyCalc as { spreadOption?: string; bondYieldPct?: number; eps?: number } | null ?? null;
      const ownerOption: CalcSDOption = (ownerSaved?.spreadOption && CALC_SD_OPTIONS.some((o) => o.value === ownerSaved.spreadOption))
        ? ownerSaved.spreadOption as CalcSDOption
        : "mean";
      const ownerBondYield = typeof ownerSaved?.bondYieldPct === "number" ? ownerSaved.bondYieldPct : null;
      const ownerEPS = typeof ownerSaved?.eps === "number" ? ownerSaved.eps : null;

      // Store owner defaults for Reset
      calcOwnerDefaults.current = { spreadOption: ownerOption, bondYieldPct: ownerBondYield, eps: ownerEPS };

      // System fallbacks (when no owner defaults)
      const sysOption: CalcSDOption = "mean";
      const sysBondYield = lastByeyRow?.bondYield != null ? parseFloat((lastByeyRow.bondYield * 100).toFixed(4)) : null;
      const sysEPS = prevImpliedEPS != null ? parseFloat(prevImpliedEPS.toFixed(2)) : null;

      let startOption = ownerSaved ? ownerOption : sysOption;
      let startBondYield = ownerBondYield ?? sysBondYield;
      let startEPS = ownerEPS ?? sysEPS;

      // Visitor: apply localStorage diff on top of owner defaults
      if (!calcCronSecret.current) {
        try {
          const raw = localStorage.getItem(BYEY_CALC_LS_KEY);
          if (raw) {
            const diff = JSON.parse(raw);
            if (diff.spreadOption && CALC_SD_OPTIONS.some((o) => o.value === diff.spreadOption)) startOption = diff.spreadOption;
            if (typeof diff.bondYieldPct === "number") startBondYield = diff.bondYieldPct;
            if (typeof diff.eps === "number") startEPS = diff.eps;
          }
        } catch {}
      }

      setCalcSpreadOption(startOption);
      setCalcBondYieldPct(startBondYield);
      setCalcEPS(startEPS);
      if (spreadStats) {
        setCalcSpreadPct(parseFloat(calcSDToSpread(startOption, spreadStats.mean, spreadStats.sd).toFixed(4)));
      }
      calcInitialised.current = true;
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refill spread when time window changes (spreadStats updates) — skips initial mount
  useEffect(() => {
    if (!calcInitialised.current || !spreadStats) return;
    setCalcSpreadPct(parseFloat(calcSDToSpread(calcSpreadOption, spreadStats.mean, spreadStats.sd).toFixed(4)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spreadStats]);

  // Visitor: persist diff to localStorage when user edits
  useEffect(() => {
    if (!calcInitialised.current || calcOwnerMode || !calcUserEdited.current) return;
    try {
      localStorage.setItem(BYEY_CALC_LS_KEY, JSON.stringify({
        spreadOption: calcSpreadOption,
        bondYieldPct: calcBondYieldPct,
        eps:          calcEPS,
      }));
    } catch {}
  }, [calcSpreadOption, calcBondYieldPct, calcEPS, calcOwnerMode]);

  // Owner: auto-save to Redis with 600ms debounce
  useEffect(() => {
    if (!calcOwnerMode || !calcCronSecret.current) return;
    if (!calcUserEdited.current) return;
    setCalcSaveStatus("saving");
    const id = setTimeout(async () => {
      try {
        const res = await fetch("/api/projection-defaults", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${calcCronSecret.current}`,
          },
          body: JSON.stringify({
            byeyCalc: {
              spreadOption: calcSpreadOption,
              bondYieldPct: calcBondYieldPct,
              eps:          calcEPS,
            },
          }),
        });
        setCalcSaveStatus(res.ok ? "saved" : "error");
      } catch {
        setCalcSaveStatus("error");
      }
    }, 600);
    return () => clearTimeout(id);
  }, [calcSpreadOption, calcBondYieldPct, calcEPS, calcOwnerMode]);

  // Derived calculator values
  const calcEY    = (calcBondYieldPct != null && calcSpreadPct != null) ? calcBondYieldPct - calcSpreadPct : null;
  const calcPE    = (calcEY != null && calcEY > 0) ? 100 / calcEY : null;
  const calcPrice = (calcPE != null && calcEPS != null) ? calcPE * calcEPS : null;

  function handleCalcReset() {
    const d = calcOwnerDefaults.current;
    const resetOption: CalcSDOption = d?.spreadOption ?? "mean";
    const resetBondYield = d?.bondYieldPct ?? (lastByeyRow?.bondYield != null ? parseFloat((lastByeyRow.bondYield * 100).toFixed(4)) : null);
    const resetEPS = d?.eps ?? (prevImpliedEPS != null ? parseFloat(prevImpliedEPS.toFixed(2)) : null);

    setCalcSpreadOption(resetOption);
    setCalcBondYieldPct(resetBondYield);
    setCalcEPS(resetEPS);
    if (spreadStats) {
      setCalcSpreadPct(parseFloat(calcSDToSpread(resetOption, spreadStats.mean, spreadStats.sd).toFixed(4)));
    }
    if (!calcOwnerMode) {
      try { localStorage.removeItem(BYEY_CALC_LS_KEY); } catch {}
      calcUserEdited.current = false;
    }
  }

  // Chart data
  const chartData = useMemo(() => {
    if (ratioMode === "FWD" && fwdWindowData) return fwdWindowData;
    return buildBYEYChartData(windowRows);
  }, [ratioMode, fwdWindowData, windowRows]);

  // Append live spread point to chart
  const liveChartData = useMemo(() => {
    if (liveSpread == null) return chartData;
    const todayISO = new Date().toISOString().slice(0, 10);
    if (chartData.length > 0 && chartData[chartData.length - 1].date === todayISO) {
      return chartData;
    }
    return [...chartData, { date: todayISO, value: liveSpread * 100 }];
  }, [chartData, liveSpread]);

  const spreadFmt = (v: number | null) => formatPct(v);
  const peFmt     = (v: number | null) => formatRatio(v);

  return (
    <div className="space-y-5 pt-2">
      {/* ── Metric cards row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* BY-EY Spread % — full stats */}
        <MetricCard
          label="BY-EY Spread"
          metric="pe"
          stats={spreadStats}
          isLive={isSpreadLive}
          valueFormatter={spreadFmt}
        />

        {/* Nifty 50 P/E */}
        <MetricCard
          label="Nifty 50 P/E"
          metric="pe"
          stats={peStats}
          isLive={isPELive}
          valueFormatter={peFmt}
        />

        {/* India 10Y Bond Yield % — daily EOD value, no LIVE badge */}
        <MetricCard
          label={`India 10Y Yield${lastByeyRow ? ` · ${formatDate(lastByeyRow.date)}` : ""}`}
          metric="pe"
          stats={bondYieldStats}
          isLive={false}
          valueFormatter={spreadFmt}
        />

        {/* Earnings Yield % — live (derived from live PE) */}
        <MetricCard
          label="Earnings Yield"
          metric="pe"
          stats={eyStats}
          isLive={isPELive}
          valueFormatter={spreadFmt}
        />
      </div>

      {/* ── Chart card ── */}
      <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <CardHeader className="px-5 pt-4 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">BY-EY Spread (%)</p>

            <div className="flex items-center gap-3">
              <TimeWindowSelector value={timeWindow} onChange={onTimeWindowChange} />
              <button
                onClick={() => setShowControlLines((v) => !v)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border transition-colors",
                  showControlLines
                    ? "border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
                    : "border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                )}
                title="Toggle control lines (Mean ± 1σ/2σ)"
              >
                {showControlLines ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                Control Lines
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-2 pb-4">
          <IndexChart
            data={liveChartData}
            metric="pe"
            controlLines={controlLines}
            showControlLines={showControlLines}
            valueFormatter={(v) => v.toFixed(2) + "%"}
          />
        </CardContent>
      </Card>

      {/* ── Spread statistics row ── */}
      {spreadStats && (
        <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Spread Statistics — {timeWindow} Window
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 dark:border-zinc-800">
                    {["Metric", "Mean", "Std Dev", "Current", "Z-Score", "Percentile"].map((h) => (
                      <th
                        key={h}
                        className="px-5 py-2 text-left text-xs font-semibold text-zinc-800 dark:text-zinc-300 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/50 transition-colors">
                    <td className="px-5 py-2.5 font-medium text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                      BY-EY Spread
                    </td>
                    <td className="px-5 py-2.5 text-zinc-800 dark:text-zinc-200 tabular-nums">
                      {formatPct(spreadStats.mean)}
                    </td>
                    <td className="px-5 py-2.5 text-zinc-800 dark:text-zinc-200 tabular-nums">
                      {formatPct(spreadStats.sd)}
                    </td>
                    <td className="px-5 py-2.5 font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                      {formatPct(spreadStats.current)}
                    </td>
                    <td className={cn("px-5 py-2.5 font-medium tabular-nums", zScoreColor(spreadStats.zScore))}>
                      {formatZScore(spreadStats.zScore)}
                    </td>
                    <td className="px-5 py-2.5 text-zinc-800 dark:text-zinc-200 tabular-nums">
                      {formatPercentile(spreadStats.percentile)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Target Price Calculator ── */}
      <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            Nifty 50 Target Price Calculator
            {calcOwnerMode && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">● Owner</span>
            )}
            {calcOwnerMode && calcSaveStatus === "saving" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">Saving…</span>
            )}
            {calcOwnerMode && calcSaveStatus === "saved" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">Saved ✓</span>
            )}
            {calcOwnerMode && calcSaveStatus === "error" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400">Save failed ✗</span>
            )}
          </CardTitle>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            EY = Bond Yield − BY-EY Spread · P/E = 1 ÷ EY · Target Price = P/E × EPS
          </p>
        </CardHeader>
        <CardContent className="px-0 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                  {[
                    "BY-EY Spread %",
                    "Bond Yield %",
                    "Earnings Yield %",
                    "Implied P/E",
                    "Nifty EPS",
                    "Target Price",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-2.5 text-left text-xs font-semibold text-zinc-800 dark:text-zinc-300 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/40 transition-colors">
                  {/* BY-EY Target Spread */}
                  <td className="px-5 py-3">
                    <div className="flex flex-col gap-1.5">
                      <select
                        value={calcSpreadOption}
                        onChange={(e) => {
                          calcUserEdited.current = true;
                          const opt = e.target.value as CalcSDOption;
                          setCalcSpreadOption(opt);
                          if (spreadStats) {
                            setCalcSpreadPct(parseFloat(calcSDToSpread(opt, spreadStats.mean, spreadStats.sd).toFixed(4)));
                          }
                        }}
                        className="text-xs border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-600 cursor-pointer"
                      >
                        {CALC_SD_OPTIONS.map(({ value, label }) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.01"
                          value={calcSpreadPct ?? ""}
                          onChange={(e) => { calcUserEdited.current = true; setCalcSpreadPct(parseFloat(e.target.value)); }}
                          className="w-20 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 text-sm tabular-nums text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                        />
                        <span className="text-xs text-zinc-500">%</span>
                      </div>
                      <button
                        onClick={handleCalcReset}
                        className="self-start text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 underline underline-offset-2 transition-colors"
                      >
                        Reset
                      </button>
                    </div>
                  </td>

                  {/* Bond Yield */}
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.01"
                        value={calcBondYieldPct ?? ""}
                        onChange={(e) => { calcUserEdited.current = true; setCalcBondYieldPct(parseFloat(e.target.value)); }}
                        className="w-20 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 text-sm tabular-nums text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                      />
                      <span className="text-xs text-zinc-500">%</span>
                    </div>
                  </td>

                  {/* Earnings Yield — auto */}
                  <td className="px-5 py-3 tabular-nums font-medium text-zinc-800 dark:text-zinc-200">
                    {calcEY != null ? calcEY.toFixed(2) + "%" : "—"}
                  </td>

                  {/* Implied P/E — auto */}
                  <td className="px-5 py-3 tabular-nums font-semibold text-zinc-900 dark:text-zinc-100">
                    {calcPE != null ? formatRatio(calcPE) : "—"}
                  </td>

                  {/* Nifty EPS */}
                  <td className="px-5 py-3">
                    <input
                      type="number"
                      step="1"
                      value={calcEPS ?? ""}
                      onChange={(e) => { calcUserEdited.current = true; setCalcEPS(parseFloat(e.target.value)); }}
                      className="w-24 border border-zinc-200 dark:border-zinc-700 rounded-md px-2 py-1 text-sm tabular-nums text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
                    />
                  </td>

                  {/* Target Price — auto */}
                  <td className="px-5 py-3 tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                    {calcPrice != null ? formatPrice(calcPrice) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
