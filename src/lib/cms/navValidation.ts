/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Navigation integrity (Phase 1 · points 2·3·4). Three jobs:
 *  - SANITIZE labels — strip any HTML/<script> so a label can never inject markup.
 *  - VALIDATE (errors → BLOCK publish): empty menu / branch / label, EMPTY destination,
 *    UNRESOLVABLE internal destination, ARCHIVED / unpublished / disabled destination, and a
 *    structurally invalid hierarchy (a `child` with no `parent` above it in its branch).
 *  - WARN (never blocks): a coming-soon item whose destination isn't live yet, duplicate URLs,
 *    and a duplicate label + identical destination inside one branch (likely accidental).
 *
 * Coming-soon is driven by the item's own `isComingSoon` flag: such an item is intentionally
 * not-yet-live, so an unresolved destination is EXPECTED (warning), never a blocker. A
 * non-coming-soon item with a broken / archived destination BLOCKS publish.
 *
 * Reuses the canonical routing (resolveHref / ENTITY_ROUTE shapes) and the same entity/status
 * sources the storefront uses — no second routing or lifecycle engine.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveHref, type EntityType } from "@/services/navigationService";

/** Strip tags + collapse whitespace → safe plain-text label. */
export function sanitizeLabel(s: unknown): string {
  return String(s ?? "").replace(/<[^>]*>/g, "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}

// Single-segment routes that exist without an entity (listing/system pages).
const STATIC_ROUTES = new Set(["", "shop", "bundles", "collections", "chapters", "about", "contact", "account", "archive", "shipping", "returns", "terms", "privacy", "faq", "product-care", "login", "register", "journal", "wishlist", "cart", "search"]);
// Reverse of ENTITY_ROUTE: a path's leading segment → the entity whose slug follows it.
const PREFIX_ENTITY: Record<string, EntityType> = { chapters: "chapter", collections: "collection", shop: "product" };

type HrefClass =
  | { kind: "empty" }
  | { kind: "unsafe" } // dangerous scheme (javascript:, data:, …) — ALWAYS blocks
  | { kind: "malformed" } // not a valid nav destination — ALWAYS blocks
  | { kind: "external" }
  | { kind: "static" }
  | { kind: "entity"; type: EntityType; slug: string }
  | { kind: "page"; slug: string }
  | { kind: "unknown" };

const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/** Classify a resolved href into what it points at (for lifecycle/existence + safety checks). */
function classifyHref(href: string | undefined): HrefClass {
  const h = (href ?? "").trim();
  if (!h || h === "#") return { kind: "empty" };
  if (h.startsWith("#")) return { kind: "static" }; // in-page anchor
  const scheme = h.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme) return SAFE_SCHEMES.has(scheme) ? { kind: "external" } : { kind: "unsafe" }; // javascript:/data:/vbscript:/file:…
  if (!h.startsWith("/")) return { kind: "malformed" }; // relative / garbage — not a valid nav destination
  const segs = h.split(/[?#]/)[0].split("/").filter(Boolean);
  if (segs.length === 0) return { kind: "static" }; // "/"
  const [first, second] = segs;
  const et = PREFIX_ENTITY[first];
  if (et) return second ? { kind: "entity", type: et, slug: second } : { kind: "static" }; // /shop, /collections listing pages
  if (segs.length === 1) return STATIC_ROUTES.has(first) ? { kind: "static" } : { kind: "page", slug: first };
  return { kind: "unknown" }; // a deep internal path we don't recognise (treat as a soft warning)
}

export interface DestIndex { pages: Map<string, string>; products: Map<string, string>; chapters: Set<string>; collections: Set<string> }

/** Slug → lifecycle status for pages/products (all statuses, so we can detect archived), plus the
 *  existence sets for config-backed chapters/collections. Best-effort — a load failure degrades to
 *  structural-only validation rather than crashing a save/publish.
 *  Exported so other admin modules (e.g. SEO redirects) reuse the SAME lifecycle source, never a second one. */
export async function loadDestinationIndex(): Promise<DestIndex> {
  const empty: DestIndex = { pages: new Map(), products: new Map(), chapters: new Set(), collections: new Set() };
  try {
    const db = createAdminClient() as any;
    const [pagesR, productsR] = await Promise.all([
      db.from("cms_pages").select("slug,status"),
      db.from("products").select("slug,status"),
    ]);
    const pages = new Map<string, string>((pagesR.data ?? []).map((r: any) => [r.slug, r.status]));
    const products = new Map<string, string>((productsR.data ?? []).map((r: any) => [r.slug, r.status]));
    let chapters = new Set<string>(), collections = new Set<string>();
    try {
      const { listLinkableEntities } = await import("@/services/navigationService");
      const e = await listLinkableEntities();
      chapters = new Set(e.chapter.map((o) => o.id));
      collections = new Set(e.collection.map((o) => o.id));
    } catch { /* config entities optional */ }
    return { pages, products, chapters, collections };
  } catch { return empty; }
}

export type Verdict = { kind: "ok" | "empty" | "missing" | "archived" | "unknown" | "unsafe" | "malformed"; detail?: string };

/** Resolve one item's destination against the lifecycle index. Exported for reuse (SEO redirect
 *  destination lifecycle) — call as `verdictFor({ href }, idx)` for a plain path. */
export function verdictFor(item: any, idx: DestIndex): Verdict {
  // Entity link — definitive existence + lifecycle (pages/products carry status; chapters/collections existence-only).
  if (item.linkType === "entity" && item.entity) {
    const { type, id } = item.entity;
    if (type === "page") return !idx.pages.has(id) ? { kind: "missing", detail: `page:${id}` } : idx.pages.get(id) !== "published" ? { kind: "archived", detail: `page:${id} is ${idx.pages.get(id)}` } : { kind: "ok" };
    if (type === "product") return !idx.products.has(id) ? { kind: "missing", detail: `product:${id}` } : idx.products.get(id) !== "active" ? { kind: "archived", detail: `product:${id} is ${idx.products.get(id)}` } : { kind: "ok" };
    if (type === "chapter") return idx.chapters.size && !idx.chapters.has(id) ? { kind: "missing", detail: `chapter:${id}` } : { kind: "ok" };
    if (type === "collection") return idx.collections.size && !idx.collections.has(id) ? { kind: "missing", detail: `collection:${id}` } : { kind: "ok" };
    return { kind: "ok" };
  }
  // Manual URL — classify the path, then check the deep slug where the route shape is known.
  const c = classifyHref(item.href);
  if (c.kind === "empty") return { kind: "empty" };
  if (c.kind === "unsafe") return { kind: "unsafe", detail: item.href };
  if (c.kind === "malformed") return { kind: "malformed", detail: item.href };
  if (c.kind === "external" || c.kind === "static") return { kind: "ok" };
  if (c.kind === "unknown") return { kind: "unknown", detail: item.href };
  const slug = c.slug;
  if (c.kind === "page") return idx.pages.size && !idx.pages.has(slug) && !STATIC_ROUTES.has(slug) ? { kind: "missing", detail: item.href } : idx.pages.has(slug) && idx.pages.get(slug) !== "published" ? { kind: "archived", detail: `${item.href} is ${idx.pages.get(slug)}` } : { kind: "ok" };
  // entity-shaped URL (/chapters|/collections|/shop/{slug})
  if (c.type === "product") return idx.products.size && !idx.products.has(slug) ? { kind: "missing", detail: item.href } : idx.products.has(slug) && idx.products.get(slug) !== "active" ? { kind: "archived", detail: `${item.href} is ${idx.products.get(slug)}` } : { kind: "ok" };
  if (c.type === "chapter") return idx.chapters.size && !idx.chapters.has(slug) ? { kind: "missing", detail: item.href } : { kind: "ok" };
  if (c.type === "collection") return idx.collections.size && !idx.collections.has(slug) ? { kind: "missing", detail: item.href } : { kind: "ok" };
  return { kind: "ok" };
}

export interface MenuValidation { clean: any[]; errors: string[]; warnings: string[] }

/** Every item we validate, with its branch + resolved destination context. */
interface FlatItem { label: string; href: string; soon: boolean; tier?: string; entity?: any; linkType?: string; branch: string; isCampaign?: boolean }

/** Sanitize labels in `clean` (mutating) and collect a flat item list with context. */
function sanitizeAndCollect(menu: "header" | "footer", clean: any[]): FlatItem[] {
  const items: FlatItem[] = [];
  const pushItem = (o: any, branch: string, isCampaign = false) => {
    o.label = sanitizeLabel(o.label);
    items.push({ label: o.label, href: resolveHref(o), soon: !!o.isComingSoon, tier: o.tier, entity: o.entity, linkType: o.linkType, branch, isCampaign });
  };
  for (const node of clean) {
    if (Array.isArray(node.items)) { // header branch
      node.label = sanitizeLabel(node.label);
      for (const it of node.items) pushItem(it, node.label || node.id || "branch");
      if (node.campaign) {
        node.campaign.title = sanitizeLabel(node.campaign.title);
        node.campaign.eyebrow = sanitizeLabel(node.campaign.eyebrow);
        node.campaign.description = sanitizeLabel(node.campaign.description);
        items.push({ label: node.campaign.title, href: node.campaign.href ?? "", soon: false, branch: node.label || node.id || "branch", isCampaign: true });
      }
    } else if (Array.isArray(node.links)) { // footer section
      node.title = sanitizeLabel(node.title);
      for (const l of node.links) pushItem(l, node.title || "section");
    }
  }
  return items;
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

  const items = sanitizeAndCollect(menu, clean);
  const idx = await loadDestinationIndex();

  // Structural: empty menu / empty branch / empty label.
  if (!clean.length) errors.push(`The ${menu} menu is empty — publishing would hide it`);
  if (menu === "header") for (const b of clean) if (!Array.isArray(b.items) || !b.items.length) errors.push(`Branch "${b.label || b.id}" has no links`);
  for (const it of items) if (!it.label && !it.isCampaign) errors.push(`A ${menu} link has an empty label`);

  // Hierarchy: a `child` must have a `parent` above it in the same branch.
  if (menu === "header") {
    for (const b of clean) {
      if (!Array.isArray(b.items)) continue;
      let sawParent = false;
      for (const it of b.items) {
        if (it.tier === "parent") sawParent = true;
        else if (it.tier === "child" && !sawParent) errors.push(`Branch "${b.label || b.id}": child "${sanitizeLabel(it.label)}" has no parent above it`);
      }
    }
  }

  // Destination lifecycle. Safety/structure ALWAYS block (never downgraded by coming-soon); a not-yet-live
  // destination is downgraded to a warning ONLY when the item is intentionally coming-soon.
  for (const it of items) {
    const v = verdictFor(it.linkType === "entity" ? { linkType: "entity", entity: it.entity } : { href: it.href }, idx);
    const who = it.isCampaign ? `Campaign "${it.label}"` : `"${it.label}"`;
    if (v.kind === "unsafe") { errors.push(`${who} has an unsafe link protocol (${v.detail}) — not allowed`); continue; }
    if (v.kind === "malformed") { errors.push(`${who} → ${v.detail} is not a valid destination`); continue; }
    if (v.kind === "empty") { if (!it.soon) errors.push(`${who} has no destination`); continue; }
    if (v.kind === "missing") { (it.soon ? warnings : errors).push(`${who} → ${v.detail} does not resolve (broken link)`); continue; }
    if (v.kind === "archived") { (it.soon ? warnings : errors).push(`${who} points to an unavailable destination (${v.detail})`); continue; }
    if (v.kind === "unknown") warnings.push(`${who} → ${it.href} may not resolve (custom or unknown route)`);
  }

  // Duplicate URLs across the menu (soft).
  const seen = new Map<string, number>();
  for (const it of items) if (it.href) seen.set(it.href, (seen.get(it.href) ?? 0) + 1);
  for (const [href, n] of seen) if (n > 1) warnings.push(`${n} links point to the same URL (${href})`);

  // Duplicate label + identical destination inside ONE branch — likely accidental (stronger note).
  const perBranch = new Map<string, Set<string>>();
  const dupFlagged = new Set<string>();
  for (const it of items) {
    if (it.isCampaign || !it.label) continue;
    const key = `${it.branch} ${it.label.toLowerCase()} ${it.href}`;
    const set = perBranch.get(it.branch) ?? new Set<string>();
    if (set.has(`${it.label.toLowerCase()} ${it.href}`) && !dupFlagged.has(key)) {
      warnings.push(`Branch "${it.branch}" repeats "${it.label}" → the same destination — likely accidental`);
      dupFlagged.add(key);
    }
    set.add(`${it.label.toLowerCase()} ${it.href}`);
    perBranch.set(it.branch, set);
  }

  return { clean, errors, warnings };
}
