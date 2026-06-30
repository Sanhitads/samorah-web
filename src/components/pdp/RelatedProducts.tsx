import { ProductCard } from "@/components/ui/ProductCard";
import type { SectionComponentProps } from "@/components/sections/registry";
import type { RelatedProductsSettings } from "@/lib/productEditorial";

/**
 * RelatedProducts (block) — "Continue the Chapter" / "Continue the Hours". Not
 * "you may also like" — a continuation of the story. Reuses ProductCard.
 */
export function RelatedProducts({ settings }: SectionComponentProps) {
  const s = settings as unknown as RelatedProductsSettings;
  if (!s.products?.length) return null;

  return (
    <div className="related-products">
      <div className="related-products__head">
        {s.eyebrow ? <p className="related-products__eyebrow">{s.eyebrow}</p> : null}
        {s.heading ? <h2 className="related-products__heading">{s.heading}</h2> : null}
      </div>
      <div className="related-products__grid">
        {s.products.map((p) => (
          <ProductCard key={p.slug} product={p} variant="related" />
        ))}
      </div>
    </div>
  );
}
