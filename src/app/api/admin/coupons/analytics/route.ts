import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { listCoupons } from "@/services/couponAdminService";
import { couponAnalyticsSummary, getCouponAnalytics, listContributingOrders } from "@/services/couponAnalyticsService";
import { getCouponWarnings } from "@/services/couponWarningsService";

/**
 * POST /api/admin/coupons/analytics { action, ... } — READ-ONLY coupon analytics.
 *
 * Guarded by `analytics.view`, DELIBERATELY separate from the coupon-config route's `catalog.manage`:
 * a future catalog-only editor must not gain order/customer financial visibility just by managing
 * coupons. All financial aggregation is server-side; the client only renders these canonical numbers.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("analytics.view");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — coupon analytics require the analytics.view capability." }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  try {
    switch (body.action) {
      case "list": {
        // Bulk aggregate (Attributed Revenue + Gross Discount) + operational warnings for the whole list.
        const coupons = await listCoupons();
        const [summary, warnings] = await Promise.all([couponAnalyticsSummary(), getCouponWarnings(coupons)]);
        return NextResponse.json({
          ok: true,
          summary: Object.fromEntries(summary),
          warnings: Object.fromEntries(warnings),
        });
      }
      case "detail":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json({ ok: true, analytics: await getCouponAnalytics(String(body.id)) });
      case "orders":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json({ ok: true, orders: await listContributingOrders(String(body.id)) });
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}
