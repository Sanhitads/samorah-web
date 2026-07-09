/**
 * Return lifecycle emails (review point 9 → notifications). One builder, copy per
 * event: requested (acknowledge) · approved (next steps) · rejected · refunded
 * (return complete + refund). Composed from the shared sections; pure + testable.
 */
import { COMMERCE } from "@/config/commerce";
import { productionUrl } from "@/config/site";
import { C, emailLayout, sectionHeader, sectionHero, sectionFooter } from "./templates";

export type ReturnEmailEvent = "return.requested" | "return.approved" | "return.rejected" | "return.refunded";

export interface ReturnEmailInput {
  order_number: string;
  rma: string;
  ship_full_name?: string | null;
  email: string;
  reason?: string | null;
  return_type?: string | null; // refund | replacement | exchange
  refund_amount?: number | null;
}

const sans = "Arial,Helvetica,sans-serif";
const serif = "Georgia,'Times New Roman',serif";

const COPY: Record<ReturnEmailEvent, { eyebrow: string; title: (n: string) => string; body: string }> = {
  "return.requested": {
    eyebrow: "Return Received",
    title: (n) => `We've received your return request, ${n}.`,
    body: "Our team will review it shortly and be in touch with the next steps.",
  },
  "return.approved": {
    eyebrow: "Return Approved",
    title: (n) => `Your return is approved, ${n}.`,
    body: "Please keep the item in its original packaging — we'll share pickup or return-shipping details shortly.",
  },
  "return.rejected": {
    eyebrow: "Return Update",
    title: (n) => `About your return request, ${n}.`,
    body: "We're sorry — we weren't able to approve this return. Reply to this email and a real person will help explain and find the best option for you.",
  },
  "return.refunded": {
    eyebrow: "Return Complete",
    title: (n) => `Your return is complete, ${n}.`,
    body: "Thank you for your patience. Your refund has been initiated and typically reaches your original payment method within 5–7 business days.",
  },
};

export function buildReturnEmail(event: ReturnEmailEvent, input: ReturnEmailInput): { subject: string; html: string; text: string } {
  const first = input.ship_full_name?.split(" ")[0] ?? "friend";
  const copy = COPY[event];

  const detailRows = [
    ["Return", input.rma],
    ["Order", input.order_number],
    input.reason ? ["Reason", input.reason] : null,
    event === "return.refunded" && input.refund_amount ? ["Refund", `₹${Number(input.refund_amount).toFixed(2)}`] : null,
  ].filter((r): r is [string, string] => r !== null);

  const detailBlock = `<tr><td style="padding:8px 40px 4px;text-align:center;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
      ${detailRows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:2px 12px;font:400 11px/1.6 ${sans};letter-spacing:1px;text-transform:uppercase;color:${C.smoke};">${k}</td><td style="padding:2px 12px;font:400 13px/1.6 ${serif};color:${C.ink};">${v}</td></tr>`,
        )
        .join("")}
    </table>
  </td></tr>`;

  const html = emailLayout(
    sectionHeader() +
      sectionHero(copy.eyebrow, copy.title(first), copy.body) +
      detailBlock +
      `<tr><td style="padding:18px 40px 4px;text-align:center;">
        <div style="font:400 12px/1.6 ${serif};color:${C.smoke};">Questions? Simply reply to this email — a real person will help.</div>
      </td></tr>` +
      sectionFooter(),
  );

  const text = [
    `${COMMERCE.brandName.toUpperCase()} — ${copy.eyebrow}`,
    ``,
    copy.title(first),
    copy.body,
    ``,
    ...detailRows.map(([k, v]) => `${k}: ${v}`),
    ``,
    `Questions? Simply reply to this email.`,
    ``,
    COMMERCE.brandName.toUpperCase(),
    productionUrl(),
    COMMERCE.support.email,
    `${COMMERCE.registeredAddress.city}, ${COMMERCE.registeredAddress.state}, ${COMMERCE.registeredAddress.country}`,
  ].join("\n");

  const subjectMap: Record<ReturnEmailEvent, string> = {
    "return.requested": `We've received your return ${input.rma}`,
    "return.approved": `Your return ${input.rma} is approved`,
    "return.rejected": `An update on your return ${input.rma}`,
    "return.refunded": `Your return ${input.rma} is complete`,
  };

  return { subject: subjectMap[event], html, text };
}
