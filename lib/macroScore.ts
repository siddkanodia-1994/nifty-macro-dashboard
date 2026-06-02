import type { BYEYRow, HistoricalRow, RubricBand, MacroParamId, MacroScoreData } from "@/lib/types";

export function parseFY(fy: string): { startDate: string; endDate: string } {
  // "FY26" → startDate "2025-04-01", endDate "2026-03-31"
  const num = parseInt(fy.slice(2), 10); // 26
  const endYear = 2000 + num;            // 2026
  const startYear = endYear - 1;         // 2025
  return {
    startDate: `${startYear}-04-01`,
    endDate:   `${endYear}-03-31`,
  };
}

// Finds the last row with date ≤ cutoff that has a non-null impliedEPS
function findLastEPS(rows: HistoricalRow[], cutoff: string): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].date <= cutoff && rows[i].NIFTY_50?.impliedEPS != null) {
      return rows[i].NIFTY_50!.impliedEPS;
    }
  }
  return null;
}

export function computeEPSGrowth(rows: HistoricalRow[], fy: string): number | null {
  const num = parseInt(fy.slice(2), 10);
  const endYear = 2000 + num;
  const thisCutoff = `${endYear - 1}-04-30`;
  const prevCutoff = `${endYear - 2}-04-30`;

  const thisEPS = findLastEPS(rows, thisCutoff);
  const prevEPS = findLastEPS(rows, prevCutoff);

  if (thisEPS == null || prevEPS == null || prevEPS === 0) return null;
  return ((thisEPS - prevEPS) / prevEPS) * 100;
}

export function computeFYBondYield(byeyData: BYEYRow[], fy: string): number | null {
  const { startDate, endDate } = parseFY(fy);
  const vals = byeyData
    .filter((r) => r.date >= startDate && r.date <= endDate && r.bondYield != null)
    .map((r) => r.bondYield as number);
  if (vals.length === 0) return null;
  const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
  return avg * 100; // convert decimal to %
}

export function computeNiftyPEAvg(rows: HistoricalRow[], fy: string): number | null {
  const { startDate, endDate } = parseFY(fy);
  const vals = rows
    .filter((r) => r.date >= startDate && r.date <= endDate && r.NIFTY_50?.pe != null)
    .map((r) => r.NIFTY_50!.pe as number);
  if (vals.length === 0) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}

function findLastClose(rows: HistoricalRow[], cutoff: string): number | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].date <= cutoff && rows[i].NIFTY_50?.close != null) {
      return rows[i].NIFTY_50!.close;
    }
  }
  return null;
}

export function computeNiftyReturn(rows: HistoricalRow[], fy: string): number | null {
  const num = parseInt(fy.slice(2), 10);
  const endYear = 2000 + num;
  const thisEnd = `${endYear}-03-31`;
  const prevEnd = `${endYear - 1}-03-31`;

  const thisClose = findLastClose(rows, thisEnd);
  const prevClose = findLastClose(rows, prevEnd);

  if (thisClose == null || prevClose == null || prevClose === 0) return null;
  return (thisClose / prevClose) - 1;
}

export function applyRubric(value: number, bands: RubricBand[]): number {
  for (const band of bands) {
    if (value <= band.max) return band.score;
  }
  return bands[bands.length - 1]?.score ?? 0;
}

export function computeFinalScore(
  scores: Partial<Record<MacroParamId, number | null>>,
  weightages: Record<MacroParamId, number>
): number | null {
  let weightedSum = 0;
  let totalWeight = 0;
  for (const [param, score] of Object.entries(scores) as [MacroParamId, number | null][]) {
    if (score == null) continue;
    const w = weightages[param] ?? 0;
    weightedSum += score * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return null;
  return weightedSum / totalWeight;
}

// Load & validate from localStorage, falling back to the JSON default
const LS_KEY = "nifty-macro-score-v2";

export function loadMacroScoreData(defaultData: MacroScoreData): MacroScoreData {
  if (typeof window === "undefined") return defaultData;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultData;
    const parsed = JSON.parse(raw) as MacroScoreData;
    if (!parsed?.years || !parsed?.weightages || !parsed?.rubric) return defaultData;
    return parsed;
  } catch {
    return defaultData;
  }
}

export function saveMacroScoreData(data: MacroScoreData): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {}
}

export function resetMacroScoreData(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LS_KEY);
}
