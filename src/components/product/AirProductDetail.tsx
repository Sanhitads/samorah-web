import Link from "next/link";
import type { CSSProperties } from "react";
import { ProductPurchasePanel } from "@/components/product/ProductPurchasePanel";
import { ProductGallery } from "@/components/product/ProductGallery";
import { SectionRenderer } from "@/components/sections/SectionRenderer";
import { bootstrapPlatform } from "@/components/page/bootstrap";
import { buildAirEditorial } from "@/lib/productEditorial";
import { JsonLd } from "@/components/seo/JsonLd";
import { airProductLd } from "@/lib/seo/productLd";
import { productBreadcrumb } from "@/lib/seo/breadcrumbLd";
import type { AirVolume, HourEntry, HourGroup } from "@/config/theHours";

/**
 * Air PDP — the same UI + builder pattern as the candle PDP, sourced from
 * config/theHours (air products don't exist in the DB yet). The commerce header
 * is a single-variant purchase; the editorial sequence is AIR_PDP_TEMPLATE,
 * themed monsoon. Swapping the data source later changes nothing here.
 */
export function AirProductDetail({
  hour,
  group,
  volume,
  others,
  preview = false,
  freeShippingThresholdInr,
}: {
  hour: HourEntry;
  group: HourGroup;
  volume: AirVolume;
  others: HourEntry[];
  preview?: boolean;
  freeShippingThresholdInr?: number;
}) {
  bootstrapPlatform();
  const editorial = buildAirEditorial({ hour, volume, others, freeShippingThresholdInr });
  const category = group.kind === "room" ? "Room Spray" : "Linen Spray";

  // Volume numbering — the admin's chapter position drives the number (VOL. I.4); otherwise it falls
  // back to the hour's auto position across the whole volume (VOL. I.1 …).
  const allHours = volume.groups.flatMap((g) => g.hours);
  const idx = allHours.findIndex((h) => h.productSlug === hour.productSlug);
  const seq = hour.chapterPosition?.split(".").pop()?.trim() || String(idx + 1);
  const edition = `${volume.volume.replace(/volume/i, "Vol.").toUpperCase()}.${seq}`;

  const variant = {
    id: hour.id,
    vessel: "",
    size: "",
    price: hour.price,
    priceLabel: `₹${hour.price}`,
    burnTime: "",
    inStock: true,
    stockNote: null,
  };

  // A custom palette themes the editorial sections via inline CSS vars + an unregistered token (so no
  // preset rule overrides them); a custom gradient repaints the hero via one scoped style rule.
  const cp = hour.customPalette;
  const editorialVars: CSSProperties | undefined = cp?.surface && cp?.ink
    ? ({
        "--surface": cp.surface,
        "--surface-alt": `color-mix(in srgb, ${cp.surface} 92%, ${cp.ink} 8%)`,
        "--ink": cp.ink,
        "--ink-soft": `color-mix(in srgb, ${cp.ink} 78%, ${cp.surface})`,
        "--ink-muted": `color-mix(in srgb, ${cp.ink} 55%, ${cp.surface})`,
        "--line": `color-mix(in srgb, ${cp.ink} 18%, ${cp.surface})`,
      } as CSSProperties)
    : undefined;
  const themeToken = editorialVars ? "air-custom" : hour.palette || "monsoon";
  const scopeId = `air-${hour.productSlug}`;
  const mainStyle = cp?.accent ? ({ "--accent": cp.accent } as CSSProperties) : undefined;

  return (
    <main className="pdp pdp--air" data-theme="warm-ivory" data-cid={scopeId} style={mainStyle}>
      {!preview ? <JsonLd data={airProductLd(hour, volume.tagline)} /> : null}
      {!preview ? <JsonLd data={productBreadcrumb(hour.name, hour.productSlug)} /> : null}
      {hour.customGradientCss ? (
        <style dangerouslySetInnerHTML={{ __html: `[data-cid="${scopeId}"] .pdp__layout .asset-image{background:${hour.customGradientCss} !important}` }} />
      ) : null}
      {cp?.accent ? (
        <style dangerouslySetInnerHTML={{ __html: `[data-cid="${scopeId}"] [data-theme]{--accent:${cp.accent}}` }} />
      ) : null}
      <div className="pdp__head" id="pdp-top">
        <nav className="pdp__breadcrumb" aria-label="Breadcrumb">
          <Link href="/" className="pdp__crumb">Home</Link>
          <span className="pdp__crumb-sep" aria-hidden="true">·</span>
          <Link href={`/collections/${volume.slug}`} className="pdp__crumb">The Hours · {volume.title}</Link>
          <span className="pdp__crumb-sep" aria-hidden="true">·</span>
          <span className="pdp__crumb pdp__crumb--current">{hour.name}</span>
        </nav>

        <div className="pdp__layout">
          <ProductGallery images={[{ src: hour.gradient, alt: hour.name }]} name={hour.name} itemId={hour.productSlug} />

        <div className="pdp__info">
          <Link href={`/collections/${volume.slug}`} className="pdp__chapter">
            The Hours · {volume.title}
          </Link>
          <p className="pdp__edition">{edition}</p>
          <h1 className="pdp__name">{hour.name}</h1>
          <p className="pdp__air-hour">Hour {hour.time} · {hour.moment}</p>
          <p className="pdp__tagline">{hour.story}</p>
          <p className="pdp__meta">{category}</p>
          {hour.scent.length ? <p className="pdp__meta pdp__meta--notes">{hour.scent.join(" · ")}</p> : null}

          <ProductPurchasePanel
            product={{
              id: hour.id,
              slug: hour.productSlug,
              name: hour.name,
              chapterName: `The Hours · ${volume.title}`,
              edition,
              hour: hour.time,
              productType: category,
              vessels: [],
              sizes: [],
              variants: [variant],
              defaultVariantId: hour.id,
              priceLabel: hour.priceLabel,
            }}
          />
        </div>
        </div>
      </div>

      <div className="pdp__editorial" style={editorialVars}>
        <SectionRenderer
          sections={editorial}
          context={{ pageId: hour.productSlug, themeToken, preview, data: { productSlug: hour.productSlug } }}
        />
      </div>
    </main>
  );
}
