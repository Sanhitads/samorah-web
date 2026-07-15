import { requireStaff } from "@/lib/auth/requireStaff";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIncidentsForExport, type IncidentFilters } from "@/services/incidentService";

/**
 * GET /api/admin/incidents/export?format=csv|xls&... — export the filtered incident list.
 * CSV (text/csv) and Excel (an HTML table Excel opens natively — dependency-free). PDF is
 * produced client-side via the browser print dialog. Staff-gated.
 */
export const runtime = "nodejs";

const COLS = ["Number", "Title", "Category", "Severity", "Status", "Team", "Owner", "Assignee", "Affected Orders", "Affected Notifications", "Root Cause", "Started", "Last Activity", "Resolved"];
const cell = (s: unknown) => (s == null ? "" : String(s));

export async function GET(request: Request) {
  const staff = await requireStaff("editor");
  if (!staff.ok) return new Response("Forbidden", { status: 403 });

  const url = new URL(request.url);
  const p = url.searchParams;
  // Same param names the list page (IncidentFilterBar) puts in the URL, so "export" honours the
  // exact filter set the user is looking at. "mine" resolves to the current staff member's name.
  let assigned = p.get("assigned") || undefined;
  if (assigned === "mine") {
    try { const db = createAdminClient() as any; const { data } = await db.from("users").select("full_name").eq("id", staff.userId).maybeSingle(); assigned = data?.full_name ?? undefined; } // eslint-disable-line @typescript-eslint/no-explicit-any
    catch { assigned = undefined; }
  }
  const filters: IncidentFilters = {
    status: p.get("status") || "active", severity: p.get("severity") || undefined, category: p.get("category") || undefined,
    team: p.get("team") || undefined, assigned,
    createdDays: p.get("created") ? Number(p.get("created")) : undefined,
    resolvedToday: p.get("resolved") === "today", q: p.get("q") || undefined,
  };
  const rows = await getIncidentsForExport(filters);
  const data = rows.map((r) => [r.number, r.title, r.categoryLabel, r.severity, r.status, r.team ?? "", r.ownerName ?? "", r.assigneeName ?? "", r.affectedOrders, r.affectedNotifications, r.rootCause ?? "", r.startedAt, r.lastActivityAt, r.resolvedAt ?? ""]);
  const date = new Date().toISOString().slice(0, 10);

  if (p.get("format") === "xls") {
    const esc = (s: unknown) => cell(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><tr>${COLS.map((c) => `<th>${esc(c)}</th>`).join("")}</tr>${data.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
    return new Response(html, { headers: { "Content-Type": "application/vnd.ms-excel", "Content-Disposition": `attachment; filename="incidents-${date}.xls"` } });
  }

  const csv = [COLS, ...data].map((row) => row.map((c) => `"${cell(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  return new Response(csv, { headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="incidents-${date}.csv"` } });
}
