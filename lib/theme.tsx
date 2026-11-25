"use client";

import { createContext, useContext, useEffect } from "react";
import { useLocalStorageState } from "@/lib/useLocalStorageState";

type Theme = "light" | "dark";

const LS_KEY = "nifty-theme";
const DEFAULT: Theme = "light";
const parseTheme = (raw: string): Theme => (raw === "dark" ? "dark" : "light");
const serializeTheme = (t: Theme) => t;

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({
  theme: "light",
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useLocalStorageState<Theme>(LS_KEY, DEFAULT, parseTheme, serializeTheme);

  // Sync the DOM class from state
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
