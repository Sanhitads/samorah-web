"use client";

import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { useMemo, useState, useEffect, useRef } from "react";
import { COMPOSITION_DISCOUNT_PCT, useCartStore, type CartItem } from "@/store/useCartStore";
import {
  calculateOrderTotals,
  addressSchema,
  businessSchema,
  fieldErrors,
  pinStateMismatch,
  type AddressForm,
} from "@/lib/checkout";
import { COMMERCE } from "@/config/commerce";
import { composeComposition } from "@/lib/bundle";
import { formatPaise, formatPaise2 } from "@/lib/money";
import { readStoredUtm } from "@/lib/utm";
import { trackBeginCheckout, trackAddPaymentInfo, trackApplyCoupon, trackPaymentStarted, trackPaymentSuccess, trackPaymentFailed, trackCheckoutError } from "@/lib/analytics/events";
import type { AnalyticsItem } from "@/lib/analytics/types";
import { StateSelect } from "./StateSelect";

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`; // rupee line inputs
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
const variantLabel = (vessel: string, size: string) =>
  [vessel ? cap(vessel) : "", size].filter(Boolean).join(" • ") || "Standard";
const NUM_WORD = ["Zero", "One", "Two", "Three", "Four", "Five", "Six"];
const countWord = (n: number) => NUM_WORD[n] ?? String(n);
/** Normalise any persisted edition ("VOL. I.1" / "No. I.1") to the canonical "NO. I.1". */
const noEdition = (e?: string) => (e ? e.replace(/^(?:VOL|No)\.\s*/i, "NO. ") : e);

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

const TRUST = [
  "Secure Razorpay Payment",
  "GST Invoice Available",
  "Orders ship within 24–48 hours",
  "100% Secure Checkout",
];

/**
 * CheckoutView (client) — Phase 3. Guest-first checkout: contact + shipping
 * address, optional separate billing, optional business-GST invoice, order
 * notes, legal consent, and a premium GST-accurate summary (per-line HSN rates,
 * CGST/SGST intra-state, IGST inter-state) from the shared money engine. The
 * summary mirrors the Cart's editorial hierarchy (chapter · edition · hour ·
 * name · vessel • size) so the archive reads consistently end to end. Payment
 * (Razorpay) + order persistence are Beat 2; the cart is never cleared before a
 * real payment. Reads the persisted cart behind a mount guard.
 */
export function CheckoutView() {
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clearCart);
  const router = useRouter();
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
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [payError, setPayError] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [couponCode, setCouponCode] = useState("");

  // Place of supply = the delivery (shipping) state (GST §12/13).
  const totals = useMemo(
    () => calculateOrderTotals(items, ship.state, { couponCode: couponCode || undefined }),
    [items, ship.state, couponCode],
  );
  const couponApplied = couponCode ? totals.promotions.some((p) => p.code === couponCode.toUpperCase()) : false;

  // GA4 ecommerce items for this checkout (no PII).
  const analyticsItems = useMemo<AnalyticsItem[]>(
    () => items.map((i) => ({ item_id: i.productId, item_name: i.name, item_category: i.chapterName, item_variant: [i.vessel, i.size].filter(Boolean).join(" · ") || undefined, price: i.price, quantity: i.qty })),
    [items],
  );
  // begin_checkout once the checkout renders with a bag (review point 4).
  const beganRef = useRef(false);
  useEffect(() => {
    if (beganRef.current || !mounted || items.length === 0) return;
    beganRef.current = true;
    trackBeginCheckout(analyticsItems, couponCode || undefined);
  }, [mounted, items.length, analyticsItems, couponCode]);
  // apply_coupon when a code becomes valid (review point 6).
  useEffect(() => {
    if (couponApplied) trackApplyCoupon(couponCode.toUpperCase(), totals.total);
  }, [couponApplied, couponCode, totals.total]);

  if (!mounted) return <div className="checkout checkout--loading" aria-busy="true" />;
  if (items.length === 0 && !paid) {
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
    if (Object.keys(found).length === 0) void pay();
  };

  const applyCode = () => {
    setCouponCode(codeInput.trim().toUpperCase());
  };

  /**
   * Stage 2A — start payment. The server re-prices the cart and returns a
   * Razorpay order for the authoritative amount; we open Checkout (Test Mode).
   * The cart is NEVER cleared here — only a persisted order (webhook, Stage 2B)
   * clears it, so a cancelled/failed payment leaves the bag intact.
   */
  const pay = async () => {
    setPayError("");
    setPaying(true);
    try {
      const payload = items.map((i) => ({
        key: i.key,
        slug: i.slug,
        name: i.name,
        vessel: i.vessel,
        size: i.size,
        qty: i.qty,
        compositionId: i.compositionId,
        productType: i.productType,
        edition: i.edition,
      }));
      const address = {
        fullName: ship.fullName,
        phone: ship.phone,
        line1: ship.line1,
        line2: ship.line2,
        city: ship.city,
        state: ship.state,
        pincode: ship.pincode,
      };
      // Optional separate billing address + B2B GST invoice — validated above.
      const billing = billSame
        ? undefined
        : { fullName: bill.fullName, phone: bill.phone, line1: bill.line1, line2: bill.line2, city: bill.city, state: bill.state, pincode: bill.pincode };
      const business = wantGst && biz.gstin ? { companyName: biz.companyName, gstin: biz.gstin } : undefined;
      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload, email: ship.email, address, billing, business, notes: notes || undefined, couponCode: couponCode || undefined, utm: readStoredUtm() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPayError(data.error ?? "Could not start payment. Please try again.");
        trackCheckoutError("create_order", data.error);
        setPaying(false);
        return;
      }
      if (typeof window === "undefined" || !window.Razorpay) {
        setPayError("Payment could not load. Please refresh and try again.");
        trackCheckoutError("razorpay_unavailable");
        setPaying(false);
        return;
      }
      const orderValue = Number(data.amount ?? 0) / 100; // paise → rupees
      trackAddPaymentInfo(analyticsItems, "razorpay");
      trackPaymentStarted(data.orderId, orderValue);
      const rzp = new window.Razorpay({
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        order_id: data.orderId,
        name: "SAMORAH",
        description: "Your Collection",
        prefill: { name: ship.fullName, email: ship.email, contact: ship.phone },
        notes: { state: ship.state },
        theme: { color: "#1f1a16" },
        handler: async (response) => {
          // Payment captured. Confirm via /verify (shared persistOrder); the
          // webhook is the backstop. The cart clears ONLY after an order number
          // comes back — so a failed verify keeps the bag (webhook will finalize).
          setPaying(true);
          try {
            const vr = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const vd = await vr.json();
            if (vr.ok && vd.orderNumber && vd.token) {
              trackPaymentSuccess(vd.orderNumber, orderValue); // purchase itself fires on the order page
              clearCart();
              router.push(`/order/${vd.orderNumber}?t=${encodeURIComponent(vd.token)}`);
              return;
            }
          } catch {
            /* fall through to the backstop acknowledgement */
          }
          // Payment succeeded but confirmation is still settling — the webhook
          // finalizes it. Keep the bag until an order number exists.
          setPaid(true);
          setPaying(false);
        },
        modal: { ondismiss: () => setPaying(false) }, // cancelled → cart intact
      });
      rzp.on("payment.failed", (resp) => {
        setPayError(resp.error?.description ?? "Payment failed. Your bag is safe — please try again.");
        trackPaymentFailed(data.orderId, resp.error?.description);
        setPaying(false);
      });
      rzp.open();
    } catch {
      setPayError("Something went wrong. Your bag is safe — please try again.");
      trackCheckoutError("pay_exception");
      setPaying(false);
    }
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
          <StateSelect
            value={value.state}
            onChange={(s) => {
              setValue({ ...value, state: s });
              if (errors[`${prefix}_state`]) setErrors((x) => ({ ...x, [`${prefix}_state`]: "" }));
            }}
            invalid={Boolean(errors[`${prefix}_state`])}
          />
          {errors[`${prefix}_state`] ? <span className="checkout-field__error">{errors[`${prefix}_state`]}</span> : null}
        </label>
      </div>
    </fieldset>
  );

  // ── Summary items — mirror the Cart's editorial hierarchy exactly ──
  const seen = new Set<string>();
  const summaryItem = (item: CartItem) => {
    // Discovery Composition → one card (same read as the Cart's comp-card).
    if (item.compositionId) {
      if (seen.has(item.compositionId)) return null;
      seen.add(item.compositionId);
      const lines = items.filter((i) => i.compositionId === item.compositionId);
      const total = composeComposition(lines.map((l) => l.price)).total;
      return (
        <li className="checkout__comp" key={item.compositionId}>
          <div className="checkout__comp-head">
            <span className="checkout__comp-eyebrow">Discovery Composition</span>
            <span className="checkout__comp-vessel">{cap(lines[0]?.vessel ?? "")} Edition</span>
            <span className="checkout__comp-count">{countWord(lines.length)} Signature Candles</span>
          </div>
          <ul className="checkout__comp-list">
            {lines.map((l) => (
              <li className="checkout__comp-item" key={l.key}>
                <span className={`checkout__comp-thumb img-fill ${l.gradClass ?? "grad-dark"}`} aria-hidden="true" />
                <span className="checkout__comp-text">
                  {l.chapterName ? <span className="checkout__item-chapter">{l.chapterName}</span> : null}
                  {l.edition ? <span className="checkout__item-edition">{noEdition(l.edition)}</span> : null}
                  <span className="checkout__item-name">{l.name}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="checkout__comp-foot">
            <span className="checkout__comp-total-label">Composition Total</span>
            <span className="checkout__comp-total">{inr(total)}</span>
          </div>
          <span className="checkout__comp-savings">{COMPOSITION_DISCOUNT_PCT}% Savings Applied</span>
        </li>
      );
    }

    // Standalone product / Air — chapter · edition · hour · name · variant · unit.
    return (
      <li key={item.key} className="checkout__item">
        <span className={`checkout__item-media img-fill ${item.gradClass ?? "grad-dark"}`} aria-hidden="true" />
        <span className="checkout__item-body">
          {item.chapterName ? <span className="checkout__item-chapter">{item.chapterName}</span> : null}
          {item.edition ? (
            <span className="checkout__item-edition">{item.hour ? item.edition : noEdition(item.edition)}</span>
          ) : null}
          {item.hour ? <span className="checkout__item-hour">Hour {item.hour}</span> : null}
          <span className="checkout__item-name">{item.name}</span>
          <span className="checkout__item-variant">
            {item.hour ? item.productType ?? "" : variantLabel(item.vessel, item.size)}
          </span>
          <span className="checkout__item-unit">
            {inr(item.price)} each{item.qty > 1 ? ` · ×${item.qty}` : ""}
          </span>
        </span>
        <span className="checkout__item-price">{inr(item.price * item.qty)}</span>
      </li>
    );
  };

  return (
    <div className="checkout">
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <header className="checkout__head">
        <p className="checkout__eyebrow">Checkout</p>
        <h1 className="checkout__title">Complete Your Collection</h1>
      </header>

      <div className="checkout__layout">
        <form className="checkout__form" onSubmit={submit} noValidate>
          {addressFieldset("ship", ship, setShip, "Contact & Shipping")}

          {/* Billing */}
          <div className="checkout-block">
            <p className="checkout-block__label">Billing Address</p>
            <label className="checkout-check checkout-check--soft">
              <input type="checkbox" checked={billSame} onChange={(e) => setBillSame(e.target.checked)} />
              <span>Same as shipping</span>
            </label>
            {!billSame ? addressFieldset("bill", bill, setBill, "Billing Address") : null}
          </div>

          {/* Business GST */}
          <div className="checkout-block">
            <label className="checkout-check checkout-check--soft">
              <input type="checkbox" checked={wantGst} onChange={(e) => setWantGst(e.target.checked)} />
              <span>Need a GST Invoice?</span>
            </label>
            {wantGst ? (
              <div className="checkout-fields checkout-fields--biz">
                <label className="checkout-field">
                  <span className="checkout-field__label">GSTIN</span>
                  <input className="checkout-field__input" value={biz.gstin} placeholder="15-character GSTIN"
                    onChange={(e) => { setBiz({ ...biz, gstin: e.target.value.toUpperCase() }); if (errors.gstin) setErrors((x) => ({ ...x, gstin: "" })); }}
                    aria-invalid={Boolean(errors.gstin)} />
                  {errors.gstin ? <span className="checkout-field__error">{errors.gstin}</span> : null}
                </label>
                <label className="checkout-field">
                  <span className="checkout-field__label">Business name</span>
                  <input className="checkout-field__input" value={biz.companyName}
                    onChange={(e) => { setBiz({ ...biz, companyName: e.target.value }); if (errors.companyName) setErrors((x) => ({ ...x, companyName: "" })); }}
                    aria-invalid={Boolean(errors.companyName)} />
                  {errors.companyName ? <span className="checkout-field__error">{errors.companyName}</span> : null}
                </label>
              </div>
            ) : null}
          </div>

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

          {paid ? (
            <div className="checkout__next" role="status">
              <p className="checkout__next-title">✓ Payment received — thank you, {ship.fullName.split(" ")[0]}.</p>
              <p className="checkout__next-sub">
                Your payment succeeded in Test Mode. Order confirmation, invoice and email are the next build step
                (the webhook confirms every order) — your bag stays until the order is recorded.
              </p>
            </div>
          ) : (
            <>
              {payError ? <p className="checkout__pay-error" role="alert">{payError}</p> : null}
              <button type="submit" className="checkout__submit" disabled={paying}>
                {paying ? "Opening secure payment…" : "Continue to Payment"}
              </button>
              <ul className="checkout__trust">
                {TRUST.map((t) => <li key={t} className="checkout__trust-item">{t}</li>)}
              </ul>
            </>
          )}
          <p className="checkout__note">One final step before your collection begins its journey.</p>
          <p className="checkout__note-sub">Secure checkout. No account required.</p>
        </form>

        {/* ── Summary ── */}
        <aside className="checkout__summary">
          <h2 className="checkout__summary-title">Order Summary</h2>

          <ul className="checkout__items">{items.map(summaryItem)}</ul>

          {/* Coupon — deliberately minimal (not an Amazon-style field) */}
          <div className="checkout__code-wrap">
            {couponApplied ? (
              <p className="checkout__code-applied">Code {couponCode} applied.</p>
            ) : !showCode ? (
              <button type="button" className="checkout__code-toggle" onClick={() => setShowCode(true)}>
                Have a code?
              </button>
            ) : (
              <div className="checkout__code">
                <input
                  className="checkout__code-input"
                  value={codeInput}
                  placeholder="Enter code"
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCode(); } }}
                />
                <button type="button" className="checkout__code-apply" onClick={applyCode}>Apply</button>
              </div>
            )}
            {couponCode && !couponApplied ? (
              <p className="checkout__code-error">That code isn’t recognised.</p>
            ) : null}
          </div>

          <div className="checkout__delivery">
            <span className="checkout__delivery-label">Estimated Delivery</span>
            <span className="checkout__delivery-value">Ships in 1–2 business days</span>
            <span className="checkout__delivery-note">Estimated delivery calculated after PIN verification.</span>
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
              Inclusive of all applicable GST{ship.state ? `, billed as ${totals.interState ? "IGST" : "CGST + SGST"}` : ""}.
            </p>
          </div>

          <Link href="/cart" className="checkout__back">Return to bag</Link>
        </aside>
      </div>
    </div>
  );
}
