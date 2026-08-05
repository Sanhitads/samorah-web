import { NextResponse } from "next/server";
import { requireCapability } from "@/lib/auth/requireStaff";
import {
  upsertRedirect, deleteRedirect, analyzeRedirect,
  upsertSeoOverride, deleteSeoOverride, analyzeSeoOverride, getEffectiveSeo,
} from "@/services/seoRedirectService";
import { requiredCapabilityFor } from "@/lib/seo/rbac";

/**
 * POST /api/admin/seo { action, ... } — redirects + SEO overrides.
 * RBAC (server-enforced, per-action — replaces the old catalog.manage gate):
 *   content.edit    → read-only analyze/preview (redirect.analyze, seo.analyze, seo.effective)
 *   content.publish → every production mutation (redirect.save/delete, seo.save/delete)
 * Mutations changing production immediately (no draft model) require content.publish.
 */
export const runtime = "nodejs";

export async function POST(request: Request) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const action = String(body.action ?? "");
  const cap = requiredCapabilityFor(action);
  if (!cap) return NextResponse.json({ error: "unknown action" }, { status: 400 });
  const staff = await requireCapability(cap);
  if (!staff.ok) return NextResponse.json({ error: `Forbidden — ${cap} required.` }, { status: 403 });
  const actorId = staff.userId ?? undefined;
  const confirmed = !!body.confirmed;

  switch (action) {
    case "redirect.analyze": return NextResponse.json({ ok: true, analysis: await analyzeRedirect(body.redirect ?? {}) });
    case "redirect.save": return NextResponse.json(await upsertRedirect(body.redirect ?? {}, { actorId, confirmed }));
    case "redirect.delete": return NextResponse.json(await deleteRedirect(body.id, actorId));
    case "seo.analyze": return NextResponse.json({ ok: true, analysis: await analyzeSeoOverride(body.seo ?? {}) });
    case "seo.effective": return NextResponse.json({ ok: true, effective: await getEffectiveSeo(String(body.path ?? "")) });
    case "seo.save": return NextResponse.json(await upsertSeoOverride(body.seo ?? {}, { actorId, confirmed }));
    case "seo.delete": return NextResponse.json(await deleteSeoOverride(body.path, actorId));
    default: return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
}
