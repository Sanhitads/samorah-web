/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Warehouse admin service (build #7) — CRUD over pickup locations + the routing
 * preview. Region routing already lives in lib/logistics/routing; this is the
 * management surface. Guardrails stop you from removing the ability to ship
 * (can't delete/deactivate the default or the last active warehouse). Audited.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getShippingSettings } from "@/lib/settings/shippingSettings";
import { getAllWarehouses } from "@/services/warehouseService";
import { routeWarehouse } from "@/lib/logistics/routing";
import { logEvent } from "@/services/auditService";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

export interface WarehouseInput {
  id: string;
  name: string;
  line1?: string; line2?: string; city?: string; state?: string; pincode?: string; country?: string;
  gstin?: string; manager?: string; phone?: string; workingHours?: string;
  priority?: number; active?: boolean; servesStates?: string[];
}

function row(i: WarehouseInput): Record<string, unknown> {
  return {
    id: i.id.trim(), name: i.name?.trim(), line1: i.line1 ?? null, line2: i.line2 ?? null,
    city: i.city ?? null, state: i.state ?? null, pincode: i.pincode ?? null, country: i.country ?? "India",
    gstin: i.gstin ?? null, manager: i.manager ?? null, phone: i.phone ?? null, working_hours: i.workingHours ?? null,
    priority: i.priority ?? 100, active: i.active ?? true,
    serves_states: (i.servesStates ?? []).map((s) => s.trim()).filter(Boolean),
    updated_at: new Date().toISOString(),
  };
}

export interface WarehouseAdminView {
  warehouses: Awaited<ReturnType<typeof getAllWarehouses>>;
  defaultWarehouseId: string;
}
export async function getWarehouseAdminView(): Promise<WarehouseAdminView> {
  const [warehouses, settings] = await Promise.all([getAllWarehouses(), getShippingSettings()]);
  return { warehouses, defaultWarehouseId: settings.defaultWarehouseId };
}

export async function createWarehouse(input: WarehouseInput, actorId?: string) {
  if (!input.id?.trim()) return { ok: false, reason: "id (slug) required" };
  if (!input.name?.trim()) return { ok: false, reason: "name required" };
  const db = loose();
  const { error } = await db.from("warehouses").insert(row(input));
  if (error) return { ok: false, reason: /duplicate|unique/i.test(error.message) ? "id already exists" : error.message };
  await logEvent({ entityType: "settings", event: "warehouse.created", actorType: actorId ? "staff" : "system", actorId, notes: `${input.id} · ${input.name}` });
  return { ok: true, id: input.id.trim() };
}

export async function updateWarehouse(id: string, input: WarehouseInput, actorId?: string) {
  // Deactivating the default (or the last active) warehouse would break shipping.
  if (input.active === false) {
    const block = await wouldBreakShipping(id);
    if (block) return { ok: false, reason: block };
  }
  const db = loose();
  const patch = row({ ...input, id }); // keep the id stable
  delete (patch as any).id;
  const { error } = await db.from("warehouses").update(patch).eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "warehouse.updated", actorType: actorId ? "staff" : "system", actorId, notes: `${id} · ${input.name}` });
  return { ok: true };
}

export async function deleteWarehouse(id: string, actorId?: string) {
  const block = await wouldBreakShipping(id);
  if (block) return { ok: false, reason: block };
  const db = loose();
  const { error } = await db.from("warehouses").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "warehouse.deleted", actorType: actorId ? "staff" : "system", actorId, notes: id });
  return { ok: true };
}

/** Returns a block reason if removing/deactivating this warehouse would leave nowhere to ship from. */
async function wouldBreakShipping(id: string): Promise<string | null> {
  const [all, settings] = await Promise.all([getAllWarehouses(), getShippingSettings()]);
  if (settings.defaultWarehouseId === id) return "this is the default warehouse — set another default first";
  const activeOthers = all.filter((w) => w.active && w.id !== id);
  if (activeOthers.length === 0) return "this is the only active warehouse — activate another first";
  return null;
}

export async function setDefaultWarehouse(id: string, actorId?: string) {
  const all = await getAllWarehouses();
  const wh = all.find((w) => w.id === id);
  if (!wh) return { ok: false, reason: "warehouse not found" };
  if (!wh.active) return { ok: false, reason: "cannot default an inactive warehouse" };
  const db = loose();
  const { error } = await db.from("shipping_settings").upsert({ id: true, default_warehouse_id: id, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "warehouse.set_default", actorType: actorId ? "staff" : "system", actorId, notes: id });
  return { ok: true };
}

/** Preview: which warehouse would an order delivering to `state` route to. */
export async function previewRoute(state: string): Promise<{ id: string; name: string; reason: string } | null> {
  const all = (await getAllWarehouses()).filter((w) => w.active);
  const routed = routeWarehouse(state, all);
  if (!routed) return null;
  const byState = (routed.servesStates ?? []).some((s) => s.trim().toLowerCase() === state.trim().toLowerCase());
  return { id: routed.id, name: routed.name, reason: byState ? `serves ${state}` : "highest-priority active (default)" };
}
