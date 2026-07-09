import { NextResponse } from "next/server";
import { mapProviderStatus } from "@/lib/shipping/statusMap";
import { advanceShipment, getShipmentIdByAwb, getShipmentForOrderNumber } from "@/services/shipmentService";
import type { ProviderName } from "@/lib/shipping/types";

/**
 * POST /api/webhooks/shipping/:provider — provider-agnostic courier tracking ingest.
 * A courier POSTs a raw status keyed by AWB (or our order number); we map it onto
 * the unified shipment machine and advance the shipment (source='provider'), which
 * updates the customer timeline and fires delivery.completed on delivery.
 *
 * Auth: a shared secret header (per-provider secrets can layer on later). Unknown
 * statuses and illegal/duplicate transitions are ACKed (200) so couriers don't retry
 * a benign no-op. Manual has no webhook; this is ready for Shiprocket/Delhivery/….
 */
export const runtime = "nodejs";

const VALID_PROVIDERS = new Set<ProviderName>(["manual", "shiprocket", "delhivery", "bluedart", "indiapost"]);

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (!VALID_PROVIDERS.has(provider as ProviderName)) {
    return NextResponse.json({ error: "unknown provider" }, { status: 404 });
  }

  // Shared-secret auth. Absent secret = endpoint disabled (never accept unauthenticated).
  const secret = process.env.SHIPPING_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  if (request.headers.get("x-webhook-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { awb?: string; referenceId?: string; status?: string; description?: string; location?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }
  if (!body.status) return NextResponse.json({ error: "status required" }, { status: 400 });

  const to = mapProviderStatus(provider as ProviderName, body.status);
  if (!to) return NextResponse.json({ ok: true, ignored: `unmapped status "${body.status}"` }); // ack

  // Resolve the shipment by AWB, else by our order number.
  let shipmentId = body.awb ? await getShipmentIdByAwb(body.awb) : null;
  if (!shipmentId && body.referenceId) {
    const found = await getShipmentForOrderNumber(body.referenceId);
    shipmentId = found?.shipment?.id ?? null;
  }
  if (!shipmentId) return NextResponse.json({ error: "shipment not found" }, { status: 404 });

  try {
    await advanceShipment(shipmentId, to, {
      description: body.description,
      location: body.location,
      source: "provider",
    });
    return NextResponse.json({ ok: true, status: to });
  } catch {
    // Illegal/duplicate transition (e.g. a repeated 'delivered') — ack, no retry.
    return NextResponse.json({ ok: true, noop: true });
  }
}
