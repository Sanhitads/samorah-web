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
