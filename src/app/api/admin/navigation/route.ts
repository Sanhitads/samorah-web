import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { updateMenu, resetMenu, type MenuId } from "@/services/navigationService";

/** POST /api/admin/navigation { action, menu, data? } — edit header/footer menus. catalog.manage. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("catalog.manage");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — catalog.manage required." }, { status: 403 });
  const actor = staff.userId ?? undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const menu = body.menu as MenuId;
  if (menu !== "header" && menu !== "footer") return NextResponse.json({ error: "menu must be header or footer" }, { status: 400 });

  if (body.action === "save") return NextResponse.json(await updateMenu(menu, body.data, actor));
  if (body.action === "reset") return NextResponse.json(await resetMenu(menu, actor));
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
