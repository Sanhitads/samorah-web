"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Minus, Plus, X } from "lucide-react";
import { useOverlay } from "@/hooks/useOverlay";
import { useStore } from "@/hooks/useStore";
import {
  COMPOSITION_DISCOUNT_PCT,
  selectCartCount,
  useCartStore,
  type CartItem,
} from "@/store/useCartStore";
import { useCompositionStore } from "@/store/useCompositionStore";
import { composeComposition } from "@/lib/bundle";
import { buildCartSummary } from "@/lib/cart";
import { useFreeShippingThreshold } from "@/components/commerce/ShippingConfigProvider";
import { formatPaise } from "@/lib/money";

const NUM_WORD = ["Zero", "One", "Two", "Three", "Four", "Five", "Six"];
const countWord = (n: number) => NUM_WORD[n] ?? String(n);
const capVessel = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
const noEdition = (e?: string) => (e ? e.replace(/^(?:VOL|No)\.\s*/i, "NO. ") : e);

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

  // The cart is a PERSISTED store: it is empty during SSR and full after the client hydrates from
  // localStorage. Reading it directly would render two different trees and crash the whole page —
  // and this drawer lives in StoreChrome, so that crash would hit EVERY storefront route the moment
  // a customer had anything in their bag. `useStore` (BRD §24.1) returns undefined until mounted.
  const items = useStore(useCartStore, (s) => s.items) ?? [];
  const count = useStore(useCartStore, selectCartCount) ?? 0;
  const freeThreshold = useFreeShippingThreshold();
  const summary = buildCartSummary(items, freeThreshold);
  const subtotal = summary.subtotal;
  const compositionDiscount = summary.discount;
  const total = summary.total;
  const updateQty = useCartStore((s) => s.updateQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const loadComposition = useCompositionStore((s) => s.loadComposition);
  const router = useRouter();
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  useEffect(() => {
    router.prefetch("/bundles"); // so "Refine" navigates instantly
  }, [router]);

  const removeComposition = (lines: CartItem[]) => lines.forEach((l) => removeItem(l.key));
  // Edit in place — the cart stays as-is until "Update Composition" is clicked.
  const refineComposition = (lines: CartItem[]) => {
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
    onClose();
    router.push(editingId ? `/bundles?edit=${editingId}` : "/bundles");
  };

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
                <h2 className="cart-drawer__title">Your Collection</h2>
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
                  href="/shop"
                  className="text-link cart-drawer__empty-link"
                  onClick={onClose}
                >
                  Discover The Chapters
                </Link>
              </div>
            ) : (
              <>
                <div className="cart-drawer__items">
                  {(() => {
                    const seen = new Set<string>();
                    return items.map((item) => {
                      // ── Discovery Composition → one grouped block ──
                      if (item.compositionId) {
                        if (seen.has(item.compositionId)) return null;
                        seen.add(item.compositionId);
                        const lines = items.filter((i) => i.compositionId === item.compositionId);
                        const total = composeComposition(lines.map((l) => l.price)).total;
                        return (
                          <div className="cart-comp" key={item.compositionId}>
                            <p className="cart-comp__eyebrow">Discovery Composition</p>
                            <p className="cart-comp__vessel">
                              {capVessel(lines[0]?.vessel ?? "")} Edition · {countWord(lines.length)} candles
                            </p>
                            <ul className="cart-comp__list">
                              {lines.map((l) => (
                                <li className="cart-comp__item" key={l.key}>
                                  <span className={`cart-comp__thumb ${l.gradClass ?? "grad-dark"}`} aria-hidden="true" />
                                  <span className="cart-comp__text">
                                    {l.chapterName ? <span className="cart-comp__chapter">{l.chapterName}</span> : null}
                                    {l.edition ? <span className="cart-comp__edition">{noEdition(l.edition)}</span> : null}
                                    <span className="cart-comp__name">{l.name}</span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                            <div className="cart-comp__foot">
                              <span className="cart-comp__total">{inr(total)}</span>
                              <span className="cart-comp__savings">{COMPOSITION_DISCOUNT_PCT}% applied</span>
                            </div>
                            {confirmRemoveId === item.compositionId ? (
                              <div className="cart-comp__confirm">
                                <p className="cart-comp__confirm-text">Remove all three candles from your collection?</p>
                                <div className="cart-comp__confirm-actions">
                                  <button type="button" className="cart-comp__cancel" onClick={() => setConfirmRemoveId(null)}>
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    className="cart-comp__remove"
                                    onClick={() => {
                                      removeComposition(lines);
                                      setConfirmRemoveId(null);
                                    }}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="cart-comp__actions">
                                <button type="button" className="cart-comp__refine" onClick={() => refineComposition(lines)}>
                                  Refine
                                </button>
                                <button
                                  type="button"
                                  className="cart-comp__remove"
                                  onClick={() => setConfirmRemoveId(item.compositionId ?? null)}
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      }

                      // ── Standalone product ──
                      return (
                        <div className="cart-item" key={item.key}>
                          <Link
                            href={`/shop/${item.slug}`}
                            className={`cart-item__img ${item.gradClass ?? "grad-dark"}`}
                            onClick={onClose}
                            aria-label={item.name}
                          />
                          <div className="cart-item__body">
                            {item.chapterName && <p className="cart-item__chapter">{item.chapterName}</p>}
                            {item.edition && (
                              <p className="cart-item__edition">{item.hour ? item.edition : noEdition(item.edition)}</p>
                            )}
                            {item.hour && <p className="cart-item__hour">Hour {item.hour}</p>}
                            <Link href={`/shop/${item.slug}`} className="cart-item__name" onClick={onClose}>
                              {item.name}
                            </Link>
                            <p className="cart-item__meta">
                              {item.hour ? item.productType ?? "" : [capVessel(item.vessel), item.size].filter(Boolean).join(" • ")}
                            </p>
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
                      );
                    });
                  })()}
                </div>

                <div className="cart-drawer__footer">
                  {compositionDiscount > 0 ? (
                    <>
                      <div className="cart-drawer__line">
                        <span>Subtotal</span>
                        <span>{formatPaise(subtotal)}</span>
                      </div>
                      <div className="cart-drawer__line cart-drawer__line--discount">
                        <span>Discovery Composition Savings ({COMPOSITION_DISCOUNT_PCT}%)</span>
                        <span>−{formatPaise(compositionDiscount)}</span>
                      </div>
                      <div className="cart-drawer__subtotal">
                        <span>Total</span>
                        <span>{formatPaise(total)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="cart-drawer__subtotal">
                      <span>Subtotal</span>
                      <span>{formatPaise(subtotal)}</span>
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
