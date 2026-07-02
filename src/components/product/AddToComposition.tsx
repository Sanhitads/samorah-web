"use client";

import Link from "next/link";
import { useCompositionStore } from "@/store/useCompositionStore";
import { BUNDLE_SIZE, BUNDLE_SIZE_LABEL, vesselLabel } from "@/lib/bundle";

/**
 * AddToComposition (client) — a PDP accelerator for an in-progress Discovery
 * Composition. It appears only when the customer already has an active
 * composition (a vessel chosen on /bundles) and this candle is offered as a 100g
 * in that vessel — then it lets them drop the candle straight in, keeping the
 * editorial "composition" language. No active composition → renders nothing.
 */
export interface CompositionVariant {
  vessel: string; // enum — "glass" | "ceramic"
  size: string; // "100g"
  price: number;
}

export function AddToComposition({
  product,
  variants,
}: {
  product: { id: string; slug: string; name: string; chapterName?: string | null; image: string };
  variants: CompositionVariant[];
}) {
  const vessel = useCompositionStore((s) => s.vessel);
  const items = useCompositionStore((s) => s.items);
  const addCandle = useCompositionStore((s) => s.addCandle);
  const removeCandle = useCompositionStore((s) => s.removeCandle);

  // Only while a composition is active, and only if this candle fits the vessel.
  if (!vessel) return null;
  const option = variants.find((v) => v.size === BUNDLE_SIZE_LABEL && v.vessel === vessel);
  if (!option) return null;

  const material = vesselLabel(vessel);
  const inComposition = items.some((i) => i.id === product.id);
  const count = items.length;
  const complete = count >= BUNDLE_SIZE;

  const add = () =>
    addCandle({
      id: product.id,
      slug: product.slug,
      name: product.name,
      chapterName: product.chapterName ?? undefined,
      image: product.image,
      vessel,
      size: option.size,
      price: option.price,
    });

  return (
    <div className="pdp-composition">
      <p className="pdp-composition__label">
        Your {material} Composition
        <span className="pdp-composition__count"> · {count} of {BUNDLE_SIZE}</span>
      </p>

      {inComposition ? (
        <div className="pdp-composition__state">
          <span className="pdp-composition__in">✓ In your composition</span>
          <button type="button" className="pdp-composition__remove" onClick={() => removeCandle(product.id)}>
            Remove
          </button>
        </div>
      ) : complete ? (
        <p className="pdp-composition__full">
          Your composition is complete.{" "}
          <Link href="/bundles" className="pdp-composition__link">Review &amp; add to bag</Link>
        </p>
      ) : (
        <button type="button" className="pdp-composition__add" onClick={add}>
          Add to Composition
        </button>
      )}

      <Link href="/bundles" className="pdp-composition__browse">
        {complete || inComposition ? "View your composition" : "Compose a set of three →"}
      </Link>
    </div>
  );
}
