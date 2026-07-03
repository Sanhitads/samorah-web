"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Minus, Plus, X } from "lucide-react";
import { useOverlay } from "@/hooks/useOverlay";
import {
  COMPOSITION_DISCOUNT_PCT,
  selectCartCount,
  selectCartSubtotal,
  selectCartTotal,
  selectCompositionDiscount,
  useCartStore,
} from "@/store/useCartStore";

/**
 * Editorial Cart Drawer (Phase 6 · Component 5).
 *
 * Isolated right-side drawer — coordinated only via `open` / `onClose` (the UI
 * store wires it in StoreChrome). Binds to the cart data store for items and
 * mutations; knows nothing of Checkout, Search, the Mega Menu, or auth.
 *
 * Quiet and editorial (Trudon × Aesop): "Your Ritual", calm line items,
 * subtotal only — no shipping/tax/coupon/badges/cross-sell. Future features
 * (checkout, coupons, gift wrap, samples, wishlist migration) slot into the
 * footer / line items without redesigning the component.
 */
export interface CartDrawerProps {
  open: boolean;
  onClose: () => void;
}

const EASE_OUT = [0, 0, 0.2, 1] as const;
const EASE_LUXURY = [0.25, 0.1, 0.25, 1] as const;
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const reduceMotion = useReducedMotion();
  const ref = useOverlay(open, onClose);

  const items = useCartStore((s) => s.items);
  const count = useCartStore(selectCartCount);
  const subtotal = useCartStore(selectCartSubtotal);
  const compositionDiscount = useCartStore(selectCompositionDiscount);
  const total = useCartStore(selectCartTotal);
  const updateQty = useCartStore((s) => s.updateQty);
  const removeItem = useCartStore((s) => s.removeItem);

  const scrimMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.25, ease: EASE_OUT } };

  const drawerMotion = reduceMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
    : {
        initial: { x: "100%" },
        animate: { x: 0 },
        exit: { x: "100%" },
        transition: { duration: 0.4, ease: EASE_LUXURY },
      };

  const onScrim = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="cart"
          ref={ref}
          className="cart-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Your ritual — cart"
          onClick={onScrim}
          {...scrimMotion}
        >
          <motion.div className="cart-drawer" {...drawerMotion}>
            <div className="cart-drawer__header">
              <div>
                <h2 className="cart-drawer__title">Your Ritual</h2>
                <p className="cart-drawer__count">
                  {count} {count === 1 ? "item" : "items"}
                </p>
              </div>
              <button
                type="button"
                className="cart-drawer__close"
                onClick={onClose}
                aria-label="Close cart"
              >
                <X size={20} strokeWidth={1.25} aria-hidden="true" />
              </button>
            </div>

            {items.length === 0 ? (
              <div className="cart-drawer__empty">
                <p className="cart-drawer__empty-title">The quiet before the flame.</p>
                <p className="cart-drawer__empty-sub">Your ritual begins here.</p>
                <Link
                  href="/chapters"
                  className="text-link cart-drawer__empty-link"
                  onClick={onClose}
                >
                  Discover The Chapters
                </Link>
              </div>
            ) : (
              <>
                <div className="cart-drawer__items">
                  {items.map((item) => (
                    <div className="cart-item" key={item.key}>
                      <Link
                        href={`/shop/${item.slug}`}
                        className={`cart-item__img ${item.gradClass ?? "grad-dark"}`}
                        onClick={onClose}
                        aria-label={item.name}
                      />
                      <div className="cart-item__body">
                        {item.chapterName && (
                          <p className="cart-item__chapter">{item.chapterName}</p>
                        )}
                        <Link
                          href={`/shop/${item.slug}`}
                          className="cart-item__name"
                          onClick={onClose}
                        >
                          {item.name}
                        </Link>
                        <p className="cart-item__meta">
                          {item.vessel} · {item.size}
                        </p>
                        {item.compositionId && (
                          <p className="cart-item__tag">Discovery Composition</p>
                        )}
                        <p className="cart-item__price">{inr(item.price * item.qty)}</p>
                      </div>
                      <div className="cart-item__controls">
                        <div className="cart-item__qty">
                          <button
                            type="button"
                            className="cart-item__qty-btn"
                            onClick={() => updateQty(item.key, item.qty - 1)}
                            aria-label={`Decrease quantity of ${item.name}`}
                          >
                            <Minus size={13} strokeWidth={1.5} aria-hidden="true" />
                          </button>
                          <span className="cart-item__qty-val">{item.qty}</span>
                          <button
                            type="button"
                            className="cart-item__qty-btn"
                            onClick={() => updateQty(item.key, item.qty + 1)}
                            aria-label={`Increase quantity of ${item.name}`}
                          >
                            <Plus size={13} strokeWidth={1.5} aria-hidden="true" />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="cart-item__remove"
                          onClick={() => removeItem(item.key)}
                          aria-label={`Remove ${item.name}`}
                        >
                          <X size={15} strokeWidth={1.25} aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="cart-drawer__footer">
                  {compositionDiscount > 0 ? (
                    <>
                      <div className="cart-drawer__line">
                        <span>Subtotal</span>
                        <span>{inr(subtotal)}</span>
                      </div>
                      <div className="cart-drawer__line cart-drawer__line--discount">
                        <span>Discovery Composition Savings ({COMPOSITION_DISCOUNT_PCT}%)</span>
                        <span>−{inr(compositionDiscount)}</span>
                      </div>
                      <div className="cart-drawer__subtotal">
                        <span>Total</span>
                        <span>{inr(total)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="cart-drawer__subtotal">
                      <span>Subtotal</span>
                      <span>{inr(subtotal)}</span>
                    </div>
                  )}
                  <Link
                    href="/cart"
                    className="atc-btn cart-drawer__checkout"
                    onClick={onClose}
                  >
                    View Bag
                  </Link>
                  <button
                    type="button"
                    className="cart-drawer__continue"
                    onClick={onClose}
                  >
                    Continue Shopping
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
