import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { SITE_CONFIG, isNonPrimaryHost } from "@/config/site";
import { resolveRedirect } from "@/lib/redirects";

export async function middleware(request: NextRequest) {
  // Canonical-domain enforcement (FALLBACK — prefer platform 301s on Vercel/
  // Cloudflare). Any non-primary host permanently redirects to the primary
  // domain, preserving path + query. Local/preview hosts are exempt. Adding or
  // removing alias domains needs no code change — only config/site.ts or the
  // hosting redirect rules.
  const host = request.headers.get("host") ?? "";
  if (isNonPrimaryHost(host)) {
    const url = request.nextUrl.clone();
    url.protocol = `${SITE_CONFIG.protocol}:`;
    url.host = SITE_CONFIG.primaryDomain;
    url.port = "";
    return NextResponse.redirect(url, 301);
  }

  // DB-driven redirects (CMS slice 6) — old/renamed URLs 301/302 without a deploy.
  // Cached (TTL) so this is not a per-request DB hit. Skips admin/api/auth internals.
  const path = request.nextUrl.pathname;
  if (!path.startsWith("/admin") && !path.startsWith("/api") && !path.startsWith("/_next")) {
    const rule = await resolveRedirect(path);
    if (rule) {
      const url = request.nextUrl.clone();
      url.pathname = rule.to.startsWith("/") ? rule.to : `/${rule.to}`;
      return NextResponse.redirect(url, rule.code);
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all paths except static assets:
     * _next/static, _next/image, favicon.ico, sitemap.xml, robots.txt, and
     * common image file extensions.
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)",
  ],
};
