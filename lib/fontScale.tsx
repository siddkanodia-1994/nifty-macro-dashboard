"use client";

import { createContext, useContext, useEffect } from "react";
import { useLocalStorageState } from "@/lib/useLocalStorageState";

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

type Stored = { preset: FontScaleValue; customPx: number };
const DEFAULT_STORED: Stored = { preset: DEFAULT, customPx: PRESET_PX[DEFAULT] };
function parseStored(raw: string): Stored {
  const { preset: p, customPx: c } = JSON.parse(raw);
  return { preset: p || DEFAULT, customPx: typeof c === "number" ? c : PRESET_PX[DEFAULT] };
}
const serializeStored = (s: Stored) => JSON.stringify(s);

const FontScaleContext = createContext<FontScaleState>({
  preset: DEFAULT,
  customPx: PRESET_PX[DEFAULT],
  setPreset: () => {},
  setCustomPx: () => {},
});

export function FontScaleProvider({ children }: { children: React.ReactNode }) {
  const [{ preset, customPx }, setStored] = useLocalStorageState(LS_KEY, DEFAULT_STORED, parseStored, serializeStored);

  useEffect(() => {
    const px = preset === "custom" ? customPx : PRESET_PX[preset as FontPreset];
    document.documentElement.style.fontSize = `${px}px`;
  }, [preset, customPx]);

  function setPreset(p: FontPreset) { setStored((prev) => ({ ...prev, preset: p })); }
  function setCustomPx(px: number) {
    const clamped = Math.min(28, Math.max(12, Math.round(px)));
    setStored({ preset: "custom", customPx: clamped });
  }

  return (
    <FontScaleContext.Provider value={{ preset, customPx, setPreset, setCustomPx }}>
      {children}
    </FontScaleContext.Provider>
  );
}

export const useFontScale = () => useContext(FontScaleContext);
