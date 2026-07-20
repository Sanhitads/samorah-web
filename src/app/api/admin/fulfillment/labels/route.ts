import { requireStaff } from "@/lib/auth/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/fulfillment/labels?numbers=SAM-1,SAM-2 — a print sheet of the shipping LABELS that
 * already exist for the selected orders (bulk "print labels, if labels exist"). Read-only; opens in
 * a new tab. Labels are the provider's own files (label_url), so each is a link that opens the
 * printable label; orders without a label yet are listed as pending, never faked. Staff (editor+).
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
  const { data } = await db.from("orders").select("order_number,ship_full_name,shipments(courier_name,awb,label_url)").in("order_number", numbers);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orders = ((data ?? []) as any[]).map((o) => {
    const sh = Array.isArray(o.shipments) ? o.shipments[0] : o.shipments;
    return { orderNumber: o.order_number, customer: o.ship_full_name ?? "", courier: sh?.courier_name ?? null, awb: sh?.awb ?? null, labelUrl: sh?.label_url ?? null };
  });
  const withLabel = orders.filter((o) => o.labelUrl);
  const pending = orders.filter((o) => !o.labelUrl);

  const labelRows = withLabel.map((o) => `
    <tr>
      <td class="mono">${esc(o.orderNumber)}</td>
      <td>${esc(o.customer)}</td>
      <td>${esc(o.courier ?? "—")}</td>
      <td class="mono">${esc(o.awb ?? "—")}</td>
      <td><a href="${esc(o.labelUrl)}" target="_blank" rel="noopener">Open label ↗</a></td>
    </tr>`).join("");

  const pendingNote = pending.length
    ? `<p class="muted">${pending.length} selected order${pending.length === 1 ? " has" : "s have"} no label yet: ${esc(pending.map((o) => o.orderNumber).join(", "))}. Create the shipment first.</p>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Shipping Labels</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; color: #1f1a16; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 2px; } .meta { color: #6b6259; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e7e1d8; }
  th { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: #6b6259; }
  .mono { font-family: ui-monospace, monospace; } .muted { color: #6b6259; font-size: 12px; margin-top: 14px; }
  a { color: #8a6d3b; }
  .noprint button { padding: 6px 14px; font-size: 13px; cursor: pointer; } .noprint { margin-bottom: 16px; }
  @media print { .noprint { display: none; } }
</style></head><body>
  <div class="noprint"><button onclick="window.print()">Print list</button></div>
  <h1>Shipping Labels</h1>
  <div class="meta">${withLabel.length} of ${numbers.length} selected order${numbers.length === 1 ? "" : "s"} have a label</div>
  <table>
    <thead><tr><th>Order</th><th>Customer</th><th>Courier</th><th>AWB</th><th>Label</th></tr></thead>
    <tbody>${labelRows || `<tr><td colspan="5" class="muted">None of the selected orders have a label yet.</td></tr>`}</tbody>
  </table>
  ${pendingNote}
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
