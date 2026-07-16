import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/requireStaff";
import { notifyOps } from "@/lib/notifications/opsEngine";
import { TEST_PRESETS, type OpsChannelKey } from "@/config/notifications";
import type { OpsPayload } from "@/lib/notifications/opsTypes";

/**
 * POST /api/admin/notifications/test — fire a REALISTIC sample per preset so each event's actual
 * formatting/routing is exercised end-to-end (not a generic "test" blob). Staff-gated. Returns
 * per-channel results so misconfiguration is visible immediately. Tagged entityType="test" so the
 * retention policy expires it in 30 days rather than polluting the operational history.
 */
export const runtime = "nodejs";

const base = () => process.env.NEXT_PUBLIC_SITE_URL || "";

/** Real-shaped payloads matching each event's production formatting. */
const PRESET_PAYLOAD: Record<string, OpsPayload> = {
  new_order: {
    title: "New Order", message: "A new order was placed.",
    fields: [
      { label: "Order", value: "SAM-2026-000234" }, { label: "Customer", value: "Ananya Sharma" },
      { label: "Amount", value: "₹1,299" }, { label: "Payment", value: "Captured" },
      { label: "Items", value: "Wild Majesty Candle" }, { label: "Shiprocket", value: "Pending" },
    ],
    url: base() ? `${base()}/admin/orders/SAM-2026-000234` : undefined,
    entityType: "test", entityRef: "SAM-2026-000234",
  },
  payment_failure: {
    title: "Payment Failure", message: "A payment could not be captured and needs review.",
    fields: [
      { label: "Order", value: "SAM-2026-000221" }, { label: "Reason", value: "Signature verification failed" },
      { label: "Gateway", value: "Razorpay" }, { label: "Retry Count", value: "2" }, { label: "Status", value: "Needs Review" },
    ],
    url: base() ? `${base()}/admin/orders/SAM-2026-000221` : undefined,
    entityType: "test", entityRef: "SAM-2026-000221",
  },
  critical_incident: {
    title: "Payment Gateway Down", message: "URGENT: the payment system has failed. Orders cannot be processed. Open Admin immediately.",
    fields: [
      { label: "Gateway", value: "Razorpay" }, { label: "Failed Payments", value: "14 in 5 min" },
      { label: "Incident", value: "INC-00042" }, { label: "Status", value: "Open" },
    ],
    url: base() ? `${base()}/admin/incidents` : undefined,
    entityType: "test", entityRef: "INC-00042",
  },
  inventory_alert: {
    title: "Stock Running Low",
    fields: [
      { label: "Product", value: "Wild Majesty Candle" }, { label: "Remaining", value: "7 units" },
      { label: "Threshold", value: "10 units" }, { label: "Supplier ETA", value: "Unknown" },
    ],
    url: base() ? `${base()}/admin/inventory` : undefined,
    entityType: "test", entityRef: "WILD-MAJESTY-200",
  },
};

export async function POST(request: Request) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let b: { preset?: string; channels?: OpsChannelKey[] } = {};
  try { b = await request.json(); } catch { /* defaults */ }

  const preset = TEST_PRESETS.find((p) => p.id === b.preset) ?? TEST_PRESETS[0];
  const payload = PRESET_PAYLOAD[preset.id];
  if (!payload) return NextResponse.json({ error: "Unknown preset." }, { status: 400 });

  // Use the event's real route unless the caller pins specific channels.
  const { results, groupId } = await notifyOps(preset.event, { ...payload, severity: preset.severity }, b.channels?.length ? { channels: b.channels } : undefined);
  return NextResponse.json({ ok: true, preset: preset.id, event: preset.event, groupId, results });
}
