"use client";

import { useMemo, useState } from "react";
import { AssetImage } from "@/components/ui/AssetImage";
import { useCartStore } from "@/store/useCartStore";
import { useUIStore } from "@/store/useUIStore";
import { isGradientPlaceholder, gradientClass } from "@/lib/product";
import {
  BUNDLE_SIZE,
  bundleStatus,
  composeBundle,
  type BundleCandle,
} from "@/lib/bundle";

/**
 * BundleBuilder (client) — "Build Your Collection". Pick exactly three candles;
 * a sticky composition panel shows the tray, the running total, and the 15%
 * bundle saving, then adds each candle to the real cart at its bundle price
 * (using its default in-stock variant). The only interactive island on the page.
 */
export function BundleBuilder({ candles }: { candles: BundleCandle[] }) {
  const [selected, setSelected] = useState<BundleCandle[]>([]);
  const [family, setFamily] = useState("All");
  const [added, setAdded] = useState(false);

  const addItem = useCartStore((s) => s.addItem);
  const openCart = useUIStore((s) => s.openCart);

  const families = useMemo(
    () => ["All", ...Array.from(new Set(candles.map((c) => c.family).filter((f): f is string => !!f)))],
    [candles],
  );
  const visible = useMemo(
    () => (family === "All" ? candles : candles.filter((c) => c.family === family)),
    [candles, family],
  );

  const composition = composeBundle(selected);
  const isFull = selected.length >= BUNDLE_SIZE;

  const toggle = (candle: BundleCandle) => {
    setAdded(false);
    setSelected((prev) => {
      if (prev.some((c) => c.id === candle.id)) return prev.filter((c) => c.id !== candle.id);
      if (prev.length >= BUNDLE_SIZE) return prev; // set is full
      return [...prev, candle];
    });
  };

  const addBundle = () => {
    if (!composition.complete) return;
    for (const { candle, unit } of composition.lines) {
      addItem(
        {
          id: candle.id,
          slug: candle.slug,
          name: candle.name,
          price: unit,
          gradClass: isGradientPlaceholder(candle.image.url)
            ? gradientClass(candle.image.url) ?? undefined
            : undefined,
        },
        candle.vessel,
        candle.size,
      );
    }
    openCart();
    setAdded(true);
    setSelected([]);
    setTimeout(() => setAdded(false), 2500);
  };

  return (
    <div className="bundle-split">
      {/* ── The candles ── */}
      <div className="bundle-left">
        {families.length > 1 ? (
          <div className="bundle-filters" role="tablist" aria-label="Filter by fragrance family">
            {families.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={family === f}
                className="bundle-filter"
                data-active={family === f}
                onClick={() => setFamily(f)}
              >
                {f}
              </button>
            ))}
          </div>
        ) : null}

        <div className="bundle-grid">
          {visible.map((candle) => {
            const chosen = selected.some((c) => c.id === candle.id);
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
                  <span className="bundle-card__name">{candle.name}</span>
                  {candle.tagline ? (
                    <span className="bundle-card__notes">{candle.tagline}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── The composition ── */}
      <aside className="bundle-right">
        <div className="composition">
          <p className="composition__eyebrow">Your composition</p>
          <p className="composition__count">
            {selected.length} <span>/ {BUNDLE_SIZE}</span>
          </p>
          <p className="composition__status" data-complete={composition.complete}>
            {bundleStatus(selected.length)}
          </p>

          <div className="composition__tray">
            {Array.from({ length: BUNDLE_SIZE }).map((_, i) => {
              const c = selected[i];
              return (
                <div key={i} className="tray-slot" data-filled={!!c}>
                  {c ? (
                    <AssetImage
                      asset={c.image.url}
                      alt={c.image.alt}
                      role="lifestyle"
                      sizes="80px"
                      className="tray-slot__image"
                    />
                  ) : (
                    <span className="tray-slot__mark" aria-hidden="true">+</span>
                  )}
                </div>
              );
            })}
          </div>

          {selected.length > 0 ? (
            <ul className="composition__items">
              {selected.map((c) => (
                <li key={c.id} className="composition__item">
                  <span>{c.name}</span>
                  <button
                    type="button"
                    className="composition__remove"
                    onClick={() => toggle(c)}
                    aria-label={`Remove ${c.name}`}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {selected.length > 0 ? (
            <div className="composition__totals">
              <div className="composition__row">
                <span>Regular value</span>
                <span>{composition.regularLabel}</span>
              </div>
              <div className="composition__row composition__row--main">
                <span>Composition total</span>
                <span>{composition.totalLabel}</span>
              </div>
              {composition.saving > 0 ? (
                <p className="composition__saving">
                  You save {composition.savingLabel} ({composition.savingPct}%)
                </p>
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            className="composition__atc"
            disabled={!composition.complete}
            data-added={added}
            onClick={addBundle}
          >
            {added
              ? "✓ Bundle added to bag"
              : composition.complete
                ? "Add Bundle to Bag"
                : `Select ${BUNDLE_SIZE - selected.length} more`}
          </button>

          <p className="composition__note">Any three candles · save 15% on the set.</p>
        </div>
      </aside>
    </div>
  );
}
