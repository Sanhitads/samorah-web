/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Customer-enquiry service — stores messages from the /contact form and powers the admin
 * "Customer Enquiries" module (list · detail · status workflow · assignment · internal notes).
 * Mirrors returnService: service-role reads/writes, a typed status machine, an events timeline,
 * and audit logging. NO outbound email (reply-by-email is a future phase) — enquiries are stored.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { emitNotification } from "@/services/notificationCenterService";
import { assertEnquiryTransition, ENQUIRY_STATUS_LABEL, type EnquiryStatus } from "@/lib/enquiries/state";

export interface EnquiryRow {
  id: string; number: string; status: EnquiryStatus;
  firstName: string; lastName: string | null; email: string; phone: string | null;
  subject: string; orderNumber: string | null; message: string; consent: boolean;
  assigneeId: string | null; assigneeName: string | null; adminNotes: string | null;
  source: string; createdAt: string; updatedAt: string;
}
export interface EnquiryEvent { id: string; kind: string; detail: string | null; actorName: string | null; createdAt: string }

function mapRow(d: any): EnquiryRow {
  return {
    id: d.id, number: d.number, status: d.status,
    firstName: d.first_name, lastName: d.last_name ?? null, email: d.email, phone: d.phone ?? null,
    subject: d.subject, orderNumber: d.order_number ?? null, message: d.message, consent: !!d.consent,
    assigneeId: d.assignee_id ?? null, assigneeName: d.assignee_name ?? null, adminNotes: d.admin_notes ?? null,
    source: d.source ?? "contact_form", createdAt: d.created_at, updatedAt: d.updated_at,
  };
}

export interface CreateEnquiryInput {
  firstName: string; lastName?: string; email: string; phone?: string;
  subject: string; orderNumber?: string; message: string; consent: boolean; meta?: Record<string, unknown>;
}

/** Public form submission → a stored enquiry + an Operations notification. Non-throwing on the
 *  notification/audit side; the insert result is authoritative. */
export async function createEnquiry(input: CreateEnquiryInput): Promise<{ ok: boolean; id?: string; number?: string; reason?: string }> {
  const db = createAdminClient() as any;
  const { data, error } = await db.from("contact_enquiries").insert({
    first_name: input.firstName, last_name: input.lastName || null, email: input.email, phone: input.phone || null,
    subject: input.subject, order_number: input.orderNumber || null, message: input.message, consent: !!input.consent,
    source: "contact_form", meta: input.meta ?? {},
  }).select("id,number").single();
  if (error || !data) return { ok: false, reason: error?.message ?? "Could not save your message." };

  await db.from("contact_enquiry_events").insert({ enquiry_id: data.id, kind: "created", detail: input.subject }).then(() => {}, () => {});
  await emitNotification({
    kind: "contact.enquiry", severity: "info", title: "New customer enquiry",
    body: `${input.firstName} · ${input.subject}`.slice(0, 140), href: `/admin/enquiries/${data.id}`,
    entityType: "enquiry", entityId: data.id,
  });
  return { ok: true, id: data.id, number: data.number };
}

/** Admin list (newest first). Optional status filter. */
export async function getEnquiriesQueue(opts: { status?: EnquiryStatus; limit?: number } = {}): Promise<EnquiryRow[]> {
  const db = createAdminClient() as any;
  let q = db.from("contact_enquiries").select("*").order("created_at", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.status) q = q.eq("status", opts.status);
  const { data } = await q;
  return (data ?? []).map(mapRow);
}

/** Count of enquiries needing attention (New) — for the admin header. */
export async function getEnquiryStatusCounts(): Promise<Record<string, number>> {
  const db = createAdminClient() as any;
  const { data } = await db.from("contact_enquiries").select("status");
  const counts: Record<string, number> = {};
  for (const r of (data ?? []) as { status: string }[]) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

export async function getEnquiryDetail(id: string): Promise<{ enquiry: EnquiryRow; events: EnquiryEvent[] } | null> {
  const db = createAdminClient() as any;
  const { data } = await db.from("contact_enquiries").select("*").eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: ev } = await db.from("contact_enquiry_events").select("id,kind,detail,actor_name,created_at").eq("enquiry_id", id).order("created_at", { ascending: true });
  return {
    enquiry: mapRow(data),
    events: (ev ?? []).map((e: any) => ({ id: e.id, kind: e.kind, detail: e.detail ?? null, actorName: e.actor_name ?? null, createdAt: e.created_at })),
  };
}

async function addEvent(db: any, enquiryId: string, kind: string, detail: string | null, actor?: { id?: string; name?: string }) {
  await db.from("contact_enquiry_events").insert({ enquiry_id: enquiryId, kind, detail, actor_id: actor?.id ?? null, actor_name: actor?.name ?? null }).then(() => {}, () => {});
}

/** Move an enquiry to a new status (server-authoritative — rejects illegal transitions). */
export async function advanceEnquiry(id: string, to: EnquiryStatus, actor?: { id?: string; name?: string }): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient() as any;
  const { data: cur } = await db.from("contact_enquiries").select("status").eq("id", id).maybeSingle();
  if (!cur) return { ok: false, reason: "Enquiry not found." };
  try { assertEnquiryTransition(cur.status as EnquiryStatus, to); } catch (e) { return { ok: false, reason: e instanceof Error ? e.message : "Illegal transition." }; }
  const { error } = await db.from("contact_enquiries").update({ status: to, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await addEvent(db, id, "status", `${ENQUIRY_STATUS_LABEL[cur.status as EnquiryStatus]} → ${ENQUIRY_STATUS_LABEL[to]}`, actor);
  await logEvent({ entityType: "enquiry", entityId: id, event: "enquiry.status", actorType: actor?.id ? "staff" : "system", actorId: actor?.id, notes: `${cur.status} → ${to}` });
  return { ok: true };
}

export interface EnquiryUpdate { adminNotes?: string; assigneeId?: string | null; assigneeName?: string | null }

/** Set internal notes and/or assignee. */
export async function updateEnquiryRecord(id: string, u: EnquiryUpdate, actor?: { id?: string; name?: string }): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient() as any;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (u.adminNotes !== undefined) patch.admin_notes = u.adminNotes || null;
  if (u.assigneeId !== undefined) { patch.assignee_id = u.assigneeId || null; patch.assignee_name = u.assigneeName || null; }
  const { error } = await db.from("contact_enquiries").update(patch).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  if (u.assigneeId !== undefined) { await addEvent(db, id, "assigned", u.assigneeName ? `Assigned to ${u.assigneeName}` : "Unassigned", actor); await logEvent({ entityType: "enquiry", entityId: id, event: "enquiry.assigned", actorType: actor?.id ? "staff" : "system", actorId: actor?.id, notes: u.assigneeName ?? "unassigned" }); }
  if (u.adminNotes !== undefined) await addEvent(db, id, "note", "Internal note updated", actor);
  return { ok: true };
}
