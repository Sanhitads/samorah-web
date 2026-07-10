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
import type { SearchProvider, ProviderQuery, RawHit, SearchResource } from "./types";

const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN")}`;

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

    const groups = await Promise.all(jobs);
    return groups.flat();
  },
};
