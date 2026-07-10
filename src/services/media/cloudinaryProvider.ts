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

export const cloudinaryProvider: MediaProvider = {
  name: "cloudinary",

  async upload(bytes: Buffer, opts: { filename?: string; folder?: string }): Promise<UploadResult> {
    if (!cloudinaryConfigured()) throw new Error("Cloudinary is not configured (CLOUDINARY_* env).");
    const folder = opts.folder ? `${BASE_FOLDER}/${opts.folder}` : BASE_FOLDER;
    const timestamp = String(Math.floor(readClock() / 1000));
    const signed = { folder, timestamp };
    const signature = sign(signed);

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)]), opts.filename ?? "upload");
    form.append("api_key", KEY);
    form.append("timestamp", timestamp);
    form.append("folder", folder);
    form.append("signature", signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/auto/upload`, { method: "POST", body: form });
    if (!res.ok) throw new Error(`Cloudinary upload failed (${res.status}): ${await res.text()}`);
    const d = await res.json();
    return { publicId: d.public_id, url: d.secure_url, width: d.width, height: d.height, bytes: d.bytes, format: d.format };
  },

  async destroy(publicId: string): Promise<void> {
    if (!cloudinaryConfigured()) return;
    const timestamp = String(Math.floor(readClock() / 1000));
    const signature = sign({ public_id: publicId, timestamp });
    const form = new FormData();
    form.append("public_id", publicId);
    form.append("api_key", KEY);
    form.append("timestamp", timestamp);
    form.append("signature", signature);
    await fetch(`https://api.cloudinary.com/v1_1/${CLOUD}/image/destroy`, { method: "POST", body: form });
  },
};

// Isolated so the "no Date.now in some contexts" rule is obvious; server routes are fine.
function readClock(): number { return Date.now(); }
