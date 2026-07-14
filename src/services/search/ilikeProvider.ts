/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * ILIKE provider — retrieves matches via Postgres ILIKE (Supabase). Good to a few
 * thousand rows; the default. It ONLY retrieves: no permission checks (the service
 * pre-filters `resources`), no ranking, no href building, no grouping. A PG-FTS or
 * Meilisearch provider is a sibling file implementing the same `search()` and
 * returning the same `RawHit[]` — nothing else in the system changes.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { listPagesAdmin } from "@/services/cmsService";
import { listMedia } from "@/services/media/mediaService";
import type { SearchProvider, ProviderQuery, RawHit, SearchResource } from "./types";

const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN")}`;

// Editable admin destinations — settings/nav/homepage/seo/emails/reports etc. (review point 12).
// Static config (they're routes, not records); matched in-memory against label + keywords.
const ADMIN_DESTINATIONS: { href: string; label: string; keywords: string; note: string }[] = [
  { href: "/admin/settings", label: "Settings", keywords: "settings config gstin store state tax", note: "Store configuration" },
  { href: "/admin/navigation", label: "Navigation", keywords: "navigation menu header nav links", note: "Menu builder" },
  { href: "/admin/homepage", label: "Homepage", keywords: "homepage home builder sections hero", note: "Homepage builder" },
  { href: "/admin/seo", label: "SEO & Redirects", keywords: "seo redirects meta canonical sitemap", note: "SEO manager" },
  { href: "/admin/emails", label: "Emails", keywords: "emails templates newsletter transactional", note: "Email templates" },
  { href: "/admin/reports", label: "Reports", keywords: "reports gst profit cohort revenue analytics", note: "Business reports" },
  { href: "/admin/about", label: "About page", keywords: "about page story", note: "About editor" },
  { href: "/admin/health", label: "Health", keywords: "health system status jobs cron integrations", note: "System health" },
  { href: "/admin/audit", label: "Audit log", keywords: "audit log activity events history", note: "Audit trail" },
];

export const ilikeProvider: SearchProvider = {
  name: "ilike",
  async search({ query, resources, limitPerResource: n }: ProviderQuery): Promise<RawHit[]> {
    const q = query.trim().replace(/[%,]/g, "");
    if (!q) return [];
    const db = createAdminClient() as any;
    const like = `%${q}%`;
    const want = new Set<SearchResource>(resources);
    const jobs: Promise<RawHit[]>[] = [];

    if (want.has("orders")) jobs.push(
      db.from("orders").select("order_number,email,ship_full_name,total_amount").or(`order_number.ilike.${like},email.ilike.${like},ship_full_name.ilike.${like}`).limit(n)
        .then((r: any) => (r.data ?? []).map((o: any): RawHit => ({ resource: "orders", ref: o.order_number, primary: o.order_number, secondary: `${o.ship_full_name ?? o.email} · ${inr(o.total_amount)}` }))));

    if (want.has("customers")) jobs.push(
      db.from("users").select("id,email,full_name").eq("role", "customer").or(`email.ilike.${like},full_name.ilike.${like},phone.ilike.${like}`).limit(n)
        .then((r: any) => (r.data ?? []).map((c: any): RawHit => ({ resource: "customers", ref: c.id, primary: c.full_name ?? c.email, secondary: c.email }))));

    if (want.has("products")) jobs.push(
      db.from("products").select("slug,name,base_sku").or(`name.ilike.${like},base_sku.ilike.${like},slug.ilike.${like}`).limit(n)
        .then((r: any) => (r.data ?? []).map((p: any): RawHit => ({ resource: "products", ref: p.slug, primary: p.name, secondary: p.base_sku }))));

    if (want.has("coupons")) jobs.push(
      db.from("coupons").select("code,description").ilike("code", like).limit(n)
        .then((r: any) => (r.data ?? []).map((c: any): RawHit => ({ resource: "coupons", ref: c.code, primary: c.code, secondary: c.description ?? "" }))));

    if (want.has("returns")) jobs.push(
      db.from("returns").select("rma_number,order_number,status").or(`rma_number.ilike.${like},order_number.ilike.${like}`).limit(n)
        .then((r: any) => (r.data ?? []).map((x: any): RawHit => ({ resource: "returns", ref: x.rma_number, primary: x.rma_number, secondary: `${x.order_number} · ${x.status}` }))));

    // Pages live behind the CMS service (config + DB); filter its small list in memory.
    if (want.has("pages")) jobs.push(
      listPagesAdmin().then((pages) => (pages ?? [])
        .filter((p) => p.slug.includes(q.toLowerCase()) || p.title.toLowerCase().includes(q.toLowerCase()))
        .slice(0, n)
        .map((p): RawHit => ({ resource: "pages", ref: p.slug, primary: p.title, secondary: `/${p.slug}` }))));

    // Media library (title / alt) — the CMS asset store.
    if (want.has("media")) jobs.push(
      listMedia({ search: q, limit: n }).then((assets) => (assets ?? [])
        .map((m): RawHit => ({ resource: "media", ref: m.id, primary: m.title || m.alt || m.id, secondary: m.folder ? `${m.folder} · ${m.kind}` : m.kind }))));

    // Editable admin destinations (settings/nav/homepage/seo/emails/reports) — in-memory.
    if (want.has("admin")) {
      const ql = q.toLowerCase();
      jobs.push(Promise.resolve(
        ADMIN_DESTINATIONS.filter((d) => d.label.toLowerCase().includes(ql) || d.keywords.includes(ql))
          .slice(0, n)
          .map((d): RawHit => ({ resource: "admin", ref: d.href, primary: d.label, secondary: d.note }))));
    }

    const groups = await Promise.all(jobs);
    return groups.flat();
  },
};
