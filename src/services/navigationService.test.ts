import { describe, it, expect } from "vitest";
import { resolveHref, resolveLabel, relOf, ENTITY_ROUTE } from "@/services/navigationService";

/**
 * Phase 1 · point 13 — pure navigation routing/SEO helpers. Entity links derive their URL from the
 * canonical route map (so a slug rename resolves automatically); manual URLs pass through; rel is safe.
 */
describe("resolveHref — entity links derive their URL, URLs pass through", () => {
  it("maps each entity type to its canonical route", () => {
    expect(resolveHref({ linkType: "entity", entity: { type: "page", id: "our-story" } })).toBe("/our-story");
    expect(resolveHref({ linkType: "entity", entity: { type: "chapter", id: "dessert-chapter" } })).toBe("/chapters/dessert-chapter");
    expect(resolveHref({ linkType: "entity", entity: { type: "collection", id: "the-everyday" } })).toBe("/collections/the-everyday");
    expect(resolveHref({ linkType: "entity", entity: { type: "product", id: "amber-candle" } })).toBe("/shop/amber-candle");
  });
  it("a manual URL passes through unchanged", () => {
    expect(resolveHref({ linkType: "url", href: "/custom" })).toBe("/custom");
    expect(resolveHref({ href: "https://instagram.com/samorah" })).toBe("https://instagram.com/samorah");
  });
  it("falls back to '#' when nothing resolves", () => {
    expect(resolveHref({ linkType: "entity", entity: undefined as any })).toBe("#");
  });
  it("ENTITY_ROUTE is the single source of URL shape", () => {
    expect(ENTITY_ROUTE.collection("x")).toBe("/collections/x");
  });
});

describe("resolveLabel — i18n-ready", () => {
  it("prefers a locale override, else the default label", () => {
    expect(resolveLabel({ label: "Shop", labelI18n: { en: "Shop", hi: "दुकान" } }, "hi")).toBe("दुकान");
    expect(resolveLabel({ label: "Shop" }, "hi")).toBe("Shop");
  });
});

describe("relOf — safe rel for new-tab / nofollow", () => {
  it("adds nofollow + noopener/noreferrer appropriately", () => {
    expect(relOf({ nofollow: true })).toBe("nofollow");
    expect(relOf({ target: "_blank" })).toBe("noopener noreferrer");
    expect(relOf({ external: true, nofollow: true })).toBe("nofollow noopener noreferrer");
    expect(relOf({})).toBeUndefined();
  });
});
