import { describe, it, expect } from "vitest";
import { breadcrumbLd, productBreadcrumb, chapterBreadcrumb, collectionBreadcrumb } from "./breadcrumbLd";

describe("breadcrumbLd (P1-10)", () => {
  it("builds a valid BreadcrumbList with positioned ListItems + absolute URLs", () => {
    const ld = breadcrumbLd([{ name: "Home", path: "/" }, { name: "Shop", path: "/shop" }]);
    expect(ld["@type"]).toBe("BreadcrumbList");
    const items = ld.itemListElement as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ "@type": "ListItem", position: 1, name: "Home" });
    expect(items[1].position).toBe(2);
    for (const it of items) expect(String(it.item)).toMatch(/^https:\/\//); // absolute
  });

  it("product hierarchy is Home → Shop → Product (canonically provable)", () => {
    const items = productBreadcrumb("Amber & Oud", "amber-oud").itemListElement as Record<string, unknown>[];
    expect(items.map((i) => i.name)).toEqual(["Home", "Shop", "Amber & Oud"]);
    expect(String(items[2].item)).toMatch(/\/shop\/amber-oud$/);
  });

  it("chapter + collection hierarchies are Home → {entity} (no fabricated middle level)", () => {
    expect((chapterBreadcrumb("The Hours", "the-hours").itemListElement as Record<string, unknown>[]).map((i) => i.name)).toEqual(["Home", "The Hours"]);
    expect((collectionBreadcrumb("The Everyday", "the-everyday").itemListElement as Record<string, unknown>[]).map((i) => i.name)).toEqual(["Home", "The Everyday"]);
  });
});
