"use client";

import { createContext, useContext, useEffect } from "react";
import { useLocalStorageState } from "@/lib/useLocalStorageState";

export type NumPreset = "S" | "M" | "L" | "XL";
export type NumScaleValue = NumPreset | "custom";

export const NUM_PRESET_PX: Record<NumPreset, number> = { S: 14, M: 17, L: 19, XL: 21 };

interface NumScaleState {
  preset: NumScaleValue;
  customPx: number;
  setPreset: (p: NumPreset) => void;
  setCustomPx: (px: number) => void;
}

const LS_KEY = "nifty-num-scale";
const DEFAULT: NumPreset = "M";

type Stored = { preset: NumScaleValue; customPx: number };
const DEFAULT_STORED: Stored = { preset: DEFAULT, customPx: NUM_PRESET_PX[DEFAULT] };
function parseStored(raw: string): Stored {
  const { preset: p, customPx: c } = JSON.parse(raw);
  return { preset: p || DEFAULT, customPx: typeof c === "number" ? c : NUM_PRESET_PX[DEFAULT] };
}
const serializeStored = (s: Stored) => JSON.stringify(s);

const NumScaleContext = createContext<NumScaleState>({
  preset: DEFAULT,
  customPx: NUM_PRESET_PX[DEFAULT],
  setPreset: () => {},
  setCustomPx: () => {},
});

export function NumScaleProvider({ children }: { children: React.ReactNode }) {
  const [{ preset, customPx }, setStored] = useLocalStorageState(LS_KEY, DEFAULT_STORED, parseStored, serializeStored);

  useEffect(() => {
    const el = document.documentElement;
    if (preset === "M") {
      el.removeAttribute("data-num-scale");
      el.style.removeProperty("--num-px-base");
      el.style.removeProperty("--num-px-sm");
      el.style.removeProperty("--num-px-xs");
    } else if (preset === "custom") {
      const base = customPx;
      el.setAttribute("data-num-scale", "custom");
      el.style.setProperty("--num-px-base", `${base}px`);
      el.style.setProperty("--num-px-sm",   `${base - 2}px`);
      el.style.setProperty("--num-px-xs",   `${base - 4}px`);
    } else {
      el.setAttribute("data-num-scale", preset);
      el.style.removeProperty("--num-px-base");
      el.style.removeProperty("--num-px-sm");
      el.style.removeProperty("--num-px-xs");
    }
  }, [preset, customPx]);

  function setPreset(p: NumPreset) { setStored((prev) => ({ ...prev, preset: p })); }
  function setCustomPx(px: number) {
    const clamped = Math.min(28, Math.max(10, Math.round(px)));
    setStored({ preset: "custom", customPx: clamped });
  }

  return (
    <NumScaleContext.Provider value={{ preset, customPx, setPreset, setCustomPx }}>
      {children}
    </NumScaleContext.Provider>
  );
}

export const useNumScale = () => useContext(NumScaleContext);
