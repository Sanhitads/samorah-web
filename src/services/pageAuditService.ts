/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Homepage audit timeline (Phase 8 · point 35) — every composed-page change records who / what / when /
 * previous → new. Built on the existing immutable `audit_events` stream: `recordPageEdit` logs a
 * `page.edited` event with a field-level diff (in metadata), and `getPageAudit` reads the page's events
 * back with actor names resolved. Values are capped so a big rich-text field can't bloat the log.
 */
import { logEvent } from "@/services/auditService";
import { createAdminClient } from "@/lib/supabase/admin";
import { diffSections, summarizeChanges, type SectionChange } from "@/lib/cms/sectionDiff";

type Sec = { id: string; type: string; enabled?: boolean; settings?: Record<string, unknown> };

const capVal = (v: unknown): string => {
  let s: string;
  try { s = typeof v === "string" ? v : v === undefined ? "—" : JSON.stringify(v); } catch { s = String(v); }
  return s.length > 160 ? `${s.slice(0, 160)}…` : s;
};
function capChanges(changes: SectionChange[]) {
  return changes.slice(0, 30).map((c) => ({ sectionType: c.sectionType, kind: c.kind, fields: c.fields.slice(0, 20).map((f) => ({ field: f.field, prev: capVal(f.prev), next: capVal(f.next) })) }));
}

/** Log a field-level edit diff for a composed page (no-op when nothing actually changed). */
export async function recordPageEdit(pageKey: string, oldSections: Sec[], newSections: Sec[], actorId?: string): Promise<void> {
  const changes = diffSections(oldSections ?? [], newSections ?? []);
  if (!changes.length) return;
  // page key lives in metadata (audit_events.entity_id is a uuid column, not a text key).
  await logEvent({
    entityType: "settings", event: "page.edited",
    actorType: actorId ? "staff" : "system", actorId,
    notes: summarizeChanges(changes).slice(0, 300),
    metadata: { pageKey, changes: capChanges(changes) },
  });
}

export interface PageAuditChange { sectionType: string; kind: string; fields: { field: string; prev: string; next: string }[] }
export interface PageAuditEntry { id: string; event: string; when: string; actorName: string; summary: string; changes: PageAuditChange[] }

const PAGE_EVENTS = ["page.edited", "page.published", "page.scheduled", "page.published_sections", "page.reset", "page.restored"];

/** The page's audit timeline (newest first) with actor names resolved. Resilient (empty on any error). */
export async function getPageAudit(pageKey: string, limit = 40): Promise<PageAuditEntry[]> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("audit_events").select("*").filter("metadata->>pageKey", "eq", pageKey).in("event", PAGE_EVENTS).order("created_at", { ascending: false }).limit(limit);
    const rows = (data ?? []) as any[];
    const actorIds = [...new Set(rows.map((e) => e.actor_id).filter(Boolean))];
    const nameMap = new Map<string, string>();
    if (actorIds.length) { const { data: us } = await db.from("users").select("id,full_name,email").in("id", actorIds); for (const u of us ?? []) nameMap.set(u.id, u.full_name || u.email || "a colleague"); }
    return rows.map((e) => ({
      id: e.id, event: e.event, when: e.created_at,
      actorName: e.actor_id ? (nameMap.get(e.actor_id) ?? "a colleague") : "System",
      summary: e.notes || e.event,
      changes: Array.isArray(e.metadata?.changes) ? e.metadata.changes : [],
    }));
  } catch { return []; }
}
