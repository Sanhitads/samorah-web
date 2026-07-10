/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Navigation service (CMS slice 3) — the header mega-menu + footer, DB-driven with
 * a config fallback. `getNavigation()` returns the PUBLISHED tree (navigation_menus
 * JSONB) or the code config when absent — so menus keep working before seeding and
 * become editable the moment a row is saved (same pattern as cms_pages).
 *
 * Campaign imagery references a Media Library id (single-source rule); we resolve
 * media_id → url at read time so the mega-menu never stores a copied URL.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { MENU_BRANCHES, FOOTER_SECTIONS } from "@/config/navigation";

export interface NavItem { label: string; href: string; isComingSoon?: boolean; tier?: "parent" | "child" | "cta" }
export interface NavCampaign { eyebrow: string; title: string; description: string; href: string; gradient: string; mediaId?: string; image?: string }
export interface NavBranch { id: string; label: string; items: NavItem[]; campaign: NavCampaign }
export interface FooterLink { label: string; href: string; external?: boolean }
export interface FooterSection { title: string; links: FooterLink[] }
export interface Navigation { branches: NavBranch[]; footer: FooterSection[] }

export type MenuId = "header" | "footer";

async function readMenu(id: MenuId): Promise<any[] | null> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("navigation_menus").select("data").eq("id", id).maybeSingle();
    return Array.isArray(data?.data) && data.data.length ? data.data : null;
  } catch { return null; }
}

/** Resolve any campaign.mediaId → a concrete image URL (single-source assets). */
async function resolveCampaignImages(branches: NavBranch[]): Promise<void> {
  const ids = [...new Set(branches.map((b) => b.campaign?.mediaId).filter(Boolean) as string[])];
  if (!ids.length) return;
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("media").select("id,url").in("id", ids);
    const url = new Map<string, string>((data ?? []).map((m: any) => [m.id, m.url]));
    for (const b of branches) if (b.campaign?.mediaId) b.campaign.image = url.get(b.campaign.mediaId) ?? b.campaign.image;
  } catch { /* imagery is optional; gradient fallback covers it */ }
}

/** Public read — DB tree if present, else config. Used by the storefront chrome. */
export async function getNavigation(): Promise<Navigation> {
  const [header, footer] = await Promise.all([readMenu("header"), readMenu("footer")]);
  const branches = (header ?? MENU_BRANCHES) as NavBranch[];
  await resolveCampaignImages(branches);
  return { branches, footer: (footer ?? FOOTER_SECTIONS) as FooterSection[] };
}

/** Admin read — raw tree + whether it's DB-managed or still the config default. */
export async function getNavigationAdmin(): Promise<{ branches: NavBranch[]; footer: FooterSection[]; headerSource: "db" | "config"; footerSource: "db" | "config" }> {
  const [header, footer] = await Promise.all([readMenu("header"), readMenu("footer")]);
  return {
    branches: (header ?? MENU_BRANCHES) as NavBranch[],
    footer: (footer ?? FOOTER_SECTIONS) as FooterSection[],
    headerSource: header ? "db" : "config",
    footerSource: footer ? "db" : "config",
  };
}

/** Replace a menu's tree (header or footer). Validated shallowly, audited. */
export async function updateMenu(id: MenuId, data: unknown, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  if (!Array.isArray(data)) return { ok: false, reason: "menu must be a list" };
  const db = createAdminClient() as any;
  const { error } = await db.from("navigation_menus").upsert({ id, data, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "navigation.updated", actorType: actorId ? "staff" : "system", actorId, notes: id });
  return { ok: true };
}

/** Reset a menu back to the code config (delete the DB override). */
export async function resetMenu(id: MenuId, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient() as any;
  const { error } = await db.from("navigation_menus").delete().eq("id", id);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "navigation.reset", actorType: actorId ? "staff" : "system", actorId, notes: id });
  return { ok: true };
}
