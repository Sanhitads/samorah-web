/**
 * ORDER_DISPATCHED template — "your order has shipped". Composed from the shared
 * sections; the Track button points at Samorah's OWN tracking page (provider-
 * agnostic), carrying the signed order token. Pure + testable.
 */
import { COMMERCE } from "@/config/commerce";
import { productionUrl } from "@/config/site";
import { signOrderToken } from "@/lib/orderToken";
import { C, emailLayout, sectionHeader, sectionHero, sectionSupport, sectionFooter } from "./templates";

export interface DispatchEmailInput {
  order_number: string;
  ship_full_name?: string | null;
  email: string;
  courier_name?: string | null;
  awb?: string | null;
}

const sans = "Arial,Helvetica,sans-serif";
const serif = "Georgia,'Times New Roman',serif";

export function buildDispatchNotificationEmail(input: DispatchEmailInput): { subject: string; html: string; text: string } {
  const token = signOrderToken(input.order_number);
  const trackUrl = productionUrl(`/order/${input.order_number}/track?t=${encodeURIComponent(token)}`);
  const first = input.ship_full_name?.split(" ")[0] ?? "friend";

  const shipmentBlock = `<tr><td style="padding:8px 40px 4px;text-align:center;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      ${input.courier_name ? `<tr><td style="padding:2px 12px;font:400 11px/1.6 ${sans};letter-spacing:1px;text-transform:uppercase;color:${C.smoke};">Courier</td><td style="padding:2px 12px;font:400 13px/1.6 ${serif};color:${C.ink};">${input.courier_name}</td></tr>` : ""}
      ${input.awb ? `<tr><td style="padding:2px 12px;font:400 11px/1.6 ${sans};letter-spacing:1px;text-transform:uppercase;color:${C.smoke};">Tracking No.</td><td style="padding:2px 12px;font:400 13px/1.6 ${serif};color:${C.ink};">${input.awb}</td></tr>` : ""}
    </table>
  </td></tr>`;

  const html = emailLayout(
    sectionHeader() +
      sectionHero("On Its Way", `It's on the way, ${first}.`, "Your collection has been dispatched and is heading to you.") +
      shipmentBlock +
      // Reuse the actions section: pass the track URL as the "order" link; no invoice button here.
      `<tr><td style="padding:14px 40px 4px;text-align:center;">
        <a href="${trackUrl}" style="display:inline-block;padding:14px 30px;background:${C.ink};color:${C.ivory};font:400 11px/1 ${sans};letter-spacing:2px;text-transform:uppercase;text-decoration:none;">Track Shipment</a>
      </td></tr>` +
      sectionSupport({ dispatchNotice: false }) +
      sectionFooter(),
  );

  const text = [
    `${COMMERCE.brandName.toUpperCase()} — On Its Way`,
    ``,
    `It's on the way, ${first}. Your collection has been dispatched.`,
    input.courier_name ? `Courier: ${input.courier_name}` : null,
    input.awb ? `Tracking No.: ${input.awb}` : null,
    ``,
    `Track your shipment: ${trackUrl}`,
    ``,
    `Questions? Simply reply to this email.`,
    ``,
    COMMERCE.brandName.toUpperCase(),
    productionUrl(),
    COMMERCE.support.email,
    `${COMMERCE.registeredAddress.city}, ${COMMERCE.registeredAddress.state}, ${COMMERCE.registeredAddress.country}`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  return { subject: `Your ${COMMERCE.brandName} order ${input.order_number} has shipped`, html, text };
}
