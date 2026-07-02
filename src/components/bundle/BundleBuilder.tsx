"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AssetImage } from "@/components/ui/AssetImage";
import { useCartStore } from "@/store/useCartStore";
import { useUIStore } from "@/store/useUIStore";
import { useCompositionStore } from "@/store/useCompositionStore";
import { isGradientPlaceholder, gradientClass } from "@/lib/product";
import {
  BUNDLE_SIZE,
  BUNDLE_VESSELS,
  composeComposition,
  optionFor,
  vesselLabel,
  type BundleCandle,
} from "@/lib/bundle";

/**
 * BundleBuilder (client) — the Discovery Composition. Choose a vessel (single-
 * vessel compositions), then compose exactly three 100g candles — filterable by
 * chapter, no duplicate fragrances. Backed by the shared composition store, so
 * the in-progress set persists across a refresh and is shared with the PDP's
 * "Add to Composition" action. A sticky panel tracks the vessel, progress, and
 * the automatic 15% discount, then adds the set to the cart.
 */
export function BundleBuilder({ candles }: { candles: BundleCandle[] }) {
  const vessel = useCompositionStore((s) => s.vessel);
  const items = useCompositionStore((s) => s.items);
  const setVessel = useCompositionStore((s) => s.setVessel);
  const addCandle = useCompositionStore((s) => s.addCandle);
  const removeCandle = useCompositionStore((s) => s.removeCandle);
  const clearComposition = useCompositionStore((s) => s.clear);

  const [chapter, setChapter] = useState("All");
  const [added, setAdded] = useState(false);

  const addItem = useCartStore((s) => s.addItem);
  const openCart = useUIStore((s) => s.openCart);
  const reduce = useReducedMotion();

  const vesselCandles = useMemo(
    () => (vessel ? candles.filter((c) => optionFor(c, vessel)) : []),
    [candles, vessel],
  );

  const chapters = useMemo(() => {
    const map = new Map<string, { key: string; short: string; order: number }>();
    for (const c of vesselCandles) {
      if (c.chapter) map.set(c.chapter.key, { key: c.chapter.key, short: c.chapter.short, order: c.chapter.order });
    }
    return [...map.values()].sort((a, b) => a.order - b.order);
  }, [vesselCandles]);

  const visible = useMemo(
    () => (chapter === "All" ? vesselCandles : vesselCandles.filter((c) => c.chapter?.key === chapter)),
    [vesselCandles, chapter],
  );

  const selectedIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const composition = composeComposition(items.map((i) => i.price));
  const isFull = items.length >= BUNDLE_SIZE;

  const chooseVessel = (key: string) => {
    if (key === vessel) return;
    setVessel(key); // store clears items on a vessel switch (no mixing)
    setChapter("All");
    setAdded(false);
  };

  const toggle = (candle: BundleCandle) => {
    if (!vessel) return;
    const option = optionFor(candle, vessel);
    if (!option) return;
    setAdded(false);
    if (selectedIds.has(candle.id)) {
      removeCandle(candle.id);
    } else {
      addCandle({
        id: candle.id,
        slug: candle.slug,
        name: candle.name,
        chapterName: candle.chapter?.name,
        image: candle.image.url,
        vessel,
        size: option.size,
        price: option.price,
      });
    }
  };

  const addComposition = () => {
    if (!composition.complete || !vessel) return;
    const material = vesselLabel(vessel);
    // Tag the three lines as one composition — the 15% is a cart-level promotion,
    // recomputed from the full prices (never baked into the stored line price).
    const compositionId = `comp-${vessel}-${Date.now()}`;
    for (const it of items) {
      addItem(
        {
          id: it.id,
          slug: it.slug,
          name: it.name,
          price: it.price, // full price — discount applied in the cart
          gradClass: isGradientPlaceholder(it.image) ? gradientClass(it.image) ?? undefined : undefined,
          chapterName: it.chapterName,
          compositionId,
        },
        material,
        it.size,
      );
    }
    openCart();
    setAdded(true);
    clearComposition();
    setTimeout(() => setAdded(false), 2500);
  };

  const selectedVessel = vessel ? BUNDLE_VESSELS.find((v) => v.key === vessel) : null;

  return (
    <div className="composer">
      {/* ── Step 1 · Choose your vessel ── */}
      <section className="vessel-choose" aria-label="Choose your vessel">
        <p className="vessel-choose__eyebrow">Step One</p>
        <h2 className="vessel-choose__title">Choose Your Vessel</h2>
        <div className="vessel-grid" role="radiogroup" aria-label="Vessel">
          {BUNDLE_VESSELS.map((v) => {
            const active = v.key === vessel;
            return (
              <button
                key={v.key}
                type="button"
                role="radio"
                aria-checked={active}
                className="vessel-card"
                data-active={active}
                data-coming={v.comingSoon}
                disabled={v.comingSoon}
                onClick={() => chooseVessel(v.key)}
              >
                <span className="vessel-card__mark" aria-hidden="true" />
                <span className="vessel-card__name">{v.name}</span>
                <span className="vessel-card__blurb">{v.blurb}</span>
                {v.comingSoon ? <span className="vessel-card__coming">Coming Soon</span> : null}
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Step 2 · Compose (revealed once a vessel is chosen) ── */}
      {vessel ? (
        <div className="bundle-split">
          <div className="bundle-left">
            <div className="compose-head">
              <p className="compose-head__eyebrow">{selectedVessel?.material} Collection</p>
              <h2 className="compose-head__title">Choose Any Three</h2>
              <p className="compose-status">
                100g Signature Candles
                <span className="compose-status__sep" aria-hidden="true"> · </span>
                {vesselCandles.length} Available
              </p>
            </div>

            {chapters.length > 1 ? (
              <div className="bundle-filters" role="tablist" aria-label="Filter by chapter">
                <button
                  type="button"
                  role="tab"
                  aria-selected={chapter === "All"}
                  className="bundle-filter"
                  data-active={chapter === "All"}
                  onClick={() => setChapter("All")}
                >
                  All
                </button>
                {chapters.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    role="tab"
                    aria-selected={chapter === c.key}
                    className="bundle-filter"
                    data-active={chapter === c.key}
                    onClick={() => setChapter(c.key)}
                  >
                    {c.short}
                  </button>
                ))}
              </div>
            ) : null}

            <AnimatePresence mode="wait">
              <motion.div
                className="bundle-grid"
                key={`${vessel}-${chapter}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduce ? 0 : 0.3, ease: "easeOut" }}
              >
                {visible.map((candle) => {
                  const chosen = selectedIds.has(candle.id);
                  const disabled = isFull && !chosen;
                  return (
                    <button
                      key={candle.id}
                      type="button"
                      className="bundle-card"
                      data-chosen={chosen}
                      data-disabled={disabled}
                      aria-pressed={chosen}
                      disabled={disabled}
                      onClick={() => toggle(candle)}
                    >
                      <span className="bundle-card__media">
                        <AssetImage
                          asset={candle.image.url}
                          alt={candle.image.alt}
                          role="lifestyle"
                          sizes="(max-width: 640px) 45vw, 220px"
                          className="bundle-card__image"
                        />
                        <span className="bundle-card__mark" aria-hidden="true">
                          {chosen ? "✓" : "+"}
                        </span>
                      </span>
                      <span className="bundle-card__body">
                        {candle.chapter?.volume ? (
                          <span className="bundle-card__edition">{candle.chapter.volume.toUpperCase()}</span>
                        ) : null}
                        <span className="bundle-card__name">{candle.name}</span>
                        {candle.chapter ? (
                          <span className="bundle-card__chapter">{candle.chapter.name}</span>
                        ) : null}
                        {candle.tagline ? <span className="bundle-card__notes">{candle.tagline}</span> : null}
                      </span>
                    </button>
                  );
                })}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* ── Sticky composition ── */}
          <aside className="bundle-right">
            <div className="composition">
              <p className="composition__eyebrow">Your Composition</p>
              {selectedVessel ? (
                <p className="composition__vessel">{selectedVessel.material} Composition</p>
              ) : null}

              <div className="composition__progress" aria-hidden="true">
                {Array.from({ length: BUNDLE_SIZE }).map((_, i) => (
                  <span key={i} className="composition__dot" data-on={i < items.length} />
                ))}
              </div>

              {composition.complete ? (
                <div className="composition__complete" role="status">
                  <span className="composition__complete-title">✓ Composition Complete</span>
                  <span className="composition__complete-sub">15% Applied</span>
                </div>
              ) : (
                <p className="composition__status">
                  {items.length} of {BUNDLE_SIZE} Selected
                </p>
              )}

              {items.length === 0 ? (
                <p className="composition__empty">Choose your first candle to begin.</p>
              ) : (
                <ul className="composition__items">
                  {items.map((it) => (
                    <li key={it.id} className="composition__item">
                      <span className="composition__thumb">
                        <AssetImage
                          asset={it.image}
                          alt={it.name}
                          role="lifestyle"
                          sizes="72px"
                          className="composition__thumb-img"
                        />
                      </span>
                      <span className="composition__item-body">
                        <span className="composition__item-name">{it.name}</span>
                        {it.chapterName ? (
                          <span className="composition__item-chapter">{it.chapterName}</span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className="composition__remove"
                        onClick={() => removeCandle(it.id)}
                        aria-label={`Remove ${it.name}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {items.length > 0 ? (
                <div className="composition__totals">
                  <div className="composition__row">
                    <span>Regular Value</span>
                    <span>{composition.regularLabel}</span>
                  </div>
                  <div className="composition__row">
                    <span>Composition Discount ({composition.savingPct || 15}%)</span>
                    <span>−{composition.savingLabel}</span>
                  </div>
                  <div className="composition__row composition__row--main">
                    <span>Composition Total</span>
                    <span>{composition.totalLabel}</span>
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                className="composition__atc"
                disabled={!composition.complete}
                data-added={added}
                onClick={addComposition}
              >
                {added
                  ? "✓ Composition added to bag"
                  : composition.complete
                    ? "Add Composition to Bag"
                    : `Choose ${BUNDLE_SIZE - items.length} more`}
              </button>

              <p className="composition__note">Any three 100g candles · 15% composition discount.</p>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
