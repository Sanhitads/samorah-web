/**
 * Server-side analytics via the GA4 Measurement Protocol (review priority B). Authoritative
 * commerce events — purchase, refund, shipment lifecycle — fired from trusted server code
 * (order finalisation, refund settlement, dispatch/delivery), so they're recorded even when
 * the browser is closed, offline, or blocking analytics. GA4 DEDUPES `purchase` by
 * transaction_id, so this is safe alongside the client-side purchase event.
 *
 * Config: NEXT_PUBLIC_GA_MEASUREMENT_ID + GA4_API_SECRET (GA4 Admin → Data Streams →
 * Measurement Protocol API secrets). No-op when either is missing — nothing to configure
 * to keep builds green; set the secret to light it up. Never throws.
 */
import { analyticsConfig } from "./config";
import type { AnalyticsEvent, AnalyticsItem } from "./types";

const ENDPOINT = "https://www.google-analytics.com/mp/collect";

function enabled(): boolean {
  return !!analyticsConfig.ga4Id && !!process.env.GA4_API_SECRET;
}

/** GA4 requires a client_id. Server events have no browser cookie, so synthesise a stable
 *  one per transaction (dedup is by transaction_id, not client_id, so this is fine). */
function clientIdFor(seed?: string): string {
  if (seed) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return `${h}.${1_700_000_000}`;
  }
  return `${Math.floor(Math.random() * 1e10)}.${1_700_000_000}`;
}

/** Fire one server-side event. Fire-and-forget; failures are swallowed + logged. */
export async function sendServerEvent(name: AnalyticsEvent, params: Record<string, unknown>, clientSeed?: string): Promise<void> {
  if (!enabled()) return;
  try {
    const url = `${ENDPOINT}?measurement_id=${encodeURIComponent(analyticsConfig.ga4Id)}&api_secret=${encodeURIComponent(process.env.GA4_API_SECRET as string)}`;
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientIdFor(clientSeed), non_personalized_ads: true, events: [{ name, params }] }),
    });
  } catch (e) {
    console.error("[analytics/server] send failed (non-fatal)", name, e);
  }
}

const CURRENCY = "INR";

export interface ServerPurchase {
  transactionId: string;
  value: number;
  tax?: number;
  shipping?: number;
  coupon?: string | null;
  items?: AnalyticsItem[];
}

/** Authoritative purchase (from order finalisation). */
export const trackServerPurchase = (p: ServerPurchase): Promise<void> =>
  sendServerEvent("purchase", {
    transaction_id: p.transactionId, currency: CURRENCY, value: p.value,
    tax: p.tax, shipping: p.shipping, coupon: p.coupon ?? undefined,
    items: p.items?.map((i) => ({ currency: CURRENCY, quantity: 1, ...i })),
  }, p.transactionId);

/** Authoritative refund (from refund settlement). */
export const trackServerRefund = (transactionId: string, value: number): Promise<void> =>
  sendServerEvent("refund", { transaction_id: transactionId, currency: CURRENCY, value }, transactionId);

/** Shipment lifecycle (dispatched / delivered / rto) — one authoritative server signal. */
export const trackServerShipment = (event: AnalyticsEvent, transactionId: string, extra: Record<string, unknown> = {}): Promise<void> =>
  sendServerEvent(event, { transaction_id: transactionId, ...extra }, transactionId);
