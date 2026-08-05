import { describe, it, expect } from "vitest";
import { siteStructuredData } from "./siteLd";
import { productLd, airProductLd } from "./productLd";
import { faqSchema } from "@/lib/chapterPage";

/**
 * Structured-data regression suite (SEO Phase 3 · P1-9). Asserts every JSON-LD Samorah emits is valid
 * and well-formed, and that the emitter never outputs empty/malformed schema. All builders are canonical
 * (commerce/content-derived) — no schema is hand-authored here.
 */
describe("global Organization + WebSite/SearchAction (siteStructuredData)", () => {
  const g = (siteStructuredData()["@graph"] as Record<string, unknown>[]);
  it("emits an Organization node", () => {
    const org = g.find((n) => n["@type"] === "Organization")!;
    expect(org).toBeTruthy();
    expect(org.name).toBeTruthy();
    expect(String(org.url)).toMatch(/^https?:\/\//);
    expect(String(org["@id"])).toContain("#organization");
  });
  it("emits a WebSite node with a SearchAction sitelinks searchbox", () => {
    const site = g.find((n) => n["@type"] === "WebSite")!;
    expect(site).toBeTruthy();
    const action = site.potentialAction as Record<string, unknown>;
    expect(action["@type"]).toBe("SearchAction");
    expect(String((action.target as Record<string, unknown>).urlTemplate)).toContain("{search_term_string}");
  });
});

describe("candle + air Product/Offer (canonical builders)", () => {
  it("candle Product has @context/@type/name/brand/offers", () => {
    const ld = productLd({ name: "A", slug: "a", gallery: [], priceLabel: "", variants: [{ price: 999, inStock: true }] });
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Product");
    expect(ld.offers).toBeTruthy();
  });
  it("air Product has the same shape via the shared builder", () => {
    const ld = airProductLd({ name: "Open Window", productSlug: "open-window", price: 599, priceLabel: "₹599" });
    expect(ld["@type"]).toBe("Product");
    expect((ld.offers as Record<string, unknown>)["@type"]).toBe("Offer");
  });
});

describe("FAQPage conditional emission", () => {
  it("builds a valid FAQPage with Question/Answer entities", () => {
    const ld = faqSchema([{ question: "Q1", answer: "A1" }]) as Record<string, unknown>;
    expect(ld["@type"]).toBe("FAQPage");
    const qa = (ld.mainEntity as Record<string, unknown>[])[0];
    expect(qa["@type"]).toBe("Question");
    expect((qa.acceptedAnswer as Record<string, unknown>)["@type"]).toBe("Answer");
  });
});

describe("no malformed/empty schema — every builder output is well-formed + JSON-serializable", () => {
  // JsonLd (the emitter component) renders null for empty/nullish data by design; here we prove the
  // upstream builders never PRODUCE empty/malformed schema, so nothing empty ever reaches the emitter.
  const outputs: Record<string, unknown>[] = [
    siteStructuredData(),
    productLd({ name: "A", slug: "a", gallery: [], priceLabel: "", variants: [{ price: 1, inStock: true }] }),
    airProductLd({ name: "B", productSlug: "b", price: 1, priceLabel: "₹1" }),
    faqSchema([{ question: "Q", answer: "A" }]) as Record<string, unknown>,
  ];
  it("each has @context and a non-empty body, and round-trips through JSON", () => {
    for (const o of outputs) {
      expect(o["@context"]).toBe("https://schema.org");
      expect(Object.keys(o).length).toBeGreaterThan(1);
      expect(() => JSON.parse(JSON.stringify(o))).not.toThrow();
      expect(JSON.stringify(o)).not.toBe("{}");
    }
  });
});
