/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Customer account service (audit gap: logged-in users had no /account at all —
 * no order history, no saved addresses). Every read/write is scoped to the caller's
 * userId (ownership enforced in-query, since the service-role client bypasses RLS).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

/** The authenticated customer for the current request, or null. */
export async function getSessionUser(): Promise<{ id: string; email: string } | null> {
  try {
    const db = await createClient();
    const { data } = await db.auth.getUser();
    if (!data.user) return null;
    return { id: data.user.id, email: data.user.email ?? "" };
  } catch {
    return null;
  }
}

export interface MyOrderRow {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  total: number;
  itemCount: number;
  placedAt: string;
}

/** A customer's own orders, newest first. Scoped to userId. */
export async function getMyOrders(userId: string, limit = 50): Promise<MyOrderRow[]> {
  const db = loose();
  const { data } = await db
    .from("orders")
    .select("order_number,status,payment_status,total_amount,placed_at,order_items(quantity)")
    .eq("user_id", userId)
    .order("placed_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((o: any) => ({
    orderNumber: o.order_number, status: o.status, paymentStatus: o.payment_status,
    total: Number(o.total_amount), itemCount: (o.order_items ?? []).reduce((s: number, i: any) => s + (i.quantity ?? 0), 0),
    placedAt: o.placed_at,
  }));
}

/** A single order the caller OWNS (ownership enforced by the user_id filter). */
export async function getMyOrder(userId: string, orderNumber: string): Promise<any | null> {
  const db = loose();
  const { data } = await db.from("orders").select("*, order_items(*)").eq("user_id", userId).eq("order_number", orderNumber).maybeSingle();
  return data ?? null;
}

// ── Address book ─────────────────────────────────────────────────────────────
export interface Address {
  id: string; fullName: string; phone: string; line1: string; line2: string | null;
  city: string; state: string; pincode: string; country: string; isDefault: boolean;
}
export interface AddressInput {
  fullName: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string; isDefault?: boolean;
}

export async function getMyAddresses(userId: string): Promise<Address[]> {
  const db = loose();
  const { data } = await db.from("addresses").select("*").eq("user_id", userId).order("is_default", { ascending: false }).order("created_at");
  return (data ?? []).map((a: any) => ({
    id: a.id, fullName: a.full_name, phone: a.phone, line1: a.line1, line2: a.line2,
    city: a.city, state: a.state, pincode: a.pincode, country: a.country, isDefault: Boolean(a.is_default),
  }));
}

function addrRow(i: AddressInput): Record<string, unknown> {
  return { full_name: i.fullName.trim(), phone: i.phone.trim(), line1: i.line1.trim(), line2: i.line2 || null, city: i.city.trim(), state: i.state.trim(), pincode: i.pincode.trim(), updated_at: new Date().toISOString() };
}

/** Ensure only one default per user (clears the others when one is set). */
async function clearOtherDefaults(db: any, userId: string, exceptId?: string) {
  let q = db.from("addresses").update({ is_default: false }).eq("user_id", userId);
  if (exceptId) q = q.neq("id", exceptId);
  await q;
}

export async function createAddress(userId: string, input: AddressInput) {
  const db = loose();
  const makeDefault = input.isDefault || (await getMyAddresses(userId)).length === 0; // first address = default
  if (makeDefault) await clearOtherDefaults(db, userId);
  const { error } = await db.from("addresses").insert({ user_id: userId, ...addrRow(input), is_default: makeDefault });
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
export async function updateAddress(userId: string, id: string, input: AddressInput) {
  const db = loose();
  if (input.isDefault) await clearOtherDefaults(db, userId, id);
  // user_id filter = ownership guard.
  const { error } = await db.from("addresses").update({ ...addrRow(input), is_default: input.isDefault ?? false }).eq("id", id).eq("user_id", userId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
export async function deleteAddress(userId: string, id: string) {
  const db = loose();
  const { error } = await db.from("addresses").delete().eq("id", id).eq("user_id", userId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
export async function setDefaultAddress(userId: string, id: string) {
  const db = loose();
  await clearOtherDefaults(db, userId, id);
  const { error } = await db.from("addresses").update({ is_default: true }).eq("id", id).eq("user_id", userId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
