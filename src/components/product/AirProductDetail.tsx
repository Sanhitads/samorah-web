import Link from "next/link";
import { ProductPurchasePanel } from "@/components/product/ProductPurchasePanel";
import { ProductGallery } from "@/components/product/ProductGallery";
import { SectionRenderer } from "@/components/sections/SectionRenderer";
import { bootstrapPlatform } from "@/components/page/bootstrap";
import { buildAirEditorial } from "@/lib/productEditorial";
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
}: {
  hour: HourEntry;
  group: HourGroup;
  volume: AirVolume;
  others: HourEntry[];
}) {
  bootstrapPlatform();
  const editorial = buildAirEditorial({ hour, volume, others });
  const category = group.kind === "room" ? "Room Spray" : "Linen Spray";

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

  return (
    <main className="pdp" data-theme="warm-ivory">
      <nav className="pdp__breadcrumb" aria-label="Breadcrumb">
        <Link href="/" className="pdp__crumb">Home</Link>
        <span className="pdp__crumb-sep" aria-hidden="true">·</span>
        <Link href={`/collections/${volume.slug}`} className="pdp__crumb">The Hours · {volume.title}</Link>
        <span className="pdp__crumb-sep" aria-hidden="true">·</span>
        <span className="pdp__crumb pdp__crumb--current">{hour.name}</span>
      </nav>

      <div className="pdp__layout">
        <ProductGallery images={[{ src: hour.gradient, alt: hour.name }]} name={hour.name} />

        <div className="pdp__info">
          <Link href={`/collections/${volume.slug}`} className="pdp__chapter">
            The Hours Collection
          </Link>
          <p className="pdp__air-hour">HOUR {hour.time} · {hour.moment}</p>
          <h1 className="pdp__name">{hour.name}</h1>
          <p className="pdp__tagline">{hour.story}</p>
          <p className="pdp__scent-group">{category} · {hour.scent.join(" · ")}</p>

          <ProductPurchasePanel
            product={{
              id: hour.id,
              slug: hour.productSlug,
              name: hour.name,
              chapterName: `The Hours · ${volume.title}`,
              vessels: [],
              sizes: [],
              variants: [variant],
              defaultVariantId: hour.id,
              priceLabel: hour.priceLabel,
            }}
          />
        </div>
      </div>

      <div className="pdp__editorial">
        <SectionRenderer
          sections={editorial}
          context={{ pageId: hour.productSlug, themeToken: "monsoon", preview: false, data: { productSlug: hour.productSlug } }}
        />
      </div>
    </main>
  );
}
