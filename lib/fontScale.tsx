"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type FontPreset = "S" | "M" | "L" | "XL";
export type FontScaleValue = FontPreset | "custom";

interface FontScaleState {
  preset: FontScaleValue;
  customPx: number;
  setPreset: (p: FontPreset) => void;
  setCustomPx: (px: number) => void;
}

export const PRESET_PX: Record<FontPreset, number> = { S: 16, M: 18, L: 20, XL: 22 };
const LS_KEY = "nifty-font-scale";
const DEFAULT: FontPreset = "M";

const FontScaleContext = createContext<FontScaleState>({
  preset: DEFAULT,
  customPx: PRESET_PX[DEFAULT],
  setPreset: () => {},
  setCustomPx: () => {},
});

export function FontScaleProvider({ children }: { children: React.ReactNode }) {
  const [preset, setPresetState] = useState<FontScaleValue>(DEFAULT);
  const [customPx, setCustomPxState] = useState(PRESET_PX[DEFAULT]);

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
    const px = preset === "custom" ? customPx : PRESET_PX[preset as FontPreset];
    document.documentElement.style.fontSize = `${px}px`;
    localStorage.setItem(LS_KEY, JSON.stringify({ preset, customPx }));
  }, [preset, customPx]);

  function setPreset(p: FontPreset) { setPresetState(p); }
  function setCustomPx(px: number) {
    const clamped = Math.min(28, Math.max(12, Math.round(px)));
    setCustomPxState(clamped);
    setPresetState("custom");
  }

  return (
    <FontScaleContext.Provider value={{ preset, customPx, setPreset, setCustomPx }}>
      {children}
    </FontScaleContext.Provider>
  );
}

export const useFontScale = () => useContext(FontScaleContext);
