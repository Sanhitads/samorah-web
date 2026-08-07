"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AssetImage } from "@/components/ui/AssetImage";
import {
  BUNDLE_SIZE,
  BUNDLE_DISCOUNT_PCT,
  chapterLabelOf,
  composeComposition,
  optionFor,
  vesselLabel,
  type BundleCandle,
} from "@/lib/bundle";
import { applyBundleMerchandising, resolveVessels, resolveTokens, selectionAllAvailable, type BundleConfig } from "@/lib/bundleConfig";
import type { BundleController } from "@/store/bundleController";

/**
 * BundleBuilder (client) — the Discovery Composition composer. Rendering is now config-driven
 * (editorial copy/vessel merchandising/product overrides from BundleConfig) and commerce goes through an
 * injected controller, so the SAME component serves the live storefront and the future Admin preview.
 * Availability uses the canonical storefront authority (option.inStock ← isInStock); OOS candles are
 * disabled. The discount percentage is the canonical BUNDLE_DISCOUNT_PCT — never an independent literal.
 */
export function BundleBuilder({
  candles,
  config,
  controller,
  mediaUrls = {},
}: {
  candles: BundleCandle[];
  config: BundleConfig;
  controller: BundleController;
  mediaUrls?: Record<string, string>;
}) {
  const { vessel, items, editingId } = controller;
  const [chapter, setChapter] = useState("All");
  const [added, setAdded] = useState(false);
  const [started, setStarted] = useState(false);
  const [pendingVessel, setPendingVessel] = useState<string | null>(null);
  const reduce = useReducedMotion();

  const vessels = useMemo(() => resolveVessels(config), [config]);
  const resolved = useMemo(() => applyBundleMerchandising(candles, config), [candles, config]);

  const composing = items.length > 0 || started;
  const activeVessel = composing ? vessel : null;

  const vesselCandles = useMemo(
    () => (vessel ? resolved.filter((c) => optionFor(c, vessel)) : []),
    [resolved, vessel],
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
  // V5 — a previously-selected candle that has since gone OOS/ineligible on refreshed canonical data
  // must not remain a valid composition. Block add-to-bag (canonical isInStock authority).
  const selectionAvailable = useMemo(() => selectionAllAvailable(items, resolved), [items, resolved]);

  const chooseVessel = (key: string) => {
    setAdded(false);
    if (key === vessel) {
      setStarted(true);
      return;
    }
    if (items.length > 0) {
      setPendingVessel(key);
      return;
    }
    setStarted(true);
    controller.setVessel(key);
    setChapter("All");
  };

  const confirmVesselSwitch = () => {
    if (!pendingVessel) return;
    setStarted(true);
    controller.setVessel(pendingVessel); // controller clears items on a vessel switch (no mixing)
    setChapter("All");
    setPendingVessel(null);
  };

  const toggle = (candle: BundleCandle) => {
    if (!vessel) return;
    const option = optionFor(candle, vessel);
    if (!option || !option.inStock) return; // canonical availability — OOS is never selectable
    setAdded(false);
    if (selectedIds.has(candle.id)) {
      controller.removeCandle(candle.id);
    } else {
      controller.addCandle({
        id: candle.id,
        slug: candle.slug,
        name: candle.name,
        chapterLabel: chapterLabelOf(candle.chapter),
        edition: candle.edition,
        image: candle.image.url,
        vessel,
        size: option.size,
        price: option.price,
      });
    }
  };

  const addComposition = () => {
    if (!composition.complete || !vessel || !selectionAvailable) return;
    controller.commitComposition();
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  };

  const selectedVessel = vessel ? vessels.find((v) => v.key === vessel) : null;

  return (
    <div className="composer">
      {/* ── Step 1 · Choose your vessel ── */}
      <section className="vessel-choose" aria-label="Choose your vessel">
        <p className="vessel-choose__eyebrow">{config.vesselSection.eyebrow}</p>
        <h2 className="vessel-choose__title">{config.vesselSection.heading}</h2>
        <div className="vessel-grid" role="radiogroup" aria-label="Vessel">
          {vessels.map((v) => {
            const active = v.key === activeVessel;
            const vImg = (v.imageId && mediaUrls[v.imageId]) || null; // merchandising image → else no image (current look)
            return (
              <button
                key={v.key}
                type="button"
                role="radio"
                aria-checked={active}
                className="vessel-card"
                data-active={active}
                data-coming={v.comingSoon}
                data-has-img={vImg ? "1" : "0"}
                disabled={v.comingSoon}
                onClick={() => chooseVessel(v.key)}
              >
                {vImg ? <img src={vImg} alt="" className="vessel-card__img" /> : null}
                <span className="vessel-card__mark" aria-hidden="true" />
                <span className="vessel-card__name">{v.name}</span>
                <span className="vessel-card__blurb">{v.blurb}</span>
                {v.comingSoon ? <span className="vessel-card__coming">Coming Soon</span> : null}
              </button>
            );
          })}
        </div>

        {pendingVessel ? (
          <div className="vessel-confirm" role="alertdialog" aria-label="Change vessel">
            <p className="vessel-confirm__text">
              Switching to {vesselLabel(pendingVessel)} will clear your current composition.
            </p>
            <div className="vessel-confirm__actions">
              <button type="button" className="vessel-confirm__cancel" onClick={() => setPendingVessel(null)}>
                Cancel
              </button>
              <button type="button" className="vessel-confirm__switch" onClick={confirmVesselSwitch}>
                Switch
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* ── Step 2 · Compose ── */}
      {composing && vessel ? (
        <div className="bundle-split">
          <div className="bundle-left">
            <div className="compose-head">
              <p className="compose-head__eyebrow">{selectedVessel?.material} Collection</p>
              <h2 className="compose-head__title">{config.candleSection.heading}</h2>
              <p className="compose-status">
                {config.candleSection.sizeLine}
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
                  const option = optionFor(candle, vessel);
                  const oos = !option?.inStock; // canonical storefront availability
                  const disabled = oos || (isFull && !chosen);
                  return (
                    <button
                      key={candle.id}
                      type="button"
                      className="bundle-card"
                      data-chosen={chosen}
                      data-disabled={disabled}
                      data-oos={oos}
                      aria-pressed={chosen}
                      aria-disabled={oos}
                      disabled={disabled}
                      onClick={() => toggle(candle)}
                    >
                      <span className="bundle-card__media">
                        <AssetImage
                          asset={(candle.overrideImageId && mediaUrls[candle.overrideImageId]) || candle.image.url}
                          alt={candle.image.alt}
                          role="lifestyle"
                          sizes="(max-width: 640px) 45vw, 220px"
                          className="bundle-card__image"
                        />
                        <span className="bundle-card__mark" aria-hidden="true">
                          {chosen ? "✓" : "+"}
                        </span>
                        {oos ? <span className="bundle-card__oos">Sold out</span> : null}
                      </span>
                      <span className="bundle-card__body">
                        {candle.chapter ? (
                          <span className="bundle-card__chapter">{chapterLabelOf(candle.chapter)}</span>
                        ) : null}
                        {candle.edition ? <span className="bundle-card__edition">{candle.edition}</span> : null}
                        <span className="bundle-card__name">{candle.name}</span>
                        {candle.displayDescription ? (
                          <span className="bundle-card__notes">{candle.displayDescription}</span>
                        ) : null}
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
                  <span className="composition__complete-title">✓ {config.flowCopy.completeLine}</span>
                  <span className="composition__complete-sub">{BUNDLE_DISCOUNT_PCT}% Applied</span>
                </div>
              ) : (
                <p className="composition__status">
                  {items.length} of {BUNDLE_SIZE} Selected
                </p>
              )}

              {items.length === 0 ? (
                <p className="composition__empty">{config.flowCopy.emptyHint}</p>
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
                        {it.chapterLabel ? (
                          <span className="composition__item-chapter">{it.chapterLabel}</span>
                        ) : null}
                      </span>
                      <button
                        type="button"
                        className="composition__remove"
                        onClick={() => controller.removeCandle(it.id)}
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
                    <span>Composition Discount ({composition.savingPct || BUNDLE_DISCOUNT_PCT}%)</span>
                    <span>−{composition.savingLabel}</span>
                  </div>
                  <div className="composition__row composition__row--main">
                    <span>Composition Total</span>
                    <span>{composition.totalLabel}</span>
                  </div>
                </div>
              ) : null}

              {composition.complete && !selectionAvailable ? (
                <p className="composition__note composition__note--warn" role="alert">
                  A candle in your composition is no longer available. Remove it to continue.
                </p>
              ) : null}

              <button
                type="button"
                className="composition__atc"
                disabled={!composition.complete || !selectionAvailable}
                data-added={added}
                onClick={addComposition}
              >
                {added
                  ? editingId
                    ? "✓ Composition updated"
                    : "✓ Composition added to bag"
                  : composition.complete
                    ? editingId
                      ? "Update Composition"
                      : "Add Composition to Bag"
                    : `Choose ${BUNDLE_SIZE - items.length} more`}
              </button>

              {editingId ? (
                <p className="composition__note composition__note--editing">{config.flowCopy.editingNote}</p>
              ) : (
                <p className="composition__note">{resolveTokens(config.flowCopy.footerLine)}</p>
              )}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
