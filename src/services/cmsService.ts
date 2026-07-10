/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * CMS service (Phase 5) — DB-driven storefront pages. getPage(slug) returns the
 * PUBLISHED cms_pages row, falling back to the config content when absent, so the
 * storefront works before seeding and becomes editable the moment a page is saved.
 * Admin CRUD keeps content out of code (the CMS-first goal).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/services/auditService";
import { LEGAL } from "@/config/legalContent";

export interface PageSection { heading?: string; body: string[] }
export interface CmsPage {
  slug: string;
  title: string;
  eyebrow: string;
  intro: string;
  sections: PageSection[];
  seo: { title?: string; description?: string; ogImage?: string };
  status: "draft" | "published";
  source: "db" | "config";
}

/** Public read — published DB page, else config fallback (LEGAL), else null. */
export async function getPage(slug: string): Promise<CmsPage | null> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("cms_pages").select("*").eq("slug", slug).eq("status", "published").maybeSingle();
    if (data) {
      return {
        slug: data.slug, title: data.title, eyebrow: data.eyebrow ?? "", intro: data.intro ?? "",
        sections: Array.isArray(data.sections) ? data.sections : [], seo: data.seo ?? {}, status: data.status, source: "db",
      };
    }
  } catch {
    /* fall through to config */
  }
  const c = LEGAL[slug];
  if (!c) return null;
  return { slug, title: c.title, eyebrow: c.eyebrow, intro: c.intro ?? "", sections: c.sections, seo: {}, status: "published", source: "config" };
}

/** Admin: all DB pages + the config-only slugs (offered as seedable). */
export async function listPagesAdmin(): Promise<{ slug: string; title: string; status: string; source: "db" | "config" }[]> {
  const db = createAdminClient() as any;
  const { data } = await db.from("cms_pages").select("slug,title,status").order("slug");
  const dbPages = (data ?? []) as any[];
  const dbSlugs = new Set(dbPages.map((p) => p.slug));
  const rows: { slug: string; title: string; status: string; source: "db" | "config" }[] = dbPages.map((p) => ({ slug: p.slug, title: p.title, status: p.status, source: "db" as const }));
  for (const [slug, c] of Object.entries(LEGAL)) if (!dbSlugs.has(slug)) rows.push({ slug, title: c.title, status: "config", source: "config" as const });
  return rows.sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Admin: load a page for editing (DB row, or config seed if none). */
export async function getPageForEdit(slug: string): Promise<CmsPage | null> {
  return getPage(slug);
}

export interface PageInput {
  slug: string; title: string; eyebrow?: string; intro?: string;
  sections: PageSection[]; seo?: { title?: string; description?: string; ogImage?: string }; status?: "draft" | "published";
}

export async function upsertPage(input: PageInput, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  if (!input.slug?.trim() || !input.title?.trim()) return { ok: false, reason: "slug and title required" };
  const db = createAdminClient() as any;
  const row = {
    slug: input.slug.trim(), title: input.title.trim(), eyebrow: input.eyebrow || null, intro: input.intro || null,
    sections: (input.sections ?? []).filter((s) => s.body?.length || s.heading), seo: input.seo ?? {},
    status: input.status ?? "published", updated_at: new Date().toISOString(),
  };
  const { error } = await db.from("cms_pages").upsert(row, { onConflict: "slug" });
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "cms.page_saved", actorType: actorId ? "staff" : "system", actorId, notes: input.slug });
  return { ok: true };
}

export async function deletePage(slug: string, actorId?: string): Promise<{ ok: boolean; reason?: string }> {
  const db = createAdminClient() as any;
  const { error } = await db.from("cms_pages").delete().eq("slug", slug);
  if (error) return { ok: false, reason: error.message };
  await logEvent({ entityType: "settings", event: "cms.page_deleted", actorType: actorId ? "staff" : "system", actorId, notes: slug });
  return { ok: true };
}
