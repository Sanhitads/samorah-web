import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import {
  createCategory, updateCategory, setCategoryStatus, reorderCategory, deleteCategory,
  type CategoryInput,
} from "@/services/categoryAdminService";

/** POST /api/admin/categories { action, ... } — Category CMS. catalog.manage. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("catalog.manage");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — you lack the catalog.manage capability." }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const a = staff.userId ?? undefined;
  try {
    switch (body.action) {
      case "create": return NextResponse.json(await createCategory(body.category as CategoryInput, a));
      case "update": return NextResponse.json(await updateCategory(body.id, body.category as CategoryInput, a));
      case "status": return NextResponse.json(await setCategoryStatus(body.id, Boolean(body.isActive), a));
      case "reorder": return NextResponse.json(await reorderCategory(body.id, body.direction === "up" ? "up" : "down", a));
      case "delete": return NextResponse.json(await deleteCategory(body.id, a));
      default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
