"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AssetImage } from "@/components/ui/AssetImage";
import { useCartStore } from "@/store/useCartStore";
import { useUIStore } from "@/store/useUIStore";
import { isGradientPlaceholder, gradientClass } from "@/lib/product";
import {
  BUNDLE_SIZE,
  BUNDLE_VESSELS,
  composeBundle,
  optionFor,
  vesselLabel,
  type BundleCandle,
  type BundleSelection,
} from "@/lib/bundle";

/**
 * BundleBuilder (client) — the Discovery Composition. The customer chooses a
 * vessel first (single-vessel compositions), then composes exactly three 100g
 * candles from that vessel — filterable by chapter, no duplicate fragrances. A
 * sticky panel tracks the vessel, progress, and the automatic 15% discount, then
 * adds the set to the real cart. The only interactive island on the page.
 */
export function BundleBuilder({ candles }: { candles: BundleCandle[] }) {
  const [vessel, setVessel] = useState<string | null>(null);
  const [chapter, setChapter] = useState("All");
  const [selected, setSelected] = useState<BundleSelection[]>([]);
  const [added, setAdded] = useState(false);

  const addItem = useCartStore((s) => s.addItem);
  const openCart = useUIStore((s) => s.openCart);
  const reduce = useReducedMotion();

  // Only candles offered in the chosen vessel (100g).
  const vesselCandles = useMemo(
    () => (vessel ? candles.filter((c) => optionFor(c, vessel)) : []),
    [candles, vessel],
  );

  // Chapters present for this vessel, in volume order → the filter row.
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

  const composition = composeBundle(selected);
  const isFull = selected.length >= BUNDLE_SIZE;

  const chooseVessel = (key: string) => {
    if (key === vessel) return;
    setVessel(key);
    setChapter("All");
    setSelected([]); // no mixing vessels within a composition
    setAdded(false);
  };

  const toggle = (candle: BundleCandle) => {
    if (!vessel) return;
    const option = optionFor(candle, vessel);
    if (!option) return;
    setAdded(false);
    setSelected((prev) => {
      if (prev.some((s) => s.candle.id === candle.id)) return prev.filter((s) => s.candle.id !== candle.id);
      if (prev.length >= BUNDLE_SIZE) return prev; // set is full
      return [...prev, { candle, option }]; // duplicates impossible — keyed by candle
    });
  };

  const addComposition = () => {
    if (!composition.complete || !vessel) return;
    const material = vesselLabel(vessel);
    for (const { selection, unit } of composition.lines) {
      addItem(
        {
          id: selection.candle.id,
          slug: selection.candle.slug,
          name: selection.candle.name,
          price: unit,
          gradClass: isGradientPlaceholder(selection.candle.image.url)
            ? gradientClass(selection.candle.image.url) ?? undefined
            : undefined,
          chapterName: selection.candle.chapter?.name,
        },
        material,
        selection.option.size,
      );
    }
    openCart();
    setAdded(true);
    setSelected([]);
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
                  const chosen = selected.some((s) => s.candle.id === candle.id);
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
                  <span key={i} className="composition__dot" data-on={i < selected.length} />
                ))}
              </div>

              {composition.complete ? (
                <div className="composition__complete" role="status">
                  <span className="composition__complete-title">✓ Composition Complete</span>
                  <span className="composition__complete-sub">15% Applied</span>
                </div>
              ) : (
                <p className="composition__status">
                  {selected.length} of {BUNDLE_SIZE} Selected
                </p>
              )}

              {selected.length === 0 ? (
                <p className="composition__empty">Choose your first candle to begin.</p>
              ) : (
                <ul className="composition__items">
                  {selected.map((s) => (
                    <li key={s.candle.id} className="composition__item">
                      <span className="composition__thumb">
                        <AssetImage
                          asset={s.candle.image.url}
                          alt={s.candle.image.alt}
                          role="lifestyle"
                          sizes="72px"
                          className="composition__thumb-img"
                        />
                      </span>
                      <span className="composition__item-body">
                        <span className="composition__item-name">{s.candle.name}</span>
                        {s.candle.chapter ? (
                          <span className="composition__item-chapter">{s.candle.chapter.name}</span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className="composition__remove"
                        onClick={() => toggle(s.candle)}
                        aria-label={`Remove ${s.candle.name}`}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {selected.length > 0 ? (
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
                    : `Choose ${BUNDLE_SIZE - selected.length} more`}
              </button>

              <p className="composition__note">Any three 100g candles · 15% composition discount.</p>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
