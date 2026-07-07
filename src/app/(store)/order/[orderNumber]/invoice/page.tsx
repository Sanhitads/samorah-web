import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getOrderByNumber } from "@/services/orderService";
import { verifyOrderToken } from "@/lib/orderToken";
import { COMMERCE } from "@/config/commerce";
import { PrintButton } from "@/components/order/PrintButton";

/**
 * Tax invoice — `/order/[orderNumber]/invoice?t=<token>`. A print-ready GST invoice
 * rendered entirely from the ORDER SNAPSHOT (legal name, GSTIN, HSN per line, GST
 * split, invoice number) — never live catalogue data, so it's stable forever. The
 * description keeps Samorah's Volume → Chapter → No. → Product hierarchy and groups
 * Discovery Compositions. Token-gated; "Save as PDF" via the browser print flow.
 */
export const metadata: Metadata = {
  title: "Tax Invoice",
  robots: { index: false },
};

const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (v: unknown) => Number(v ?? 0);
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
const fmtDate = (v: unknown) => {
  if (!v) return "";
  try {
    return new Date(String(v)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return String(v);
  }
};
const METHOD: Record<string, string> = { upi: "UPI", card: "Card", netbanking: "Net Banking", wallet: "Wallet", emi: "EMI", paylater: "Pay Later" };
const methodLabel = (m: string | null) => (m && m !== "razorpay" ? `Razorpay · ${METHOD[m] ?? cap(m)}` : "Razorpay");

interface Item {
  id: string;
  product_name: string;
  variant_name: string | null;
  vessel: string | null;
  size: string | null;
  volume_label: string | null;
  collection_name: string | null;
  edition_label: string | null;
  composition_id: string | null;
  hsn_code: string | null;
  gst_rate: number | null;
  quantity: number;
  line_taxable: number | string;
  line_cgst: number | string;
  line_sgst: number | string;
  line_igst: number | string;
  line_total: number | string;
}

export default async function InvoicePage({
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

  if (!order || !order.invoice_number) {
    return (
      <main className="inv-page">
        <div className="inv inv--missing">
          <p>Invoice unavailable.</p>
        </div>
      </main>
    );
  }

  const items = (order.order_items ?? []) as unknown as Item[];
  const interState = num(order.igst_amount) > 0;
  const cols = interState ? 8 : 9;
  const addr = COMMERCE.registeredAddress;

  // Group Discovery Composition lines; keep first-seen order.
  type Group = { type: "comp" | "single"; vessel?: string; items: Item[] };
  const groups: Group[] = [];
  const seen = new Map<string, Group>();
  for (const it of items) {
    if (it.composition_id) {
      let g = seen.get(it.composition_id);
      if (!g) {
        g = { type: "comp", vessel: it.vessel ?? "", items: [] };
        seen.set(it.composition_id, g);
        groups.push(g);
      }
      g.items.push(it);
    } else {
      groups.push({ type: "single", items: [it] });
    }
  }

  const Description = ({ it }: { it: Item }) => (
    <div className="inv__desc">
      {it.volume_label ? <span className="inv__desc-volume">{it.volume_label.toUpperCase()}</span> : null}
      {it.collection_name ? <span className="inv__desc-chapter">{it.collection_name}</span> : null}
      {it.edition_label ? <span className="inv__desc-edition">{it.edition_label}</span> : null}
      <span className="inv__desc-name">{it.product_name}</span>
      <span className="inv__desc-variant">{it.vessel ? [cap(it.vessel), it.size].filter(Boolean).join(" • ") : it.variant_name}</span>
    </div>
  );

  let n = 0;

  return (
    <main className="inv-page">
      <div className="inv">
        <div className="inv__actions">
          <PrintButton />
        </div>

        <header className="inv__head">
          <div>
            <p className="inv__brand">{COMMERCE.brandName}</p>
            <p className="inv__doc">Tax Invoice</p>
          </div>
          <div className="inv__meta">
            <p><span>Invoice No.</span> {order.invoice_number}</p>
            <p><span>Invoice Date</span> {fmtDate(order.invoice_date)}</p>
            <p><span>Order No.</span> {order.order_number}</p>
            <p><span>Order Date</span> {fmtDate(order.placed_at)}</p>
            <p><span>Payment</span> Paid · {methodLabel(order.payment_method)}</p>
            <p><span>Payment Date</span> {fmtDate(order.invoice_date)}</p>
          </div>
        </header>

        <section className="inv__parties">
          <div className="inv__party">
            <p className="inv__party-title">Sold By</p>
            <p className="inv__party-name">{COMMERCE.brandName}</p>
            <p className="inv__party-sub">{COMMERCE.legalName} · A {COMMERCE.constitution}</p>
            <p>{addr.line1}</p>
            <p>{addr.line2}, {addr.city}</p>
            <p>{addr.state} {addr.pincode}, {addr.country}</p>
            <p className="inv__gstin-label">GSTIN</p>
            <p className="inv__gstin">{COMMERCE.gstin}</p>
          </div>
          <div className="inv__party">
            <p className="inv__party-title">Delivered To</p>
            <p className="inv__party-name">{order.ship_full_name}</p>
            <p>{order.ship_line1}{order.ship_line2 ? `, ${order.ship_line2}` : ""}</p>
            <p>{order.ship_city}, {order.ship_state} {order.ship_pincode}</p>
            {order.ship_phone ? <p>Mobile: {order.ship_phone}</p> : null}
            <p className="inv__party-sub">Place of supply: {order.ship_state}</p>
          </div>
        </section>

        <table className="inv__table">
          <thead>
            <tr>
              <th>#</th>
              <th className="inv__col-desc">Description</th>
              <th>HSN</th>
              <th className="inv__col-num">Qty</th>
              <th className="inv__col-num">Taxable</th>
              <th className="inv__col-num">GST%</th>
              {interState ? (
                <th className="inv__col-num">IGST</th>
              ) : (
                <>
                  <th className="inv__col-num">CGST</th>
                  <th className="inv__col-num">SGST</th>
                </>
              )}
              <th className="inv__col-num">Total</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => {
              const rows: ReactNode[] = [];
              if (g.type === "comp") {
                rows.push(
                  <tr key={`h-${gi}`} className="inv__group-head">
                    <td colSpan={cols}>
                      Discovery Composition — {cap(g.vessel ?? "")} Edition · {g.items.length} Signature Candles
                    </td>
                  </tr>,
                );
              }
              for (const it of g.items) {
                n += 1;
                rows.push(
                  <tr key={it.id}>
                    <td>{n}</td>
                    <td className="inv__col-desc"><Description it={it} /></td>
                    <td>{it.hsn_code}</td>
                    <td className="inv__col-num">{it.quantity}</td>
                    <td className="inv__col-num">{inr(it.line_taxable)}</td>
                    <td className="inv__col-num">{it.gst_rate}%</td>
                    {interState ? (
                      <td className="inv__col-num">{inr(it.line_igst)}</td>
                    ) : (
                      <>
                        <td className="inv__col-num">{inr(it.line_cgst)}</td>
                        <td className="inv__col-num">{inr(it.line_sgst)}</td>
                      </>
                    )}
                    <td className="inv__col-num">{inr(it.line_total)}</td>
                  </tr>,
                );
              }
              return rows;
            })}
          </tbody>
        </table>

        <div className="inv__totals">
          <div className="inv__t-row"><span>Taxable value</span><span>{inr(order.taxable_amount)}</span></div>
          {interState ? (
            <div className="inv__t-row"><span>IGST</span><span>{inr(order.igst_amount)}</span></div>
          ) : (
            <>
              <div className="inv__t-row"><span>CGST</span><span>{inr(order.cgst_amount)}</span></div>
              <div className="inv__t-row"><span>SGST</span><span>{inr(order.sgst_amount)}</span></div>
            </>
          )}
          {num(order.shipping_amount) > 0 ? (
            <div className="inv__t-row"><span>Shipping</span><span>{inr(order.shipping_amount)}</span></div>
          ) : null}
          {num(order.discount_amount) > 0 ? (
            <div className="inv__t-row inv__t-row--discount"><span>Discovery Composition Savings (15%)</span><span>−{inr(order.discount_amount)}</span></div>
          ) : null}
          <div className="inv__t-row inv__t-row--grand"><span>Grand Total</span><span>{inr(order.total_amount)}</span></div>
        </div>

        <footer className="inv__foot">
          <p>All prices are inclusive of applicable GST. This is a computer-generated tax invoice and does not require a physical signature.</p>
        </footer>
      </div>
    </main>
  );
}
