"use client";

import Link from "next/link";
import { Minus, Plus } from "lucide-react";
import { useStore } from "@/hooks/useStore";
import {
  COMPOSITION_DISCOUNT_PCT,
  selectCartSubtotal,
  selectCompositionDiscount,
  useCartStore,
  type CartItem,
  type CartState,
} from "@/store/useCartStore";
import { buildCartSummary } from "@/lib/cart";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * CartView (client) — the full Cart page ("Your Bag"). Reads the persisted cart
 * through the hydration-safe useStore hook (so SSR never renders stale/empty
 * localStorage), lists the line items with variant + composition detail, and
 * shows the order summary (subtotal · composition discount · shipping estimate ·
 * inclusive GST · total) from the shared cart-summary math.
 */
export function CartView() {
  const items = useStore<CartState, CartItem[]>(useCartStore, (s) => s.items);
  const updateQty = useCartStore((s) => s.updateQty);
  const removeItem = useCartStore((s) => s.removeItem);

  // First render (server + pre-hydration): keep the frame, defer the contents.
  if (items === undefined) {
    return <div className="cart-page cart-page--loading" aria-busy="true" />;
  }

  if (items.length === 0) {
    return (
      <div className="cart-page">
        <div className="cart-empty">
          <p className="cart-empty__title">Your bag is empty.</p>
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

  return (
    <div className="cart-page">
      <header className="cart-page__head">
        <p className="cart-page__eyebrow">Your Bag</p>
        <h1 className="cart-page__title">The Ritual</h1>
        <p className="cart-page__count">{count} {count === 1 ? "item" : "items"}</p>
      </header>

      <div className="cart-layout">
        <ul className="cart-lines">
          {items.map((item) => (
            <li className="cart-line" key={item.key}>
              <Link
                href={`/shop/${item.slug}`}
                className={`cart-line__media img-fill ${item.gradClass ?? "grad-dark"}`}
                aria-label={item.name}
              />
              <div className="cart-line__info">
                {item.chapterName ? <p className="cart-line__chapter">{item.chapterName}</p> : null}
                <Link href={`/shop/${item.slug}`} className="cart-line__name">{item.name}</Link>
                <p className="cart-line__variant">
                  {[item.vessel, item.size].filter(Boolean).join(" · ") || "Standard"}
                </p>
                {item.compositionId ? <p className="cart-line__tag">Discovery Composition</p> : null}
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
                <button
                  type="button"
                  className="cart-line__remove"
                  onClick={() => removeItem(item.key)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>

        <aside className="cart-summary">
          <h2 className="cart-summary__title">Order Summary</h2>

          <div className="cart-summary__row">
            <span>Subtotal</span>
            <span>{inr(summary.subtotal)}</span>
          </div>
          {summary.discount > 0 ? (
            <div className="cart-summary__row cart-summary__row--discount">
              <span>Composition discount ({COMPOSITION_DISCOUNT_PCT}%)</span>
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
          <Link href="/shop" className="cart-summary__continue">Continue Shopping</Link>
          <p className="cart-summary__note">
            Shipping is an estimate; final rates and taxes are confirmed at checkout.
          </p>
        </aside>
      </div>
    </div>
  );
}
