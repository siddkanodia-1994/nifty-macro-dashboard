"use client";

import { useState, useEffect, useRef } from "react";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { useRatioMode } from "@/lib/ratioMode";
import { useFontScale, PRESET_PX, type FontPreset } from "@/lib/fontScale";
import { useFontFamily, FONT_OPTIONS } from "@/lib/fontFamily";
import { useNumScale, NUM_PRESET_PX, type NumPreset } from "@/lib/numScale";
import { useColBold, type ColKey } from "@/lib/colBold";
import { isMarketOpen } from "@/lib/marketHours";
import { BarChart3, Calendar, Moon, Sun } from "lucide-react";

const PRESETS: { key: FontPreset; label: string }[] = [
  { key: "S",  label: "Small"   },
  { key: "M",  label: "Medium"  },
  { key: "L",  label: "Large"   },
  { key: "XL", label: "X-Large" },
];

function FontScaleDropdown() {
  const { preset, customPx, setPreset, setCustomPx } = useFontScale();
  const [open, setOpen] = useState(false);
  const [draftPx, setDraftPx] = useState(String(customPx));
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  // Keep draft in sync when customPx changes externally
  useEffect(() => { setDraftPx(String(customPx)); }, [customPx]);

  function commitCustom(val: string) {
    const n = parseInt(val, 10);
    if (!isNaN(n)) setCustomPx(n);
  }

  const activePx = preset === "custom" ? customPx : PRESET_PX[preset as FontPreset];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 border rounded-lg px-3 py-1.5 transition-colors",
          open
            ? "bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100 text-white dark:text-zinc-900"
            : "bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
        )}
        title="Font size"
      >
        <span className="text-xs font-semibold tracking-tight">Aa</span>
        <span className="text-xs font-medium hidden sm:inline">
          {preset === "custom" ? `${activePx}px` : preset}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-44 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
          {PRESETS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setPreset(key); setOpen(false); }}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 text-xs transition-colors",
                preset === key
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold"
                  : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              )}
            >
              <span>{key} — {label}</span>
              <span className={cn("text-[10px] tabular-nums", preset === key ? "opacity-70" : "text-zinc-400")}>
                {PRESET_PX[key]}px
              </span>
            </button>
          ))}
          <div className="border-t border-zinc-200 dark:border-zinc-700 px-3 py-2 flex items-center gap-2">
            <span className={cn("text-xs", preset === "custom" ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400")}>
              Custom
            </span>
            <input
              type="number"
              min={12}
              max={28}
              value={draftPx}
              onChange={(e) => setDraftPx(e.target.value)}
              onBlur={(e) => commitCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { commitCustom(draftPx); setOpen(false); } }}
              className="w-14 rounded-md border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-1.5 py-0.5 text-xs text-center outline-none focus:border-blue-400 text-zinc-900 dark:text-zinc-100"
            />
            <span className="text-xs text-zinc-400">px</span>
          </div>
        </div>
      )}
    </div>
  );
}

const NUM_PRESETS: { key: NumPreset; label: string }[] = [
  { key: "S",  label: "Small"   },
  { key: "M",  label: "Medium"  },
  { key: "L",  label: "Large"   },
  { key: "XL", label: "X-Large" },
];

function NumScaleDropdown() {
  const { preset, customPx, setPreset, setCustomPx } = useNumScale();
  const [open, setOpen] = useState(false);
  const [draftPx, setDraftPx] = useState(String(customPx));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  useEffect(() => { setDraftPx(String(customPx)); }, [customPx]);

  function commitCustom(val: string) {
    const n = parseInt(val, 10);
    if (!isNaN(n)) setCustomPx(n);
  }

  const activePx = preset === "custom" ? customPx : NUM_PRESET_PX[preset as NumPreset];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 border rounded-lg px-3 py-1.5 transition-colors",
          open
            ? "bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100 text-white dark:text-zinc-900"
            : "bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
        )}
        title="Number font size"
      >
        <span className="text-xs font-semibold tracking-tight">123</span>
        <span className="text-xs font-medium hidden sm:inline">
          {preset === "custom" ? `${activePx}px` : preset}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-44 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
          {NUM_PRESETS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setPreset(key); setOpen(false); }}
              className={cn(
                "w-full flex items-center justify-between px-3 py-2 text-xs transition-colors",
                preset === key
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold"
                  : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              )}
            >
              <span>{key} — {label}</span>
              <span className={cn("text-[10px] tabular-nums", preset === key ? "opacity-70" : "text-zinc-400")}>
                {NUM_PRESET_PX[key]}px
              </span>
            </button>
          ))}
          <div className="border-t border-zinc-200 dark:border-zinc-700 px-3 py-2 flex items-center gap-2">
            <span className={cn("text-xs", preset === "custom" ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400")}>
              Custom
            </span>
            <input
              type="number"
              min={10}
              max={28}
              value={draftPx}
              onChange={(e) => setDraftPx(e.target.value)}
              onBlur={(e) => commitCustom(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { commitCustom(draftPx); setOpen(false); } }}
              className="w-14 rounded-md border border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 px-1.5 py-0.5 text-xs text-center outline-none focus:border-blue-400 text-zinc-900 dark:text-zinc-100"
            />
            <span className="text-xs text-zinc-400">px</span>
          </div>
        </div>
      )}
    </div>
  );
}

const COL_BOLD_OPTIONS: { key: ColKey; label: string }[] = [
  { key: "close",   label: "Day Chg / Close"      },
  { key: "current", label: "Current (PE & PB)"     },
  { key: "mean",    label: "Mean (PE & PB)"         },
  { key: "sd",      label: "SD (PE & PB)"           },
  { key: "zscore",  label: "Z-Score (PE & PB)"      },
  { key: "target",  label: "Target Price (PE & PB)" },
  { key: "upside",  label: "Upside % (PE & PB)"     },
];

function BoldColsDropdown() {
  const { boldCols, toggleBold } = useColBold();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 border rounded-lg px-3 py-1.5 transition-colors",
          open
            ? "bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100 text-white dark:text-zinc-900"
            : "bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
        )}
        title="Bold columns"
      >
        <span className="text-xs font-bold tracking-tight">B</span>
        <span className="text-xs font-medium hidden sm:inline">{boldCols.size}/{COL_BOLD_OPTIONS.length}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-52 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">Bold Columns</span>
          </div>
          {COL_BOLD_OPTIONS.map(({ key, label }) => {
            const active = boldCols.has(key);
            return (
              <button
                key={key}
                onClick={() => toggleBold(key)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs transition-colors text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                <span className={active ? "font-semibold text-zinc-900 dark:text-zinc-100" : ""}>{label}</span>
                <span className={cn(
                  "h-4 w-4 rounded text-[9px] font-bold flex items-center justify-center flex-shrink-0",
                  active
                    ? "bg-zinc-800 dark:bg-zinc-200 text-white dark:text-zinc-900"
                    : "bg-zinc-100 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500"
                )}>B</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FontFamilyDropdown() {
  const { fontFamily, setFontFamily } = useFontFamily();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const activeLabel = FONT_OPTIONS.find((o) => o.key === fontFamily)?.label ?? "Geist";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1 border rounded-lg px-3 py-1.5 transition-colors",
          open
            ? "bg-zinc-900 dark:bg-zinc-100 border-zinc-900 dark:border-zinc-100 text-white dark:text-zinc-900"
            : "bg-zinc-50 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700"
        )}
        title="Font family"
      >
        <span className="text-xs font-semibold hidden sm:inline">{activeLabel}</span>
        <span className="text-[10px] opacity-60">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-36 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
          {FONT_OPTIONS.map(({ key, label, previewStack }) => (
            <button
              key={key}
              onClick={() => { setFontFamily(key); setOpen(false); }}
              style={{ fontFamily: previewStack }}
              className={cn(
                "w-full text-left px-3 py-2.5 text-xs transition-colors",
                fontFamily === key
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold"
                  : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface DashboardHeaderProps {
  dataAsOf: string; // ISO date of last row in historical.json
}

export function DashboardHeader({ dataAsOf }: DashboardHeaderProps) {
  const [live, setLive] = useState(false);
  const [istTime, setIstTime] = useState("");
  const { theme, toggleTheme } = useTheme();
  const { ratioMode, setRatioMode } = useRatioMode();

  function getISTTime() {
    return new Date().toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    });
  }

  useEffect(() => {
    setLive(isMarketOpen());
    setIstTime(getISTTime());
    const marketId = setInterval(() => setLive(isMarketOpen()), 60_000);
    const clockId  = setInterval(() => setIstTime(getISTTime()), 1_000);
    return () => { clearInterval(marketId); clearInterval(clockId); };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 dark:border-zinc-700 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-white dark:text-zinc-900" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-tight">
              Nifty Macro Dashboard
            </h1>
            <p className="text-xs text-zinc-700 dark:text-zinc-400 leading-tight hidden sm:block">
              NSE India Index Valuations
            </p>
          </div>
        </div>

        {/* Right side: TTM/FWD toggle + dark toggle + LIVE badge + data freshness */}
        <div className="flex items-center gap-2">
          {/* TTM / FWD toggle */}
          <div className="flex items-center bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-0.5">
            <button
              onClick={() => setRatioMode("TTM")}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                ratioMode === "TTM"
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
            >
              TTM
            </button>
            <button
              onClick={() => setRatioMode("FWD")}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                ratioMode === "FWD"
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
              )}
            >
              FWD
            </button>
          </div>

          {/* Font size toggle */}
          <FontScaleDropdown />

          {/* Number size toggle */}
          <NumScaleDropdown />

          {/* Bold columns toggle */}
          <BoldColsDropdown />

          {/* Font family toggle */}
          <FontFamilyDropdown />

          {/* Dark mode toggle */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
          >
            {theme === "dark"
              ? <Sun className="h-3.5 w-3.5 text-yellow-400" />
              : <Moon className="h-3.5 w-3.5 text-zinc-600" />}
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 hidden sm:inline">
              {theme === "dark" ? "Light" : "Dark"}
            </span>
          </button>

          {live && (
            <span className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              LIVE
              {istTime && (
                <span className="font-mono font-normal tracking-tight">{istTime}</span>
              )}
            </span>
          )}
          <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-1.5">
            <Calendar className="h-3.5 w-3.5 text-zinc-700 dark:text-zinc-400 flex-shrink-0" />
            <span className="text-xs text-zinc-800 dark:text-zinc-300">
              <span className="text-zinc-600 dark:text-zinc-400 mr-1 hidden sm:inline">
                {live ? "Live as of" : "Data as of"}
              </span>
              <span className="font-medium">
                {live
                  ? formatDate(new Date().toISOString().slice(0, 10))
                  : formatDate(dataAsOf)}
              </span>
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
