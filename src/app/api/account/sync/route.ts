import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mergeCart, mergeWishlist, sanitizeCart, sanitizeWishlist, withinSize } from "@/lib/account/merge";

/**
 * Cross-device account state (cart + wishlist). GET returns the signed-in user's
 * stored state; POST MERGES the incoming state with what's stored (last-write-wins per
 * line) and saves the result — so two devices syncing concurrently converge instead of
 * clobbering (optimistic concurrency). Payloads are size- + shape-validated. Auth is the
 * user's own session; writes use the admin client scoped to that verified user id.
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
  const { data } = await db.from("account_state").select("cart,wishlist,prefs").eq("user_id", userId).maybeSingle();
  return NextResponse.json({ cart: data?.cart ?? [], wishlist: data?.wishlist ?? [], prefs: data?.prefs ?? {} });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!withinSize(body)) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  const incomingCart = sanitizeCart(body.cart);
  const incomingWish = sanitizeWishlist(body.wishlist);
  const prefs = body.prefs && typeof body.prefs === "object" && withinSize(body.prefs) ? body.prefs : undefined;

  const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  // Read-merge-write: converge with any concurrent write instead of overwriting it.
  const { data: current } = await db.from("account_state").select("cart,wishlist,prefs").eq("user_id", userId).maybeSingle();
  const cart = mergeCart(incomingCart, sanitizeCart(current?.cart));
  const wishlist = mergeWishlist(incomingWish, sanitizeWishlist(current?.wishlist));
  const mergedPrefs = { ...(current?.prefs ?? {}), ...(prefs ?? {}) };

  const { error } = await db.from("account_state").upsert({ user_id: userId, cart, wishlist, prefs: mergedPrefs, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });

  // Mirror wishlist → normalized `wishlists` (source for the CRM Customer 360).
  try {
    const ids = [...new Set(wishlist.map((w: any) => w.productId).filter(Boolean))]; // eslint-disable-line @typescript-eslint/no-explicit-any
    await db.from("wishlists").delete().eq("user_id", userId);
    if (ids.length) await db.from("wishlists").insert(ids.map((productId: any) => ({ user_id: userId, product_id: productId }))); // eslint-disable-line @typescript-eslint/no-explicit-any
  } catch { /* best-effort; jsonb state is the storefront source of truth */ }

  return NextResponse.json({ ok: true, cart, wishlist });
}
