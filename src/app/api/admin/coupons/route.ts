import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { createCoupon, updateCoupon, toggleCoupon, deleteCoupon, setCouponStatus, duplicateCoupon, listCouponAudit, restoreRedemption, savePromoBanner, type CouponInput, type PromoBanner } from "@/services/couponAdminService";

/** POST /api/admin/coupons { action, ... } — coupon CRUD. Merchandising → catalog.manage. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("catalog.manage");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — you lack the catalog.manage capability." }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const a = staff.userId ?? undefined;
  try {
    switch (body.action) {
      case "create": return NextResponse.json(await createCoupon(body.coupon as CouponInput, a));
      case "update":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await updateCoupon(body.id, body.coupon as CouponInput, a));
      case "toggle":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await toggleCoupon(body.id, Boolean(body.isActive), a));
      case "delete":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await deleteCoupon(body.id, a));
      case "activate": // runs strict activation validation
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await setCouponStatus(body.id, "active", a));
      case "pause":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await setCouponStatus(body.id, "paused", a));
      case "archive":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await setCouponStatus(body.id, "archived", a));
      case "restore": // archived → draft (review before relaunch)
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await setCouponStatus(body.id, "draft", a));
      case "duplicate":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await duplicateCoupon(body.id, String(body.code ?? ""), a));
      case "audit":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json({ ok: true, entries: await listCouponAudit(body.id) });
      case "restore-redemption":
        if (!body.orderId) return NextResponse.json({ error: "orderId required" }, { status: 400 });
        return NextResponse.json(await restoreRedemption(body.orderId, String(body.reason ?? ""), a));
      case "save-banner":
        return NextResponse.json(await savePromoBanner(body.banner as PromoBanner, a));
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
