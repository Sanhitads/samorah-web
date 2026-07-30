import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import {
  createProduct, updateProduct, setProductStatus, setProductFeatured, getProductForEdit, duplicateProduct, deleteProduct,
  upsertVariant, deleteVariant, setFragranceNotes, addProductImage, updateProductImage, setPrimaryImage, deleteProductImage,
  getProductTimeline, getProductRelationships, setProductRelationships, bulkUpdateProducts,
  type CreateProductInput, type ProductCoreInput, type VariantInput, type ProductStatus, type ProductBulkAction,
} from "@/services/productAdminService";
import { getAirSiblings, getCandleSiblings } from "@/services/productService";

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
      case "duplicate":
        return NextResponse.json(await duplicateProduct(body.id, a));
      case "delete":
        return NextResponse.json(await deleteProduct(body.id, a));
      case "variant.upsert":
        return NextResponse.json(await upsertVariant(body.variant as VariantInput, a));
      case "variant.delete":
        return NextResponse.json(await deleteVariant(body.id, body.productId, a));
      case "notes.set":
        return NextResponse.json(await setFragranceNotes(body.productId, body.notes ?? [], a));
      case "image.add":
        return NextResponse.json(await addProductImage(body.productId, body.url, body.altText ?? "", a));
      case "image.update":
        return NextResponse.json(await updateProductImage(body.id, body.patch ?? {}, a));
      case "image.primary":
        return NextResponse.json(await setPrimaryImage(body.productId, body.id, a));
      case "image.delete":
        return NextResponse.json(await deleteProductImage(body.id, body.productId, a));
      case "bulk":
        return NextResponse.json(await bulkUpdateProducts(body.ids ?? [], body.bulkAction as ProductBulkAction, body.value, a));
      case "timeline":
        return NextResponse.json({ ok: true, timeline: await getProductTimeline(body.id) });
      case "relationships.get":
        return NextResponse.json({ ok: true, relationships: await getProductRelationships(body.id) });
      case "relationships.set":
        return NextResponse.json(await setProductRelationships(body.id, body.items ?? [], a));
      case "air.siblings":
        return NextResponse.json({ ok: true, siblings: await getAirSiblings(body.collectionId, body.excludeId ?? "") });
      case "candle.siblings":
        return NextResponse.json({ ok: true, siblings: await getCandleSiblings(body.collectionId, body.excludeId ?? "") });
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 422 });
  }
}
