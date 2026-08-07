"use client";
/**
 * Bundle controller seam (Phase 0) — the commerce/adapter boundary that lets ONE shared Bundle renderer
 * (BundlePageView/BundleBuilder) run against either the real storefront stores or an ephemeral,
 * side-effect-free preview state. There is NO second renderer: the renderer only ever talks to this
 * interface.
 *
 *  • useStorefrontBundleController — wires the real persisted composition/cart/UI stores + analytics
 *    (behaviour identical to the pre-Phase-0 BundleBuilder). Used by the live /bundles route.
 *  • usePreviewBundleController — ephemeral useState only. NO persistence, NO cart writes, NO analytics,
 *    NO section beacon, NO cart drawer, NO reservation/order, NO checkout navigation. Used by the future
 *    side-by-side Admin preview (Phase 2); its zero-side-effect guarantee is proven by tests in Phase 0.
 */
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/hooks/useStore";
import { useCompositionStore, type CompositionItem } from "@/store/useCompositionStore";
import { useCartStore } from "@/store/useCartStore";
import { useUIStore } from "@/store/useUIStore";
import { trackBundleStarted, trackBundleCompleted, trackBundleAbandoned } from "@/lib/analytics/events";
import { BUNDLE_SIZE, vesselLabel } from "@/lib/bundle";
import { isGradientPlaceholder, gradientClass } from "@/lib/product";

export interface BundleController {
  vessel: string | null;
  items: CompositionItem[];
  editingId: string | null;
  setVessel: (key: string) => void;
  addCandle: (item: CompositionItem) => void;
  removeCandle: (id: string) => void;
  clear: () => void;
  /** Commit the completed set (storefront: cart write + open drawer + analytics; preview: inert no-op). */
  commitComposition: () => void;
  readonly isPreview: boolean;
}

const NO_ITEMS: CompositionItem[] = [];

/** STOREFRONT adapter — the real persisted stores + analytics. Identical behaviour to the prior BundleBuilder. */
export function useStorefrontBundleController(): BundleController {
  const vessel = useStore(useCompositionStore, (s) => s.vessel) ?? null;
  const items = useStore(useCompositionStore, (s) => s.items) ?? NO_ITEMS;
  const editingId = useStore(useCompositionStore, (s) => s.editingId) ?? null;
  const setVessel = useCompositionStore((s) => s.setVessel);
  const addCandleStore = useCompositionStore((s) => s.addCandle);
  const removeCandle = useCompositionStore((s) => s.removeCandle);
  const clear = useCompositionStore((s) => s.clear);
  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const openCart = useUIStore((s) => s.openCart);
  const completedRef = useRef(false);

  // Abandoned = navigated away with an in-progress-but-incomplete set (read live state).
  useEffect(() => {
    return () => {
      const remaining = useCompositionStore.getState().items;
      if (!completedRef.current && remaining.length > 0 && remaining.length < BUNDLE_SIZE) {
        trackBundleAbandoned(remaining.length);
      }
    };
  }, []);

  const addCandle = (item: CompositionItem) => {
    if (useCompositionStore.getState().items.length === 0) trackBundleStarted(); // first candle → started
    addCandleStore(item);
  };

  const commitComposition = () => {
    const st = useCompositionStore.getState();
    if (st.items.length !== BUNDLE_SIZE || !st.vessel) return;
    completedRef.current = true;
    trackBundleCompleted(st.items.reduce((s, i) => s + i.price, 0), st.items.length);
    const material = vesselLabel(st.vessel);
    // Editing → reuse the same compositionId and replace existing lines in place. The 15% stays a
    // cart-level promotion recomputed from full prices (never baked into the line price).
    const compositionId = st.editingId ?? `comp-${st.vessel}-${Date.now()}`;
    if (st.editingId) {
      useCartStore.getState().items.filter((i) => i.compositionId === st.editingId).forEach((i) => removeItem(i.key));
    }
    for (const it of st.items) {
      addItem(
        {
          id: it.id,
          slug: it.slug,
          name: it.name,
          price: it.price,
          gradClass: isGradientPlaceholder(it.image) ? gradientClass(it.image) ?? undefined : undefined,
          chapterName: it.chapterLabel,
          edition: it.edition,
          compositionId,
        },
        material,
        it.size,
      );
    }
    openCart();
    clear();
  };

  return { vessel, items, editingId, setVessel, addCandle, removeCandle, clear, commitComposition, isPreview: false };
}

// ── PREVIEW state machine — PURE functions (no stores, no analytics, no persistence, no navigation) ──
// The hook wraps these exact functions in useState. Because they are pure and import nothing with side
// effects, the preview path is side-effect-free BY CONSTRUCTION — proven by bundleController.preview.test.ts.
export interface PreviewState {
  vessel: string | null;
  items: CompositionItem[];
}
export const PREVIEW_INITIAL: PreviewState = { vessel: null, items: [] };
export function previewSetVessel(s: PreviewState, key: string): PreviewState {
  return key === s.vessel ? s : { vessel: key, items: [] }; // switching clears (no mixing)
}
export function previewAddCandle(s: PreviewState, item: CompositionItem): PreviewState {
  const vessel = s.vessel ?? item.vessel;
  if (item.vessel !== vessel) return s;
  if (s.items.length >= BUNDLE_SIZE) return s;
  if (s.items.some((i) => i.id === item.id)) return s;
  return { vessel, items: [...s.items, item] };
}
export function previewRemoveCandle(s: PreviewState, id: string): PreviewState {
  return { ...s, items: s.items.filter((i) => i.id !== id) };
}
export function previewClear(s: PreviewState): PreviewState {
  return { ...s, items: [] };
}

/** PREVIEW adapter — ephemeral React state ONLY, over the pure transitions above. Zero
 *  commerce/storage/analytics/navigation side effects; commitComposition is inert. */
export function usePreviewBundleController(): BundleController {
  const [state, setState] = useState<PreviewState>(PREVIEW_INITIAL);
  return {
    vessel: state.vessel,
    items: state.items,
    editingId: null,
    setVessel: (key) => setState((s) => previewSetVessel(s, key)),
    addCandle: (item) => setState((s) => previewAddCandle(s, item)),
    removeCandle: (id) => setState((s) => previewRemoveCandle(s, id)),
    clear: () => setState((s) => previewClear(s)),
    commitComposition: () => {
      /* inert in preview — no cart, no persistence, no analytics, no navigation. */
    },
    isPreview: true,
  };
}
