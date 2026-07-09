/**
 * Server-side staff guard for admin API routes — mirrors the middleware RBAC
 * (customer < editor < manager < admin < super_admin; /admin needs editor+). The
 * middleware protects admin PAGES at the edge; API routes under /api/* aren't on
 * that path, so they call this. Role is read from `users` via the authenticated
 * session client (self-read RLS), never a JWT claim.
 */
import { createClient } from "@/lib/supabase/server";
import { hasCapability, type Capability } from "@/lib/auth/capabilities";

export const ROLE_RANK: Record<string, number> = {
  customer: 0,
  editor: 1,
  manager: 2,
  admin: 3,
  super_admin: 4,
};

export type StaffRole = keyof typeof ROLE_RANK;

export async function requireStaff(min: StaffRole = "editor"): Promise<{ ok: boolean; role: string | null; userId: string | null }> {
  try {
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return { ok: false, role: null, userId: null };
    const { data: profile } = await db.from("users").select("role").eq("id", user.id).single();
    const role = profile?.role ?? "customer";
    return { ok: (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[min] ?? 99), role, userId: user.id };
  } catch {
    return { ok: false, role: null, userId: null };
  }
}

/**
 * Capability guard — the preferred gate for actions. Resolves the session role and
 * checks it holds `cap`. Returns the same shape as requireStaff so routes swap in
 * place: `const staff = await requireCapability("order.cancel")`.
 */
export async function requireCapability(cap: Capability): Promise<{ ok: boolean; role: string | null; userId: string | null }> {
  try {
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return { ok: false, role: null, userId: null };
    const { data: profile } = await db.from("users").select("role").eq("id", user.id).single();
    const role = profile?.role ?? "customer";
    return { ok: hasCapability(role, cap), role, userId: user.id };
  } catch {
    return { ok: false, role: null, userId: null };
  }
}
