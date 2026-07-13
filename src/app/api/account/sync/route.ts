import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rateLimit";
import {
  mergeCart, mergeWishlist, mergeTombstones, applyCartTombstones, applyWishTombstones,
  sanitizeCart, sanitizeWishlist, withinSize, type Tombstones,
} from "@/lib/account/merge";
import { normalizePrefs } from "@/lib/account/prefs";

/**
 * Cross-device account state (cart + wishlist + prefs). GET returns the signed-in
 * user's state; POST MERGES incoming ⊕ stored (last-write-wins per line, tombstones for
 * deletions) and saves — concurrent devices converge. Rate-limited + size/shape
 * validated. Auth via the user's session; writes via admin client scoped to the user.
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
  const { data } = await db.from("account_state").select("cart,wishlist,tombstones,prefs").eq("user_id", userId).maybeSingle();
  return NextResponse.json({ cart: data?.cart ?? [], wishlist: data?.wishlist ?? [], tombstones: data?.tombstones ?? {}, prefs: normalizePrefs(data?.prefs) });
}

export async function POST(request: Request) {
  const rl = rateLimit(request, { bucket: "account-sync", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!withinSize(body)) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  const db = createAdminClient() as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: cur } = await db.from("account_state").select("cart,wishlist,tombstones,prefs").eq("user_id", userId).maybeSingle();

  // Merge tombstones first, then merge lines, then apply tombstones (deletions win when latest).
  const tomb = mergeTombstones((body.tombstones ?? {}) as Tombstones, (cur?.tombstones ?? {}) as Tombstones);
  const cart = applyCartTombstones(mergeCart(sanitizeCart(body.cart), sanitizeCart(cur?.cart)), tomb.cart);
  const wishlist = applyWishTombstones(mergeWishlist(sanitizeWishlist(body.wishlist), sanitizeWishlist(cur?.wishlist)), tomb.wish);
  const prefs = normalizePrefs({ ...(cur?.prefs ?? {}), ...(body.prefs && typeof body.prefs === "object" ? body.prefs : {}) });

  const { error } = await db.from("account_state").upsert({ user_id: userId, cart, wishlist, tombstones: tomb, prefs, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) return NextResponse.json({ ok: false, reason: error.message }, { status: 500 });

  // Mirror wishlist → normalized `wishlists` (CRM Customer 360 source).
  try {
    const ids = [...new Set(wishlist.map((w: any) => w.productId).filter(Boolean))]; // eslint-disable-line @typescript-eslint/no-explicit-any
    await db.from("wishlists").delete().eq("user_id", userId);
    if (ids.length) await db.from("wishlists").insert(ids.map((productId: any) => ({ user_id: userId, product_id: productId }))); // eslint-disable-line @typescript-eslint/no-explicit-any
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, cart, wishlist, tombstones: tomb, prefs });
}
