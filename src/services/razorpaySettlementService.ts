/**
 * Razorpay settlements (review point 8) — the real money-in-the-bank view for cash flow.
 * Reads the Settlements API with our keys and surfaces the last processed settlement + any
 * in-flight (created) one as "expected". Server-only; no-op + { available:false } when
 * Razorpay isn't configured or the call fails. Cached 1h (settlements move daily, and this
 * avoids hammering the API on every dashboard render).
 */
import { unstable_cache } from "next/cache";
import { RAZORPAY } from "@/config/commerce";
import { cacheSeconds } from "@/lib/analytics/cacheConfig";

export interface SettlementSummary {
  available: boolean;
  last: { amount: number; at: string; utr: string | null } | null;   // most recent processed (rupees)
  expected: { amount: number; at: string } | null;                    // in-flight / created (rupees)
  processedCount: number;
  error?: string;
}

const EMPTY: SettlementSummary = { available: false, last: null, expected: null, processedCount: 0 };
const paise = (n: unknown) => Math.round(Number(n ?? 0)) / 100;

interface RzpSettlement { id: string; status?: string; amount?: number; utr?: string | null; created_at?: number }

const fetchSettlements = unstable_cache(
  async (): Promise<SettlementSummary> => {
    if (!RAZORPAY.configured) return { ...EMPTY, error: "not_configured" };
    try {
      const auth = Buffer.from(`${RAZORPAY.keyId}:${RAZORPAY.keySecret}`).toString("base64");
      const res = await fetch("https://api.razorpay.com/v1/settlements?count=20", {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) return { ...EMPTY, available: true, error: `http_${res.status}` };
      const body = (await res.json()) as { items?: RzpSettlement[] };
      const items = body.items ?? [];
      const iso = (s: number | undefined) => (s ? new Date(s * 1000).toISOString() : "");

      const processed = items.filter((s) => s.status === "processed").sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
      const created = items.filter((s) => s.status === "created").sort((a, b) => (b.created_at ?? 0) - (a.created_at ?? 0));
      const lastRow = processed[0];
      const expRow = created[0];

      return {
        available: true,
        last: lastRow ? { amount: paise(lastRow.amount), at: iso(lastRow.created_at), utr: lastRow.utr ?? null } : null,
        expected: expRow ? { amount: paise(expRow.amount), at: iso(expRow.created_at) } : null,
        processedCount: processed.length,
      };
    } catch (e) {
      return { ...EMPTY, error: e instanceof Error ? e.message : "fetch_failed" };
    }
  },
  ["razorpay-settlements"],
  { revalidate: cacheSeconds("razorpay"), tags: ["settlements"] },
);

export function getSettlementSummary(): Promise<SettlementSummary> {
  return fetchSettlements();
}
