/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Bundle page config service (Phase 0). Reads the editorial BundleConfig server-side via the service-role
 * client — bundle_pages is service-role only (no public RLS), exactly like composed_pages. The storefront
 * shows the PUBLISHED config; when no published row exists (pre-launch / never edited), it falls back to
 * DEFAULT_BUNDLE_CONFIG so /bundles renders identically to the current hard-coded page. A malformed
 * payload normalizes to DEFAULT — the storefront never crashes on a bad config.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_BUNDLE_CONFIG, normalizeBundleConfig, type BundleConfig } from "@/lib/bundleConfig";

const BUNDLE_KEY = "discovery";

/** Collect every media.id referenced by a BundleConfig (hero desktop/mobile, vessels, product overrides). */
export function collectBundleMediaIds(config: BundleConfig): string[] {
  const ids = new Set<string>();
  if (config.hero.imageId) ids.add(config.hero.imageId);
  if (config.hero.imageMobileId) ids.add(config.hero.imageMobileId);
  for (const v of config.vessels) if (v.imageId) ids.add(v.imageId);
  for (const ov of Object.values(config.productOverrides ?? {})) if (ov.imageId) ids.add(ov.imageId);
  return [...ids];
}

/** Resolve media ids → delivery URLs (canonical Media authority). Missing/deleted ids are simply absent
 *  from the map → the renderer falls back (gradient / canonical product image). Server-only. */
export async function resolveBundleMedia(config: BundleConfig): Promise<Record<string, string>> {
  const ids = collectBundleMediaIds(config);
  if (!ids.length) return {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data } = await db.from("media").select("id,url").in("id", ids);
    const map: Record<string, string> = {};
    for (const m of (data ?? []) as { id: string; url: string }[]) if (m.url) map[m.id] = m.url;
    return map;
  } catch {
    return {}; // never break rendering on a media lookup failure
  }
}

/** The live (published) config for the storefront, or the default when none is published. */
export async function getPublishedBundleConfig(): Promise<BundleConfig> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("bundle_pages").select("published,status").eq("bundle_key", BUNDLE_KEY).maybeSingle();
    if (data?.status === "published" && data.published) return normalizeBundleConfig(data.published);
    return DEFAULT_BUNDLE_CONFIG;
  } catch {
    return DEFAULT_BUNDLE_CONFIG; // never break /bundles on a config read failure
  }
}
