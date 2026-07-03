"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import {
  COMPOSITION_DISCOUNT_PCT,
  selectCartSubtotal,
  selectCompositionDiscount,
  useCartStore,
  type CartItem,
  type CartState,
} from "@/store/useCartStore";
import { useCompositionStore } from "@/store/useCompositionStore";
import { buildCartSummary } from "@/lib/cart";
import { composeComposition } from "@/lib/bundle";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
const variantLabel = (vessel: string, size: string) =>
  [vessel ? cap(vessel) : "", size].filter(Boolean).join(" • ") || "Standard";
const NUM_WORD = ["Zero", "One", "Two", "Three", "Four", "Five", "Six"];
const countWord = (n: number) => NUM_WORD[n] ?? String(n);
/** Normalise any persisted edition ("VOL. I.1" / "No. I.1") to the canonical "NO. I.1". */
const noEdition = (e?: string) => (e ? e.replace(/^(?:VOL|No)\.\s*/i, "NO. ") : e);

/**
 * CartView (client) — the full Cart page ("Your Collection"). Reads the persisted
 * cart through the hydration-safe useStore hook. A Discovery Composition renders
 * as ONE curated parent item (vessel · its three candles · total · Edit / Remove);
 * standalone products render as regular lines with a quantity stepper. All items
 * share the same metadata hierarchy (edition · chapter · name · vessel • size).
 */
export function CartView() {
  const items = useCartStore((s) => s.items);
  const updateQty = useCartStore((s) => s.updateQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const loadComposition = useCompositionStore((s) => s.loadComposition);
  const router = useRouter();

  // Persisted cart hydrates on the client only — render after mount (a single,
  // synchronous read, so removals reflow once and scroll anchoring holds).
  const [mounted, setMounted] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  useEffect(() => {
    setMounted(true);
    router.prefetch("/bundles"); // so "Refine" navigates instantly
  }, [router]);

  if (!mounted) {
    return <div className="cart-page cart-page--loading" aria-busy="true" />;
  }

  if (items.length === 0) {
    return (
      <div className="cart-page">
        <div className="cart-empty">
          <p className="cart-empty__title">Your collection is empty.</p>
          <p className="cart-empty__sub">The quiet before the flame — your ritual begins here.</p>
          <Link href="/shop" className="cart-empty__link">Explore the collection</Link>
        </div>
      </div>
    );
  }

  const state = { items } as CartState;
  const subtotal = selectCartSubtotal(state);
  const discount = selectCompositionDiscount(state);
  const summary = buildCartSummary(subtotal, discount);
  const count = items.reduce((n, i) => n + i.qty, 0);

  const removeComposition = (lines: CartItem[]) => lines.forEach((l) => removeItem(l.key));
  // Load the composition into the composer to edit IN PLACE — the cart is left
  // untouched until the customer clicks "Update Composition".
  const editComposition = (lines: CartItem[]) => {
    const vessel = (lines[0]?.vessel ?? "").toLowerCase();
    const editingId = lines[0]?.compositionId ?? null;
    loadComposition(
      vessel,
      lines.map((l) => ({
        id: l.productId,
        slug: l.slug,
        name: l.name,
        chapterLabel: l.chapterName,
        edition: noEdition(l.edition),
        image: l.gradClass ? `gradient:${l.gradClass}` : "",
        vessel,
        size: l.size,
        price: l.price,
      })),
      editingId,
    );
    router.push(editingId ? `/bundles?edit=${editingId}` : "/bundles");
  };

  // Render order: composition groups collapse into one card at first sight.
  const seen = new Set<string>();

  return (
    <div className="cart-page">
      <header className="cart-page__head">
        <p className="cart-page__eyebrow">Your Bag</p>
        <h1 className="cart-page__title">Your Collection</h1>
        <p className="cart-page__count">{count} {count === 1 ? "item" : "items"}</p>
      </header>

      <div className="cart-layout">
        <ul className="cart-lines">
          {items.map((item) => {
            // ── Discovery Composition → one parent item ──
            if (item.compositionId) {
              if (seen.has(item.compositionId)) return null;
              seen.add(item.compositionId);
              const lines = items.filter((i) => i.compositionId === item.compositionId);
              const total = composeComposition(lines.map((l) => l.price)).total;
              return (
                <li className="cart-line cart-line--composition" key={item.compositionId}>
                  <div className="comp-card">
                    <div className="comp-card__head">
                      <p className="comp-card__eyebrow">Discovery Composition</p>
                      <p className="comp-card__vessel">{cap(lines[0]?.vessel ?? "")} Edition</p>
                      <p className="comp-card__count">{countWord(lines.length)} Signature Candles</p>
                    </div>

                    <div className="comp-card__body">
                      <ul className="comp-card__list">
                        {lines.map((l) => (
                          <li className="comp-card__item" key={l.key}>
                            <span className={`comp-card__thumb img-fill ${l.gradClass ?? "grad-dark"}`} aria-hidden="true" />
                            <span className="comp-card__item-text">
                              {l.chapterName ? <span className="comp-card__chapter">{l.chapterName}</span> : null}
                              {l.edition ? <span className="comp-card__edition">{noEdition(l.edition)}</span> : null}
                              <span className="comp-card__name">{l.name}</span>
                            </span>
                          </li>
                        ))}
                      </ul>

                      <div className="comp-card__rail">
                        <div className="comp-card__pricing">
                          <p className="comp-card__total-label">Composition Total</p>
                          <p className="comp-card__total">{inr(total)}</p>
                          <p className="comp-card__savings">{COMPOSITION_DISCOUNT_PCT}% Savings Applied</p>
                        </div>
                        {confirmRemoveId === item.compositionId ? (
                          <div className="comp-card__confirm" role="alertdialog" aria-label="Remove composition">
                            <p className="comp-card__confirm-text">
                              Removing this composition will remove all three candles from your collection.
                            </p>
                            <div className="comp-card__confirm-actions">
                              <button type="button" className="comp-card__cancel" onClick={() => setConfirmRemoveId(null)}>
                                Cancel
                              </button>
                              <button
                                type="button"
                                className="comp-card__confirm-remove"
                                onClick={() => {
                                  removeComposition(lines);
                                  setConfirmRemoveId(null);
                                }}
                              >
                                Remove Composition
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="comp-card__actions">
                            <button type="button" className="comp-card__edit" onClick={() => editComposition(lines)}>
                              Refine Composition
                            </button>
                            <button
                              type="button"
                              className="comp-card__remove"
                              onClick={() => setConfirmRemoveId(item.compositionId ?? null)}
                            >
                              Remove Composition
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            }

            // ── Standalone product ──
            return (
              <li className="cart-line" key={item.key}>
                <Link
                  href={`/shop/${item.slug}`}
                  className={`cart-line__media img-fill ${item.gradClass ?? "grad-dark"}`}
                  aria-label={item.name}
                />
                <div className="cart-line__info">
                  {item.chapterName ? <p className="cart-line__chapter">{item.chapterName}</p> : null}
                  {item.edition ? (
                    <span className="cart-line__edition">{item.hour ? item.edition : noEdition(item.edition)}</span>
                  ) : null}
                  {item.hour ? <p className="cart-line__hour">Hour {item.hour}</p> : null}
                  <Link href={`/shop/${item.slug}`} className="cart-line__name">{item.name}</Link>
                  <p className="cart-line__variant">
                    {item.hour ? item.productType ?? "" : variantLabel(item.vessel, item.size)}
                  </p>
                  <p className="cart-line__unit">{inr(item.price)} each</p>
                </div>

                <div className="cart-line__qty" aria-label={`Quantity of ${item.name}`}>
                  <button
                    type="button"
                    className="cart-line__qty-btn"
                    onClick={() => updateQty(item.key, item.qty - 1)}
                    aria-label={`Decrease quantity of ${item.name}`}
                  >
                    <Minus size={13} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                  <span className="cart-line__qty-val">{item.qty}</span>
                  <button
                    type="button"
                    className="cart-line__qty-btn"
                    onClick={() => updateQty(item.key, item.qty + 1)}
                    aria-label={`Increase quantity of ${item.name}`}
                  >
                    <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>

                <div className="cart-line__amount">
                  <p className="cart-line__total">{inr(item.price * item.qty)}</p>
                  <button type="button" className="cart-line__remove" onClick={() => removeItem(item.key)}>
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <aside className="cart-summary">
          <h2 className="cart-summary__title">Order Summary</h2>

          <div className="cart-summary__row">
            <span>Subtotal</span>
            <span>{inr(summary.subtotal)}</span>
          </div>
          {summary.discount > 0 ? (
            <div className="cart-summary__row cart-summary__row--discount">
              <span>Discovery Composition Savings ({COMPOSITION_DISCOUNT_PCT}%)</span>
              <span>−{inr(summary.discount)}</span>
            </div>
          ) : null}
          <div className="cart-summary__row">
            <span>Shipping{summary.freeShipping ? "" : " (estimate)"}</span>
            <span>{summary.freeShipping ? "Free" : inr(summary.shipping)}</span>
          </div>
          {!summary.freeShipping && summary.freeShippingRemaining > 0 ? (
            <p className="cart-summary__nudge">
              Add {inr(summary.freeShippingRemaining)} more for complimentary shipping.
            </p>
          ) : null}

          <div className="cart-summary__row cart-summary__row--total">
            <span>Total</span>
            <span>{inr(summary.total)}</span>
          </div>
          <p className="cart-summary__tax">Inclusive of GST ({summary.gstRate}%) · {inr(summary.gst)}</p>

          <Link href="/checkout" className="atc-btn cart-summary__checkout">Proceed to Checkout</Link>
          <Link href="/shop" className="cart-summary__continue">Continue Exploring</Link>
          <p className="cart-summary__note">
            Shipping is an estimate; final rates and taxes are confirmed at checkout.
          </p>
        </aside>
      </div>
    </div>
  );
}
