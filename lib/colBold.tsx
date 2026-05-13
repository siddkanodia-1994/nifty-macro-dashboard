"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ColKey = "close" | "current" | "mean" | "sd" | "zscore" | "target" | "upside";

const DEFAULT_BOLD: ColKey[] = ["close", "current", "target", "upside"];
const LS_KEY = "nifty-col-bold-v2";

interface ColBoldState {
  boldCols: Set<ColKey>;
  toggleBold: (col: ColKey) => void;
}

const ColBoldContext = createContext<ColBoldState>({
  boldCols: new Set(DEFAULT_BOLD),
  toggleBold: () => {},
});

export function ColBoldProvider({ children }: { children: React.ReactNode }) {
  const [boldCols, setBoldCols] = useState<Set<ColKey>>(new Set(DEFAULT_BOLD));

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (saved) setBoldCols(new Set(JSON.parse(saved) as ColKey[]));
    } catch {}
  }, []);

  function toggleBold(col: ColKey) {
    setBoldCols(prev => {
      const next = new Set(prev);
      next.has(col) ? next.delete(col) : next.add(col);
      localStorage.setItem(LS_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  return (
    <ColBoldContext.Provider value={{ boldCols, toggleBold }}>
      {children}
    </ColBoldContext.Provider>
  );
}

export const useColBold = () => useContext(ColBoldContext);
