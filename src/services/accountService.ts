/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Customer account service (audit gap: logged-in users had no /account at all —
 * no order history, no saved addresses). Every read/write is scoped to the caller's
 * userId (ownership enforced in-query, since the service-role client bypasses RLS).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logAccountEvent } from "@/services/accountAuditService";
import { resolveAvatar } from "@/lib/account/avatar";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

export interface AccountProfile {
  fullName: string | null; email: string; avatarUrl: string | null;
  provider: string | null; emailVerified: boolean; lastLoginAt: string | null; lastLoginProvider: string | null;
  loyaltyPoints: number; loyaltyTier: string; marketingConsent: boolean; createdAt: string | null;
  providers: string[];
  devices: { deviceId: string; label: string | null; lastActiveAt: string }[];
  logins: { provider: string | null; device: string | null; browser: string | null; country: string | null; createdAt: string }[];
}

/** Full account profile + connected providers + devices + recent sign-in history. */
export async function getAccountProfile(userId: string): Promise<AccountProfile | null> {
  const db = loose();
  const { data: u } = await db.from("users").select("full_name,email,avatar_url,avatar_cached_url,provider,email_verified,last_login_at,last_login_provider,loyalty_points,loyalty_tier,marketing_consent,created_at").eq("id", userId).maybeSingle();
  if (!u) return null;
  const [{ data: logins }, { data: provs }, { data: devs }] = await Promise.all([
    db.from("login_history").select("provider,device,browser,country,created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(6),
    db.from("user_auth_providers").select("provider").eq("user_id", userId),
    db.from("user_devices").select("device_id,label,last_active_at").eq("user_id", userId).order("last_active_at", { ascending: false }).limit(8),
  ]);
  return {
    fullName: u.full_name ?? null, email: u.email, avatarUrl: resolveAvatar({ avatarUrl: u.avatar_url, avatarCachedUrl: u.avatar_cached_url }),
    provider: u.provider ?? null, emailVerified: Boolean(u.email_verified), lastLoginAt: u.last_login_at ?? null, lastLoginProvider: u.last_login_provider ?? null,
    loyaltyPoints: Number(u.loyalty_points ?? 0), loyaltyTier: u.loyalty_tier ?? "bronze", marketingConsent: Boolean(u.marketing_consent), createdAt: u.created_at ?? null,
    providers: [...new Set([...(provs ?? []).map((p: any) => p.provider), u.provider].filter(Boolean))] as string[],
    devices: (devs ?? []).map((d: any) => ({ deviceId: d.device_id, label: d.label, lastActiveAt: d.last_active_at })),
    logins: (logins ?? []).map((l: any) => ({ provider: l.provider, device: l.device, browser: l.browser, country: l.country, createdAt: l.created_at })),
  };
}

/** Update the editable profile fields (display name, marketing consent). */
export async function updateProfile(userId: string, patch: { fullName?: string; marketingConsent?: boolean }): Promise<{ ok: boolean; reason?: string }> {
  const db = loose();
  const row: any = { updated_at: new Date().toISOString() };
  if (patch.fullName !== undefined) row.full_name = patch.fullName.trim().slice(0, 160) || null;
  if (patch.marketingConsent !== undefined) row.marketing_consent = Boolean(patch.marketingConsent);
  const { error } = await db.from("users").update(row).eq("id", userId);
  return error ? { ok: false, reason: error.message } : { ok: true };
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
  await logAccountEvent(userId, "address_change", { metadata: { action: "add" } });
  return { ok: true };
}
export async function updateAddress(userId: string, id: string, input: AddressInput) {
  const db = loose();
  if (input.isDefault) await clearOtherDefaults(db, userId, id);
  // user_id filter = ownership guard.
  const { error } = await db.from("addresses").update({ ...addrRow(input), is_default: input.isDefault ?? false }).eq("id", id).eq("user_id", userId);
  if (error) return { ok: false, reason: error.message };
  await logAccountEvent(userId, "address_change", { metadata: { action: "update" } });
  return { ok: true };
}
export async function deleteAddress(userId: string, id: string) {
  const db = loose();
  const { error } = await db.from("addresses").delete().eq("id", id).eq("user_id", userId);
  if (error) return { ok: false, reason: error.message };
  await logAccountEvent(userId, "address_change", { metadata: { action: "delete" } });
  return { ok: true };
}
export async function setDefaultAddress(userId: string, id: string) {
  const db = loose();
  await clearOtherDefaults(db, userId, id);
  const { error } = await db.from("addresses").update({ is_default: true }).eq("id", id).eq("user_id", userId);
  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}
