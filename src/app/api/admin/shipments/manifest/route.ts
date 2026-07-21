import { requireStaff } from "@/lib/auth/requireStaff";
import { getShipmentsQueue } from "@/services/shipmentService";
import { shipmentStatusLabel } from "@/lib/shipment/display";

/**
 * GET /api/admin/shipments/manifest?ids=a,b,c — dispatch manifest / CSV export (review priority
 * 2.13). Returns the selected shipments (or all) as a CSV the finance/dispatch team can hand to a
 * courier or reconcile against. Read-only; opens as a download. Staff (editor+).
 */
export const runtime = "nodejs";

const csv = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(request: Request) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return new Response("Forbidden", { status: 403 });

  const idsParam = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const ids = new Set(idsParam);
  const all = await getShipmentsQueue({ limit: 5000 });
  const rows = ids.size ? all.filter((r) => ids.has(r.id)) : all;

  const header = ["Order", "Customer", "Phone", "Provider", "Courier", "AWB", "Status", "Payment", "Weight (kg)", "Shipping ₹", "Total ₹", "Health", "SLA", "Created", "Delivered"];
  const lines = rows.map((r) => [
    r.orderNumber, r.customerName ?? "", r.phone ?? "", r.provider, r.courierName ?? "", r.awb ?? "",
    shipmentStatusLabel(r.status), r.isCod ? "COD" : "Prepaid",
    r.chargeableWeightKg ?? "", r.shippingCost ?? "", r.totalCost ?? "",
    r.health.label, r.sla.label,
    r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : "",
    r.deliveredAt ? new Date(r.deliveredAt).toISOString().slice(0, 10) : "",
  ].map(csv).join(","));

  const body = [header.join(","), ...lines].join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shipment-manifest-${stamp}.csv"`,
    },
  });
}
