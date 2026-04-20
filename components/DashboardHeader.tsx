"use client";

import { useState, useEffect } from "react";
import { formatDate } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { isMarketOpen } from "@/lib/marketHours";
import { BarChart3, Calendar, Moon, Sun } from "lucide-react";

interface DashboardHeaderProps {
  dataAsOf: string; // ISO date of last row in historical.json
}

export function DashboardHeader({ dataAsOf }: DashboardHeaderProps) {
  const [live, setLive] = useState(false);
  const [istTime, setIstTime] = useState("");
  const { theme, toggleTheme } = useTheme();

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

        {/* Right side: dark toggle + LIVE badge + data freshness */}
        <div className="flex items-center gap-2">
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
