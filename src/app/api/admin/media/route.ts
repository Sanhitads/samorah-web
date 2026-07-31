import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { uploadMedia, registerMedia, updateMedia, deleteMedia, getMediaUsage, listMedia, listFolders, listTags } from "@/services/media/mediaService";

/** /api/admin/media — GET list (for the picker) · POST upload (multipart) or JSON actions. catalog.manage. */
export const runtime = "nodejs";

/** GET /api/admin/media?folder=&q=&tag=&kind= — assets + distinct folders + tags for the Media picker. */
export async function GET(request: Request) {
  const staff = await requireCapability("catalog.manage");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — catalog.manage required." }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const [items, folders, tags] = await Promise.all([
    listMedia({ folder: sp.get("folder") || undefined, search: sp.get("q") || undefined, tag: sp.get("tag") || undefined, kind: sp.get("kind") || undefined, limit: 120 }),
    listFolders(),
    listTags(),
  ]);
  return NextResponse.json({ ok: true, items, folders, tags });
}

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
      const isImage = file.type.startsWith("image/");
      const isVideo = /^video\/(mp4|webm|quicktime|ogg)$/.test(file.type);
      // Reject unsupported file types — this endpoint stores images and web-ready video.
      if (file.type && !isImage && !isVideo) {
        return NextResponse.json({ error: `Unsupported file type "${file.type}". Upload an image (JPEG, PNG, WebP, AVIF) or a web video (MP4, WebM).` }, { status: 415 });
      }
      // Cap: images re-encode to a ≤3000px master (25MB is plenty); video is stored as-is, so allow more.
      const cap = isVideo ? 100 * 1024 * 1024 : 25 * 1024 * 1024;
      if (file.size > cap) {
        return NextResponse.json({ error: isVideo ? "Max 100MB for video — please upload a compressed web MP4, not the full-resolution original." : "Max 25MB — please upload a web master (≤3000px), not the full-resolution original. Keep the original in your archive." }, { status: 413 });
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      const res = await uploadMedia(bytes, {
        filename: file.name, folder: (form.get("folder") as string) || undefined, kind: isVideo ? "video" : "image",
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
