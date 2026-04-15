import { formatDate } from "@/lib/utils";
import { BarChart3, Calendar } from "lucide-react";

interface DashboardHeaderProps {
  dataAsOf: string; // ISO date of last row in historical.json
}

export function DashboardHeader({ dataAsOf }: DashboardHeaderProps) {
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
            <p className="text-xs text-zinc-500 leading-tight hidden sm:block">
              NSE India Index Valuations
            </p>
          </div>
        </div>

        {/* Data freshness badge */}
        <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-1.5">
          <Calendar className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
          <span className="text-xs text-zinc-600">
            <span className="text-zinc-400 mr-1 hidden sm:inline">Data as of</span>
            <span className="font-medium">{formatDate(dataAsOf)}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
