"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import {
  COMPOSITION_DISCOUNT_PCT,
  selectCartSubtotal,
  selectCompositionDiscount,
  useCartStore,
  type CartState,
} from "@/store/useCartStore";
import { calculateOrderTotals, validateAddress, type AddressForm } from "@/lib/checkout";
import { INDIAN_STATES } from "@/config/commerce";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const round = (n: number) => `₹${(Math.round(n * 100) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const FIELDS: { name: keyof AddressForm; label: string; type?: string; half?: boolean; placeholder?: string }[] = [
  { name: "fullName", label: "Full name" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Mobile number", type: "tel", placeholder: "10-digit mobile" },
  { name: "line1", label: "Address" },
  { name: "line2", label: "Apartment, suite (optional)" },
  { name: "city", label: "City", half: true },
  { name: "pincode", label: "PIN code", half: true, placeholder: "6-digit" },
];

const EMPTY: AddressForm = { fullName: "", email: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" };

/**
 * CheckoutView (client) — Phase 3 · Beat 1. Contact + shipping address (validated)
 * and a GST-accurate order summary (CGST/SGST intra-state, IGST inter-state) from
 * the shared order-totals module. Payment (Razorpay) + order persistence land in
 * Beat 2. Reads the persisted cart behind a mount guard (no SSR mismatch).
 */
export function CheckoutView() {
  const items = useCartStore((s) => s.items);
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState<AddressForm>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [placed, setPlaced] = useState(false);
  useEffect(() => setMounted(true), []);

  const subtotal = useCartStore(selectCartSubtotal);
  const discount = useCartStore(selectCompositionDiscount);
  const totals = useMemo(() => calculateOrderTotals(subtotal, discount, form.state), [subtotal, discount, form.state]);

  if (!mounted) return <div className="checkout checkout--loading" aria-busy="true" />;

  if (items.length === 0 && !placed) {
    return (
      <div className="checkout">
        <div className="checkout__empty">
          <p className="checkout__empty-title">Your collection is empty.</p>
          <Link href="/shop" className="checkout__empty-link">Explore the collection</Link>
        </div>
      </div>
    );
  }

  const set = (name: keyof AddressForm, value: string) => {
    setForm((f) => ({ ...f, [name]: value }));
    if (errors[name]) setErrors((e) => ({ ...e, [name]: "" }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = validateAddress(form);
    setErrors(found);
    if (Object.keys(found).length === 0) setPlaced(true);
  };

  return (
    <div className="checkout">
      <header className="checkout__head">
        <p className="checkout__eyebrow">Checkout</p>
        <h1 className="checkout__title">Your Details</h1>
      </header>

      <div className="checkout__layout">
        {/* ── Address ── */}
        <form className="checkout__form" onSubmit={submit} noValidate>
          <fieldset className="checkout-group">
            <legend className="checkout-group__label">Contact &amp; Shipping</legend>
            <div className="checkout-fields">
              {FIELDS.map((f) => (
                <label key={f.name} className="checkout-field" data-half={f.half}>
                  <span className="checkout-field__label">{f.label}</span>
                  <input
                    className="checkout-field__input"
                    type={f.type ?? "text"}
                    value={form[f.name] ?? ""}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.name, e.target.value)}
                    aria-invalid={Boolean(errors[f.name])}
                  />
                  {errors[f.name] ? <span className="checkout-field__error">{errors[f.name]}</span> : null}
                </label>
              ))}
              <label className="checkout-field" data-half>
                <span className="checkout-field__label">State</span>
                <select
                  className="checkout-field__input"
                  value={form.state}
                  onChange={(e) => set("state", e.target.value)}
                  aria-invalid={Boolean(errors.state)}
                >
                  <option value="">Select state</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {errors.state ? <span className="checkout-field__error">{errors.state}</span> : null}
              </label>
            </div>
          </fieldset>

          {placed ? (
            <div className="checkout__next" role="status">
              <p className="checkout__next-title">✓ Details saved for {form.fullName.split(" ")[0]}.</p>
              <p className="checkout__next-sub">
                Secure payment (Razorpay) and order confirmation are the next step in the build — no charge has
                been made.
              </p>
            </div>
          ) : (
            <button type="submit" className="checkout__submit">Proceed to Secure Payment</button>
          )}
          <p className="checkout__note">
            Payments are processed securely. Shipping &amp; taxes are shown in the summary; final serviceability is
            confirmed at payment.
          </p>
        </form>

        {/* ── Summary ── */}
        <aside className="checkout__summary">
          <h2 className="checkout__summary-title">Order Summary</h2>

          <ul className="checkout__items">
            {items.map((item) => (
              <li key={item.key} className="checkout__item">
                <span className={`checkout__item-media img-fill ${item.gradClass ?? "grad-dark"}`} aria-hidden="true" />
                <span className="checkout__item-body">
                  <span className="checkout__item-name">{item.name}</span>
                  <span className="checkout__item-meta">
                    {item.hour ? item.productType ?? "" : [item.vessel, item.size].filter(Boolean).join(" · ")}
                    {item.qty > 1 ? ` · ×${item.qty}` : ""}
                  </span>
                </span>
                <span className="checkout__item-price">{inr(item.price * item.qty)}</span>
              </li>
            ))}
          </ul>

          <div className="checkout__totals">
            <div className="checkout__row"><span>Subtotal</span><span>{inr(totals.subtotal)}</span></div>
            {totals.discount > 0 ? (
              <div className="checkout__row checkout__row--discount">
                <span>Discovery Composition Savings ({COMPOSITION_DISCOUNT_PCT}%)</span>
                <span>−{inr(totals.discount)}</span>
              </div>
            ) : null}
            <div className="checkout__row">
              <span>Shipping{totals.freeShipping ? "" : " (estimate)"}</span>
              <span>{totals.freeShipping ? "Free" : inr(totals.shipping)}</span>
            </div>
            <div className="checkout__row checkout__row--muted"><span>Taxable value</span><span>{round(totals.taxableValue)}</span></div>
            {totals.interState ? (
              <div className="checkout__row checkout__row--muted"><span>IGST ({totals.gstRate}%)</span><span>{round(totals.igst)}</span></div>
            ) : (
              <>
                <div className="checkout__row checkout__row--muted"><span>CGST ({totals.gstRate / 2}%)</span><span>{round(totals.cgst)}</span></div>
                <div className="checkout__row checkout__row--muted"><span>SGST ({totals.gstRate / 2}%)</span><span>{round(totals.sgst)}</span></div>
              </>
            )}
            <div className="checkout__row checkout__row--total"><span>Total</span><span>{inr(totals.total)}</span></div>
            <p className="checkout__tax-note">
              Prices are inclusive of GST{form.state ? `, ${totals.interState ? "billed as IGST" : "billed as CGST + SGST"}` : ""}.
            </p>
          </div>

          <Link href="/cart" className="checkout__back">Return to bag</Link>
        </aside>
      </div>
    </div>
  );
}
