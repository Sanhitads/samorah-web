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

  // Volume numbering — the hour's position across the whole volume (VOL. I.1 …).
  const allHours = volume.groups.flatMap((g) => g.hours);
  const idx = allHours.findIndex((h) => h.productSlug === hour.productSlug);
  const edition = `${volume.volume.replace(/volume/i, "Vol.").toUpperCase()}.${idx + 1}`;

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
    <main className="pdp pdp--air" data-theme="warm-ivory">
      <div className="pdp__head">
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
          <p className="pdp__meta">{category} · {hour.scent.join(" · ")}</p>

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

      <div className="pdp__editorial">
        <SectionRenderer
          sections={editorial}
          context={{ pageId: hour.productSlug, themeToken: hour.palette || "monsoon", preview: false, data: { productSlug: hour.productSlug } }}
        />
      </div>
    </main>
  );
}
