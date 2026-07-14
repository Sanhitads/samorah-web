/**
 * Google Tag Manager provider — mirrors events onto `dataLayer` so GTM-managed tags
 * (Meta Pixel, Google Ads, future marketing pixels) can consume them. GTM must NOT
 * contain a GA4 Configuration tag (GA4 is handled by ga4.ts) — see docs/analytics.md.
 */
import { analyticsConfig, analyticsDebug, hasGtm } from "./config";
import type { AnalyticsProvider, AnalyticsEvent, EventParams } from "./types";

/** The GTM container loader snippet (injected once, after consent). */
export function gtmInitScript(): string {
  const id = analyticsConfig.gtmId;
  return `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${id}');`;
}

interface DataLayerObject { event: string; [k: string]: unknown }
function dataLayer(): DataLayerObject[] | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { dataLayer?: DataLayerObject[] };
  w.dataLayer = w.dataLayer || [];
  return w.dataLayer;
}

export const gtm: AnalyticsProvider = {
  name: "gtm",
  get enabled() {
    return hasGtm();
  },
  pageView(url: string, title?: string) {
    dataLayer()?.push({ event: "page_view", page_path: url, page_title: title });
    if (analyticsDebug) console.debug("[gtm] page_view", url);
  },
  event(name: AnalyticsEvent, params: EventParams) {
    dataLayer()?.push({ event: name, ...params });
    if (analyticsDebug) console.debug("[gtm]", name, params);
  },
};
