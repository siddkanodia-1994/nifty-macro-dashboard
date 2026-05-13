"use client";

import { createContext, useContext, useEffect, useState } from "react";

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

const NumScaleContext = createContext<NumScaleState>({
  preset: DEFAULT,
  customPx: NUM_PRESET_PX[DEFAULT],
  setPreset: () => {},
  setCustomPx: () => {},
});

export function NumScaleProvider({ children }: { children: React.ReactNode }) {
  const [preset, setPresetState] = useState<NumScaleValue>(DEFAULT);
  const [customPx, setCustomPxState] = useState(NUM_PRESET_PX[DEFAULT]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (!saved) return;
      const { preset: p, customPx: c } = JSON.parse(saved);
      if (p) setPresetState(p);
      if (typeof c === "number") setCustomPxState(c);
    } catch {}
  }, []);

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
    localStorage.setItem(LS_KEY, JSON.stringify({ preset, customPx }));
  }, [preset, customPx]);

  function setPreset(p: NumPreset) { setPresetState(p); }
  function setCustomPx(px: number) {
    const clamped = Math.min(28, Math.max(10, Math.round(px)));
    setCustomPxState(clamped);
    setPresetState("custom");
  }

  return (
    <NumScaleContext.Provider value={{ preset, customPx, setPreset, setCustomPx }}>
      {children}
    </NumScaleContext.Provider>
  );
}

export const useNumScale = () => useContext(NumScaleContext);
