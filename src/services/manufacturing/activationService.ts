/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Activation controls (Phase 7A) — the ONLY sanctioned way to flip the release/allocation
 * switches or a variant's tracking_state. Gated by manufacturing.activate, which is held by
 * super_admin ONLY (it is not in any role bundle), so routine admins cannot activate tracked
 * stock. Every change is audited. Activation itself is governed by the reconciliation gates
 * documented for Phase 7B — this service is the enforcement point, not an auto-activator.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { assertCap, type StaffActor } from "@/services/manufacturing/actor";

const db = () => createAdminClient();

export async function getSwitches(): Promise<{ releaseEnabled: boolean; allocationEnabled: boolean }> {
  const row = (await db().from("manufacturing_settings").select("release_enabled, allocation_enabled").eq("id", true).maybeSingle()).data as any;
  return { releaseEnabled: !!row?.release_enabled, allocationEnabled: !!row?.allocation_enabled };
}

export async function setReleaseEnabled(actor: StaffActor, enabled: boolean): Promise<void> {
  assertCap(actor, "manufacturing.activate");
  const { error } = await db().from("manufacturing_settings").update({ release_enabled: enabled, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) throw new Error(error.message);
  await logEvent({ entityType: "settings", event: "manufacturing.release_enabled", actorType: "staff", actorId: actor.userId, newState: String(enabled) });
}

export async function setAllocationEnabled(actor: StaffActor, enabled: boolean): Promise<void> {
  assertCap(actor, "manufacturing.activate");
  const { error } = await db().from("manufacturing_settings").update({ allocation_enabled: enabled, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) throw new Error(error.message);
  await logEvent({ entityType: "settings", event: "manufacturing.allocation_enabled", actorType: "staff", actorId: actor.userId, newState: String(enabled) });
}

/** Flip a variant's tracking state. transition_pending is the reconciliation window; a variant
 *  may only go to 'tracked' once every enabled stock-writing path supports attribution. */
export async function setVariantTracking(actor: StaffActor, variantId: string, state: "untracked" | "transition_pending" | "tracked"): Promise<void> {
  assertCap(actor, "manufacturing.activate");
  const { error } = await db().from("variants").update({ tracking_state: state, tracked_at: state === "tracked" ? new Date().toISOString() : null }).eq("id", variantId);
  if (error) throw new Error(error.message);
  await logEvent({ entityType: "variant", entityId: variantId, event: "manufacturing.tracking_state", actorType: "staff", actorId: actor.userId, newState: state });
}
