import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rateLimit";

/**
 * Storefront search logging (review point 1). Records what visitors search for + how many
 * results they got, into the existing `search_logs` table — powering the admin "Top
 * searches" and "Zero-result searches" insights ("people searched Coffee, 0 results →
 * maybe launch a Coffee candle"). First-party + aggregate; no PII beyond the query the
 * visitor typed. Fired only after consent (the client gates it). Rate-limited.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const rl = rateLimit(request, { bucket: "search-log", limit: 60, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ ok: false }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  try {
    const body = (await request.json()) as { query?: unknown; resultsCount?: unknown; sessionId?: unknown; clickedProductId?: unknown };
    const query = typeof body.query === "string" ? body.query.trim().slice(0, 200) : "";
    if (!query) return NextResponse.json({ ok: false }, { status: 400 });

    const db = createAdminClient() as unknown as { from: (t: string) => { insert: (r: Record<string, unknown>) => Promise<{ error: unknown }> } };
    await db.from("search_logs").insert({
      query,
      results_count: Number.isFinite(Number(body.resultsCount)) ? Math.max(0, Math.trunc(Number(body.resultsCount))) : 0,
      session_id: typeof body.sessionId === "string" ? body.sessionId.slice(0, 255) : null,
      clicked_product_id: typeof body.clickedProductId === "string" && body.clickedProductId ? body.clickedProductId : null,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 }); // analytics must never surface an error to the storefront
  }
}
