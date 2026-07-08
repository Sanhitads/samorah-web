import { describe, it, expect } from "vitest";
import { buildOrderConfirmationEmail, type EmailOrder, type EmailItem } from "@/lib/email";

const item = (o: Partial<EmailItem>): EmailItem => ({
  product_name: "Kashmiri Chai",
  variant_name: null,
  vessel: "glass",
  size: "100g",
  volume_label: "Vol. I",
  collection_name: "Dessert Chapter",
  edition_label: "NO. I.1",
  composition_id: null,
  line_total: 580,
  ...o,
});

describe("order confirmation email builder", () => {
  it("renders order number, items, invoice number, and secure links", () => {
    const order: EmailOrder = {
      order_number: "SAM-2026-000009",
      invoice_number: "SAM/26-27/000009",
      email: "guest@example.com",
      ship_full_name: "Sanhita Das",
      subtotal: 1160,
      discount_amount: 0,
      shipping_amount: 0,
      total_amount: 1160,
      order_items: [item({}), item({ product_name: "Modak", edition_label: "NO. I.2" })],
    };
    const { subject, html, text } = buildOrderConfirmationEmail(order);

    // Plain-text alternative accompanies the HTML (multipart → better deliverability).
    expect(text).toBeTruthy();
    expect(text).toContain("SAM-2026-000009");
    expect(text).toContain("Kashmiri Chai");
    expect(text).toContain("hello@samorahstudio.com");
    expect(text).not.toContain("<td"); // genuinely plain text, no markup

    expect(subject).toContain("SAM-2026-000009");
    expect(html).toContain("Sanhita"); // greeting first name
    expect(html).toContain("Kashmiri Chai");
    expect(html).toContain("Modak");
    expect(html).toContain("SAM/26-27/000009"); // invoice referenced
    // Links carry a signed token (?t=) for both order + invoice.
    expect(html).toMatch(/\/order\/SAM-2026-000009\?t=/);
    expect(html).toMatch(/\/order\/SAM-2026-000009\/invoice\?t=/);
    expect(html).toContain("₹1,160"); // paid total
    // Links must use the canonical production domain — never localhost/preview.
    expect(html).toContain("https://samorahstudio.com/order/");
    expect(html).not.toContain("localhost");
    expect(html).toContain("Download Tax Invoice");
    // Footer identity — website, email, location (trust + deliverability).
    expect(html).toContain(">https://samorahstudio.com<");
    expect(html).toContain("hello@samorahstudio.com");
    expect(html).toContain("Bengaluru, Karnataka, India");
  });

  it("groups a Discovery Composition into one labelled set", () => {
    const order: EmailOrder = {
      order_number: "SAM-2026-000010",
      invoice_number: null,
      email: "g@x.com",
      ship_full_name: "Guest",
      subtotal: 1740,
      discount_amount: 261,
      shipping_amount: 0,
      total_amount: 1479,
      order_items: [
        item({ composition_id: "c1", vessel: "glass" }),
        item({ composition_id: "c1", product_name: "Modak" }),
        item({ composition_id: "c1", product_name: "Gajar Halwa" }),
      ],
    };
    const { html } = buildOrderConfirmationEmail(order);
    expect(html).toContain("Discovery Composition");
    expect(html).toContain("Glass Edition");
    expect(html).toContain("Discovery Composition Savings");
  });
});
