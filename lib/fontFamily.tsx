"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type FontFamilyKey = "geist" | "inter" | "arial" | "calibri";

export const FONT_OPTIONS: { key: FontFamilyKey; label: string; stack: string | null; previewStack: string }[] = [
  { key: "geist",   label: "Geist",   stack: null,                                                 previewStack: "var(--font-geist-sans)"              },
  { key: "inter",   label: "Inter",   stack: "var(--font-inter)",                                  previewStack: "var(--font-inter)"                   },
  { key: "arial",   label: "Arial",   stack: '"Arial", "Helvetica Neue", Helvetica, sans-serif',   previewStack: '"Arial", sans-serif'                 },
  { key: "calibri", label: "Calibri", stack: '"Calibri", "Trebuchet MS", "Gill Sans", sans-serif', previewStack: '"Calibri", "Trebuchet MS", sans-serif'},
];

interface FontFamilyState {
  fontFamily: FontFamilyKey;
  setFontFamily: (f: FontFamilyKey) => void;
}

const LS_KEY = "nifty-font-family";
const DEFAULT: FontFamilyKey = "geist";

const FontFamilyContext = createContext<FontFamilyState>({
  fontFamily: DEFAULT,
  setFontFamily: () => {},
});

export function FontFamilyProvider({ children }: { children: React.ReactNode }) {
  const [fontFamily, setFontFamilyState] = useState<FontFamilyKey>(DEFAULT);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY) as FontFamilyKey | null;
      if (saved && FONT_OPTIONS.some((o) => o.key === saved)) setFontFamilyState(saved);
    } catch {}
  }, []);

  useEffect(() => {
    const opt = FONT_OPTIONS.find((o) => o.key === fontFamily);
    const el = document.documentElement;
    if (opt?.stack) {
      el.style.setProperty("--font-sans", opt.stack);
    } else {
      el.style.removeProperty("--font-sans");
    }
    el.setAttribute("data-font", fontFamily);
    localStorage.setItem(LS_KEY, fontFamily);
  }, [fontFamily]);

  function setFontFamily(f: FontFamilyKey) { setFontFamilyState(f); }

  return (
    <FontFamilyContext.Provider value={{ fontFamily, setFontFamily }}>
      {children}
    </FontFamilyContext.Provider>
  );
}

export const useFontFamily = () => useContext(FontFamilyContext);
