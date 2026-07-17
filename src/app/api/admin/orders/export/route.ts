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
  const p = url.searchParams;
  const numbers = p.get("numbers"); // explicit selection (Export Selected)
  const filter: OrderFilter = {
    search: p.get("search") ?? undefined,
    status: p.get("status") ?? undefined,
    payment: p.get("payment") ?? undefined,
    paymentMethod: p.get("paymentMethod") ?? undefined,
    priority: p.get("priority") ?? undefined,
    courier: p.get("courier") ?? undefined,
    assignedTo: p.get("assignedTo") ?? undefined,
    tag: p.get("tag") ?? undefined,
    gift: p.get("gift") === "1",
    range: p.get("range") ?? undefined,
    awaiting: p.get("awaiting") === "1",
    refundQueue: p.get("refundQueue") === "1",
    needsAttention: p.get("needsAttention") === "1",
    orderNumbers: numbers ? numbers.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
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
