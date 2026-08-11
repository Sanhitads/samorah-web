import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { updateSiteSettings, type SiteSettings } from "@/services/siteSettingsService";
import { validateCosts } from "@/lib/settings/costValidation";

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

  const result = await updateSiteSettings(body.patch, staff.userId ?? undefined);
  if (!result.ok) return NextResponse.json({ error: result.reason ?? "Could not save." }, { status: 422 });
  return NextResponse.json(result);
}
