import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { cronAuthorized } from "@/lib/cronAuth";
import { processCmsSchedule, NAV_CACHE_TAG } from "@/services/navigationService";

/**
 * POST /api/cron/cms-schedule — materialize due navigation schedule transitions (points 10·11).
 * Activates scheduled menus once publish_at passes, and reverts menus past unpublish_at to the exact
 * revision they displaced (code-config default if none) — atomically + audited. Guarded by CRON_SECRET.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!cronAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const result = await processCmsSchedule();
    if (result.activated || result.deactivated) revalidateTag(NAV_CACHE_TAG); // refresh the live nav on any transition
    return NextResponse.json(result);
  } catch (e) {
    console.error("cms-schedule cron failed", e);
    return NextResponse.json({ error: "Cron failed." }, { status: 500 });
  }
}

// Vercel Cron invokes the path with GET; accept it (still guarded by CRON_SECRET).
export const GET = POST;
