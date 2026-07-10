/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Global admin search (refinement R1) — one query across every resource, like a
 * commercial admin's top search bar. Returns grouped, linked hits. PII groups
 * (orders/customers) are only populated when the caller holds analytics.view.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { listPagesAdmin } from "@/services/cmsService";

export interface SearchHit { label: string; sublabel?: string; href: string }
export interface SearchResults {
  orders: SearchHit[];
  customers: SearchHit[];
  products: SearchHit[];
  coupons: SearchHit[];
  returns: SearchHit[];
  pages: SearchHit[];
}

export async function globalSearch(query: string, opts: { pii: boolean } = { pii: false }): Promise<SearchResults> {
  const q = query.trim().replace(/[%,]/g, "");
  const empty: SearchResults = { orders: [], customers: [], products: [], coupons: [], returns: [], pages: [] };
  if (!q) return empty;
  const db = createAdminClient() as any;
  const like = `%${q}%`;

  const [ordersR, customersR, productsR, couponsR, returnsR, pages] = await Promise.all([
    opts.pii ? db.from("orders").select("order_number,email,ship_full_name,total_amount").or(`order_number.ilike.${like},email.ilike.${like},ship_full_name.ilike.${like}`).limit(6) : Promise.resolve({ data: [] }),
    opts.pii ? db.from("users").select("id,email,full_name").eq("role", "customer").or(`email.ilike.${like},full_name.ilike.${like},phone.ilike.${like}`).limit(6) : Promise.resolve({ data: [] }),
    db.from("products").select("slug,name,base_sku").or(`name.ilike.${like},base_sku.ilike.${like},slug.ilike.${like}`).limit(6),
    db.from("coupons").select("id,code,description").ilike("code", like).limit(6),
    db.from("returns").select("rma_number,order_number,status").or(`rma_number.ilike.${like},order_number.ilike.${like}`).limit(6),
    listPagesAdmin(),
  ]);

  return {
    orders: (ordersR.data ?? []).map((o: any) => ({ label: o.order_number, sublabel: `${o.ship_full_name ?? o.email} · ₹${Number(o.total_amount).toLocaleString("en-IN")}`, href: `/admin/orders/${o.order_number}` })),
    customers: (customersR.data ?? []).map((c: any) => ({ label: c.full_name ?? c.email, sublabel: c.email, href: `/admin/customers/${c.id}` })),
    products: (productsR.data ?? []).map((p: any) => ({ label: p.name, sublabel: p.base_sku, href: `/admin/products` })),
    coupons: (couponsR.data ?? []).map((c: any) => ({ label: c.code, sublabel: c.description ?? "", href: `/admin/coupons` })),
    returns: (returnsR.data ?? []).map((r: any) => ({ label: r.rma_number, sublabel: `${r.order_number} · ${r.status}`, href: `/admin/returns` })),
    pages: (pages ?? []).filter((p) => p.slug.includes(q.toLowerCase()) || p.title.toLowerCase().includes(q.toLowerCase())).slice(0, 6).map((p) => ({ label: p.title, sublabel: `/${p.slug}`, href: `/admin/content` })),
  };
}
