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

/** A tiny blurred LQIP URL for a Cloudinary image (~a few hundred bytes) — used as the blur-up
 *  background so imagery fades in instead of popping. Non-Cloudinary URLs return undefined. */
export function cldBlur(url: string): string | undefined {
  if (!isCloudinary(url)) return undefined;
  const i = url.indexOf(UPLOAD);
  const post = url.slice(i + UPLOAD.length);
  if (!/^v\d+\//.test(post)) return undefined;
  return `${url.slice(0, i)}${UPLOAD}e_blur:2000,q_30,w_24,c_limit,f_auto/${post}`;
}
