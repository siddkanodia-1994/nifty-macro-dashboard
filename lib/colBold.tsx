"use client";

import { createContext, useContext } from "react";
import { useLocalStorageState } from "@/lib/useLocalStorageState";

export type ColKey = "close" | "current" | "mean" | "sd" | "zscore" | "target" | "upside";

const DEFAULT_BOLD: ColKey[] = ["close", "current", "target", "upside"];
const LS_KEY = "nifty-col-bold-v2";
const DEFAULT_SET = new Set(DEFAULT_BOLD);
const parseBold = (raw: string) => new Set(JSON.parse(raw) as ColKey[]);
const serializeBold = (cols: Set<ColKey>) => JSON.stringify([...cols]);

interface ColBoldState {
  boldCols: Set<ColKey>;
  toggleBold: (col: ColKey) => void;
}

const ColBoldContext = createContext<ColBoldState>({
  boldCols: new Set(DEFAULT_BOLD),
  toggleBold: () => {},
});

export function ColBoldProvider({ children }: { children: React.ReactNode }) {
  const [boldCols, setBoldCols] = useLocalStorageState(LS_KEY, DEFAULT_SET, parseBold, serializeBold);

  function toggleBold(col: ColKey) {
    setBoldCols(prev => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
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
