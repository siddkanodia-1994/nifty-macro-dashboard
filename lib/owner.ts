/**
 * Owner mode: the owner opens the site once with ?key=<CRON_SECRET>. The key is
 * moved into this tab's sessionStorage and stripped from the address bar, so it
 * doesn't linger in the URL, history entries or anything shared from the page.
 * Client-only — returns null during server rendering.
 */
const STORAGE_KEY = "nifty-owner-key";

let cached: string | null | undefined;

export function getOwnerKey(): string | null {
  if (cached !== undefined) return cached;
  if (typeof window === "undefined") return null;

  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get("key");
  if (fromUrl) {
    try { sessionStorage.setItem(STORAGE_KEY, fromUrl); } catch {}
    url.searchParams.delete("key");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    cached = fromUrl;
  } else {
    try { cached = sessionStorage.getItem(STORAGE_KEY); } catch { cached = null; }
  }
  return cached;
}
