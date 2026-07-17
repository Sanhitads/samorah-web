import { describe, it, expect } from "vitest";
import {
  sortColumn, orderAge, priorityBadge, paymentMethodLabel, opsFlags,
  SAVED_VIEWS, savedViewHref, isViewActive, rangeStart, type OrderFlagInput,
} from "@/lib/admin/orderList";

describe("orders-list vocabulary", () => {
  // ── sort ──
  it("maps every sort key to a concrete column + direction; unknown falls back to newest", () => {
    expect(sortColumn("newest")).toEqual({ column: "created_at", ascending: false });
    expect(sortColumn("oldest")).toEqual({ column: "created_at", ascending: true });
    expect(sortColumn("value_high")).toEqual({ column: "total_amount", ascending: false });
    expect(sortColumn("updated")).toEqual({ column: "updated_at", ascending: false });
    expect(sortColumn("pending")).toEqual({ column: "created_at", ascending: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(sortColumn(undefined as any)).toEqual({ column: "created_at", ascending: false });
  });

  // ── order age (deterministic: now is injected) ──
  it("renders relative age across every bucket", () => {
    const now = Date.parse("2026-07-17T12:00:00Z");
    const ago = (ms: number) => orderAge(new Date(now - ms).toISOString(), now);
    expect(ago(10_000)).toBe("just now");
    expect(ago(5 * 60_000)).toBe("5 min ago");
    expect(ago(60 * 60_000)).toBe("1 hr ago");
    expect(ago(3 * 3_600_000)).toBe("3 hrs ago");
    expect(ago(24 * 3_600_000)).toBe("Yesterday");
    expect(ago(3 * 86_400_000)).toBe("3 days ago");
    expect(ago(14 * 86_400_000)).toBe("2 wks ago");
    expect(ago(60 * 86_400_000)).toBe("2 mo ago");
    expect(ago(800 * 86_400_000)).toBe("2 yrs ago");
  });

  it("order age never throws on a bad date and never goes negative for a future date", () => {
    expect(orderAge("not-a-date")).toBe("");
    const now = Date.parse("2026-07-17T12:00:00Z");
    expect(orderAge(new Date(now + 60_000).toISOString(), now)).toBe("just now"); // clamped at 0
  });

  // ── priority ──
  it("maps priority to operator vocabulary; normal shows no badge", () => {
    expect(priorityBadge("vip")).toEqual({ label: "VIP", b: "vip" });
    expect(priorityBadge("urgent")).toEqual({ label: "Rush", b: "rush" }); // urgent reads as Rush
    expect(priorityBadge("high")).toEqual({ label: "Priority", b: "highp" });
    expect(priorityBadge("normal")).toBeNull();
    expect(priorityBadge(null)).toBeNull();
  });

  // ── payment method ──
  it("labels the instrument, lets COD win, and never invents one", () => {
    expect(paymentMethodLabel("upi", false)).toBe("UPI");
    expect(paymentMethodLabel("card", false)).toBe("Card");
    expect(paymentMethodLabel("anything", true)).toBe("COD"); // COD flag overrides
    expect(paymentMethodLabel("razorpay", false)).toBeNull(); // pre-capture placeholder, not shown
    expect(paymentMethodLabel(null, false)).toBeNull();
  });

  // ── ops flags: only what the data can back, in a stable order ──
  const base: OrderFlagInput = { status: "confirmed", refundAmount: 0, latestRefundStatus: null, isGift: false, tags: [] };
  it("derives flags only from real columns; no incident/fraud fabrication", () => {
    expect(opsFlags(base)).toEqual([]);
    expect(opsFlags({ ...base, status: "cancelled" })).toEqual([{ label: "Cancelled", f: "cancelled" }]);
    expect(opsFlags({ ...base, refundAmount: 200 })).toEqual([{ label: "Refunded", f: "refunded" }]);
    expect(opsFlags({ ...base, latestRefundStatus: "processing" })).toEqual([{ label: "Refunded", f: "refunded" }]);
    expect(opsFlags({ ...base, isGift: true })).toEqual([{ label: "Gift", f: "gift" }]);
    expect(opsFlags({ ...base, tags: ["Wholesale", "Fragile"] })).toEqual([{ label: "Wholesale", f: "wholesale" }]);
    expect(opsFlags({ ...base, status: "rto" })).toEqual([{ label: "RTO", f: "returned" }]);
  });

  it("stacks multiple flags in a deterministic order", () => {
    const flags = opsFlags({ status: "cancelled", refundAmount: 500, latestRefundStatus: null, isGift: true, tags: ["Wholesale"] });
    expect(flags.map((f) => f.f)).toEqual(["cancelled", "refunded", "gift", "wholesale"]);
  });

  // ── saved views ──
  it("saved views are pure param presets with stable, shareable URLs", () => {
    const refund = SAVED_VIEWS.find((v) => v.key === "refund_queue")!;
    expect(savedViewHref(refund)).toBe("/admin/orders?refundQueue=1");
    const vip = SAVED_VIEWS.find((v) => v.key === "vip")!;
    expect(savedViewHref(vip)).toBe("/admin/orders?priority=vip");
  });

  it("marks a view active only when all its params are present in the current query", () => {
    const vip = SAVED_VIEWS.find((v) => v.key === "vip")!;
    expect(isViewActive(vip, { priority: "vip" })).toBe(true);
    expect(isViewActive(vip, { priority: "urgent" })).toBe(false);
    expect(isViewActive(vip, {})).toBe(false);
    const pending = SAVED_VIEWS.find((v) => v.key === "pending_ship")!;
    expect(isViewActive(pending, { awaiting: "1", sort: "pending" })).toBe(true);
    expect(isViewActive(pending, { awaiting: "1" })).toBe(false); // partial ≠ active
  });

  // ── date range ──
  it("resolves range keys to an ISO lower bound; unknown = all-time (null)", () => {
    const now = Date.parse("2026-07-17T12:00:00Z");
    expect(rangeStart("7d", now)).toBe(new Date(now - 7 * 86_400_000).toISOString());
    expect(rangeStart("30d", now)).toBe(new Date(now - 30 * 86_400_000).toISOString());
    expect(rangeStart(undefined, now)).toBeNull();
    // "today" is local midnight — just assert it's within the last 24h and not in the future.
    const today = rangeStart("today", now)!;
    expect(Date.parse(today)).toBeLessThanOrEqual(now);
    expect(now - Date.parse(today)).toBeLessThan(86_400_000);
  });
});
