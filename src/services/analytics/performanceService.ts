/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Homepage performance meter (Phase 6 · point 27) — estimates the page's image weight from the media
 * library. It walks each section's settings for image URLs, sizes them against the `media` table
 * (matching by the raw Cloudinary base so a cropped delivery URL still resolves), and reports total
 * weight, the largest image, the heaviest section, and an estimated load time. Gradients/solid colours
 * carry no weight; external images not in the library are counted but reported as "unknown size".
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { ComposedSection } from "@/services/pageComposerService";

const UPLOAD = "/upload/";
/** The raw Cloudinary upload URL (transforms stripped) — how the asset is stored in `media`. */
export function cldBase(url: string): string {
  const i = url.indexOf(UPLOAD);
  if (i < 0) return url;
  const post = url.slice(i + UPLOAD.length);
  if (/^v\d+\//.test(post)) return url; // already raw
  const rawFrom = post.search(/v\d+\//);
  return rawFrom >= 0 ? `${url.slice(0, i)}${UPLOAD}${post.slice(rawFrom)}` : url;
}

const isHttpImage = (v: string) => /^https?:\/\//.test(v) && !/\.(mp4|webm|mov|ogg)(\?|$)/i.test(v);

/** Collect every http(s) image URL found anywhere in a settings object (recurses arrays/objects). */
function collectImageUrls(val: unknown, out: Set<string>) {
  if (typeof val === "string") { if (isHttpImage(val)) out.add(val); return; }
  if (Array.isArray(val)) { for (const v of val) collectImageUrls(v, out); return; }
  if (val && typeof val === "object") { for (const v of Object.values(val)) collectImageUrls(v, out); }
}

/** Enabled sections → the image URLs each holds (with the raw Cloudinary base for media lookup). Pure. */
export function extractImages(sections: ComposedSection[]): { url: string; base: string; section: string; sectionType: string }[] {
  const out: { url: string; base: string; section: string; sectionType: string }[] = [];
  for (const s of sections) {
    if (!s.enabled) continue;
    const urls = new Set<string>();
    collectImageUrls(s.settings, urls);
    for (const url of urls) out.push({ url, base: cldBase(url), section: s.id, sectionType: s.type });
  }
  return out;
}

export interface PerfImage { url: string; bytes: number | null; section: string; sectionType: string }
export interface HomepagePerformance {
  totalBytes: number; knownImages: number; unknownImages: number;
  largest: { url: string; bytes: number; section: string } | null;
  heaviestSection: { id: string; type: string; bytes: number } | null;
  estLoadMs: number; assumedMbps: number; images: PerfImage[];
}

// A deliberately conservative "typical mobile" baseline for the estimate (a fast-4G effective throughput).
const ASSUMED_MBPS = 4;

/** Aggregate weight/largest/heaviest/est-load from the extracted images + a base→bytes size map. Pure. */
export function summarizePerformance(perImage: { url: string; base: string; section: string; sectionType: string }[], sizeByBase: Map<string, number>): HomepagePerformance {
  let totalBytes = 0, knownImages = 0, unknownImages = 0;
  let largest: HomepagePerformance["largest"] = null;
  const sectionBytes = new Map<string, { type: string; bytes: number }>();
  const images: PerfImage[] = [];
  for (const im of perImage) {
    const bytes = sizeByBase.get(im.base) ?? null;
    images.push({ url: im.url, bytes, section: im.section, sectionType: im.sectionType });
    if (bytes == null) { unknownImages++; continue; }
    knownImages++; totalBytes += bytes;
    if (!largest || bytes > largest.bytes) largest = { url: im.url, bytes, section: im.sectionType };
    const cur = sectionBytes.get(im.section) ?? { type: im.sectionType, bytes: 0 };
    cur.bytes += bytes; sectionBytes.set(im.section, cur);
  }
  let heaviestSection: HomepagePerformance["heaviestSection"] = null;
  for (const [id, v] of sectionBytes) if (!heaviestSection || v.bytes > heaviestSection.bytes) heaviestSection = { id, type: v.type, bytes: v.bytes };
  const estLoadMs = Math.round((totalBytes * 8) / (ASSUMED_MBPS * 1_000_000) * 1000);
  return { totalBytes, knownImages, unknownImages, largest, heaviestSection, estLoadMs, assumedMbps: ASSUMED_MBPS, images };
}

export async function getHomepagePerformance(sections: ComposedSection[]): Promise<HomepagePerformance> {
  const perImage = extractImages(sections);
  const bases = [...new Set(perImage.map((i) => i.base))];
  const sizeByBase = new Map<string, number>();
  if (bases.length) {
    try {
      const db = createAdminClient() as any;
      const { data } = await db.from("media").select("url,bytes").in("url", bases);
      for (const r of data ?? []) if (r.bytes != null) sizeByBase.set(r.url as string, Number(r.bytes));
    } catch { /* resilient — report unknowns */ }
  }
  return summarizePerformance(perImage, sizeByBase);
}
