/**
 * Analytics facade (review point 19) — the single service the app talks to. It fans a
 * typed event out to every enabled provider (GA4 · GTM · Clarity), and enforces the
 * consent gate (review point 10): before the visitor grants consent, events are BUFFERED
 * in memory (never sent) and flushed on grant. Switching/adding providers never touches
 * a UI component. Never throws — analytics must not break UX (review point 11).
 */
import { analyticsEnabled } from "./config";
import { ga4 } from "./ga4";
import { gtm } from "./gtm";
import { clarity } from "./clarity";
import { getConsent } from "./consent";
import type { AnalyticsProvider, AnalyticsEvent, EventParams } from "./types";

const providers: AnalyticsProvider[] = [ga4, gtm, clarity];

type Buffered = { kind: "event"; name: AnalyticsEvent; params: EventParams } | { kind: "page"; url: string; title?: string };
const buffer: Buffered[] = [];
const MAX_BUFFER = 50;

function ready(): boolean {
  return analyticsEnabled && getConsent() === "granted";
}

/** Analytics is a client-only concern — never buffer/fire during SSR (the buffer is
 *  module-scoped and would otherwise leak across requests on the server). */
const isClient = () => typeof window !== "undefined";

function fanEvent(name: AnalyticsEvent, params: EventParams): void {
  for (const p of providers) if (p.enabled) { try { p.event(name, params); } catch { /* per-provider isolation */ } }
}
function fanPage(url: string, title?: string): void {
  for (const p of providers) if (p.enabled) { try { p.pageView(url, title); } catch { /* isolation */ } }
}

export const analytics = {
  /** Fire a typed event. Buffered until consent is granted. */
  track(name: AnalyticsEvent, params: EventParams = {}): void {
    if (!isClient()) return;
    if (!ready()) {
      if (buffer.length < MAX_BUFFER) buffer.push({ kind: "event", name, params });
      return;
    }
    fanEvent(name, params);
  },

  /** Record a page view. Buffered until consent is granted. */
  pageView(url: string, title?: string): void {
    if (!isClient()) return;
    if (!ready()) {
      if (buffer.length < MAX_BUFFER) buffer.push({ kind: "page", url, title });
      return;
    }
    fanPage(url, title);
  },

  /** Called by the loader once consent is granted + scripts are in place: replay the buffer. */
  flush(): void {
    if (!ready()) return;
    const pending = buffer.splice(0, buffer.length);
    for (const b of pending) {
      if (b.kind === "event") fanEvent(b.name, b.params);
      else fanPage(b.url, b.title);
    }
  },
};

/** Low-level escape hatch + back-compat for existing call-sites. Prefer the helpers in
 *  events.ts (trackAddToCart, …) which enforce the correct GA4 param shapes. */
export function track(name: AnalyticsEvent, params: EventParams = {}): void {
  analytics.track(name, params);
}
