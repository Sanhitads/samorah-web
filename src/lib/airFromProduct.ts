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

/** Only accept a real hex colour (guards the inline theme against CSS injection). */
const hex = (v: any): string | null => (typeof v === "string" && /^#[0-9a-fA-F]{3,8}$/.test(v.trim()) ? v.trim() : null);

export function airHourFromProduct(p: any): HourEntry {
  const ac = (p.air_content ?? {}) as any;
  const price = Number(p.price ?? 0);
  const cp = ac.customPalette;
  const customPalette = cp && hex(cp.surface) && hex(cp.ink) ? { surface: hex(cp.surface)!, ink: hex(cp.ink)! } : undefined;
  const cg = ac.customGradient;
  const angle = Number.isFinite(Number(cg?.angle)) ? Number(cg.angle) : 135;
  const customGradientCss = !primaryImg(p.product_images) && cg && hex(cg.from) && hex(cg.to)
    ? `linear-gradient(${angle}deg, ${hex(cg.from)} 0%, ${hex(cg.to)} 100%)`
    : undefined;
  return {
    id: p.id,
    time: ac.time ?? "",
    moment: ac.moment ?? "",
    name: p.name,
    // Hero line = the product tagline (single source; the admin edits it in one place). Legacy
    // air_content.heroLine remains a fallback for products seeded before the fields were unified.
    story: p.tagline || ac.heroLine || "",
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
    palette: ac.palette || "monsoon",
    gradient: primaryImg(p.product_images) ?? ac.gradient ?? "gradient:grad-air",
    interlude: ac.interlude || undefined,
    accordion: Array.isArray(ac.accordion)
      ? ac.accordion.map((x: any) => ({ title: String(x.title ?? "").trim(), body: String(x.body ?? "").trim() })).filter((x: any) => x.title || x.body)
      : undefined,
    labels: ac.labels && typeof ac.labels === "object" ? ac.labels : undefined,
    chapterPosition: p.chapter_position || undefined,
    customSections: Array.isArray(ac.customSections) ? ac.customSections : undefined,
    customPalette,
    customGradientCss,
  };
}

export function buildAirViewFromDb(product: any, siblings: any[]): { hour: HourEntry; group: HourGroup; volume: AirVolume; others: HourEntry[] } {
  const col = product.collection ?? {};
  const kind: HourGroup["kind"] = product.product_type === "linen_spray" ? "linen" : "room";
  const hour = airHourFromProduct(product);
  const others = (siblings ?? []).map((s) => airHourFromProduct(s));
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

/** Build an AirVolume (the air chapter page) from a DB collection + its air products, grouped into
 *  the Room / Linen groups. The group label/title/note default to the house wording (a per-group
 *  editable column is a later refinement). Returns null when the collection has no air products. */
export function buildAirVolumeFromDb(col: any, products: any[]): AirVolume | null {
  const air = (products ?? []).filter((p) => p.product_type === "room_spray" || p.product_type === "linen_spray");
  if (!air.length) return null;
  const room = air.filter((p) => p.product_type === "room_spray").map(airHourFromProduct);
  const linen = air.filter((p) => p.product_type === "linen_spray").map(airHourFromProduct);
  const groups: HourGroup[] = [];
  if (room.length) groups.push({ kind: "room", label: "Shared Hours", title: "The Room", note: "The atmosphere a room makes for itself.", hours: room });
  if (linen.length) groups.push({ kind: "linen", label: "Private Hours", title: "The Linen", note: "For linen, for fabric, for the hours that ask for nothing.", hours: linen });
  return {
    slug: col.slug,
    volume: col.volume ?? "Volume I",
    title: col.name,
    tagline: col.tagline ?? "",
    cover: col.cover_image_url || "gradient:grad-air",
    isComingSoon: Boolean(col.is_coming_soon),
    groups,
  };
}
