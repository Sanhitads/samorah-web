"use client";
import { BundlePageView } from "@/components/bundle/BundlePageView";
import { useStorefrontBundleController } from "@/store/bundleController";
import type { BundleConfig } from "@/lib/bundleConfig";
import type { BundleCandle } from "@/lib/bundle";

/**
 * Storefront wrapper — injects the REAL persisted composition/cart controller into the shared
 * BundlePageView. This is the only place the live route wires commerce; the preview wrapper (Phase 2)
 * injects the ephemeral controller into the same view.
 */
export function BundleStorefront({ config, candles }: { config: BundleConfig; candles: BundleCandle[] }) {
  const controller = useStorefrontBundleController();
  return <BundlePageView config={config} candles={candles} controller={controller} />;
}
