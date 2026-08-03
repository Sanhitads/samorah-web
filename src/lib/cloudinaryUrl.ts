/**
 * Cloudinary delivery transforms (performance) — rewrite a stored upload URL so the browser gets a
 * modern format (`f_auto` → WebP/AVIF where supported), automatic quality (`q_auto`), and a
 * right-sized, capped width (`c_limit,w_n`); and emit a responsive `srcSet` from the single upload so
 * phones download a phone-sized image, not the full desktop one. Non-Cloudinary URLs (gradient markers,
 * external URLs, already-transformed URLs) pass through untouched. Pure; safe on client + server.
 */
const UPLOAD = "/upload/";
const DEFAULT_TX = "f_auto,q_auto,c_limit";
/** Responsive widths covering phones → retina desktop (common DPR breakpoints). */
export const CLD_WIDTHS = [384, 640, 828, 1080, 1280, 1600, 2048];

export function isCloudinary(url: string | null | undefined): boolean {
  return !!url && /^https?:\/\/res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\//i.test(url);
}

/** Inject a delivery transform right after `/upload/`. Only a RAW upload (path begins with a version
 *  segment, e.g. `v1234/…`) is rewritten; an already-transformed URL is returned unchanged so we never
 *  double-transform. Non-Cloudinary URLs pass through. */
export function cldUrl(url: string, width?: number): string {
  if (!isCloudinary(url)) return url;
  const i = url.indexOf(UPLOAD);
  const post = url.slice(i + UPLOAD.length);
  if (!/^v\d+\//.test(post)) return url; // already transformed (or unexpected) — leave it
  const tx = width ? `${DEFAULT_TX},w_${width}` : DEFAULT_TX;
  return `${url.slice(0, i)}${UPLOAD}${tx}/${post}`;
}

/** A responsive `srcSet` built from a single Cloudinary upload — each candidate is `f_auto,q_auto,w_n`. */
export function cldSrcSet(url: string, widths: number[] = CLD_WIDTHS): string | undefined {
  if (!isCloudinary(url)) return undefined;
  return widths.map((w) => `${cldUrl(url, w)} ${w}w`).join(", ");
}

/** Map a 0–1 focal point to a Cloudinary compass gravity (`g_north_west` … `g_center` … `g_south_east`).
 *  Coarse (9 zones) but dependency-free — used as the FALLBACK when the image's pixel dimensions aren't
 *  known (so a precise `g_xy_center` crop can't be built). With dimensions, `cldCrop` is pixel-precise. */
export function focalGravity(fx?: number | null, fy?: number | null): string {
  if (fx == null || fy == null) return "auto"; // no focal set → Cloudinary smart crop
  const h = fx < 0.34 ? "west" : fx > 0.66 ? "east" : "";
  const v = fy < 0.34 ? "north" : fy > 0.66 ? "south" : "";
  return [v, h].filter(Boolean).join("_") || "center";
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Bake a focal-aware crop into a Cloudinary URL (Phase 5 · point 21 — Crop / Focal / Aspect).
 *  Produces `c_fill,ar_<ar>,<gravity>[,w_n],f_auto,q_auto` so a plain <img>/background shows the cropped
 *  image with the focal region kept in frame — no per-component change needed. `ar` like "16:9"/"4:5"/"1:1";
 *  omit to keep the original ratio.
 *
 *  Focal precision:
 *   • focal + image dimensions (`imgW`/`imgH`) → **pixel-precise** `g_xy_center,x_<px>,y_<px>` (the exact
 *     point the editor clicked stays centred in the crop, clamped to the edges by Cloudinary).
 *   • focal but no dimensions → coarse 9-zone compass gravity (`focalGravity`).
 *   • no focal → `g_auto` (Cloudinary smart crop).
 *  Non-Cloudinary or already-transformed URLs pass through unchanged. */
export function cldCrop(url: string, opts: { ar?: string; focalX?: number | null; focalY?: number | null; width?: number; imgW?: number | null; imgH?: number | null } = {}): string {
  if (!isCloudinary(url)) return url;
  const i = url.indexOf(UPLOAD);
  const post = url.slice(i + UPLOAD.length);
  if (!/^v\d+\//.test(post)) return url; // already transformed — never double-crop
  const hasFocal = opts.focalX != null && opts.focalY != null;
  const precise = hasFocal && !!opts.imgW && !!opts.imgH && opts.imgW > 0 && opts.imgH > 0;
  const parts = ["c_fill"];
  if (precise) {
    const x = Math.round(clamp01(opts.focalX!) * opts.imgW!);
    const y = Math.round(clamp01(opts.focalY!) * opts.imgH!);
    parts.push("g_xy_center", `x_${x}`, `y_${y}`);
  } else {
    parts.push(`g_${focalGravity(opts.focalX, opts.focalY)}`);
  }
  if (opts.ar && /^\d+:\d+$/.test(opts.ar)) parts.push(`ar_${opts.ar}`);
  if (opts.width) parts.push(`w_${opts.width}`);
  parts.push("f_auto", "q_auto");
  return `${url.slice(0, i)}${UPLOAD}${parts.join(",")}/${post}`;
}

/** A tiny blurred LQIP URL for a Cloudinary image (~a few hundred bytes) — used as the blur-up
 *  background so imagery fades in instead of popping. Non-Cloudinary URLs return undefined. */
export function cldBlur(url: string): string | undefined {
  if (!isCloudinary(url)) return undefined;
  const i = url.indexOf(UPLOAD);
  const post = url.slice(i + UPLOAD.length);
  if (!/^v\d+\//.test(post)) return undefined;
  return `${url.slice(0, i)}${UPLOAD}e_blur:2000,q_30,w_24,c_limit,f_auto/${post}`;
}
