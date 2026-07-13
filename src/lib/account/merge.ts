/**
 * Cross-device state merge (review points 3 + 12.4). Used on BOTH the client (sign-in
 * merge of guest ⊕ server) and the server (each POST merges incoming ⊕ stored, so two
 * devices writing concurrently CONVERGE instead of clobbering — optimistic concurrency
 * without version conflicts).
 *
 * Strategy: union by identity, LAST-WRITE-WINS per line via `updatedAt`. This respects
 * the most recent edit — if a device intentionally lowered a quantity, its newer line
 * wins over another device's older, higher quantity (MAX would wrongly keep the higher).
 * Ties fall back to the higher quantity for determinism.
 *
 * Known limitation: without tombstones, a line fully removed on one device can be
 * re-added from another device that still holds it (deletion doesn't propagate). Quantity
 * edits — the common case — are handled correctly. Tombstones are a documented follow-up.
 */

export interface CartLine { key: string; qty: number; updatedAt?: number; [k: string]: unknown }
export interface WishEntry { productId: string; updatedAt?: number; [k: string]: unknown }

function newer<T extends { updatedAt?: number; qty?: number }>(a: T, b: T): T {
  const ta = a.updatedAt ?? 0, tb = b.updatedAt ?? 0;
  if (ta !== tb) return ta > tb ? a : b;
  return (a.qty ?? 0) >= (b.qty ?? 0) ? a : b; // deterministic tie-break
}

export function mergeCart(a: CartLine[], b: CartLine[]): CartLine[] {
  const map = new Map<string, CartLine>();
  for (const it of [...(a ?? []), ...(b ?? [])]) {
    if (!it?.key) continue;
    const prev = map.get(it.key);
    map.set(it.key, prev ? newer(it, prev) : it);
  }
  return [...map.values()];
}

export function mergeWishlist(a: WishEntry[], b: WishEntry[]): WishEntry[] {
  const map = new Map<string, WishEntry>();
  for (const it of [...(a ?? []), ...(b ?? [])]) {
    if (!it?.productId) continue;
    const prev = map.get(it.productId);
    map.set(it.productId, prev ? newer(it, prev) : it);
  }
  return [...map.values()];
}

// ── Validation (review point 12.2) — reject oversized / malformed sync payloads ──
export const MAX_CART_LINES = 100;
export const MAX_WISHLIST = 300;
export const MAX_PAYLOAD_BYTES = 256 * 1024; // 256 KB

export function sanitizeCart(v: unknown): CartLine[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is CartLine => !!x && typeof x === "object" && typeof (x as any).key === "string") // eslint-disable-line @typescript-eslint/no-explicit-any
    .slice(0, MAX_CART_LINES)
    .map((x) => ({ ...x, qty: Math.max(0, Math.min(999, Number((x as any).qty) || 0)) })); // eslint-disable-line @typescript-eslint/no-explicit-any
}

export function sanitizeWishlist(v: unknown): WishEntry[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is WishEntry => !!x && typeof x === "object" && typeof (x as any).productId === "string") // eslint-disable-line @typescript-eslint/no-explicit-any
    .slice(0, MAX_WISHLIST);
}

/** True when the JSON size is within the accepted limit. */
export function withinSize(payload: unknown): boolean {
  try { return JSON.stringify(payload ?? "").length <= MAX_PAYLOAD_BYTES; } catch { return false; }
}
