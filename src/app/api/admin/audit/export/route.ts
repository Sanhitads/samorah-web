import { requireCapability } from "@/lib/auth/requireStaff";
import { getRecentAuditEvents } from "@/services/auditService";

/** GET /api/admin/audit/export — CSV of the (filtered) activity feed. data.export. */
export const runtime = "nodejs";
const esc = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(request: Request) {
  const staff = await requireCapability("data.export");
  if (!staff.ok) return new Response("Forbidden — data.export capability required.", { status: 403 });

  const p = new URL(request.url).searchParams;
  const events = await getRecentAuditEvents({
    limit: 5000,
    entityType: p.get("entity") ?? undefined,
    actorType: p.get("actor") ?? undefined,
    search: p.get("search") ?? undefined,
    since: p.get("since") ? new Date(p.get("since") as string).toISOString() : undefined,
  });

  const header = ["Time", "Entity", "Event", "Order", "Actor", "From", "To", "Notes"];
  const lines = [header.join(",")];
  for (const e of events) {
    lines.push([e.created_at, e.entity_type, e.event, e.orderNumber ?? "", e.actorName ?? e.actor_type, e.previous_state ?? "", e.new_state ?? "", e.notes ?? ""].map(esc).join(","));
  }
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="samorah-activity-${stamp}.csv"` },
  });
}
