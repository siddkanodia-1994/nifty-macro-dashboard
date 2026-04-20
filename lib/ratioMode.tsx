"use client";

import { createContext, useContext, useState } from "react";

export type RatioMode = "TTM" | "FWD";

const RatioModeContext = createContext<{ ratioMode: RatioMode; setRatioMode: (m: RatioMode) => void }>({
  ratioMode: "TTM",
  setRatioMode: () => {},
});

export function RatioModeProvider({ children }: { children: React.ReactNode }) {
  const [ratioMode, setRatioMode] = useState<RatioMode>("TTM");
  return (
    <RatioModeContext.Provider value={{ ratioMode, setRatioMode }}>
      {children}
    </RatioModeContext.Provider>
  );
}

export const useRatioMode = () => useContext(RatioModeContext);
