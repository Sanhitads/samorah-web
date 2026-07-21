import { requireStaff } from "@/lib/auth/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/shipments/labels?ids=a,b — a print sheet of shipping LABELS for the selected
 * shipments (bulk "print labels"). Provider labels (label_url) open as links; a manual dispatch with
 * no provider label instead prints an address + AWB card so the parcel can still go out. Read-only,
 * opens in a new tab, auto-print. Staff (editor+).
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
    .select("id,provider,courier_name,awb,label_url,orders(order_number,ship_full_name,ship_line1,ship_line2,ship_city,ship_state,ship_pincode,ship_phone)")
    .in("id", ids);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cards = ((data ?? []) as any[]).map((s) => {
    const o = Array.isArray(s.orders) ? s.orders[0] : s.orders;
    const addr = [o?.ship_line1, o?.ship_line2, `${o?.ship_city ?? ""} ${o?.ship_state ?? ""} ${o?.ship_pincode ?? ""}`.trim()].filter(Boolean).map(esc).join("<br>");
    const labelLink = s.label_url ? `<a href="${esc(s.label_url)}" target="_blank" rel="noopener">Open provider label ↗</a>` : `<span class="muted">Manual dispatch — no provider label</span>`;
    return `<div class="card">
      <div class="row"><b>${esc(o?.order_number ?? "—")}</b><span>${esc(s.courier_name ?? s.provider)}</span></div>
      <div class="name">${esc(o?.ship_full_name ?? "")}</div>
      <div class="addr">${addr}</div>
      <div class="muted">${esc(o?.ship_phone ?? "")}</div>
      <div class="awb">AWB: <b>${esc(s.awb ?? "—")}</b></div>
      <div class="link">${labelLink}</div>
    </div>`;
  }).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Shipping labels</title>
  <style>
    body{font-family:system-ui,Segoe UI,Arial,sans-serif;margin:20px;color:#1f1a16}
    h1{font-size:16px;margin:0 0 14px}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
    .card{border:1px solid #ccc;border-radius:8px;padding:14px;break-inside:avoid}
    .row{display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px}
    .name{font-weight:600}
    .addr{font-size:13px;margin:4px 0;line-height:1.4}
    .awb{margin-top:8px;font-size:13px}
    .muted{color:#777;font-size:12px}
    .link{margin-top:6px;font-size:12px}
    @media print{.noprint{display:none}}
  </style></head><body>
  <h1>Shipping labels · ${cards ? ids.length : 0} shipment(s)</h1>
  <button class="noprint" onclick="window.print()">Print</button>
  <div class="grid">${cards || "<p>No shipments found.</p>"}</div>
  <script>window.addEventListener("load",()=>setTimeout(()=>window.print(),300));</script>
  </body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
