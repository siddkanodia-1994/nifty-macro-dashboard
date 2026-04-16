"use client";

import { useState, useEffect } from "react";
import { formatDate } from "@/lib/utils";
import { isMarketOpen } from "@/lib/marketHours";
import { BarChart3, Calendar } from "lucide-react";

interface DashboardHeaderProps {
  dataAsOf: string; // ISO date of last row in historical.json
}

export function DashboardHeader({ dataAsOf }: DashboardHeaderProps) {
  const [live, setLive] = useState(false);

  useEffect(() => {
    // Check once on mount, then every minute
    setLive(isMarketOpen());
    const id = setInterval(() => setLive(isMarketOpen()), 60_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur-md">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-zinc-900 flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-zinc-900 leading-tight">
              Nifty Macro Dashboard
            </h1>
            <p className="text-xs text-zinc-700 leading-tight hidden sm:block">
              NSE India Index Valuations
            </p>
          </div>
        </div>

        {/* Right side: LIVE badge + data freshness */}
        <div className="flex items-center gap-2">
          {live && (
            <span className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              LIVE
            </span>
          )}
          <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-1.5">
            <Calendar className="h-3.5 w-3.5 text-zinc-700 flex-shrink-0" />
            <span className="text-xs text-zinc-800">
              <span className="text-zinc-600 mr-1 hidden sm:inline">
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
