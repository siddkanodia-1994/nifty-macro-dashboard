"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { INDEX_META } from "@/lib/utils";
import { isMarketOpen } from "@/lib/marketHours";
import type { IndexKey } from "@/lib/types";

interface LivePrices {
  /** Latest quotes, or null when there's nothing fresh (stale feed, or long after close). */
  prices: Partial<Record<IndexKey, number>> | null;
  bondYield: number | null;
  usdInr: number | null;
  /** True only while the market is open AND fresh quotes arrived (drives LIVE badges). */
  marketOpen: boolean;
  asOf: string | null;
}

const EMPTY: LivePrices = { prices: null, bondYield: null, usdInr: null, marketOpen: false, asOf: null };

const LivePricesContext = createContext<LivePrices>(EMPTY);

const POLL_MS = 60_000;

/**
 * Polls /api/live-prices once a minute while the market is open and the tab is
 * visible. Fetches once on mount too, so today's closing quotes (CLO) show after
 * 3:30 PM. Re-checks market hours on every tick, so a page opened before 9:15 AM
 * starts polling at the open and one left open past 3:30 PM stops.
 */
export function LivePricesProvider({ children }: { children: React.ReactNode }) {
  const [live, setLive] = useState<LivePrices>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/live-prices");
        if (!res.ok) return; // network/server error — keep last known state
        const json = await res.json();
        const prices: Partial<Record<IndexKey, number>> = {};
        for (const meta of INDEX_META) {
          const val = json[meta.key];
          if (typeof val === "number") prices[meta.key] = val;
        }
        const anyValid = Object.keys(prices).length > 0;
        if (cancelled) return;
        setLive({
          prices:    anyValid ? prices : null,
          bondYield: anyValid && typeof json.bondYield === "number" ? json.bondYield : null,
          usdInr:    anyValid && typeof json.usdInr === "number" ? json.usdInr : null,
          marketOpen: anyValid && json.marketOpen === true,
          asOf:      typeof json.asOf === "string" ? json.asOf : null,
        });
      } catch {}
    }

    function tick() {
      if (isMarketOpen()) {
        if (document.visibilityState === "visible") load();
      } else {
        setLive((prev) => (prev.marketOpen ? { ...prev, marketOpen: false } : prev));
      }
    }

    load();
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  return <LivePricesContext.Provider value={live}>{children}</LivePricesContext.Provider>;
}

export function useLivePrices(): LivePrices {
  return useContext(LivePricesContext);
}
