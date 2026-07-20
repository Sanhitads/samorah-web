import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { attachReturnEvidence, deleteReturnEvidence } from "@/services/returnService";
import { cloudinaryProvider, cloudinaryConfigured } from "@/services/media/cloudinaryProvider";

/**
 * POST /api/admin/returns/evidence — attach or remove customer evidence on a return.
 * Multipart (file + returnId [+ caption]) uploads a photo/video to Cloudinary (reusing the media
 * provider) and records it in `return_attachments`. JSON { action: "delete", id } removes one.
 * Attaching evidence is operational → returns.operate (mirrors the inspection/warehouse split).
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("returns.operate");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — returns.operate required." }, { status: 403 });
  const actor = staff.userId ?? undefined;
  const ctype = request.headers.get("content-type") ?? "";

  // Multipart → upload a new piece of evidence
  if (ctype.includes("multipart/form-data")) {
    if (!cloudinaryConfigured()) return NextResponse.json({ error: "Storage not configured (CLOUDINARY_* env)." }, { status: 422 });
    try {
      const form = await request.formData();
      const returnId = (form.get("returnId") as string) || "";
      const file = form.get("file");
      if (!returnId) return NextResponse.json({ error: "returnId required" }, { status: 400 });
      if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");
      if (!isVideo && !isImage) return NextResponse.json({ error: "Only image or video files." }, { status: 415 });
      if (file.size > 25 * 1024 * 1024) return NextResponse.json({ error: "Max 25MB." }, { status: 413 });

      const bytes = Buffer.from(await file.arrayBuffer());
      const up = await cloudinaryProvider.upload(bytes, { filename: file.name, folder: `returns/${returnId}` });
      const res = await attachReturnEvidence(returnId, {
        kind: isVideo ? "video" : "image", url: up.url, publicId: up.publicId,
        caption: (form.get("caption") as string) || null, source: "admin",
      }, actor);
      return NextResponse.json(res, { status: res.ok ? 200 : 422 });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "upload failed" }, { status: 422 });
    }
  }

  // JSON → delete
  let body: { action?: string; id?: string };
  try { body = (await request.json()) as typeof body; } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (body.action === "delete") {
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const res = await deleteReturnEvidence(body.id, actor);
    return NextResponse.json(res, { status: res.ok ? 200 : 422 });
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
