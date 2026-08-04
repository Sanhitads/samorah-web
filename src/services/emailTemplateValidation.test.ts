import { describe, it, expect } from "vitest";
import { EMAIL_TEMPLATE_DEFS, validateEmailTemplate, renderTemplateContent, type EmailContent, type EmailTemplateDef } from "./emailTemplateService";

const def = (key: string): EmailTemplateDef => EMAIL_TEMPLATE_DEFS.find((d) => d.key === key)!;
const content = (over: Partial<EmailContent>): EmailContent => ({
  subject: "Your order {{orderNumber}} is confirmed", preheader: "", intro: "", signoff: "", eyebrow: "", heading: "",
  blocks: [], enabled: true, ...over,
});

describe("validateEmailTemplate — blocks on publish", () => {
  it("passes a valid order.confirmed template with a details block", () => {
    const v = validateEmailTemplate(def("order.confirmed"), content({ blocks: [{ type: "paragraph", text: "Hi {{name}}" }, { type: "details" }] }));
    expect(v.errors).toEqual([]);
  });

  it("errors on an unknown token and suggests the canonical one", () => {
    const v = validateEmailTemplate(def("order.confirmed"), content({ subject: "Order {{ordreNumber}}" }));
    expect(v.errors.some((e) => e.includes("ordreNumber") && e.includes("orderNumber"))).toBe(true);
  });

  it("errors on an empty subject", () => {
    const v = validateEmailTemplate(def("order.confirmed"), content({ subject: "   " }));
    expect(v.errors.some((e) => /subject/i.test(e))).toBe(true);
  });

  it("errors when a requiresDetails event authors a body but omits the details block", () => {
    const v = validateEmailTemplate(def("order.confirmed"), content({ blocks: [{ type: "paragraph", text: "Hi {{name}}" }] }));
    expect(v.errors.some((e) => /details/i.test(e))).toBe(true);
  });

  it("does NOT require a details block when there is no authored body (coded default sends)", () => {
    const v = validateEmailTemplate(def("order.confirmed"), content({ blocks: [] }));
    expect(v.errors).toEqual([]);
  });

  it("errors on an unsafe CTA protocol", () => {
    const v = validateEmailTemplate(def("order.confirmed"), content({ blocks: [{ type: "cta", ctaLabel: "Track", ctaHref: "javascript:alert(1)" }, { type: "details" }] }));
    expect(v.errors.some((e) => /unsafe/i.test(e))).toBe(true);
  });

  it("allows safe CTA schemes and relative/token URLs", () => {
    const v = validateEmailTemplate(def("order.dispatched"), content({ subject: "On its way {{orderNumber}}", blocks: [{ type: "cta", ctaLabel: "Track", ctaHref: "https://samorah.example/track/{{awb}}" }, { type: "details" }] }));
    expect(v.errors).toEqual([]);
  });
});

// The variables panel must reflect the ACTUAL send-time vars each event provides in
// src/lib/notifications/channels/email.ts → render(). If that mapping changes, update DEFS here so
// the admin panel never advertises a token production won't resolve (which would render blank).
describe("EMAIL_TEMPLATE_DEFS.vars stay in sync with the send-time variables", () => {
  const SEND_VARS: Record<string, string[]> = {
    "order.confirmed": ["orderNumber", "name", "total"],
    "order.dispatched": ["orderNumber", "name", "courier", "awb"],
    "order.cancelled": ["orderNumber", "name"],
    "delivery.completed": ["orderNumber", "name"],
    "return.requested": ["rmaNumber", "orderNumber"],
    "return.approved": ["rmaNumber", "orderNumber"],
    "return.refunded": ["rmaNumber", "orderNumber"],
  };
  it("every def's vars exactly match the channel's send-time keys", () => {
    for (const d of EMAIL_TEMPLATE_DEFS) {
      expect([...d.vars].sort(), `${d.key} vars`).toEqual([...(SEND_VARS[d.key] ?? [])].sort());
    }
    expect(EMAIL_TEMPLATE_DEFS.map((d) => d.key).sort()).toEqual(Object.keys(SEND_VARS).sort());
  });
});

describe("renderTemplateContent — same renderer as production", () => {
  it("renders an authored body and injects the details HTML", () => {
    const r = renderTemplateContent(def("order.confirmed"), content({ blocks: [{ type: "paragraph", text: "Hi {{name}}" }, { type: "details" }] }), def("order.confirmed").sample, "<tr><td>DETAILS</td></tr>");
    expect(r.authored).toBe(true);
    expect(r.html).toContain("Hi Aarohi");
    expect(r.html).toContain("DETAILS");
    expect(r.subject).toContain("SAM1042");
  });

  it("blanks an unknown token at render (never leaks a raw {{token}})", () => {
    const r = renderTemplateContent(def("order.confirmed"), content({ blocks: [{ type: "paragraph", text: "Hi {{nmae}}" }, { type: "details" }] }), def("order.confirmed").sample, "");
    expect(r.html).not.toContain("{{nmae}}");
  });

  it("falls back to a details-only render when there is no authored body", () => {
    const r = renderTemplateContent(def("order.confirmed"), content({ blocks: [] }), def("order.confirmed").sample, "<tr><td>CODED</td></tr>");
    expect(r.authored).toBe(false);
    expect(r.html).toContain("CODED");
  });
});
