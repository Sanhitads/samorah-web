/**
 * ORDER_CANCELLED template — "your order has been cancelled". A dedicated email
 * (SLP principle 9): it states the order, the reason, and — when money is being
 * returned — the refund amount, status, and expected timeline. Cancellation and
 * refund are distinct: an order can be cancelled with no refund (e.g. unpaid), so
 * the refund block is conditional. Pure + testable.
 */
import { COMMERCE } from "@/config/commerce";
import { productionUrl } from "@/config/site";
import { C, emailLayout, sectionHeader, sectionHero, sectionFooter } from "./templates";

export interface CancellationEmailRefund {
  amount: number; // rupees
  status: "processing" | "processed" | "failed";
  method: "gateway" | "manual";
}

export interface CancellationEmailInput {
  order_number: string;
  ship_full_name?: string | null;
  email: string;
  reason?: string | null;
  refund?: CancellationEmailRefund | null;
}

const sans = "Arial,Helvetica,sans-serif";
const serif = "Georgia,'Times New Roman',serif";

/** Human refund timeline — gateway settles in a few business days; manual is hand-processed. */
function refundTimeline(r: CancellationEmailRefund): string {
  if (r.status === "processed") return "The amount has been refunded to your original payment method.";
  if (r.method === "manual") return "Our team will process this refund shortly and confirm once it's done.";
  return "The refund has been initiated and typically reaches your original payment method within 5–7 business days.";
}

export function buildCancellationEmail(input: CancellationEmailInput): { subject: string; html: string; text: string } {
  const first = input.ship_full_name?.split(" ")[0] ?? "friend";
  const r = input.refund && input.refund.status !== "failed" ? input.refund : null;

  const reasonBlock = input.reason
    ? `<tr><td style="padding:4px 40px 8px;text-align:center;">
        <div style="font:400 10px/1 ${sans};letter-spacing:1.5px;text-transform:uppercase;color:${C.smoke};">Reason</div>
        <div style="font:400 14px/1.6 ${serif};color:${C.ink};margin-top:6px;">${input.reason}</div>
      </td></tr>`
    : "";

  const refundBlock = r
    ? `<tr><td style="padding:12px 40px 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${C.hair};border-bottom:1px solid ${C.hair};">
          <tr>
            <td style="padding:14px 0;font:400 10px/1 ${sans};letter-spacing:1.5px;text-transform:uppercase;color:${C.smoke};">Refund</td>
            <td style="padding:14px 0;text-align:right;font:400 16px/1 ${serif};color:${C.ink};">₹${r.amount.toFixed(2)}</td>
          </tr>
        </table>
        <div style="font:400 13px/1.7 ${serif};color:${C.smoke};margin-top:10px;text-align:center;">${refundTimeline(r)}</div>
      </td></tr>`
    : "";

  const html = emailLayout(
    sectionHeader() +
      sectionHero("Order Cancelled", `Your order has been cancelled, ${first}.`, `Order ${input.order_number} has been cancelled.`) +
      reasonBlock +
      refundBlock +
      `<tr><td style="padding:20px 40px 4px;text-align:center;">
        <div style="font:400 12px/1.6 ${serif};color:${C.smoke};">If this wasn't expected, or you have any questions, simply reply to this email — a real person will help.</div>
      </td></tr>` +
      sectionFooter(),
  );

  const text = [
    `${COMMERCE.brandName.toUpperCase()} — Order Cancelled`,
    ``,
    `Your order has been cancelled, ${first}. Order ${input.order_number} has been cancelled.`,
    input.reason ? `Reason: ${input.reason}` : null,
    r ? `` : null,
    r ? `Refund: ₹${r.amount.toFixed(2)}` : null,
    r ? refundTimeline(r) : null,
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

  return { subject: `Your ${COMMERCE.brandName} order ${input.order_number} has been cancelled`, html, text };
}
