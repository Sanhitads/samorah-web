/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Navigation integrity (review points 4·6·13). Three jobs:
 *   - SANITIZE labels — strip any HTML/<script> so a label can never inject markup.
 *   - VALIDATE (errors, block publish) — no empty menu, no empty labels, no two
 *     items pointing at the same URL within a menu.
 *   - DETECT broken links (warnings, don't block) — internal links whose target
 *     route / CMS page doesn't exist.
 * Returns a CLEANED copy (labels sanitized) plus errors + warnings.
 */
import { createAdminClient } from "@/lib/supabase/admin";

/** Strip tags + collapse whitespace → safe plain-text label. */
export function sanitizeLabel(s: unknown): string {
  return String(s ?? "").replace(/<[^>]*>/g, "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}

const STATIC_ROUTES = new Set(["", "shop", "bundles", "collections", "chapters", "about", "contact", "account", "archive", "shipping", "returns", "terms", "privacy", "faq", "product-care", "login", "register"]);

function firstSegment(href: string): string | null {
  if (!href.startsWith("/")) return null; // external / anchor — not our route
  return href.split(/[?#]/)[0].split("/").filter(Boolean)[0] ?? "";
}

export interface MenuValidation { clean: any[]; errors: string[]; warnings: string[] }

/** Pull every {label,href} pair out of a header or footer tree (mutating labels in `clean`). */
function eachLink(clean: any[], visit: (o: { label?: string; href?: string }, setLabel: (v: string) => void) => void): { label: string; href: string }[] {
  const out: { label: string; href: string }[] = [];
  const walk = (o: any, labelKey: string) => {
    if (o[labelKey] !== undefined) { const s = sanitizeLabel(o[labelKey]); o[labelKey] = s; }
    if (o.href) { visit({ label: o[labelKey], href: o.href }, (v) => { o[labelKey] = v; }); out.push({ label: o[labelKey] ?? "", href: o.href }); }
  };
  for (const node of clean) {
    if (Array.isArray(node.items)) { // header branch
      node.label = sanitizeLabel(node.label);
      for (const it of node.items) walk(it, "label");
      if (node.campaign) { node.campaign.title = sanitizeLabel(node.campaign.title); node.campaign.eyebrow = sanitizeLabel(node.campaign.eyebrow); node.campaign.description = sanitizeLabel(node.campaign.description); }
    } else if (Array.isArray(node.links)) { // footer section
      node.title = sanitizeLabel(node.title);
      for (const l of node.links) walk(l, "label");
    }
  }
  return out;
}

async function knownPageSlugs(): Promise<Set<string>> {
  try {
    const db = createAdminClient() as any;
    const { data } = await db.from("cms_pages").select("slug").eq("status", "published");
    return new Set((data ?? []).map((r: any) => r.slug));
  } catch { return new Set(); }
}

/** Validate + sanitize a menu tree. `data` omitted + fetchLatest → validate the saved draft. */
export async function validateMenu(menu: "header" | "footer", data?: unknown, opts: { fetchLatest?: boolean } = {}): Promise<MenuValidation> {
  let tree = data;
  if (tree === undefined && opts.fetchLatest) {
    try {
      const db = createAdminClient() as any;
      const { data: row } = await db.from("navigation_menus").select("draft").eq("id", menu).maybeSingle();
      tree = row?.draft;
    } catch { /* ignore */ }
  }
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(tree)) return { clean: [], errors: ["menu must be a list"], warnings };
  const clean = JSON.parse(JSON.stringify(tree));

  const links = eachLink(clean, (o) => { if (!o.label) errors.push(`A ${menu} link has an empty label`); });

  if (!clean.length) errors.push(`The ${menu} menu is empty — publish would hide it`);
  if (menu === "header") for (const b of clean) if (!Array.isArray(b.items) || !b.items.length) errors.push(`Branch "${b.label || b.id}" has no links`);

  // Duplicate URLs within the menu.
  const seen = new Map<string, number>();
  for (const l of links) if (l.href) seen.set(l.href, (seen.get(l.href) ?? 0) + 1);
  for (const [href, n] of seen) if (n > 1) warnings.push(`${n} links point to the same URL (${href})`);

  // Broken internal links.
  const slugs = await knownPageSlugs();
  for (const l of links) {
    const seg = firstSegment(l.href);
    if (seg === null) continue; // external / anchor
    if (!STATIC_ROUTES.has(seg) && !slugs.has(seg) && !slugs.has(l.href.replace(/^\//, ""))) {
      warnings.push(`"${l.label}" → ${l.href} may be a broken link (no matching route or page)`);
    }
  }

  return { clean, errors, warnings };
}
