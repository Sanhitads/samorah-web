/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Bundle CMS admin service (Phase 1A) — the canonical write path for the editorial BundleConfig.
 * Operates on the FROZEN bundle_pages singleton (service-role only). Mirrors the established CMS
 * publishable pattern (composed_pages / navigation):
 *   • draft vs published jsonb; the STOREFRONT reads `published` only (getPublishedBundleConfig).
 *   • Save Draft writes `draft` and NEVER touches `published` → storefront unchanged.
 *   • Publish validates (structural + commercial viability), writes `published = draft`, and snapshots a
 *     revision (revisions are created ON PUBLISH ONLY — matching the canonical cms_revisions semantics).
 *   • Reset-to-default loads DEFAULT into the DRAFT only (storefront unchanged — deliberately different
 *     from composed_pages resetPage which deletes the row and reverts LIVE; see Phase-1A closure).
 *   • Restore loads a revision snapshot into the draft (no live change); Restore+Publish publishes it.
 * No new renderer/controller/pricing/inventory/SEO/media authority is introduced here.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_BUNDLE_CONFIG, normalizeBundleConfig, validateBundleSubmission, type BundleConfig } from "@/lib/bundleConfig";
import { validateBundleForPublish } from "@/lib/bundleHealth";
import { getBundleCandles } from "@/services/bundleService";
import { snapshotRevision, listRevisions, getRevisionSnapshot, type Revision } from "@/services/cms/revisions";
import { logEvent } from "@/services/auditService";

const BUNDLE_KEY = "discovery";
const REV = "bundle" as const;

interface Row { draft: any; published: any; status: string }
async function readRow(): Promise<Row | null> {
  const db = createAdminClient() as any;
  const { data } = await db.from("bundle_pages").select("draft,published,status").eq("bundle_key", BUNDLE_KEY).maybeSingle();
  return (data as Row) ?? null;
}

export interface BundleAdminState {
  /** The config being edited (last-saved draft, or DEFAULT when none). */
  draft: BundleConfig;
  /** The live published config, or null when never published. */
  published: BundleConfig | null;
  status: "draft" | "published";
  neverPublished: boolean;
}

/** Load editor state (draft + published + publication status). content.edit. */
export async function getBundleAdmin(): Promise<BundleAdminState> {
  const row = await readRow();
  const published = row?.published ? normalizeBundleConfig(row.published) : null;
  return {
    draft: row?.draft ? normalizeBundleConfig(row.draft) : (published ?? DEFAULT_BUNDLE_CONFIG),
    published,
    status: published ? "published" : "draft",
    neverPublished: !published,
  };
}

/** Save the editing draft. Publishes NOTHING — storefront `published` is preserved untouched. content.edit. */
export async function saveBundleDraft(config: unknown, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  // Admin write boundary: reject malformed submissions BEFORE normalization (never coerce garbage→DEFAULT).
  const sub = validateBundleSubmission(config);
  if (!sub.ok) return { ok: false, reason: sub.errors[0] };
  const draft = normalizeBundleConfig(config);
  const existing = await readRow();
  const db = createAdminClient() as any;
  const { error } = await db.from("bundle_pages").upsert(
    { bundle_key: BUNDLE_KEY, draft, published: existing?.published ?? null, status: existing?.published ? "published" : "draft", updated_at: new Date().toISOString() },
    { onConflict: "bundle_key" },
  );
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "bundle.draft_saved", actorType: actorId ? "staff" : "system", actorId, notes: "Bundle draft saved", metadata: { bundle_key: BUNDLE_KEY } });
  return { ok: true };
}

export interface PublishResult { ok: boolean; errors?: string[]; warnings?: string[]; reason?: string }

/** Publish the given config as the live storefront config. Validates (structural + commercial viability);
 *  ERROR → no live mutation. Snapshots a revision of the published config. content.publish. */
export async function publishBundle(config: unknown, actorId?: string): Promise<PublishResult> {
  // Admin write boundary: a genuinely malformed submitted payload is REJECTED (422) and must never
  // normalize into DEFAULT and publish. (The storefront read fallback still normalizes persisted config.)
  const sub = validateBundleSubmission(config);
  if (!sub.ok) return { ok: false, errors: sub.errors };
  const next = normalizeBundleConfig(config);
  const candles = await getBundleCandles().catch(() => []);
  const { errors, warnings } = validateBundleForPublish(next, candles);
  if (errors.length) return { ok: false, errors, warnings }; // old published survives untouched
  const existing = await readRow();
  const db = createAdminClient() as any;
  const { error } = await db.from("bundle_pages").upsert(
    { bundle_key: BUNDLE_KEY, draft: next, published: next, status: "published", updated_at: new Date().toISOString() },
    { onConflict: "bundle_key" },
  );
  if (error) return { ok: false, reason: error.message };
  await snapshotRevision(REV, BUNDLE_KEY, next, actorId); // revision created ON PUBLISH ONLY
  await logEvent({ entityType: "settings", event: "bundle.published", actorType: actorId ? "staff" : "system", actorId, notes: existing?.published ? "Published bundle" : "First bundle publish", metadata: { bundle_key: BUNDLE_KEY } });
  return { ok: true, warnings };
}

/** Load DEFAULT_BUNDLE_CONFIG into the DRAFT (storefront/published unchanged). content.edit.
 *  NOTE: deliberately differs from composed_pages resetPage (which deletes the row → reverts LIVE). */
export async function resetBundleToDefault(actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const existing = await readRow();
  const db = createAdminClient() as any;
  const { error } = await db.from("bundle_pages").upsert(
    { bundle_key: BUNDLE_KEY, draft: DEFAULT_BUNDLE_CONFIG, published: existing?.published ?? null, status: existing?.published ? "published" : "draft", updated_at: new Date().toISOString() },
    { onConflict: "bundle_key" },
  );
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "bundle.reset", actorType: actorId ? "staff" : "system", actorId, notes: "Reset draft to default", metadata: { bundle_key: BUNDLE_KEY } });
  return { ok: true };
}

export async function listBundleRevisions(limit = 30): Promise<Revision[]> {
  return listRevisions(REV, BUNDLE_KEY, limit);
}
export async function getBundleRevision(id: string): Promise<BundleConfig | null> {
  const snap = await getRevisionSnapshot(id);
  return snap ? normalizeBundleConfig(snap) : null;
}

/** Restore a revision snapshot INTO THE DRAFT (no live change). content.edit. */
export async function restoreBundleRevisionToDraft(revisionId: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const snap = await getRevisionSnapshot(revisionId);
  if (!snap) return { ok: false, reason: "revision not found" };
  const res = await saveBundleDraft(snap, actorId);
  if (res.ok) await logEvent({ entityType: "settings", event: "bundle.revision_restored", actorType: actorId ? "staff" : "system", actorId, notes: "Restored a bundle revision to draft", metadata: { bundle_key: BUNDLE_KEY, revision_id: revisionId } });
  return res;
}

/** Restore a revision snapshot AND publish it live. content.publish. */
export async function restoreBundleRevisionAndPublish(revisionId: string, actorId?: string): Promise<PublishResult> {
  const snap = await getRevisionSnapshot(revisionId);
  if (!snap) return { ok: false, reason: "revision not found" };
  const res = await publishBundle(snap, actorId);
  if (res.ok) await logEvent({ entityType: "settings", event: "bundle.revision_restored_and_published", actorType: actorId ? "staff" : "system", actorId, notes: "Restored + published a bundle revision", metadata: { bundle_key: BUNDLE_KEY, revision_id: revisionId } });
  return res;
}
