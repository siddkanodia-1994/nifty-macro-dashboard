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
              ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
              : "text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          )}
        >
          {w}
        </button>
      ))}
    </div>
  );
}
