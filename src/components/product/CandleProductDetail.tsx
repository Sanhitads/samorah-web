import Link from "next/link";
import type { CSSProperties } from "react";
import type { ProductPageView } from "@/lib/productPage";
import type { SectionInstance } from "@/platform/section";
import type { CandlePdpContent } from "@/lib/productEditorial";
import { TrackEvent } from "@/components/analytics/TrackEvent";
import { ProductPurchasePanel } from "@/components/product/ProductPurchasePanel";
import { ProductGallery } from "@/components/product/ProductGallery";
import { SectionRenderer } from "@/components/sections/SectionRenderer";
import { bootstrapPlatform } from "@/components/page/bootstrap";

/**
 * Candle PDP (Experience A) — the buyable core (gallery · info · purchase) then the editorial
 * section stack. Extracted from `/shop/[slug]` so the SAME component renders both the live route
 * and the editor's `/candle-preview` iframe (review: visual CMS) — the preview never diverges from
 * the shipped page. In `preview` mode it skips analytics + JSON-LD and tells the section engine so
 * scroll-reveal renders its final state. Server-safe (no client hooks of its own).
 */
export function CandleProductDetail({
  p,
  editorial,
  palette,
  ld,
  content,
  preview = false,
}: {
  p: ProductPageView;
  editorial: SectionInstance[];
  palette: string;
  ld?: object;
  content?: CandlePdpContent;
  preview?: boolean;
}) {
  bootstrapPlatform(); // register the section library so SectionRenderer resolves each type (also in preview)

  // A custom palette themes the editorial sections via inline CSS vars + an unregistered token (so no
  // preset rule overrides them); a custom gradient repaints the hero media via one scoped style rule.
  const cp = content?.customPalette;
  const themeToken = cp ? "candle-custom" : palette;
  const editorialVars: CSSProperties | undefined = cp
    ? ({
        "--surface": cp.surface,
        "--surface-alt": `color-mix(in srgb, ${cp.surface} 92%, ${cp.ink} 8%)`,
        "--ink": cp.ink,
        "--ink-soft": `color-mix(in srgb, ${cp.ink} 78%, ${cp.surface})`,
        "--ink-muted": `color-mix(in srgb, ${cp.ink} 55%, ${cp.surface})`,
      } as CSSProperties)
    : undefined;
  const cg = content?.customGradient;
  const gradientCss = cg?.from && cg?.to ? `linear-gradient(${cg.angle || 135}deg, ${cg.from}, ${cg.to})` : null;
  const scopeId = `pdp-${p.slug}`;

  return (
    <main className="pdp" data-theme="warm-ivory" data-cid={scopeId}>
      {gradientCss ? (
        <style dangerouslySetInnerHTML={{ __html: `[data-cid="${scopeId}"] .pdp__layout .asset-image{background:${gradientCss} !important}` }} />
      ) : null}
      {ld && !preview ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      ) : null}
      {!preview ? (
        <TrackEvent event="view_item" params={{ item_id: p.slug, item_name: p.name, price: p.variants[0]?.price }} />
      ) : null}
      <div className="pdp__head">
        <nav className="pdp__breadcrumb" aria-label="Breadcrumb">
          {p.breadcrumb.map((c, i) => (
            <span key={c.href}>
              {i > 0 ? <span className="pdp__crumb-sep" aria-hidden="true">·</span> : null}
              {i < p.breadcrumb.length - 1 ? (
                <Link href={c.href} className="pdp__crumb">{c.label}</Link>
              ) : (
                <span className="pdp__crumb pdp__crumb--current">{c.label}</span>
              )}
            </span>
          ))}
        </nav>

        <div className="pdp__layout">
          <ProductGallery images={p.gallery} name={p.name} itemId={p.slug} />

          <div className="pdp__info">
            {p.chapterName ? (
              p.chapterHref ? (
                <Link href={p.chapterHref} className="pdp__chapter">{p.chapterName}</Link>
              ) : (
                <p className="pdp__chapter">{p.chapterName}</p>
              )
            ) : null}
            {p.edition ? <p className="pdp__edition">{p.edition}</p> : null}
            <h1 className="pdp__name">{p.name}</h1>
            {p.tagline ? <p className="pdp__tagline">{p.tagline}</p> : null}
            <p className="pdp__meta">
              {p.collectionType}
              {p.scentGroup ? <span className="pdp__meta-sep"> · </span> : null}
              {p.scentGroup ?? ""}
            </p>

            <ProductPurchasePanel
              product={{
                id: p.id,
                slug: p.slug,
                name: p.name,
                chapterName: p.chapterName,
                edition: p.edition,
                vessels: p.vessels,
                sizes: p.sizes,
                variants: p.variants,
                defaultVariantId: p.defaultVariantId,
                priceLabel: p.priceLabel,
                image: p.gallery[0]?.src ?? "",
              }}
            />
          </div>
        </div>
      </div>

      <div className="pdp__editorial" style={editorialVars}>
        <SectionRenderer
          sections={editorial}
          context={{ pageId: p.slug, themeToken, preview, data: { productSlug: p.slug } }}
        />
      </div>
    </main>
  );
}
