/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Build the air PDP view-model from a DATABASE product (review: room/linen fresheners are now
 * DB-managed). Turns a product row (+ its collection + sibling air products) into the same
 * { hour, group, volume, others } shape `AirProductDetail` already renders from config — so the air
 * PDP is data-driven with zero component changes. The bespoke air fields come from `air_content`; the
 * shared fields (name, tagline, price, images, collection) come from the normal product columns.
 */
import type { HourEntry, HourGroup, AirVolume } from "@/config/theHours";

function primaryImg(images: any[]): string | null {
  const imgs = images ?? [];
  const p = imgs.find((i) => i.is_primary) ?? [...imgs].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0];
  return p?.url ?? null;
}

function toHour(p: any): HourEntry {
  const ac = (p.air_content ?? {}) as any;
  const price = Number(p.price ?? 0);
  return {
    id: p.id,
    time: ac.time ?? "",
    moment: ac.moment ?? "",
    name: p.name,
    story: ac.heroLine || p.tagline || "",
    hourReason: ac.hourReason ?? "",
    hourStory: ac.hourStory || undefined,
    scentEffect: ac.scentEffect || undefined,
    productDetails: ac.composition || undefined,
    scent: Array.isArray(ac.scent) ? ac.scent : [],
    feels: Array.isArray(ac.feels) ? ac.feels : [],
    experience: ac.experience ?? "",
    placement: Array.isArray(ac.placement) ? ac.placement.map((x: any) => ({ label: x.label ?? "", note: x.note ?? "" })) : [],
    signature: ac.signature ?? "",
    productSlug: p.slug,
    priceLabel: price ? `From ₹${price}` : "",
    price,
    palette: "monsoon",
    gradient: primaryImg(p.product_images) ?? "gradient:grad-air",
  };
}

export function buildAirViewFromDb(product: any, siblings: any[]): { hour: HourEntry; group: HourGroup; volume: AirVolume; others: HourEntry[] } {
  const col = product.collection ?? {};
  const kind: HourGroup["kind"] = product.product_type === "linen_spray" ? "linen" : "room";
  const hour = toHour(product);
  const others = (siblings ?? []).map((s) => toHour(s));
  const group: HourGroup = {
    kind,
    label: kind === "linen" ? "Private Hours" : "Shared Hours",
    title: col.name ?? "The Hours",
    note: col.tagline ?? "",
    hours: [hour, ...others],
  };
  const volume: AirVolume = {
    slug: col.slug ?? "",
    volume: col.volume ?? "Volume I",
    title: col.name ?? "The Hours",
    tagline: col.tagline ?? "",
    cover: col.cover_image_url || "gradient:grad-air",
    isComingSoon: Boolean(col.is_coming_soon),
    groups: [group],
  };
  return { hour, group, volume, others };
}
