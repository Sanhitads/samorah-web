"use client";

import { useMemo, useState } from "react";
import { useCartStore } from "@/store/useCartStore";
import { useUIStore } from "@/store/useUIStore";
import type { ProductVariantView } from "@/lib/productPage";

/**
 * Product purchase panel (client) — vessel + size selection → the live variant
 * price, and Add to bag → cart store + open the cart drawer. The only
 * interactive island on the PDP; everything else is server-rendered.
 */
export interface PurchaseProduct {
  id: string;
  slug: string;
  name: string;
  chapterName: string | null;
  vessels: string[];
  sizes: string[];
  variants: ProductVariantView[];
  defaultVariantId: string | null;
  priceLabel: string;
}

export function ProductPurchasePanel({ product }: { product: PurchaseProduct }) {
  const def =
    product.variants.find((v) => v.id === product.defaultVariantId) ?? product.variants[0];
  const [vessel, setVessel] = useState(def?.vessel ?? product.vessels[0] ?? "");
  const [size, setSize] = useState(def?.size ?? product.sizes[0] ?? "");
  const [added, setAdded] = useState(false);

  const addItem = useCartStore((s) => s.addItem);
  const openCart = useUIStore((s) => s.openCart);

  const current = useMemo(
    () => product.variants.find((v) => v.vessel === vessel && v.size === size) ?? null,
    [product.variants, vessel, size],
  );

  const handleAdd = () => {
    if (!current || !current.inStock) return;
    addItem(
      {
        id: product.id,
        slug: product.slug,
        name: product.name,
        price: current.price,
        chapterName: product.chapterName ?? undefined,
      },
      vessel,
      size,
    );
    openCart();
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const atcLabel = !current
    ? "Unavailable"
    : !current.inStock
      ? "Sold out"
      : added
        ? "Added to bag"
        : "Add to bag";

  return (
    <div className="purchase">
      <p className="purchase__price">{current ? current.priceLabel : product.priceLabel}</p>
      {current?.burnTime ? (
        <p className="purchase__burn">
          <span className="purchase__burn-label">Burn time</span> {current.burnTime}
        </p>
      ) : null}

      {product.vessels.length > 0 ? (
        <div className="purchase__group">
          <p className="purchase__label">Vessel</p>
          <div className="purchase__options">
            {product.vessels.map((v) => (
              <button
                key={v}
                type="button"
                className="purchase__option"
                data-selected={v === vessel}
                onClick={() => setVessel(v)}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {product.sizes.length > 0 ? (
        <div className="purchase__group">
          <p className="purchase__label">Size</p>
          <div className="purchase__options">
            {product.sizes.map((s) => (
              <button
                key={s}
                type="button"
                className="purchase__option"
                data-selected={s === size}
                onClick={() => setSize(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className="purchase__atc"
        onClick={handleAdd}
        disabled={!current || !current.inStock}
        data-added={added}
      >
        {atcLabel}
      </button>

      {current?.stockNote && current.inStock ? (
        <p className="purchase__stock">{current.stockNote} — only a few left.</p>
      ) : null}
    </div>
  );
}
