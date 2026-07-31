/**
 * Cloudinary media provider — signed server-side upload + destroy via the REST API
 * (no SDK, keeping our lean-deps posture). Signature = sha1 of the sorted params +
 * api_secret, per Cloudinary's spec. Credentials come from env; the provider is
 * `configured`-gated so the service can fall back to register-by-URL when keys are
 * absent (e.g. local dev).
 */
import { createHash } from "node:crypto";
import type { MediaProvider, UploadResult } from "./provider";

const CLOUD = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
const KEY = process.env.CLOUDINARY_API_KEY ?? "";
const SECRET = process.env.CLOUDINARY_API_SECRET ?? "";
const BASE_FOLDER = process.env.CLOUDINARY_FOLDER ?? "samorah";

export function cloudinaryConfigured(): boolean {
  return Boolean(CLOUD && KEY && SECRET);
}

/** Cloudinary signature: sha1 of `k=v&k=v...` (sorted, excl. file/api_key) + secret. */
function sign(params: Record<string, string>): string {
  const toSign = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join("&");
  return createHash("sha1").update(toSign + SECRET).digest("hex");
}

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
/** Reduce dimensions to a clean CSS aspect-ratio string ("1600 x 2000" → "4 / 5"). */
function aspectOf(w: number, h: number): string {
  const g = gcd(w, h) || 1;
  return `${w / g} / ${h / g}`;
}

/** A tiny base64 LQIP for blur-up — a heavily-blurred 24px derivative of the master. Best-effort:
 *  returns undefined (no blur) on any failure so an upload never fails just because the LQIP didn't. */
async function fetchBlur(secureUrl: string): Promise<string | undefined> {
  if (!secureUrl?.includes("/upload/")) return undefined;
  try {
    const blurUrl = secureUrl.replace("/upload/", "/upload/e_blur:2000,q_30,w_24,c_limit/");
    const r = await fetch(blurUrl);
    if (!r.ok) return undefined;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 4096) return undefined; // keep the LQIP tiny (a few hundred bytes typically)
    const ct = r.headers.get("content-type") || "image/jpeg";
    return `data:${ct};base64,${buf.toString("base64")}`;
  } catch {
    return undefined;
  }
}

export const cloudinaryProvider: MediaProvider = {
  name: "cloudinary",

  async upload(bytes: Buffer, opts: { filename?: string; folder?: string; kind?: string }): Promise<UploadResult> {
    if (!cloudinaryConfigured()) throw new Error("Cloudinary is not configured (CLOUDINARY_* env).");
    const isVideo = opts.kind === "video";
    const folder = opts.folder ? `${BASE_FOLDER}/${opts.folder}` : BASE_FOLDER;
    const timestamp = String(Math.floor(readClock() / 1000));
    // Images: store a capped, metadata-free "web master" (≤3000px, q_90, EXIF/GPS dropped) + palette.
    // Video: those transforms/params are image-only, so we upload as-is (Cloudinary re-encodes on
    // delivery) and sign just folder+timestamp. `/auto/upload` auto-detects the resource type.
    const signed: Record<string, string> = { folder, timestamp };
    if (!isVideo) { signed.colors = "true"; signed.transformation = "c_limit,w_3000,q_90"; }
    const signature = sign(signed);

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)]), opts.filename ?? "upload");
    form.append("api_key", KEY);
    for (const [k, v] of Object.entries(signed)) form.append(k, v);
    form.append("signature", signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/auto/upload`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Cloudinary upload failed (${res.status}): ${await res.text()}`);
    const d = await res.json();
    const dominantColor: string | undefined = !isVideo && Array.isArray(d.colors) && d.colors[0]?.[0] ? String(d.colors[0][0]) : undefined;
    const aspectRatio = d.width && d.height ? aspectOf(d.width, d.height) : undefined;
    const blurDataUrl = isVideo ? undefined : await fetchBlur(d.secure_url as string);
    return { publicId: d.public_id, url: d.secure_url, width: d.width, height: d.height, bytes: d.bytes, format: d.format, dominantColor, aspectRatio, blurDataUrl };
  },

  async destroy(publicId: string, kind?: string): Promise<void> {
    if (!cloudinaryConfigured()) return;
    const timestamp = String(Math.floor(readClock() / 1000));
    const signature = sign({ public_id: publicId, timestamp });
    const form = new FormData();
    form.append("public_id", publicId);
    form.append("api_key", KEY);
    form.append("timestamp", timestamp);
    form.append("signature", signature);
    const resourceType = kind === "video" ? "video" : "image";
    await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/${resourceType}/destroy`, { method: "POST", body: form });
  },
};

// Isolated so the "no Date.now in some contexts" rule is obvious; server routes are fine.
function readClock(): number { return Date.now(); }
