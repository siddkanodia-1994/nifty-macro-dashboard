"use client";

import { cn, TIME_WINDOWS } from "@/lib/utils";
import type { TimeWindow } from "@/lib/types";

interface TimeWindowSelectorProps {
  value: TimeWindow;
  onChange: (w: TimeWindow) => void;
}

export function TimeWindowSelector({ value, onChange }: TimeWindowSelectorProps) {
  return (
    <div className="flex items-center gap-1">
      {TIME_WINDOWS.map((w) => (
        <button
          key={w}
          onClick={() => onChange(w)}
          className={cn(
            "px-3 py-1 rounded-md text-xs font-medium transition-colors",
            value === w
              ? "bg-zinc-900 text-white"
              : "text-zinc-700 hover:text-zinc-900 hover:bg-zinc-100"
          )}
        >
          {w}
        </button>
      ))}
    </div>
  );
}
