import { requireStaff } from "@/lib/auth/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/shipments/packing-slips?ids=a,b — a printable packing slip per selected shipment
 * (bulk "generate packing slips"). One slip per parcel: order, ship-to, and the line items to pack.
 * Read-only, opens in a new tab, auto-print. Staff (editor+).
 */
export const runtime = "nodejs";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export async function GET(request: Request) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return new Response("Forbidden", { status: 403 });

  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 200);
  if (!ids.length) return new Response("No shipments selected.", { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db
    .from("shipments")
    .select("id,awb,courier_name,provider,orders(order_number,ship_full_name,ship_line1,ship_line2,ship_city,ship_state,ship_pincode,ship_phone,order_items(product_name,sku,quantity))")
    .in("id", ids);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const slips = ((data ?? []) as any[]).map((s) => {
    const o = Array.isArray(s.orders) ? s.orders[0] : s.orders;
    const addr = [o?.ship_line1, o?.ship_line2, `${o?.ship_city ?? ""} ${o?.ship_state ?? ""} ${o?.ship_pincode ?? ""}`.trim()].filter(Boolean).map(esc).join("<br>");
    const items = ((o?.order_items ?? []) as { product_name: string; sku: string; quantity: number }[])
      .map((it) => `<tr><td>${esc(it.product_name)}</td><td class="mono">${esc(it.sku)}</td><td class="qty">${esc(it.quantity)}</td></tr>`).join("");
    return `<div class="slip">
      <div class="head"><h2>Packing slip</h2><span class="mono">${esc(o?.order_number ?? "—")}</span></div>
      <div class="to"><b>Ship to</b><br>${esc(o?.ship_full_name ?? "")}<br>${addr}<br><span class="muted">${esc(o?.ship_phone ?? "")}</span></div>
      <div class="courier muted">${esc(s.courier_name ?? s.provider)}${s.awb ? ` · AWB ${esc(s.awb)}` : ""}</div>
      <table><thead><tr><th>Item</th><th>SKU</th><th class="qty">Qty</th></tr></thead><tbody>${items || `<tr><td colspan="3" class="muted">No items</td></tr>`}</tbody></table>
    </div>`;
  }).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Packing slips</title>
  <style>
    body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:20px;color:#1f1a16}
    .slip{border:1px solid #ccc;border-radius:8px;padding:18px;margin-bottom:16px;break-inside:avoid;page-break-after:always}
    .head{display:flex;justify-content:space-between;align-items:baseline}
    h2{font-size:15px;margin:0}
    .to{margin:10px 0;font-size:13px;line-height:1.5}
    .courier{margin-bottom:10px;font-size:12px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #eee}
    .qty{text-align:center}
    .mono{font-family:ui-monospace,monospace}
    .muted{color:#777}
    @media print{.noprint{display:none}}
  </style></head><body>
  <button class="noprint" onclick="window.print()">Print</button>
  ${slips || "<p>No shipments found.</p>"}
  <script>window.addEventListener("load",()=>setTimeout(()=>window.print(),300));</script>
  </body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
