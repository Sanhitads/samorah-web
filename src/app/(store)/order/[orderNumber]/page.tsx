import { TrackEvent } from "@/components/analytics/TrackEvent";
import type { Metadata } from "next";
import Link from "next/link";
import { getOrderByNumber } from "@/services/orderService";
import { verifyOrderToken } from "@/lib/orderToken";

/**
 * Order confirmation ("Thank-You") — `/order/[orderNumber]?t=<token>`. Reads the
 * SERVER-PERSISTED order (never client state). Access is gated by a signed
 * capability token issued at finalize (no IDOR). Renders the archive's editorial
 * hierarchy (Volume → Chapter → Number), groups Discovery Compositions as one
 * curated set, and shows what happens next + an order timeline.
 */
export const metadata: Metadata = {
  title: "Order Confirmed",
  robots: { index: false },
};

const money = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN")}`;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

interface OrderItem {
  id: string;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  line_total: number | string;
  line_subtotal: number | string;
  line_discount: number | string;
  brand_name: string | null;
  collection_name: string | null;
  volume_label: string | null;
  edition_label: string | null;
  vessel: string | null;
  size: string | null;
  image_url: string | null;
  composition_id: string | null;
}

const num = (v: unknown) => Number(v ?? 0);

const TIMELINE = [
  { key: "confirmed", label: "Order Confirmed" },
  { key: "processing", label: "Preparing Collection" },
  { key: "packed", label: "Packed" },
  { key: "shipped", label: "Dispatched" },
  { key: "delivered", label: "Delivered" },
] as const;
const STATUS_INDEX: Record<string, number> = { confirmed: 0, processing: 1, packed: 2, shipped: 3, delivered: 4 };

const variantText = (it: OrderItem) =>
  it.vessel ? [cap(it.vessel), it.size].filter(Boolean).join(" • ") : it.variant_name ?? "";

function ItemBody({ it }: { it: OrderItem }) {
  return (
    <span className="oc-item__body">
      {it.volume_label ? <span className="oc-item__volume">{it.volume_label.toUpperCase()}</span> : null}
      {it.collection_name ? <span className="oc-item__chapter">{it.collection_name}</span> : null}
      {it.edition_label ? <span className="oc-item__edition">{it.edition_label}</span> : null}
      <span className="oc-item__name">{it.product_name}</span>
      {variantText(it) ? <span className="oc-item__variant">{variantText(it)}</span> : null}
    </span>
  );
}

export default async function OrderConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { orderNumber } = await params;
  const { t } = await searchParams;

  let order: Awaited<ReturnType<typeof getOrderByNumber>> = null;
  if (verifyOrderToken(orderNumber, t)) {
    try {
      order = await getOrderByNumber(orderNumber);
    } catch {
      order = null;
    }
  }

  if (!order) {
    return (
      <main className="order-page">
        <div className="order-conf order-conf--missing">
          <p className="order-conf__eyebrow">Order</p>
          <h1 className="order-conf__title">We couldn’t find that order.</h1>
          <p className="order-conf__lead">
            If you’ve just paid, your confirmation may still be settling — check your email shortly.
          </p>
          <Link href="/shop" className="order-conf__cta">Discover Another Chapter</Link>
        </div>
      </main>
    );
  }

  const items = (order.order_items ?? []) as unknown as OrderItem[];
  const interState = Number(order.igst_amount ?? 0) > 0;
  const invoiceHref = `/order/${order.order_number}/invoice?t=${encodeURIComponent(t ?? "")}`;
  const reached = STATUS_INDEX[order.status] ?? 0;

  // Group Discovery Composition lines into one curated set; keep first-seen order.
  type Group = { type: "comp" | "single"; compositionId?: string; items: OrderItem[] };
  const groups: Group[] = [];
  const seen = new Map<string, Group>();
  for (const it of items) {
    if (it.composition_id) {
      let g = seen.get(it.composition_id);
      if (!g) {
        g = { type: "comp", compositionId: it.composition_id, items: [] };
        seen.set(it.composition_id, g);
        groups.push(g);
      }
      g.items.push(it);
    } else {
      groups.push({ type: "single", items: [it] });
    }
  }

  return (
    <main className="order-page">
      <TrackEvent event="purchase" params={{ transaction_id: order.order_number, value: Number(order.total_amount), currency: "INR", coupon: order.coupon_code ?? undefined }} />
      <div className="order-conf">
        <header className="order-conf__head">
          <p className="order-conf__eyebrow">Order Confirmed</p>
          <h1 className="order-conf__title">Your collection is on its way.</h1>
          <p className="order-conf__lead">
            Thank you, {order.ship_full_name?.split(" ")[0] ?? "friend"} — every piece is made by hand. A confirmation
            and tax invoice have been sent to {order.email}.
          </p>
        </header>

        <div className="order-conf__meta">
          <div className="order-conf__meta-item">
            <span className="order-conf__meta-label">Order</span>
            <span className="order-conf__meta-value">{order.order_number}</span>
          </div>
          {order.invoice_number ? (
            <div className="order-conf__meta-item">
              <span className="order-conf__meta-label">Tax Invoice</span>
              <span className="order-conf__meta-value order-conf__meta-value--strong">{order.invoice_number}</span>
              <a href={invoiceHref} target="_blank" rel="noopener noreferrer" className="order-conf__meta-action">
                Download Invoice
              </a>
            </div>
          ) : null}
          <div className="order-conf__meta-item">
            <span className="order-conf__meta-label">Estimated dispatch</span>
            <span className="order-conf__meta-value">Within 1–2 business days</span>
          </div>
        </div>

        {/* Order timeline */}
        <ol className="order-conf__timeline" aria-label="Order progress">
          {TIMELINE.map((step, i) => (
            <li key={step.key} className="oc-step" data-done={i <= reached} data-current={i === reached}>
              <span className="oc-step__dot" aria-hidden="true">{i <= reached ? "✓" : ""}</span>
              <span className="oc-step__label">{step.label}</span>
            </li>
          ))}
        </ol>

        {/* Items — Volume → Chapter → Number hierarchy; compositions grouped */}
        <ul className="order-conf__items">
          {groups.map((g, gi) => {
            if (g.type === "comp") {
              const vessel = g.items[0]?.vessel ?? "";
              const compTotal = g.items.reduce((s, it) => s + num(it.line_total), 0);
              const compSaved = g.items.reduce((s, it) => s + num(it.line_discount), 0);
              const compBefore = g.items.reduce((s, it) => s + num(it.line_subtotal), 0);
              const savedPct = compBefore > 0 ? Math.round((compSaved / compBefore) * 100) : 0;
              return (
                <li key={g.compositionId ?? gi} className="oc-comp">
                  <div className="oc-comp__head">
                    <span className="oc-comp__eyebrow">Discovery Composition</span>
                    {vessel ? <span className="oc-comp__vessel">{cap(vessel)} Edition</span> : null}
                    <span className="oc-comp__count">{g.items.length} Signature Candles</span>
                  </div>
                  <ul className="oc-comp__list">
                    {g.items.map((it) => (
                      <li key={it.id} className="oc-item oc-item--nested">
                        <span className="oc-item__media" aria-hidden="true" />
                        <ItemBody it={it} />
                      </li>
                    ))}
                  </ul>
                  <div className="oc-comp__foot">
                    <span className="oc-comp__total-label">Composition Total</span>
                    <span className="oc-comp__total">{money0(compTotal)}</span>
                  </div>
                  {compSaved > 0 ? (
                    <span className="oc-comp__savings">{savedPct}% Savings Applied</span>
                  ) : null}
                </li>
              );
            }
            const it = g.items[0];
            return (
              <li key={it.id} className="oc-item">
                <span className="oc-item__media" aria-hidden="true" />
                <ItemBody it={it} />
                <span className="oc-item__price">{money0(it.line_total)}</span>
              </li>
            );
          })}
        </ul>

        {/* Payment */}
        <div className="order-conf__payment">
          <div className="order-conf__payment-text">
            <span className="order-conf__payment-label">Payment</span>
            <span className="order-conf__payment-status">Successfully received</span>
          </div>
          <span className="order-conf__payment-amount">{money0(order.total_amount)}</span>
        </div>

        <div className="order-conf__totals">
          <div className="order-conf__row"><span>Subtotal</span><span>{money0(order.subtotal)}</span></div>
          {Number(order.discount_amount ?? 0) > 0 ? (
            <div className="order-conf__row order-conf__row--discount"><span>Savings</span><span>−{money0(order.discount_amount)}</span></div>
          ) : null}
          <div className="order-conf__row">
            <span>Shipping</span>
            <span>{Number(order.shipping_amount ?? 0) > 0 ? money0(order.shipping_amount) : "Free"}</span>
          </div>
          <div className="order-conf__row order-conf__row--muted"><span>Taxable value</span><span>{money(order.taxable_amount)}</span></div>
          {interState ? (
            <div className="order-conf__row order-conf__row--muted"><span>IGST</span><span>{money(order.igst_amount)}</span></div>
          ) : (
            <>
              <div className="order-conf__row order-conf__row--muted"><span>CGST</span><span>{money(order.cgst_amount)}</span></div>
              <div className="order-conf__row order-conf__row--muted"><span>SGST</span><span>{money(order.sgst_amount)}</span></div>
            </>
          )}
          <div className="order-conf__row order-conf__row--total"><span>Paid</span><span>{money0(order.total_amount)}</span></div>
          <p className="order-conf__tax-note">Inclusive of all applicable GST.</p>
        </div>

        {/* What happens next */}
        <section className="order-conf__next">
          <h2 className="order-conf__next-title">What happens next</h2>
          <p className="order-conf__next-lead">Your collection is now being prepared in our studio.</p>
          <ul className="order-conf__next-list">
            <li>Every candle is hand inspected.</li>
            <li>Carefully packed to travel well.</li>
            <li>You’ll receive another email the moment your order is dispatched.</li>
          </ul>
        </section>

        {/* Shipment tracking — space reserved for Shiprocket */}
        <div className="order-conf__track">
          <div className="order-conf__track-text">
            <span className="order-conf__track-label">Track Shipment</span>
            <span className="order-conf__track-status">Available once dispatched</span>
          </div>
          <span className="order-conf__track-cta" aria-disabled="true">Coming soon</span>
        </div>

        <div className="order-conf__ship">
          <p className="order-conf__ship-label">Shipping to</p>
          <p className="order-conf__ship-body">
            {order.ship_full_name}<br />
            {order.ship_line1}{order.ship_line2 ? `, ${order.ship_line2}` : ""}<br />
            {order.ship_city}, {order.ship_state} {order.ship_pincode}
            {order.ship_phone ? <><br />Mobile: {order.ship_phone}</> : null}
          </p>
        </div>

        <Link href="/shop" className="order-conf__cta">Discover Another Chapter</Link>
      </div>
    </main>
  );
}
