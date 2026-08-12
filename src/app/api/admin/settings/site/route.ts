import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { updateSiteSettings, type SiteSettings } from "@/services/siteSettingsService";
import { validateCosts } from "@/lib/settings/costValidation";
import { validateDispatch } from "@/lib/settings/dispatchValidation";
import { validateShipping } from "@/lib/settings/shippingValidation";

/** POST /api/admin/settings/site { patch } — general site settings. shipping.configure. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("shipping.configure");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — shipping.configure required." }, { status: 403 });

  let body: { patch?: Partial<SiteSettings> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.patch || typeof body.patch !== "object") return NextResponse.json({ error: "patch required." }, { status: 400 });

  // Server-side operating-cost validation (defense-in-depth; matches the client's corrective rules).
  if (body.patch.costs) {
    const c = body.patch.costs;
    const errors = validateCosts({
      packagingPerOrder: Number(c.packagingPerOrder),
      shippingCostPerOrder: Number(c.shippingCostPerOrder),
      paymentFeePercent: Number(c.paymentFeePercent),
    });
    if (errors.length) return NextResponse.json({ error: errors[0].message, fieldErrors: errors }, { status: 422 });
  }

  // Server-side dispatch validation (S2A; same corrective rules as the client).
  if (body.patch.dispatch) {
    const d = body.patch.dispatch;
    const errors = validateDispatch({ cutoffTime: String(d.cutoffTime), slaHours: Number(d.slaHours) });
    if (errors.length) return NextResponse.json({ error: errors[0].message, fieldErrors: errors }, { status: 422 });
  }

  // Server-side shipping validation (money-critical threshold; same corrective rules as the client).
  if (body.patch.shipping) {
    const errors = validateShipping({ freeThreshold: Number(body.patch.shipping.freeThreshold) });
    if (errors.length) return NextResponse.json({ error: errors[0].message, fieldErrors: errors }, { status: 422 });
  }

  const result = await updateSiteSettings(body.patch, staff.userId ?? undefined);
  if (!result.ok) return NextResponse.json({ error: result.reason ?? "Could not save." }, { status: 422 });
  return NextResponse.json(result);
}
