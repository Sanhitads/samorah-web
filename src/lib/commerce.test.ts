import { describe, it, expect, afterEach } from "vitest";
import { computeOrderTotals, type CommerceLine } from "@/lib/commerce";
import { requiresPayment } from "@/lib/orders";
import { COUPONS, type Coupon } from "@/lib/promotions";
import { TAX_VERSION, PRICING_VERSION, COMMERCE_ENGINE_VERSION, STORE_STATE } from "@/config/commerce";

// Config-driven so the tests follow the registered state (place of supply).
const HOME = STORE_STATE; // intra-state → CGST + SGST
const AWAY = STORE_STATE.toLowerCase() === "maharashtra" ? "Karnataka" : "Maharashtra"; // inter → IGST

const line = (key: string, price: number, taxClass = "candle", qty = 1, compositionId?: string): CommerceLine => ({
  key,
  name: key,
  unitPrice: price,
  qty,
  taxClass,
  compositionId,
});

// All money fields are integer paise.
const MONEY_KEYS = [
  "subtotal", "discount", "goodsTotal", "shipping", "shippingTaxable", "shippingGst",
  "taxableValue", "gst", "cgst", "sgst", "igst", "giftCard", "total", "payable", "freeShippingRemaining",
] as const;

describe("commerce engine — GST-compliant totals (paise)", () => {
  it("money-safety: every money field is an integer (paise)", () => {
    const t = computeOrderTotals([line("a", 899), line("b", 499, "room_spray")], { state: HOME });
    for (const k of MONEY_KEYS) expect(Number.isInteger(t[k]), `${k}=${t[k]}`).toBe(true);
    // provenance stamps frozen on the order
    expect(t.taxVersion).toBe(TAX_VERSION);
    expect(t.pricingVersion).toBe(PRICING_VERSION);
    expect(t.commerceVersion).toBe(COMMERCE_ENGINE_VERSION);
  });

  it("single product GST — candle ₹899 @12% (intra-state)", () => {
    const t = computeOrderTotals([line("a", 899)], { state: HOME });
    expect(t.subtotal).toBe(89900);
    // 899 < 1499 → ₹99 shipping applies
    expect(t.freeShipping).toBe(false);
    expect(t.shipping).toBe(9900);
    // line GST @12% + shipping GST @12% (principal)
    expect(t.lines[0].gst).toBe(89900 - Math.round(89900 / 1.12)); // 9632
    expect(t.shippingGst).toBe(9900 - Math.round(9900 / 1.12)); // 1061
    expect(t.gst).toBe(t.lines[0].gst + t.shippingGst);
    expect(t.cgst + t.sgst).toBe(t.gst); // intra → CGST+SGST = GST
    expect(t.igst).toBe(0);
  });

  it("Discovery Composition — 3 candles ₹580, 15% per line", () => {
    const items = [line("a", 580, "candle", 1, "c1"), line("b", 580, "candle", 1, "c1"), line("c", 580, "candle", 1, "c1")];
    const t = computeOrderTotals(items, { state: HOME });
    expect(t.subtotal).toBe(174000);
    // 580 → bundleUnitPrice 493; discount (580−493)*3 = ₹261
    expect(t.discount).toBe(26100);
    expect(t.goodsTotal).toBe(147900);
    expect(t.promotions[0].code).toBe("DISCOVERY_COMPOSITION");
    expect(t.promotions[0].amount).toBe(26100); // immutable snapshot
  });

  it("mixed GST rates — candle 12% + two sprays 18% (per-line, not cart-total)", () => {
    const t = computeOrderTotals(
      [line("a", 899, "candle"), line("b", 499, "room_spray"), line("c", 499, "linen_spray")],
      { state: HOME },
    );
    // ≥ ₹1,499 → free shipping; pure goods GST
    expect(t.freeShipping).toBe(true);
    expect(t.shipping).toBe(0);
    // 96.32 + 76.12 + 76.12 = ₹248.56 (extracted per rate)
    expect(t.gst).toBe(24856);
    // the WRONG single-rate answer would be ₹203.25 — guard against regressing to it
    expect(t.gst).not.toBe(20325);
    expect(t.cgst).toBe(12428);
    expect(t.sgst).toBe(12428);
  });

  it("shipping GST — ₹99 shipping is taxable at the principal rate (12%)", () => {
    const t = computeOrderTotals([line("a", 580), line("b", 520)], { state: AWAY }); // goods 1100 < 1499
    expect(t.freeShipping).toBe(false);
    expect(t.shipping).toBe(9900);
    expect(t.shippingGstRate).toBe(12);
    expect(t.shippingTaxable).toBe(8839);
    expect(t.shippingGst).toBe(1061);
    expect(t.igst).toBe(t.gst); // inter-state → all IGST
    expect(t.cgst).toBe(0);
  });

  it("free-shipping threshold — ≥ ₹1,499 ships free", () => {
    expect(computeOrderTotals([line("a", 1599)]).freeShipping).toBe(true);
    expect(computeOrderTotals([line("a", 1499)]).freeShipping).toBe(true);
    expect(computeOrderTotals([line("a", 1498)]).freeShipping).toBe(false);
  });

  it("honours an admin-configured free-shipping threshold override (single source of truth)", () => {
    // ₹1,200 is charged under the default ₹1,499…
    const dflt = computeOrderTotals([line("a", 1200)]);
    expect(dflt.freeShipping).toBe(false);
    expect(dflt.freeShippingRemaining).toBe(29900); // (1499 − 1200) × 100 paise
    // …but ships free once the threshold is lowered to ₹1,000.
    const lowered = computeOrderTotals([line("a", 1200)], { freeShippingThresholdInr: 1000 });
    expect(lowered.freeShipping).toBe(true);
    expect(lowered.shipping).toBe(0);
    expect(lowered.freeShippingRemaining).toBe(0);
    // Raising the threshold makes a previously-free ₹1,600 order charged again.
    const raised = computeOrderTotals([line("a", 1600)], { freeShippingThresholdInr: 2000 });
    expect(raised.freeShipping).toBe(false);
    expect(raised.freeShippingRemaining).toBe(40000); // (2000 − 1600) × 100
  });

  it("inter-state place of supply → IGST, intra-state → CGST+SGST", () => {
    const inter = computeOrderTotals([line("a", 899)], { state: AWAY });
    expect(inter.interState).toBe(true);
    expect(inter.igst).toBe(inter.gst);
    const intra = computeOrderTotals([line("a", 899)], { state: HOME });
    expect(intra.interState).toBe(false);
    expect(intra.igst).toBe(0);
  });

  // ── Additions from the Commerce Test Matrix ──
  it("GST-004 — mixed cart: shipping taxed at the HIGHEST rate (18%)", () => {
    const t = computeOrderTotals([line("a", 899, "candle"), line("b", 499, "room_spray")], { state: HOME });
    expect(t.freeShipping).toBe(false); // 1398 < 1499
    expect(t.shipping).toBe(9900);
    expect(t.shippingGstRate).toBe(18); // highest rate present
    expect(t.shippingGst).toBe(9900 - Math.round(9900 / 1.18));
  });

  it("GST-005 — line-item taxes sum EXACTLY to the header (no 1-paisa drift)", () => {
    const t = computeOrderTotals(
      [line("a", 899, "candle"), line("b", 499, "room_spray"), line("c", 333, "linen_spray")],
      { state: AWAY },
    );
    const lineGst = t.lines.reduce((s, l) => s + l.gst, 0);
    const lineTax = t.lines.reduce((s, l) => s + l.taxableValue, 0);
    expect(lineGst + t.shippingGst).toBe(t.gst);
    expect(lineTax + t.shippingTaxable).toBe(t.taxableValue);
    expect(t.cgst + t.sgst + t.igst).toBe(t.gst);
  });

  it("GC-001 — gift card covering the total → payable ₹0, Razorpay bypassed", () => {
    const t = computeOrderTotals([line("a", 899)], { state: HOME, giftCard: 9_99_999 });
    expect(t.payable).toBe(0);
    expect(requiresPayment(t.payable)).toBe(false);
    expect(requiresPayment(t.total)).toBe(true); // the order still has value
  });

  it("GST-006 — 100% discount (free order) → taxable ₹0, GST ₹0, no shipping", () => {
    const c: Coupon = {
      code: "FREE100", label: "Free", campaign: "x", version: "v1", priority: 5,
      stackable: true, exclusive: false, combinableWith: ["*"], type: "percentage", value: 100, active: true,
    };
    COUPONS.push(c);
    const t = computeOrderTotals([line("a", 899)], { state: HOME, couponCode: "FREE100" });
    expect(t.goodsTotal).toBe(0);
    expect(t.shipping).toBe(0);
    expect(t.gst).toBe(0);
    expect(t.taxableValue).toBe(0);
  });
});

afterEach(() => {
  COUPONS.length = 0;
});
