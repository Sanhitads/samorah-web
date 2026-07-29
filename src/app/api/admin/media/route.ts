import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { uploadMedia, registerMedia, updateMedia, deleteMedia, getMediaUsage } from "@/services/media/mediaService";

/** POST /api/admin/media — upload (multipart) or JSON actions. catalog.manage. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("catalog.manage");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — catalog.manage required." }, { status: 403 });
  const actor = staff.userId ?? undefined;
  const ctype = request.headers.get("content-type") ?? "";

  // Multipart → file upload
  if (ctype.includes("multipart/form-data")) {
    try {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
      // Reject unsupported file types — this endpoint stores images only (video has its own path).
      if (file.type && !file.type.startsWith("image/")) {
        return NextResponse.json({ error: `Unsupported file type "${file.type}". Please upload an image (JPEG, PNG, WebP, AVIF, TIFF).` }, { status: 415 });
      }
      // Generous cap for a high-quality web master; the server re-encodes it to a ≤3000px master anyway.
      if (file.size > 25 * 1024 * 1024) {
        return NextResponse.json({ error: "Max 25MB — please upload a web master (≤3000px), not the full-resolution original. Keep the original in your archive." }, { status: 413 });
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const res = await uploadMedia(bytes, {
        filename: file.name, folder: (form.get("folder") as string) || undefined,
        alt: (form.get("alt") as string) || undefined, title: (form.get("title") as string) || file.name,
      }, actor);
      return NextResponse.json(res, { status: res.ok ? 200 : 422 });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "upload failed" }, { status: 422 });
    }
  }

  // JSON → register-by-url / update / delete / usage
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  switch (body.action) {
    case "register": return NextResponse.json(await registerMedia(body.media, actor));
    case "update": return NextResponse.json(await updateMedia(body.id, body.patch ?? {}, actor));
    case "usage": return NextResponse.json({ ok: true, usage: await getMediaUsage(body.id) });
    case "delete": {
      const res = await deleteMedia(body.id, actor);
      return NextResponse.json(res, { status: res.ok ? 200 : 409 });
    }
    default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
