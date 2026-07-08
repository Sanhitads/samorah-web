/**
 * ORDER_CONFIRMATION template — composed from the modular sections. Every link uses
 * the PRODUCTION domain (never localhost/preview) via `productionUrl`, and carries
 * the signed order token. Pure function → unit-testable offline.
 */
import { COMMERCE } from "@/config/commerce";
import { productionUrl } from "@/config/site";
import { signOrderToken } from "@/lib/orderToken";
import {
  C,
  emailLayout,
  sectionHeader,
  sectionHero,
  sectionOrderSummary,
  sectionShippingAddress,
  sectionActions,
  sectionSupport,
  sectionFooter,
} from "./templates";

const money0 = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN")}`;
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
const serif = "Georgia,'Times New Roman',serif";
const sans = "Arial,Helvetica,sans-serif";

export interface EmailItem {
  product_name: string;
  variant_name: string | null;
  vessel: string | null;
  size: string | null;
  volume_label: string | null;
  collection_name: string | null;
  edition_label: string | null;
  composition_id: string | null;
  line_total: number | string;
}
export interface EmailOrder {
  order_number: string;
  invoice_number: string | null;
  email: string;
  ship_full_name: string | null;
  ship_line1?: string | null;
  ship_line2?: string | null;
  ship_city?: string | null;
  ship_state?: string | null;
  ship_pincode?: string | null;
  ship_phone?: string | null;
  subtotal: number | string;
  discount_amount: number | string;
  shipping_amount: number | string;
  total_amount: number | string;
  order_items?: EmailItem[];
}

const variantText = (it: EmailItem) =>
  it.vessel ? [cap(it.vessel), it.size].filter(Boolean).join(" • ") : it.variant_name ?? "";

function itemRow(it: EmailItem): string {
  const meta = [it.volume_label?.toUpperCase(), it.collection_name, it.edition_label].filter(Boolean).join(" &nbsp;·&nbsp; ");
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid ${C.hair};">
      ${meta ? `<div style="font:400 10px/1.4 ${sans};letter-spacing:1px;color:${C.smoke};text-transform:uppercase;">${meta}</div>` : ""}
      <div style="font:600 15px/1.3 ${serif};color:${C.ink};margin-top:2px;">${it.product_name}</div>
      ${variantText(it) ? `<div style="font:400 11px/1.4 ${sans};color:${C.smoke};">${variantText(it)}</div>` : ""}
    </td>
    <td style="padding:10px 0;border-bottom:1px solid ${C.hair};text-align:right;font:400 14px/1.3 ${serif};color:${C.ink};white-space:nowrap;">${money0(it.line_total)}</td>
  </tr>`;
}

function totalsRow(label: string, value: string, strong = false): string {
  const f = strong ? `600 16px/1.4 ${serif}` : `400 13px/1.4 ${sans}`;
  return `<tr><td style="padding:4px 0;font:${f};color:${C.ink};">${label}</td><td style="padding:4px 0;text-align:right;font:${f};color:${C.ink};">${value}</td></tr>`;
}

export function buildOrderConfirmationEmail(order: EmailOrder): { subject: string; html: string; text: string } {
  const token = signOrderToken(order.order_number);
  const orderUrl = productionUrl(`/order/${order.order_number}?t=${encodeURIComponent(token)}`);
  const invoiceUrl = order.invoice_number
    ? productionUrl(`/order/${order.order_number}/invoice?t=${encodeURIComponent(token)}`)
    : null;
  const first = order.ship_full_name?.split(" ")[0] ?? "friend";
  const items = order.order_items ?? [];

  // Group Discovery Composition lines (first-seen order).
  type Group = { type: "comp" | "single"; vessel?: string; items: EmailItem[] };
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
    } else groups.push({ type: "single", items: [it] });
  }

  const rowsHtml = groups
    .map((g) => {
      if (g.type === "comp") {
        const head = `<tr><td colspan="2" style="padding:16px 0 6px;font:600 10px/1.4 ${sans};letter-spacing:1.5px;text-transform:uppercase;color:${C.gold};">Discovery Composition — ${cap(g.vessel ?? "")} Edition · ${g.items.length} Candles</td></tr>`;
        return head + g.items.map(itemRow).join("");
      }
      return itemRow(g.items[0]);
    })
    .join("");

  const totalsHtml =
    totalsRow("Subtotal", money0(order.subtotal)) +
    (Number(order.discount_amount ?? 0) > 0 ? totalsRow("Discovery Composition Savings", "−" + money0(order.discount_amount)) : "") +
    totalsRow("Shipping", Number(order.shipping_amount ?? 0) > 0 ? money0(order.shipping_amount) : "Free") +
    totalsRow("Paid", money0(order.total_amount), true);

  const html = emailLayout(
    sectionHeader() +
      sectionHero(
        "Order Confirmed",
        `Thank you, ${first}.`,
        `Your collection is being prepared by hand.${order.invoice_number ? ` Tax invoice ${order.invoice_number} is ready below.` : ""}`,
      ) +
      sectionOrderSummary(order.order_number, rowsHtml, totalsHtml) +
      sectionShippingAddress(order) +
      sectionActions(orderUrl, invoiceUrl) +
      sectionSupport() +
      sectionFooter(),
  );

  // Plain-text alternative (multipart) — improves spam scores + accessibility.
  const itemText = (it: EmailItem) => {
    const meta = [it.volume_label?.toUpperCase(), it.collection_name, it.edition_label].filter(Boolean).join(" · ");
    const v = variantText(it);
    return `${meta ? `${meta}\n` : ""}${it.product_name}${v ? ` — ${v}` : ""}   ${money0(it.line_total)}`;
  };
  const linesText = groups
    .map((g) =>
      g.type === "comp"
        ? `Discovery Composition — ${cap(g.vessel ?? "")} Edition · ${g.items.length} Candles\n${g.items.map(itemText).join("\n\n")}`
        : itemText(g.items[0]),
    )
    .join("\n\n");
  const totalsText = [
    `Subtotal: ${money0(order.subtotal)}`,
    Number(order.discount_amount ?? 0) > 0 ? `Discovery Composition Savings: −${money0(order.discount_amount)}` : "",
    `Shipping: ${Number(order.shipping_amount ?? 0) > 0 ? money0(order.shipping_amount) : "Free"}`,
    `Paid: ${money0(order.total_amount)}`,
  ]
    .filter(Boolean)
    .join("\n");
  const text = ([
    `${COMMERCE.brandName.toUpperCase()} — Order Confirmed`,
    ``,
    `Thank you, ${first}. Your collection is being prepared by hand.`,
    order.invoice_number ? `Tax invoice ${order.invoice_number} is ready.` : null,
    ``,
    `Order ${order.order_number}`,
    `----------------------------------------`,
    linesText,
    `----------------------------------------`,
    totalsText,
    ``,
    invoiceUrl ? `Download Tax Invoice: ${invoiceUrl}` : null,
    `View Order: ${orderUrl}`,
    ``,
    `You'll receive another email the moment your order is dispatched.`,
    `Questions? Simply reply to this email.`,
    ``,
    COMMERCE.brandName.toUpperCase(),
    productionUrl(),
    COMMERCE.support.email,
    `${COMMERCE.registeredAddress.city}, ${COMMERCE.registeredAddress.state}, ${COMMERCE.registeredAddress.country}`,
  ].filter((l): l is string => l !== null)).join("\n");

  return { subject: `Your ${COMMERCE.brandName} order ${order.order_number} is confirmed`, html, text };
}
