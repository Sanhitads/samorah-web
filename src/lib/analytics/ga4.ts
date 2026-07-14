/**
 * GA4 provider — the canonical analytics path. Talks to `gtag`. This is the ONLY GA4
 * surface in the app; UI components never call gtag directly (review point 19).
 *
 * NOTE on the dual GA4+GTM install: GA4 events flow through gtag HERE. Do NOT also add
 * a GA4 Configuration tag inside GTM, or every hit double-counts. GTM is for marketing
 * tags (Meta Pixel / Ads) only. See docs/analytics.md.
 */
import { analyticsConfig, analyticsDebug, hasGa4 } from "./config";
import type { AnalyticsProvider, AnalyticsEvent, EventParams } from "./types";

type Gtag = (...args: unknown[]) => void;
function gtag(): Gtag | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { gtag?: Gtag }).gtag;
}

export const ga4: AnalyticsProvider = {
  name: "ga4",
  get enabled() {
    return hasGa4();
  },
  pageView(url: string, title?: string) {
    const g = gtag();
    if (!g) return;
    // send_page_view is false in the config; we fire page_view manually per route so
    // there are never duplicate pageviews (review point 2).
    g("event", "page_view", { page_path: url, page_location: typeof location !== "undefined" ? location.origin + url : url, page_title: title });
    if (analyticsDebug) console.debug("[ga4] page_view", url);
  },
  event(name: AnalyticsEvent, params: EventParams) {
    const g = gtag();
    if (!g) return;
    g("event", name, params);
    if (analyticsDebug) console.debug("[ga4]", name, params);
  },
};

/** The inline init snippet the loader injects once (after consent). Configures GA4 with
 *  send_page_view disabled so route tracking is manual + duplicate-free. */
export function ga4InitScript(): string {
  const id = analyticsConfig.ga4Id;
  return `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${id}',{send_page_view:false,anonymize_ip:true});`;
}
