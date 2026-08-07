"use client";
import { BundlePageView } from "@/components/bundle/BundlePageView";
import { usePreviewBundleController } from "@/store/bundleController";
import type { BundleConfig } from "@/lib/bundleConfig";
import type { BundleCandle } from "@/lib/bundle";

/**
 * BundlePreview — the Admin-side wrapper that injects the EPHEMERAL preview controller into the SAME
 * shared BundlePageView the storefront uses. Rendered directly in the editor's right column (no iframe,
 * no duplicate renderer). Preview interactions are commerce-isolated exactly as Phase 0 proved.
 */
export function BundlePreview({
  config,
  candles,
  mediaUrls = {},
}: {
  config: BundleConfig;
  candles: BundleCandle[];
  mediaUrls?: Record<string, string>;
}) {
  const controller = usePreviewBundleController();
  return <BundlePageView config={config} candles={candles} controller={controller} mediaUrls={mediaUrls} />;
}
