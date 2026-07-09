/**
 * ORDER_DELIVERED template — "your order has arrived". The close of the delivery
 * journey (SLP principle 19). Pure + testable; composed from the shared sections.
 */
import { COMMERCE } from "@/config/commerce";
import { productionUrl, productionOrigin } from "@/config/site";
import { C, emailLayout, sectionHeader, sectionHero, sectionFooter } from "./templates";

export interface DeliveryEmailInput {
  order_number: string;
  ship_full_name?: string | null;
  email: string;
  delivered_to?: string | null;
}

const sans = "Arial,Helvetica,sans-serif";

export function buildDeliveryEmail(input: DeliveryEmailInput): { subject: string; html: string; text: string } {
  const first = input.ship_full_name?.split(" ")[0] ?? "friend";
  const shopUrl = productionOrigin();

  const html = emailLayout(
    sectionHeader() +
      sectionHero("Delivered", `It's arrived, ${first}.`, `Order ${input.order_number} has been delivered${input.delivered_to ? ` — received by ${input.delivered_to}` : ""}. We hope it brings a little calm to your space.`) +
      `<tr><td style="padding:14px 40px 4px;text-align:center;">
        <a href="${shopUrl}" style="display:inline-block;padding:14px 30px;background:${C.ink};color:${C.ivory};font:400 11px/1 ${sans};letter-spacing:2px;text-transform:uppercase;text-decoration:none;">Explore the Collection</a>
      </td></tr>` +
      `<tr><td style="padding:18px 40px 4px;text-align:center;">
        <div style="font:400 12px/1.6 Georgia,serif;color:${C.smoke};">Not quite right? Simply reply to this email — we're here to help.</div>
      </td></tr>` +
      sectionFooter(),
  );

  const text = [
    `${COMMERCE.brandName.toUpperCase()} — Delivered`,
    ``,
    `It's arrived, ${first}. Order ${input.order_number} has been delivered${input.delivered_to ? ` — received by ${input.delivered_to}` : ""}.`,
    ``,
    `Explore the collection: ${shopUrl}`,
    ``,
    `Not quite right? Simply reply to this email.`,
    ``,
    COMMERCE.brandName.toUpperCase(),
    productionUrl(),
    COMMERCE.support.email,
    `${COMMERCE.registeredAddress.city}, ${COMMERCE.registeredAddress.state}, ${COMMERCE.registeredAddress.country}`,
  ].join("\n");

  return { subject: `Your ${COMMERCE.brandName} order ${input.order_number} has arrived`, html, text };
}
