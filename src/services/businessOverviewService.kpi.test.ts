import { describe, it, expect, vi, beforeEach } from "vitest";

// unstable_cache → pass-through so the inner reader runs directly under test.
vi.mock("next/cache", () => ({ unstable_cache: (fn: (...a: unknown[]) => unknown) => fn }));

// Controllable analytics RPC.
const rpc = vi.fn();
vi.mock("@/lib/analytics/rpc", () => ({ analyticsRpc: () => ({ rpc }) }));

import { getKpiSnapshot } from "@/services/businessOverviewService";

beforeEach(() => rpc.mockReset());

describe("getKpiSnapshot — resilience (regression: missing analytics_kpi_snapshot_v1 RPC 500'd the whole page)", () => {
  it("degrades to a zeroed, unavailable snapshot when the RPC errors (never throws)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Could not find the function public.analytics_kpi_snapshot_v1(p_window_days) in the schema cache" } });
    const snap = await getKpiSnapshot(30);
    expect(snap.freshness.available).toBe(false);
    expect(snap.revenue.current).toBe(0);
    expect(snap.orders.current).toBe(0);
    expect(snap.avgBasket.current).toBe(0);
    expect(snap.revenueToday).toEqual({ current: 0, previous: 0 });
    expect(snap.windowDays).toBe(30);
  });

  it("maps the RPC row into the snapshot on success (available)", async () => {
    rpc.mockResolvedValue({ data: [{
      cur_orders: 10, cur_revenue: 5000, prev_orders: 8, prev_revenue: 4000,
      today_orders: 2, today_revenue: 900, yday_orders: 1, yday_revenue: 400,
    }], error: null });
    const snap = await getKpiSnapshot(30);
    expect(snap.freshness.available).toBe(true);
    expect(snap.revenue).toEqual({ current: 5000, previous: 4000 });
    expect(snap.orders).toEqual({ current: 10, previous: 8 });
    expect(snap.avgBasket.current).toBe(500); // 5000 / 10
    expect(snap.revenueToday).toEqual({ current: 900, previous: 400 });
  });

  it("treats all-time (null window) previous values as null", async () => {
    rpc.mockResolvedValue({ data: [{ cur_orders: 4, cur_revenue: 2000, prev_orders: 3, prev_revenue: 1500 }], error: null });
    const snap = await getKpiSnapshot(null);
    expect(snap.windowDays).toBeNull();
    expect(snap.revenue.previous).toBeNull();
    expect(snap.orders.previous).toBeNull();
  });
});
