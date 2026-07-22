import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import {
  createCollection, updateCollection, setCollectionStatus, deleteCollection, getCollectionForEdit,
  setProductDisplayOrder, assignProductToCollection,
  type CollectionInput,
} from "@/services/collectionAdminService";
import { getAirChapterProducts } from "@/services/productService";

/** POST /api/admin/collections { action, ... } — Chapter/Collection CMS. catalog.manage. */
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
      case "get": return NextResponse.json({ ok: true, ...(await getCollectionForEdit(body.id)) });
      case "create": return NextResponse.json(await createCollection(body.collection, a));
      case "update": return NextResponse.json(await updateCollection(body.id, body.collection as CollectionInput, a));
      case "status": return NextResponse.json(await setCollectionStatus(body.id, Boolean(body.isActive), a));
      case "delete": return NextResponse.json(await deleteCollection(body.id, a));
      case "product.order": return NextResponse.json(await setProductDisplayOrder(body.productId, Number(body.displayOrder), a));
      case "product.assign": return NextResponse.json(await assignProductToCollection(body.productId, body.collectionId ?? null, a));
      case "air.data": return NextResponse.json({ ok: true, ...(await getAirChapterProducts(body.id)) });
      default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
