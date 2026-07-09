import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import {
  createProduct, updateProduct, setProductStatus, setProductFeatured, getProductForEdit,
  upsertVariant, deleteVariant,
  type CreateProductInput, type ProductCoreInput, type VariantInput, type ProductStatus,
} from "@/services/productAdminService";

/** POST /api/admin/products { action, ... } — catalog CRUD. catalog.manage. */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const staff = await requireCapability("catalog.manage");
  if (!staff.ok) return NextResponse.json({ error: "Forbidden — you lack the catalog.manage capability." }, { status: 403 });

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
      case "get":
        return NextResponse.json({ ok: true, ...(await getProductForEdit(body.id)) });
      case "create":
        return NextResponse.json(await createProduct(body.product as CreateProductInput, a));
      case "update":
        return NextResponse.json(await updateProduct(body.id, body.product as ProductCoreInput, a));
      case "status":
        return NextResponse.json(await setProductStatus(body.id, body.status as ProductStatus, a));
      case "featured":
        return NextResponse.json(await setProductFeatured(body.id, Boolean(body.isFeatured), a));
      case "variant.upsert":
        return NextResponse.json(await upsertVariant(body.variant as VariantInput, a));
      case "variant.delete":
        return NextResponse.json(await deleteVariant(body.id, body.productId, a));
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
