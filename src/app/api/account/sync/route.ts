import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cross-device account state (cart + wishlist). GET returns the signed-in user's
 * stored state; POST saves it. Auth is the user's own session (server client); data
 * writes use the admin client scoped to that verified user id. Wishlist product ids
 * are mirrored into the normalized `wishlists` table so the CRM stays accurate.
 */
export const runtime = "nodejs";

async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  } catch { return null; }
}

export async function GET() {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await db.from("account_state").select("cart,wishlist").eq("user_id", userId).maybeSingle();
  return NextResponse.json({ cart: data?.cart ?? [], wishlist: data?.wishlist ?? [] });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const cart = Array.isArray(body.cart) ? body.cart : [];
  const wishlist = Array.isArray(body.wishlist) ? body.wishlist : [];

  const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { error } = await db.from("account_state").upsert({ user_id: userId, cart, wishlist, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });

  // Mirror wishlist → normalized `wishlists` (source for the CRM Customer 360).
  try {
    const ids = [...new Set(wishlist.map((w: any) => w.productId).filter(Boolean))];
    await db.from("wishlists").delete().eq("user_id", userId);
    if (ids.length) await db.from("wishlists").insert(ids.map((productId: any) => ({ user_id: userId, product_id: productId })));
  } catch { /* mirror is best-effort; the jsonb state is the storefront source of truth */ }

  return NextResponse.json({ ok: true });
}
