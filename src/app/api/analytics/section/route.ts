import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rateLimit";
import { recordSectionEvents, type SectionEventInput } from "@/services/analytics/sectionAnalyticsService";

/**
 * Section analytics ingest (Phase 6 · point 26). First-party, privacy-first: the storefront posts
 * anonymous per-section events (view / click / scroll / conversion) here after the visitor grants
 * consent (the client gates it). No PII — only an ephemeral per-tab session id used to de-dupe views.
 * Rate-limited; errors are swallowed so tracking never surfaces to the storefront.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  const rl = rateLimit(request, { bucket: "section-events", limit: 120, windowMs: 60_000 });
  if (!rl.ok) return NextResponse.json({ ok: false }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  try {
    const body = (await request.json()) as { events?: unknown };
    const events = (Array.isArray(body.events) ? body.events : []) as SectionEventInput[];
    if (!events.length) return NextResponse.json({ ok: true, inserted: 0 });
    const res = await recordSectionEvents(events);
    return NextResponse.json({ ok: res.ok, inserted: res.inserted });
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 }); // never surface an error to the storefront
  }
}
