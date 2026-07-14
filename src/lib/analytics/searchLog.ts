/**
 * Storefront search logging client (review point 1). Fires a first-party log to
 * search_logs (top searches + zero-result searches for the admin) AND the GA4 `search`
 * event. Consent-gated: it piggybacks on the analytics facade's consent state so it
 * never records before the visitor accepts. Best-effort — never throws.
 */
import { getConsent } from "./consent";
import { getDeviceId } from "@/lib/account/device";

function post(body: Record<string, unknown>): void {
  if (typeof window === "undefined" || getConsent() !== "granted") return;
  try {
    const payload = JSON.stringify(body);
    // sendBeacon survives navigation (result-click → page change); fetch is the fallback.
    if (navigator.sendBeacon?.("/api/search/log", new Blob([payload], { type: "application/json" }))) return;
    void fetch("/api/search/log", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
  } catch {
    /* analytics must never break the storefront */
  }
}

/** Log a search + its result count (settle-debounced by the caller). Powers the admin's
 *  top-searches + zero-result-searches insights. Click-through is tracked separately via
 *  GA4 `select_item` (storefront results don't carry the product UUID this table needs). */
export function logStorefrontSearch(query: string, resultsCount: number): void {
  const q = query.trim();
  if (q.length < 2) return;
  post({ query: q, resultsCount, sessionId: safeDevice() });
}

function safeDevice(): string | undefined {
  try { return getDeviceId(); } catch { return undefined; }
}
