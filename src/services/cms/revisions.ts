/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared revision store (review points 1 + 14). ONE table, `cms_revisions`, keyed
 * by (resource_type, resource_key) — so pages, navigation, homepage, blog and email
 * templates all snapshot and restore through the same helpers instead of each
 * inventing a *_revisions table. Snapshotting is best-effort (never blocks a save);
 * restore returns the stored snapshot and the caller re-commits it (non-destructive).
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type CmsResourceType = "page" | "navigation" | "homepage" | "blog" | "email";

export interface Revision { id: string; snapshot: any; label: string | null; actorId: string | null; createdAt: string }

/** Snapshot a committed version. Non-blocking — a history failure never breaks the save. */
export async function snapshotRevision(type: CmsResourceType, key: string, snapshot: unknown, actorId?: string, label?: string): Promise<void> {
  try {
    const db = createAdminClient() as any;
    await db.from("cms_revisions").insert({ resource_type: type, resource_key: key, snapshot, actor_id: actorId ?? null, label: label ?? null });
  } catch (e) {
    console.error("snapshotRevision failed (non-fatal)", e);
  }
}

/** Revision history for a resource, newest first. */
export async function listRevisions(type: CmsResourceType, key: string, limit = 30): Promise<Revision[]> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("cms_revisions").select("*").eq("resource_type", type).eq("resource_key", key).order("created_at", { ascending: false }).limit(limit);
    return (data ?? []).map((r: any) => ({ id: r.id, snapshot: r.snapshot, label: r.label ?? null, actorId: r.actor_id ?? null, createdAt: r.created_at }));
  } catch { return []; }
}

/** Fetch one revision's snapshot (the caller applies it via its own upsert). */
export async function getRevisionSnapshot(id: string): Promise<any | null> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("cms_revisions").select("snapshot").eq("id", id).maybeSingle();
    return data?.snapshot ?? null;
  } catch { return null; }
}
