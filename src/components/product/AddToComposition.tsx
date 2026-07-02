"use client";

import { useState } from "react";
import Link from "next/link";
import { useCompositionStore } from "@/store/useCompositionStore";
import { BUNDLE_SIZE, BUNDLE_SIZE_LABEL, vesselLabel } from "@/lib/bundle";

/**
 * AddToComposition (client) — a small editorial panel on the PDP that lets a
 * candle join the Discovery Composition, in the customer's own language. It sits
 * inside the purchase panel so it follows the selected vessel AND size:
 *  · 100g → the full composition controls (start / add / progress);
 *  · 200g / 350g → a quiet note that compositions are 100g-only (never silently
 *    adds a different size than the one selected).
 * With an empty composition it starts one in the selected vessel; once active it
 * locks to the composition's vessel (with a guarded "Change Vessel"). Renders
 * nothing when the candle isn't offered as a 100g in that vessel at all.
 */
export interface CompositionVariant {
  vessel: string; // enum — "glass" | "ceramic"
  size: string; // "100g"
  price: number;
}

export function AddToComposition({
  product,
  variants,
  selectedVessel,
  selectedSize,
}: {
  product: { id: string; slug: string; name: string; chapterName?: string | null; image: string };
  variants: CompositionVariant[];
  selectedVessel: string;
  selectedSize: string;
}) {
  const storeVessel = useCompositionStore((s) => s.vessel);
  const items = useCompositionStore((s) => s.items);
  const addCandle = useCompositionStore((s) => s.addCandle);
  const removeCandle = useCompositionStore((s) => s.removeCandle);
  const setVessel = useCompositionStore((s) => s.setVessel);
  const [confirmSwitch, setConfirmSwitch] = useState(false);

  const active = items.length > 0;
  // Empty composition → follow the PDP's chosen vessel (ignore any stale persisted
  // vessel). Active composition → locked to the composition's own vessel.
  const vessel = active ? storeVessel : selectedVessel || storeVessel;
  if (!vessel) return null;

  const has100g = (v: string) => variants.some((x) => x.size === BUNDLE_SIZE_LABEL && x.vessel === v);
  const option = variants.find((x) => x.size === BUNDLE_SIZE_LABEL && x.vessel === vessel);
  if (!option) return null; // candle not offered as 100g in this vessel — no composition

  const material = vesselLabel(vessel);
  const eligibleSize = selectedSize === BUNDLE_SIZE_LABEL; // only the 100g Signature Candle
  const count = items.length;
  const complete = count >= BUNDLE_SIZE;
  const inComposition = items.some((i) => i.id === product.id);
  const canSwitch =
    eligibleSize && active && !!selectedVessel && selectedVessel !== vessel && has100g(selectedVessel);

  const add = () => {
    if (!eligibleSize) return; // never add a different size than selected
    if (!active && storeVessel !== vessel) setVessel(vessel); // lock/reset to the chosen vessel
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
  };

  const doSwitch = () => {
    setVessel(selectedVessel); // clears the composition, then adopts the new vessel
    setConfirmSwitch(false);
  };

  return (
    <div className="pdp-composition">
      <div className="pdp-composition__head">
        <p className="pdp-composition__label">Your {material} Composition</p>
        {canSwitch && !confirmSwitch ? (
          <button type="button" className="pdp-composition__change" onClick={() => setConfirmSwitch(true)}>
            Change Vessel
          </button>
        ) : null}
      </div>
      <p className="pdp-composition__subtitle">100g Signature Candles</p>

      {confirmSwitch ? (
        <div className="pdp-composition__confirm" role="alertdialog" aria-label="Change vessel">
          <p className="pdp-composition__confirm-text">
            Switching to {vesselLabel(selectedVessel)} will clear your current composition.
          </p>
          <div className="pdp-composition__confirm-actions">
            <button type="button" className="pdp-composition__cancel" onClick={() => setConfirmSwitch(false)}>
              Cancel
            </button>
            <button type="button" className="pdp-composition__switch" onClick={doSwitch}>
              Switch
            </button>
          </div>
        </div>
      ) : !eligibleSize ? (
        <div className="pdp-composition__note">
          <p>Compositions are available only with the 100g Signature Candle.</p>
          <p className="pdp-composition__note-cue">Switch to 100g to add this fragrance to your composition.</p>
        </div>
      ) : (
        <>
          <div className="pdp-composition__dots" aria-hidden="true">
            {Array.from({ length: BUNDLE_SIZE }).map((_, i) => (
              <span key={i} className="pdp-composition__dot" data-on={i < count} />
            ))}
          </div>

          {complete ? (
            <>
              <p className="pdp-composition__status pdp-composition__status--done">Composition Complete</p>
              <Link href="/bundles" className="pdp-composition__review">Review Composition →</Link>
            </>
          ) : inComposition ? (
            <>
              <p className="pdp-composition__count">{count} of {BUNDLE_SIZE} Selected</p>
              <p className="pdp-composition__added">✓ This candle has been added.</p>
              <div className="pdp-composition__actions">
                <button type="button" className="pdp-composition__remove" onClick={() => removeCandle(product.id)}>
                  Remove
                </button>
                <Link href="/bundles" className="pdp-composition__review">View Composition →</Link>
              </div>
            </>
          ) : (
            <>
              <p className="pdp-composition__count">{count} of {BUNDLE_SIZE} Selected</p>
              <p className="pdp-composition__benefit">
                Compose three signature candles and receive 15% off.
              </p>
              <button type="button" className="pdp-composition__add" onClick={add}>
                Add This Candle
              </button>
              <Link href="/bundles" className="pdp-composition__review">
                {count > 0 ? "View Composition →" : "Compose a set of three →"}
              </Link>
            </>
          )}
        </>
      )}
    </div>
  );
}
