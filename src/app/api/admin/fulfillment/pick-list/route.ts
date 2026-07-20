import { requireStaff } from "@/lib/auth/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/fulfillment/pick-list?numbers=SAM-1,SAM-2 — a print-friendly CONSOLIDATED pick
 * list for the selected orders, grouped by SKU so a picker walks the shelf once per product rather
 * than once per order. Read-only; opens in a new tab and auto-prints. Staff (editor+).
 *
 * NOTE: this groups by SKU (the productivity win the operator asked for). An optimised *walking
 * path* additionally needs bin/rack/shelf locations, which don't exist yet — documented as the
 * Warehouse-Location dependency in the post-launch roadmap.
 */
export const runtime = "nodejs";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export async function GET(request: Request) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return new Response("Forbidden", { status: 403 });

  const numbers = (new URL(request.url).searchParams.get("numbers") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
  if (!numbers.length) return new Response("No orders selected.", { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("orders").select("order_number,order_items(sku,product_name,variant_name,quantity)").in("order_number", numbers);

  // Consolidate by SKU: total units + the orders each unit belongs to.
  type PickLine = { sku: string; name: string; variant: string | null; total: number; orders: { orderNumber: string; qty: number }[] };
  const bySku = new Map<string, PickLine>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const o of (data ?? []) as any[]) {
    for (const it of o.order_items ?? []) {
      const key = (it.sku || it.product_name) as string;
      const e: PickLine = bySku.get(key) ?? { sku: it.sku ?? "", name: it.product_name ?? "", variant: it.variant_name ?? null, total: 0, orders: [] };
      e.total += it.quantity ?? 0;
      e.orders.push({ orderNumber: o.order_number, qty: it.quantity ?? 0 });
      bySku.set(key, e);
    }
  }
  const lines = [...bySku.values()].sort((a, b) => a.sku.localeCompare(b.sku));
  const totalUnits = lines.reduce((s, l) => s + l.total, 0);

  const rows = lines.map((l) => `
    <tr>
      <td class="chk">☐</td>
      <td class="sku">${esc(l.sku)}</td>
      <td>${esc(l.name)}${l.variant ? ` <span class="muted">· ${esc(l.variant)}</span>` : ""}</td>
      <td class="qty">${l.total}</td>
      <td class="muted">${esc(l.orders.map((o) => `${o.orderNumber}×${o.qty}`).join(", "))}</td>
    </tr>`).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Pick List</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; color: #1f1a16; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; } .meta { color: #6b6259; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e7e1d8; }
  th { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #6b6259; }
  .chk { width: 24px; font-size: 16px; } .sku { font-family: ui-monospace, monospace; } .qty { text-align: right; font-weight: 600; width: 60px; }
  .muted { color: #6b6259; font-size: 11px; }
  @media print { .noprint { display: none; } body { margin: 0; } }
  .noprint { margin-bottom: 16px; } button { padding: 6px 14px; font-size: 13px; cursor: pointer; }
</style></head><body>
  <div class="noprint"><button onclick="window.print()">Print</button></div>
  <h1>Pick List</h1>
  <div class="meta">${numbers.length} order${numbers.length === 1 ? "" : "s"} · ${lines.length} SKU${lines.length === 1 ? "" : "s"} · ${totalUnits} unit${totalUnits === 1 ? "" : "s"}</div>
  <table>
    <thead><tr><th></th><th>SKU</th><th>Product</th><th>Qty</th><th>Orders</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5" class="muted">No items found for the selected orders.</td></tr>`}</tbody>
  </table>
  <script>window.addEventListener("load", function(){ setTimeout(function(){ window.print(); }, 300); });</script>
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
