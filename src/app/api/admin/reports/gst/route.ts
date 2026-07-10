import { requireCapability } from "@/lib/auth/requireStaff";
import { getReports } from "@/services/reportsService";

/** GET /api/admin/reports/gst?window=30|90|all — CSV GST report by state (filing). data.export. */
export const runtime = "nodejs";
const esc = (v: unknown) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function GET(request: Request) {
  const staff = await requireCapability("data.export");
  if (!staff.ok) return new Response("Forbidden — data.export required.", { status: 403 });

  const w = new URL(request.url).searchParams.get("window");
  const reports = await getReports(w === "all" ? null : Number(w || 30));

  const lines = [["State", "Orders", "Taxable", "CGST", "SGST", "IGST", "Total"].join(",")];
  for (const s of reports.gst.byState) lines.push([s.state, s.orders, s.taxable, s.cgst, s.sgst, s.igst, s.total].map(esc).join(","));
  lines.push(["TOTAL", "", reports.gst.taxable, reports.gst.cgst, reports.gst.sgst, reports.gst.igst, reports.gst.total].map(esc).join(","));

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="samorah-gst-report-${stamp}.csv"` },
  });
}
