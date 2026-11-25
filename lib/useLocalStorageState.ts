"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

// Same-tab change notification (the native `storage` event only fires in other tabs).
const LOCAL_EVENT = "nifty-local-storage";

// In-memory overrides so writes still take effect when localStorage is unavailable
// (private mode, quota exceeded). Cleared when another tab writes the key.
const memory = new Map<string, string | null>();

function readRaw(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(key: string, onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== key) return;
    memory.delete(key);
    onChange();
  };
  const onLocal = (e: Event) => {
    if ((e as CustomEvent<string>).detail === key) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(LOCAL_EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(LOCAL_EVENT, onLocal);
  };
}

/**
 * useState-like hook persisted to localStorage under `key`.
 * The server / hydration snapshot is always `defaultValue`, so SSR markup is unchanged;
 * the stored value is picked up right after hydration.
 * `defaultValue`, `parse` and `serialize` should be stable (module-level) references.
 * `parse` may throw or return undefined to fall back to `defaultValue`.
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T,
  parse: (raw: string) => T | undefined,
  serialize: (value: T) => string,
): [T, (next: T | ((prev: T) => T)) => void] {
  // Snapshot is the raw string (a primitive), so it is referentially stable by nature.
  const raw = useSyncExternalStore(
    useCallback((onChange: () => void) => subscribe(key, onChange), [key]),
    () => readRaw(key),
    () => null,
  );

  // Parsed value is cached per raw string.
  const value = useMemo(() => decode(raw, defaultValue, parse), [raw, defaultValue, parse]);

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = decode(readRaw(key), defaultValue, parse);
      const resolved = typeof next === "function" ? (next as (prev: T) => T)(prev) : next;
      const str = serialize(resolved);
      memory.set(key, str);
      try {
        localStorage.setItem(key, str);
        memory.delete(key);
      } catch {}
      window.dispatchEvent(new CustomEvent(LOCAL_EVENT, { detail: key }));
    },
    [key, defaultValue, parse, serialize],
  );

  return [value, setValue];
}

function decode<T>(raw: string | null, defaultValue: T, parse: (raw: string) => T | undefined): T {
  if (raw === null) return defaultValue;
  try {
    return parse(raw) ?? defaultValue;
  } catch {
    return defaultValue;
  }
}
