/**
 * Modular email sections — Header · Hero · Order Summary · Shipping Address ·
 * Actions (Invoice/View) · Support · Footer. Each is a reusable, inline-styled
 * fragment (email clients ignore external CSS); templates compose them.
 */
import { COMMERCE } from "@/config/commerce";
import { productionOrigin } from "@/config/site";

export const C = { ink: "#1f1a16", gold: "#c9a96e", smoke: "#6b6259", ivory: "#faf7f2", hair: "rgba(31,26,22,0.1)" };
const serif = "Georgia,'Times New Roman',serif";
const sans = "Arial,Helvetica,sans-serif";

export function emailLayout(inner: string): string {
  return `<!doctype html><html><body style="margin:0;background:${C.ivory};padding:0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.ivory};padding:32px 16px;">
   <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${C.hair};">
      ${inner}
    </table>
   </td></tr>
  </table></body></html>`;
}

export function sectionHeader(): string {
  return `<tr><td style="padding:28px 40px 0;text-align:center;">
    <div style="font:400 22px/1 ${serif};letter-spacing:4px;color:${C.ink};">${COMMERCE.brandName.toUpperCase()}</div>
  </td></tr>`;
}

export function sectionHero(eyebrow: string, title: string, subtitle: string): string {
  return `<tr><td style="padding:22px 40px 8px;text-align:center;">
    <div style="font:400 11px/1 ${sans};letter-spacing:3px;text-transform:uppercase;color:${C.gold};">${eyebrow}</div>
    <div style="font:400 26px/1.2 ${serif};color:${C.ink};margin-top:14px;">${title}</div>
    ${subtitle ? `<div style="font:400 14px/1.6 ${serif};color:${C.smoke};margin-top:12px;">${subtitle}</div>` : ""}
  </td></tr>`;
}

export function sectionOrderSummary(orderNumber: string, rowsHtml: string, totalsHtml: string): string {
  return `<tr><td style="padding:20px 40px;">
    <div style="font:400 11px/1 ${sans};letter-spacing:1px;text-transform:uppercase;color:${C.smoke};">Order ${orderNumber}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">${rowsHtml}</table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;">${totalsHtml}</table>
  </td></tr>`;
}

export function sectionShippingAddress(o: {
  ship_full_name?: string | null;
  ship_line1?: string | null;
  ship_line2?: string | null;
  ship_city?: string | null;
  ship_state?: string | null;
  ship_pincode?: string | null;
  ship_phone?: string | null;
}): string {
  const line2 = o.ship_line2 ? `, ${o.ship_line2}` : "";
  return `<tr><td style="padding:4px 40px 12px;">
    <div style="font:400 10px/1 ${sans};letter-spacing:1.5px;text-transform:uppercase;color:${C.smoke};">Delivered To</div>
    <div style="font:400 13px/1.7 ${serif};color:${C.ink};margin-top:6px;">
      ${o.ship_full_name ?? ""}<br/>
      ${o.ship_line1 ?? ""}${line2}<br/>
      ${o.ship_city ?? ""}, ${o.ship_state ?? ""} ${o.ship_pincode ?? ""}
      ${o.ship_phone ? `<br/>Mobile: ${o.ship_phone}` : ""}
    </div>
  </td></tr>`;
}

/** Actions — Download Tax Invoice is the primary button; View Order secondary. */
export function sectionActions(orderUrl: string, invoiceUrl: string | null): string {
  const invoiceBtn = invoiceUrl
    ? `<a href="${invoiceUrl}" style="display:inline-block;padding:14px 30px;background:${C.ink};color:${C.ivory};font:400 11px/1 ${sans};letter-spacing:2px;text-transform:uppercase;text-decoration:none;">Download Tax Invoice</a>`
    : "";
  const viewLink = `<a href="${orderUrl}" style="font:400 11px/1 ${sans};letter-spacing:1px;color:${C.gold};text-decoration:underline;">View Order</a>`;
  return `<tr><td style="padding:8px 40px 4px;text-align:center;">
    ${invoiceBtn}
    <div style="margin-top:${invoiceUrl ? "14px" : "0"};">${viewLink}</div>
  </td></tr>`;
}

/** `dispatchNotice` (default true) shows the "you'll get a dispatch email" line —
 *  correct for the confirmation email, but omitted for the dispatch email itself. */
export function sectionSupport(opts?: { dispatchNotice?: boolean }): string {
  const notice =
    opts?.dispatchNotice === false
      ? ""
      : `<div style="font:400 12px/1.6 ${serif};color:${C.smoke};">You'll receive another email the moment your order is dispatched.</div>`;
  return `<tr><td style="padding:20px 40px 4px;text-align:center;">
    ${notice}
    <div style="font:400 12px/1.6 ${serif};color:${C.smoke};margin-top:${notice ? "8px" : "0"};">Questions? Simply reply to this email — a real person will help.</div>
  </td></tr>`;
}

export function sectionFooter(): string {
  const origin = productionOrigin(); // always the canonical domain
  const a = COMMERCE.registeredAddress;
  return `<tr><td style="padding:22px 40px 36px;text-align:center;border-top:1px solid ${C.hair};">
    <div style="font:400 12px/1 ${serif};letter-spacing:3px;text-transform:uppercase;color:${C.ink};">${COMMERCE.brandName.toUpperCase()}</div>
    <div style="margin-top:10px;"><a href="${origin}" style="font:400 11px/1.7 ${sans};color:${C.gold};text-decoration:none;">${origin}</a></div>
    <div><a href="mailto:${COMMERCE.support.email}" style="font:400 11px/1.7 ${sans};color:${C.smoke};text-decoration:none;">${COMMERCE.support.email}</a></div>
    <div style="font:400 11px/1.7 ${sans};color:${C.smoke};">${a.city}, ${a.state}, ${a.country}</div>
  </td></tr>`;
}
