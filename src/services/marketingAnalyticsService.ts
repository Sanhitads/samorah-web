/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Marketing & Storefront analytics (review points 1, 18, 19, 20). First-party only —
 * aggregates the data we already capture (search_logs · orders' UTMs) into the founder
 * views: search intelligence (top + zero-result searches), and campaign-level attribution.
 * Channel attribution reuses reportsService.getChannelReport. Live-user / true-conversion
 * metrics that require GA4 Realtime are surfaced with a link-out on the page, never faked.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { channelOf } from "@/lib/marketing/channel";

const db = () => createAdminClient() as any;
const PAID = ["paid", "partially_refunded", "refunded"];
const r0 = (n: number) => Math.round(n);

export interface SearchInsights {
  totalSearches: number;
  zeroResultShare: number; // % of searches that returned nothing
  top: { query: string; searches: number; avgResults: number }[];
  zeroResult: { query: string; searches: number }[];
}

/** Top + zero-result searches from search_logs (review points 1, 18). Click-through lives
 *  in GA4 (`select_item`) — storefront results don't carry the product UUID this table keys on. */
export async function getSearchInsights(windowDays = 30): Promise<SearchInsights> {
  const cutoff = new Date(Date.now() - windowDays * 86400000).toISOString();
  const { data } = await db().from("search_logs").select("query,results_count,created_at").gte("created_at", cutoff).limit(20000);
  const rows = (data ?? []) as { query: string; results_count: number }[];

  const agg = new Map<string, { searches: number; resultsSum: number; zero: number }>();
  for (const r of rows) {
    const q = (r.query ?? "").trim().toLowerCase();
    if (!q) continue;
    const a = agg.get(q) ?? { searches: 0, resultsSum: 0, zero: 0 };
    a.searches++;
    a.resultsSum += Number(r.results_count ?? 0);
    if (Number(r.results_count ?? 0) === 0) a.zero++;
    agg.set(q, a);
  }

  const all = [...agg.entries()].map(([query, a]) => ({
    query,
    searches: a.searches,
    avgResults: a.searches ? Math.round((a.resultsSum / a.searches) * 10) / 10 : 0,
  }));
  const totalSearches = all.reduce((s, r) => s + r.searches, 0);
  const totalZero = [...agg.values()].reduce((s, a) => s + a.zero, 0);

  return {
    totalSearches,
    zeroResultShare: totalSearches ? Math.round((totalZero / totalSearches) * 1000) / 10 : 0,
    top: all.sort((a, b) => b.searches - a.searches).slice(0, 15),
    zeroResult: [...agg.entries()].filter(([, a]) => a.zero > 0).map(([query, a]) => ({ query, searches: a.zero })).sort((a, b) => b.searches - a.searches).slice(0, 15),
  };
}

export interface CampaignRow { source: string; medium: string; campaign: string; channel: string; orders: number; revenue: number; aov: number; share: number }

/** Revenue + orders per UTM campaign, from each paid order's UTMs (review point 20).
 *  Complements getChannelReport (point 19) with campaign-level granularity. */
export async function getCampaignReport(windowDays: number | null = 90): Promise<CampaignRow[]> {
  const cutoff = windowDays ? new Date(Date.now() - windowDays * 86400000).toISOString() : null;
  let q = db().from("orders").select("total_amount,utm_source,utm_medium,utm_campaign,placed_at").in("payment_status", PAID);
  if (cutoff) q = q.gte("placed_at", cutoff);
  const { data } = await q;
  const orders = (data ?? []) as any[];

  const map = new Map<string, { source: string; medium: string; campaign: string; orders: number; revenue: number }>();
  let total = 0;
  for (const o of orders) {
    const source = (o.utm_source ?? "").trim() || "(direct)";
    const medium = (o.utm_medium ?? "").trim() || "(none)";
    const campaign = (o.utm_campaign ?? "").trim() || "(none)";
    const key = `${source}|${medium}|${campaign}`;
    const r = map.get(key) ?? { source, medium, campaign, orders: 0, revenue: 0 };
    const rev = Number(o.total_amount ?? 0);
    r.orders++; r.revenue += rev; map.set(key, r);
    total += rev;
  }
  return [...map.values()].map((r) => ({
    source: r.source, medium: r.medium, campaign: r.campaign, channel: channelOf(r.source, r.medium),
    orders: r.orders, revenue: r0(r.revenue), aov: r.orders ? r0(r.revenue / r.orders) : 0,
    share: total > 0 ? Math.round((r.revenue / total) * 1000) / 10 : 0,
  })).sort((a, b) => b.revenue - a.revenue).slice(0, 25);
}
