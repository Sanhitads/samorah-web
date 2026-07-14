import { describe, it, expect } from "vitest";
import {
  mergeCart, mergeWishlist, mergeTombMap, mergeTombstones,
  applyCartTombstones, applyWishTombstones,
  sanitizeCart, sanitizeWishlist, withinSize,
  MAX_CART_LINES, MAX_WISHLIST,
  type CartLine, type WishEntry,
} from "./merge";

const now = 1_700_000_000_000; // fixed "now" for TTL-relative assertions
const cart = (key: string, qty: number, updatedAt?: number): CartLine => ({ key, qty, updatedAt });
const wish = (productId: string, updatedAt?: number): WishEntry => ({ productId, updatedAt });

describe("mergeCart — last-write-wins per line", () => {
  it("keeps the newer line even when its quantity is LOWER (intentional reduction)", () => {
    // device A lowered qty at t=200; device B still holds the old higher qty at t=100.
    const merged = mergeCart([cart("sku-1", 1, 200)], [cart("sku-1", 5, 100)]);
    expect(merged).toEqual([cart("sku-1", 1, 200)]);
  });

  it("unions distinct lines from both devices", () => {
    const merged = mergeCart([cart("a", 1, 100)], [cart("b", 2, 100)]);
    expect(merged.map((l) => l.key).sort()).toEqual(["a", "b"]);
  });

  it("breaks exact-timestamp ties toward the higher quantity (deterministic)", () => {
    const merged = mergeCart([cart("a", 2, 100)], [cart("a", 7, 100)]);
    expect(merged[0].qty).toBe(7);
  });

  it("ignores malformed lines without a key", () => {
    const merged = mergeCart([cart("a", 1, 100), { qty: 3 } as CartLine], []);
    expect(merged).toEqual([cart("a", 1, 100)]);
  });
});

describe("mergeWishlist", () => {
  it("dedupes by productId, newest wins", () => {
    const merged = mergeWishlist([wish("p1", 100)], [wish("p1", 300), wish("p2", 50)]);
    expect(merged.find((w) => w.productId === "p1")?.updatedAt).toBe(300);
    expect(merged.map((w) => w.productId).sort()).toEqual(["p1", "p2"]);
  });
});

describe("tombstones — deletion propagation, revival, and TTL", () => {
  it("drops a line deleted AFTER its last update (deletion propagates across devices)", () => {
    // sku-1 last touched at t=100, then deleted at t=200.
    const items = [cart("sku-1", 2, 100), cart("sku-2", 1, 100)];
    const out = applyCartTombstones(items, { "sku-1": 200 });
    expect(out.map((i) => i.key)).toEqual(["sku-2"]);
  });

  it("REVIVES a line re-added after its deletion (newer updatedAt beats the tombstone)", () => {
    // deleted at t=200, but re-added at t=300 → the re-add wins.
    const items = [cart("sku-1", 1, 300)];
    const out = applyCartTombstones(items, { "sku-1": 200 });
    expect(out).toEqual([cart("sku-1", 1, 300)]);
  });

  it("applies the same rule to wishlist entries", () => {
    const items = [wish("p1", 100), wish("p2", 500)];
    const out = applyWishTombstones(items, { p1: 200, p2: 200 });
    expect(out.map((w) => w.productId)).toEqual(["p2"]); // p1 deleted, p2 re-added later
  });

  it("merges tombstone maps keeping the latest deletion per key", () => {
    // timestamps must be within the 30-day TTL window relative to `now`.
    const t1 = now - 5000, t2 = now - 4000, t3 = now - 3000, t4 = now - 2000;
    const out = mergeTombMap({ a: t1, b: t4 }, { a: t3, c: t2 }, now);
    expect(out).toEqual({ a: t3, b: t4, c: t2 }); // per key: latest of the two wins
  });

  it("prunes tombstones older than the 30-day TTL", () => {
    const stale = now - 31 * 86400000;
    const fresh = now - 1 * 86400000;
    const out = mergeTombMap({ old: stale, recent: fresh }, {}, now);
    expect(out).toEqual({ recent: fresh });
  });

  it("mergeTombstones handles both cart and wish namespaces", () => {
    const ca = now - 5000, wp = now - 4000;
    const out = mergeTombstones({ cart: { a: ca } }, { wish: { p: wp } }, now);
    expect(out).toEqual({ cart: { a: ca }, wish: { p: wp } });
  });
});

describe("sanitize + size guards", () => {
  it("caps cart lines at MAX_CART_LINES and clamps qty to [0,999]", () => {
    const big = Array.from({ length: MAX_CART_LINES + 20 }, (_, i) => cart(`k${i}`, 5));
    expect(sanitizeCart(big)).toHaveLength(MAX_CART_LINES);
    expect(sanitizeCart([cart("a", 100000)])[0].qty).toBe(999);
    expect(sanitizeCart([cart("a", -3)])[0].qty).toBe(0);
  });

  it("caps wishlist at MAX_WISHLIST and drops entries without productId", () => {
    const big = Array.from({ length: MAX_WISHLIST + 5 }, (_, i) => wish(`p${i}`));
    expect(sanitizeWishlist(big)).toHaveLength(MAX_WISHLIST);
    expect(sanitizeWishlist([{ foo: 1 } as unknown as WishEntry])).toHaveLength(0);
  });

  it("returns [] for non-array input", () => {
    expect(sanitizeCart(null)).toEqual([]);
    expect(sanitizeWishlist("nope")).toEqual([]);
  });

  it("withinSize rejects payloads over the byte limit", () => {
    expect(withinSize({ ok: true })).toBe(true);
    expect(withinSize({ blob: "x".repeat(300 * 1024) })).toBe(false);
  });
});
