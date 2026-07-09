import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import { createWarehouse, updateWarehouse, deleteWarehouse, setDefaultWarehouse, previewRoute, type WarehouseInput } from "@/services/warehouseAdminService";

/**
 * POST /api/admin/warehouses { action, ... } — warehouse CRUD + routing preview.
 * Logistics config → shipping.configure. Actions: create | update | delete |
 * setDefault | preview.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("shipping.configure");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — you lack the shipping.configure capability." }, { status: 403 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const a = staff.userId ?? undefined;

  try {
    switch (body.action) {
      case "create": return NextResponse.json(await createWarehouse(body.warehouse as WarehouseInput, a));
      case "update":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await updateWarehouse(body.id, body.warehouse as WarehouseInput, a));
      case "delete":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await deleteWarehouse(body.id, a));
      case "setDefault":
        if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
        return NextResponse.json(await setDefaultWarehouse(body.id, a));
      case "preview":
        return NextResponse.json({ ok: true, route: await previewRoute(String(body.state ?? "")) });
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
