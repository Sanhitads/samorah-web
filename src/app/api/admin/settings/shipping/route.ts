import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { updateShippingSettings } from "@/services/settingsService";
import type { ShippingSettings } from "@/lib/settings/shippingSettings";

/** POST /api/admin/settings/shipping { patch } — edit the shipping settings
 *  singleton. Config action → shipping.configure. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("shipping.configure");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — you lack the shipping.configure capability." }, { status: 403 });

  let body: { patch?: Partial<ShippingSettings> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!body.patch || typeof body.patch !== "object") return NextResponse.json({ error: "patch required." }, { status: 400 });

  const result = await updateShippingSettings(body.patch, staff.userId ?? undefined);
  if (!result.ok) return NextResponse.json({ error: result.reason ?? "Could not save." }, { status: 422 });
  return NextResponse.json(result);
}
