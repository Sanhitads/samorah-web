import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";

// Role hierarchy. We operate a 4-role model (customer < editor < manager <
// admin); `super_admin` exists in the DB enum but is dormant — tolerated here at
// the top so it is never wrongly denied if it ever appears.
const ROLE_RANK: Record<string, number> = {
  customer: 0,
  editor: 1,
  manager: 2,
  admin: 3,
  super_admin: 4,
};
const MIN_ADMIN_RANK = ROLE_RANK.editor; // /admin requires "editor or above"

/**
 * Refreshes the Supabase auth session on each request AND enforces route access:
 *   • /account/* — any authenticated user
 *   • /admin/*   — editor or above (role read from `users`, only on this path)
 *
 * Refreshed-session cookies are preserved on every redirect. Role is never read
 * from a JWT claim (not implemented yet) — only from the table, on protected paths.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the auth token. Keep this immediately after client creation —
  // do not insert logic before it (Supabase guidance).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAccount = path.startsWith("/account");
  const isAdmin = path.startsWith("/admin");

  // Redirect that carries the refreshed-session cookies onto the new response.
  const redirectTo = (pathname: string, withNext = false) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    if (withNext) url.searchParams.set("next", path);
    const response = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      response.cookies.set(cookie);
    });
    return response;
  };

  // Both /account and /admin require authentication.
  if ((isAccount || isAdmin) && !user) {
    return redirectTo("/login", true);
  }

  // /admin additionally requires editor or above — role queried only here.
  if (isAdmin && user) {
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();

    const rank = ROLE_RANK[profile?.role ?? "customer"] ?? 0;
    if (rank < MIN_ADMIN_RANK) {
      return redirectTo("/"); // authenticated but insufficient role
    }
  }

  return supabaseResponse;
}