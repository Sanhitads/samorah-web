"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { COMPOSITION_DISCOUNT_PCT, useCartStore } from "@/store/useCartStore";
import {
  calculateOrderTotals,
  addressSchema,
  businessSchema,
  fieldErrors,
  pinStateMismatch,
  type AddressForm,
} from "@/lib/checkout";
import { INDIAN_STATES, COMMERCE } from "@/config/commerce";
import { formatPaise, formatPaise2 } from "@/lib/money";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`; // rupee line inputs

const ADDRESS_FIELDS: { name: keyof AddressForm; label: string; type?: string; half?: boolean; placeholder?: string }[] = [
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
 * CheckoutView (client) — Phase 3. Guest-first checkout: contact + shipping
 * address, optional separate billing, optional business-GST invoice, order
 * notes, legal consent, and a GST-accurate summary (per-line HSN rates, CGST/SGST
 * intra-state, IGST inter-state) from the shared money engine. Payment (Razorpay)
 * + order persistence are Beat 2; the cart is never cleared before a real
 * payment. Reads the persisted cart behind a mount guard.
 */
export function CheckoutView() {
  const items = useCartStore((s) => s.items);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [ship, setShip] = useState<AddressForm>(EMPTY);
  const [billSame, setBillSame] = useState(true);
  const [bill, setBill] = useState<AddressForm>(EMPTY);
  const [wantGst, setWantGst] = useState(false);
  const [biz, setBiz] = useState({ companyName: "", gstin: "" });
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [placed, setPlaced] = useState(false);

  // Place of supply = the delivery (shipping) state (GST §12/13).
  const totals = useMemo(() => calculateOrderTotals(items, ship.state), [items, ship.state]);

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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found: Record<string, string> = {};
    Object.entries(fieldErrors(addressSchema, ship)).forEach(([k, v]) => (found[`ship_${k}`] = v));
    if (!found.ship_pincode && pinStateMismatch(ship.pincode, ship.state))
      found.ship_pincode = "PIN code does not match the selected state";
    if (!billSame) {
      Object.entries(fieldErrors(addressSchema, bill)).forEach(([k, v]) => (found[`bill_${k}`] = v));
      if (!found.bill_pincode && pinStateMismatch(bill.pincode, bill.state))
        found.bill_pincode = "PIN code does not match the selected state";
    }
    if (wantGst) Object.entries(fieldErrors(businessSchema, biz)).forEach(([k, v]) => (found[k] = v));
    if (!consent) found.consent = "Please accept to continue";
    setErrors(found);
    if (Object.keys(found).length === 0) setPlaced(true);
  };

  const addressFieldset = (
    prefix: "ship" | "bill",
    value: AddressForm,
    setValue: (u: AddressForm) => void,
    legend: string,
  ) => (
    <fieldset className="checkout-group">
      <legend className="checkout-group__label">{legend}</legend>
      <div className="checkout-fields">
        {ADDRESS_FIELDS.map((f) => {
          const ek = `${prefix}_${String(f.name)}`;
          return (
            <label key={ek} className="checkout-field" data-half={f.half}>
              <span className="checkout-field__label">{f.label}</span>
              <input
                className="checkout-field__input"
                type={f.type ?? "text"}
                value={value[f.name] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => {
                  setValue({ ...value, [f.name]: e.target.value });
                  if (errors[ek]) setErrors((x) => ({ ...x, [ek]: "" }));
                }}
                aria-invalid={Boolean(errors[ek])}
              />
              {errors[ek] ? <span className="checkout-field__error">{errors[ek]}</span> : null}
            </label>
          );
        })}
        <label className="checkout-field" data-half>
          <span className="checkout-field__label">State</span>
          <select
            className="checkout-field__input"
            value={value.state}
            onChange={(e) => {
              setValue({ ...value, state: e.target.value });
              if (errors[`${prefix}_state`]) setErrors((x) => ({ ...x, [`${prefix}_state`]: "" }));
            }}
            aria-invalid={Boolean(errors[`${prefix}_state`])}
          >
            <option value="">Select state</option>
            {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {errors[`${prefix}_state`] ? <span className="checkout-field__error">{errors[`${prefix}_state`]}</span> : null}
        </label>
      </div>
    </fieldset>
  );

  return (
    <div className="checkout">
      <header className="checkout__head">
        <p className="checkout__eyebrow">Checkout · Guest or Account</p>
        <h1 className="checkout__title">Your Details</h1>
      </header>

      <div className="checkout__layout">
        <form className="checkout__form" onSubmit={submit} noValidate>
          {addressFieldset("ship", ship, setShip, "Contact & Shipping")}

          {/* Billing */}
          <label className="checkout-check">
            <input type="checkbox" checked={billSame} onChange={(e) => setBillSame(e.target.checked)} />
            <span>Billing address same as shipping</span>
          </label>
          {!billSame ? addressFieldset("bill", bill, setBill, "Billing Address") : null}

          {/* Business GST */}
          <label className="checkout-check">
            <input type="checkbox" checked={wantGst} onChange={(e) => setWantGst(e.target.checked)} />
            <span>I need a GST invoice (business purchase)</span>
          </label>
          {wantGst ? (
            <div className="checkout-fields checkout-fields--biz">
              <label className="checkout-field">
                <span className="checkout-field__label">Company name</span>
                <input className="checkout-field__input" value={biz.companyName}
                  onChange={(e) => { setBiz({ ...biz, companyName: e.target.value }); if (errors.companyName) setErrors((x) => ({ ...x, companyName: "" })); }}
                  aria-invalid={Boolean(errors.companyName)} />
                {errors.companyName ? <span className="checkout-field__error">{errors.companyName}</span> : null}
              </label>
              <label className="checkout-field">
                <span className="checkout-field__label">GSTIN</span>
                <input className="checkout-field__input" value={biz.gstin} placeholder="15-character GSTIN"
                  onChange={(e) => { setBiz({ ...biz, gstin: e.target.value.toUpperCase() }); if (errors.gstin) setErrors((x) => ({ ...x, gstin: "" })); }}
                  aria-invalid={Boolean(errors.gstin)} />
                {errors.gstin ? <span className="checkout-field__error">{errors.gstin}</span> : null}
              </label>
            </div>
          ) : null}

          {/* Order notes */}
          <label className="checkout-field checkout-field--notes">
            <span className="checkout-field__label">Order notes (optional)</span>
            <textarea className="checkout-field__input checkout-field__textarea" rows={3} value={notes}
              placeholder="Leave at security · call before delivery · gift instructions"
              onChange={(e) => setNotes(e.target.value)} />
          </label>

          {/* Consent */}
          <label className="checkout-check checkout-check--consent" data-error={Boolean(errors.consent)}>
            <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); if (errors.consent) setErrors((x) => ({ ...x, consent: "" })); }} />
            <span>
              I agree to the <Link href={COMMERCE.policy.termsHref} className="checkout-link">Terms &amp; Conditions</Link>,{" "}
              <Link href={COMMERCE.policy.privacyHref} className="checkout-link">Privacy Policy</Link> and{" "}
              <Link href={COMMERCE.policy.shippingReturnsHref} className="checkout-link">Shipping &amp; Returns</Link>.
            </span>
          </label>
          {errors.consent ? <span className="checkout-field__error">{errors.consent}</span> : null}

          {placed ? (
            <div className="checkout__next" role="status">
              <p className="checkout__next-title">✓ Details saved for {ship.fullName.split(" ")[0]}.</p>
              <p className="checkout__next-sub">
                Secure payment (Razorpay) and order confirmation are the next build step — no charge has been made,
                and your bag is preserved.
              </p>
            </div>
          ) : (
            <button type="submit" className="checkout__submit" disabled={!consent}>
              Proceed to Secure Payment
            </button>
          )}
          <p className="checkout__note">
            Guest checkout — no account required. Payments are processed securely; the webhook confirms every order.
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

          <div className="checkout__delivery">
            <span>Estimated Delivery</span>
            <span className="checkout__delivery-value">Available after payment</span>
          </div>

          <div className="checkout__totals">
            <div className="checkout__row"><span>Subtotal</span><span>{formatPaise(totals.subtotal)}</span></div>
            {totals.discount > 0 ? (
              <div className="checkout__row checkout__row--discount">
                <span>Discovery Composition Savings ({COMPOSITION_DISCOUNT_PCT}%)</span>
                <span>−{formatPaise(totals.discount)}</span>
              </div>
            ) : null}
            <div className="checkout__row">
              <span>Shipping{totals.freeShipping ? "" : " (estimate)"}</span>
              <span>{totals.freeShipping ? "Free" : formatPaise(totals.shipping)}</span>
            </div>
            <div className="checkout__row checkout__row--muted"><span>Taxable value</span><span>{formatPaise2(totals.taxableValue)}</span></div>
            {totals.interState ? (
              <div className="checkout__row checkout__row--muted"><span>IGST</span><span>{formatPaise2(totals.igst)}</span></div>
            ) : (
              <>
                <div className="checkout__row checkout__row--muted"><span>CGST</span><span>{formatPaise2(totals.cgst)}</span></div>
                <div className="checkout__row checkout__row--muted"><span>SGST</span><span>{formatPaise2(totals.sgst)}</span></div>
              </>
            )}
            <div className="checkout__row checkout__row--total"><span>Total</span><span>{formatPaise(totals.total)}</span></div>
            <p className="checkout__tax-note">
              Inclusive of GST{ship.state ? `, billed as ${totals.interState ? "IGST" : "CGST + SGST"}` : ""}. Mixed
              rates are extracted per item (per HSN).
            </p>
          </div>

          <Link href="/cart" className="checkout__back">Return to bag</Link>
        </aside>
      </div>
    </div>
  );
}
