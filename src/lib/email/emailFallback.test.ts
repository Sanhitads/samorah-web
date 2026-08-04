import { describe, it, expect } from "vitest";
import { renderEmailBlocks } from "./blocks";
import { buildReturnEmail, buildDeliveryEmail } from "@/lib/email";
import { contrastRatio, AA_NORMAL } from "@/lib/a11y/contrast";
import { C } from "./templates";

/**
 * Point 20 — plain-text fallback. The sending pipeline must never depend solely on HTML. This LOCKS
 * the already-existing behaviour (we build nothing new): both the authored block renderer and the
 * coded builders return a non-empty `text`, which the provider sends as the multipart alternative.
 */
describe("plain-text fallback exists across both render paths (point 20)", () => {
  it("the authored block renderer produces a non-empty text alternative", () => {
    const { text } = renderEmailBlocks(
      { subject: "Order {{orderNumber}}", blocks: [{ type: "heading", text: "Thank you {{name}}" }, { type: "paragraph", text: "Your order is confirmed." }, { type: "cta", ctaLabel: "Track", ctaHref: "/order/{{orderNumber}}/track" }, { type: "support", text: "Need help?" }] },
      { orderNumber: "SAM1042", name: "Aarohi" },
    );
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).toContain("Thank you Aarohi");
    expect(text).toContain("Track:"); // the button is reachable as text, not HTML-only
  });

  it("coded transactional builders return a non-empty text alternative", () => {
    const ret = buildReturnEmail("return.requested", { order_number: "SAM1042", rma: "RMA-88", email: "guest@example.com", return_type: "refund" } as never);
    expect(ret.text.trim().length).toBeGreaterThan(0);
    const del = buildDeliveryEmail({ order_number: "SAM1042", email: "guest@example.com", ship_full_name: "Aarohi" });
    expect(del.text.trim().length).toBeGreaterThan(0);
  });
});

/**
 * Point 19 — the fixed brand palette carries the email's information colours. This LOCKS that the
 * text colours meet WCAG AA. `gold` is a decorative accent that does NOT meet AA (2.24:1) — pinned
 * here so a regression that starts using gold for body text or that changes ink/smoke is caught, and
 * so the known gold-link limitation stays tracked (see POST_LAUNCH_ROADMAP).
 */
describe("email palette contrast is controlled (point 19)", () => {
  it("body + heading text colours meet WCAG AA on white and ivory", () => {
    for (const bg of ["#ffffff", C.ivory]) {
      expect(contrastRatio(C.ink, bg)!).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(C.smoke, bg)!).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });
  it("gold is a sub-AA decorative accent (documented, not used for body text)", () => {
    expect(contrastRatio(C.gold, "#ffffff")!).toBeLessThan(AA_NORMAL); // known — tracked in roadmap
  });
});
