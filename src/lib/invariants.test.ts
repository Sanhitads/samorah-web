/**
 * Commerce INVARIANTS — the cross-surface guarantees that must never regress.
 * Every money surface (Cart · Checkout · Razorpay create-order) is proven here to
 * be the SAME number, produced by the SAME engine (`computeOrderTotals`). If a
 * future change introduces a parallel calculation anywhere, one of these breaks.
 *
 * Stage 2B will extend this file: the webhook, invoice, and order-confirmation
 * totals must be asserted byte-identical to `repriceCart` here too (see the
 * `TODO(2B)` guard at the bottom).
 */
import { describe, it, expect, vi } from "vitest";
import { buildCartSummary } from "@/lib/cart";
import { calculateOrderTotals } from "@/lib/checkout";
import { STORE_STATE } from "@/config/commerce";

// The Razorpay path (repriceCart) re-derives prices from the catalogue. We mock the
// catalogue so the engine math — not the data source — is what's under test.
vi.mock("@/services/productService", () => ({
  getProductBySlug: vi.fn(async (slug: string) => CATALOGUE[slug] ?? null),
}));

import { repriceCart, type ClientCartLine } from "@/lib/repricing";

const HOME = STORE_STATE; // intra-state → CGST + SGST
const AWAY = STORE_STATE.toLowerCase() === "maharashtra" ? "Karnataka" : "Maharashtra"; // inter → IGST

// ── A tiny fake catalogue (candles only; Air isn't needed for these identities) ──
type FakeVariant = { vessel_type: string | null; size_label: string | null; price: number; sale_price: number | null; is_active: boolean };
type FakeProduct = { name: string; price?: number | null; variants?: FakeVariant[] };
const candle = (name: string, variants: FakeVariant[]): FakeProduct => ({ name, variants });
const v = (vessel: string, size: string, price: number): FakeVariant => ({ vessel_type: vessel, size_label: size, price, sale_price: null, is_active: true });

const CATALOGUE: Record<string, FakeProduct> = {
  modak: candle("Modak", [v("Ceramic", "200g", 899), v("Glass", "100g", 580)]),
  "gajar-halwa": candle("Gajar Halwa", [v("Glass", "100g", 580)]),
  "kashmiri-chai": candle("Kashmiri Chai", [v("Glass", "100g", 580)]),
  "room-spray": candle("Aer Room Spray", [v("Bottle", "200ml", 499)]), // priced like a candle here; taxClass forced below
};

// The three surfaces express the SAME cart in their own input shapes.
type Sku = { slug: string; name: string; vessel: string; size: string; price: number; qty: number; productType?: string; compositionId?: string };
const cartItems = (skus: Sku[]) =>
  skus.map((s, i) => ({ key: `k${i}`, name: s.name, price: s.price, qty: s.qty, productType: s.productType, compositionId: s.compositionId }));
const clientLines = (skus: Sku[]): ClientCartLine[] =>
  skus.map((s, i) => ({ key: `k${i}`, slug: s.slug, name: s.name, vessel: s.vessel, size: s.size, qty: s.qty, compositionId: s.compositionId, productType: s.productType }));

// A single-candle order and a full 3-candle Discovery Composition.
const SINGLE: Sku[] = [{ slug: "modak", name: "Modak", vessel: "ceramic", size: "200g", price: 899, qty: 1, productType: "candle" }];
const COMPOSITION: Sku[] = [
  { slug: "modak", name: "Modak", vessel: "glass", size: "100g", price: 580, qty: 1, productType: "candle", compositionId: "c1" },
  { slug: "gajar-halwa", name: "Gajar Halwa", vessel: "glass", size: "100g", price: 580, qty: 1, productType: "candle", compositionId: "c1" },
  { slug: "kashmiri-chai", name: "Kashmiri Chai", vessel: "glass", size: "100g", price: 580, qty: 1, productType: "candle", compositionId: "c1" },
];

describe("INVARIANT · Cart ↔ Checkout parity (same items, one engine)", () => {
  for (const [label, skus] of [["single candle", SINGLE], ["Discovery Composition", COMPOSITION]] as const) {
    it(`${label}: subtotal · discount · shipping · total are identical`, () => {
      const cart = buildCartSummary(cartItems(skus));
      const checkout = calculateOrderTotals(cartItems(skus), HOME);
      expect(cart.subtotal).toBe(checkout.subtotal);
      expect(cart.discount).toBe(checkout.discount); // composition discount identical
      expect(cart.shipping).toBe(checkout.shipping);
      expect(cart.total).toBe(checkout.total);
      expect(cart.gst).toBe(checkout.gst);
    });
  }
});

describe("INVARIANT · GST accounting identities (Checkout)", () => {
  it("Taxable Value + GST = Total (goods + shipping, exact in paise)", () => {
    for (const skus of [SINGLE, COMPOSITION]) {
      const t = calculateOrderTotals(cartItems(skus), HOME);
      expect(t.taxableValue + t.gst).toBe(t.total);
    }
  });

  it("intra-state → CGST + SGST = Total GST, IGST = 0", () => {
    const t = calculateOrderTotals(cartItems(SINGLE), HOME);
    expect(t.interState).toBe(false);
    expect(t.cgst + t.sgst).toBe(t.gst);
    expect(t.igst).toBe(0);
  });

  it("inter-state → IGST = Total GST, CGST = SGST = 0", () => {
    const t = calculateOrderTotals(cartItems(SINGLE), AWAY);
    expect(t.interState).toBe(true);
    expect(t.igst).toBe(t.gst);
    expect(t.cgst).toBe(0);
    expect(t.sgst).toBe(0);
  });

  it("line-item taxes sum EXACTLY to the header (no 1-paisa drift)", () => {
    const t = calculateOrderTotals(cartItems(COMPOSITION), AWAY);
    const lineGst = t.lines.reduce((s, l) => s + l.gst, 0);
    const lineTax = t.lines.reduce((s, l) => s + l.taxableValue, 0);
    expect(lineGst + t.shippingGst).toBe(t.gst);
    expect(lineTax + t.shippingTaxable).toBe(t.taxableValue);
  });
});

describe("INVARIANT · Razorpay create-order == Checkout (server re-price, one engine)", () => {
  const FIELDS = ["subtotal", "discount", "goodsTotal", "shipping", "shippingGst", "taxableValue", "gst", "cgst", "sgst", "igst", "total", "payable"] as const;

  for (const [label, skus] of [["single candle", SINGLE], ["Discovery Composition", COMPOSITION]] as const) {
    for (const state of [HOME, AWAY]) {
      it(`${label} @ ${state}: server payable & every GST field match Checkout`, async () => {
        const priced = await repriceCart(clientLines(skus), state);
        expect(priced.valid).toBe(true);
        const checkout = calculateOrderTotals(cartItems(skus), state);
        for (const f of FIELDS) expect(priced.totals![f], f).toBe(checkout[f]);
        // The amount handed to Razorpay is exactly the server payable (paise).
        expect(priced.totals!.payable).toBe(checkout.payable);
      });
    }
  }

  it("rejects a tampered composition (only 2 candles) — never prices an invalid bag", async () => {
    const priced = await repriceCart(clientLines(COMPOSITION.slice(0, 2)), HOME);
    expect(priced.valid).toBe(false);
    expect(priced.totals).toBeNull();
  });
});

// TODO(2B): when the webhook / invoice / order-confirmation land, assert their
// totals are byte-identical to `repriceCart(...).totals` here. The webhook is the
// ONLY place the cart may be cleared — after the order is persisted.
