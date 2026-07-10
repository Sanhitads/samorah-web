import { requireCapability } from "@/lib/auth/requireStaff";
import { getOrdersOverview, type OrderFilter } from "@/services/orderAdminService";

/**
 * GET /api/admin/orders/export?search&status&payment — CSV of the (filtered) order
 * list. Contains customer PII → gated on data.export (manager+).
 */
export const runtime = "nodejs";

const esc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(request: Request) {
  const staff = await requireCapability("data.export");
  if (!staff.ok) return new Response("Forbidden — data.export capability required.", { status: 403 });

  const url = new URL(request.url);
  const filter: OrderFilter = {
    search: url.searchParams.get("search") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    payment: url.searchParams.get("payment") ?? undefined,
    limit: 5000,
  };
  const rows = await getOrdersOverview(filter);

  const header = ["Order", "Placed", "Customer", "Email", "Status", "Payment", "COD", "Gift", "GST invoice", "Tags", "Total", "Refunded"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      r.orderNumber, r.placedAt, r.customerName, r.email, r.status, r.paymentStatus,
      r.isCod ? "yes" : "", r.isGift ? "yes" : "", r.hasGstin ? "yes" : "", r.tags.join("; "),
      r.total.toFixed(2), r.refundAmount ? r.refundAmount.toFixed(2) : "",
    ].map(esc).join(","));
  }
  const csv = lines.join("\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="samorah-orders-${stamp}.csv"`,
    },
  });
}
