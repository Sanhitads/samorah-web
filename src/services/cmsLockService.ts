/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Advisory content locking (review point 8). A resource (page:homepage, email:…) can
 * be "held" by one editor; another editor opening it sees "currently edited by X". A
 * lock goes stale after FRESH_MS without a heartbeat, so a closed tab never blocks
 * forever. Advisory only — it warns, it doesn't hard-block (avoids lockout footguns).
 */
import { createAdminClient } from "@/lib/supabase/admin";

const FRESH_MS = 90_000;

async function actorName(db: any, actorId?: string): Promise<string> {
  if (!actorId) return "a colleague";
  try { const { data } = await db.from("users").select("full_name,email").eq("id", actorId).maybeSingle(); return data?.full_name || data?.email || "a colleague"; } catch { return "a colleague"; }
}

/** Acquire/refresh a lock. If a fresh lock is held by someone else, returns their name. */
export async function acquireLock(resource: string, actorId?: string): Promise<{ ok: boolean; heldBy?: string }> {
  const db = createAdminClient() as any;
  try {
    const { data: row } = await db.from("cms_locks").select("*").eq("resource_key", resource).maybeSingle();
    const fresh = row && Date.now() - Date.parse(row.locked_at) < FRESH_MS;
    if (fresh && row.actor_id && row.actor_id !== actorId) return { ok: false, heldBy: row.actor_name || "a colleague" };
    await db.from("cms_locks").upsert({ resource_key: resource, actor_id: actorId ?? null, actor_name: await actorName(db, actorId), locked_at: new Date().toISOString() }, { onConflict: "resource_key" });
    return { ok: true };
  } catch { return { ok: true }; } // never block editing on a lock-system failure
}

export async function releaseLock(resource: string, actorId?: string): Promise<void> {
  try {
    const db = createAdminClient() as any;
    // Only release if we own it (or it's ours/stale) — don't steal another's lock.
    const { data: row } = await db.from("cms_locks").select("actor_id").eq("resource_key", resource).maybeSingle();
    if (!row || !row.actor_id || row.actor_id === actorId) await db.from("cms_locks").delete().eq("resource_key", resource);
  } catch { /* ignore */ }
}
