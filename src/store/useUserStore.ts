import { create } from "zustand";

/** The five RBAC roles — mirrors the public.user_role enum in the database. */
export type UserRole =
  | "customer"
  | "editor"
  | "manager"
  | "admin"
  | "super_admin";

/** The authenticated user's profile essentials, held in memory. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl?: string | null;
}

interface UserState {
  user: AuthUser | null;
  // Placeholder in Phase 3A to keep this store Supabase-free; Phase 3B retypes
  // this as the Supabase `Session`.
  session: unknown;
  role: UserRole;
  isLoggedIn: boolean;
  setUser: (user: AuthUser | null, role?: UserRole) => void;
  setSession: (session: unknown) => void;
  clearUser: () => void;
}

/**
 * Identity / auth container. Intentionally NOT persisted — auth state lives in
 * memory (BRD §6.2) and is rehydrated from the Supabase session on mount in
 * Phase 3B. No Supabase wiring here; the setters are called by the auth layer.
 */
export const useUserStore = create<UserState>((set) => ({
  user: null,
  session: null,
  role: "customer",
  isLoggedIn: false,

  setUser: (user, role = "customer") =>
    set({ user, role, isLoggedIn: user !== null }),

  setSession: (session) => set({ session }),

  clearUser: () =>
    set({ user: null, session: null, role: "customer", isLoggedIn: false }),
}));
