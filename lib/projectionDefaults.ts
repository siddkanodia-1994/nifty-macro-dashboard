/**
 * Owner projection defaults from Redis (/api/projection-defaults), fetched once per
 * page load and shared by every panel that needs them. Owner saves call
 * invalidateProjectionDefaults() so the next read picks up the new values.
 */
let pending: Promise<Record<string, unknown> | null> | null = null;

export function fetchProjectionDefaults(): Promise<Record<string, unknown> | null> {
  if (!pending) {
    pending = fetch("/api/projection-defaults", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .catch(() => null);
    // Don't cache a failure — the next caller retries.
    pending.then((data) => { if (data == null) pending = null; });
  }
  return pending;
}

export function invalidateProjectionDefaults(): void {
  pending = null;
}
