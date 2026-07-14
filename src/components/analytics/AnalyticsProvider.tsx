"use client";

import Script from "next/script";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { analytics } from "@/lib/analytics/analytics";
import { analyticsConfig, analyticsEnabled, hasGa4, hasGtm, hasClarity } from "@/lib/analytics/config";
import { ga4InitScript } from "@/lib/analytics/ga4";
import { gtmInitScript } from "@/lib/analytics/gtm";
import { clarityInitScript } from "@/lib/analytics/clarity";
import { getConsent, onConsentChange } from "@/lib/analytics/consent";
import type { ConsentState } from "@/lib/analytics/types";
import { ConsentBanner } from "./ConsentBanner";
import { EngagementTracker } from "./EngagementTracker";

/**
 * Global analytics installer (review points 2, 3, 10, 11). Loads GA4 + GTM + Clarity via
 * next/script — but ONLY in production, ONLY for configured providers, and ONLY after the
 * visitor grants consent. Fires automatic page views on every App Router navigation
 * (duplicate-free, since GA4 config sets send_page_view:false). All UI event tracking goes
 * through the facade, never here.
 */
export function AnalyticsProvider() {
  const [consent, setConsentState] = useState<ConsentState>("unset");

  useEffect(() => {
    setConsentState(getConsent());
    return onConsentChange((s) => {
      setConsentState(s);
      if (s === "granted") analytics.flush(); // replay events buffered before consent
    });
  }, []);

  const load = analyticsEnabled && consent === "granted";

  return (
    <>
      {load && hasGa4() ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${analyticsConfig.ga4Id}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: ga4InitScript() }} />
        </>
      ) : null}

      {load && hasGtm() ? (
        <>
          <Script id="gtm-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: gtmInitScript() }} />
          <noscript>
            <iframe src={`https://www.googletagmanager.com/ns.html?id=${analyticsConfig.gtmId}`} height="0" width="0" style={{ display: "none", visibility: "hidden" }} title="gtm" />
          </noscript>
        </>
      ) : null}

      {load && hasClarity() ? (
        <Script id="clarity-init" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: clarityInitScript() }} />
      ) : null}

      <Suspense fallback={null}>
        <PageViewTracker enabled={load} />
      </Suspense>

      {analyticsEnabled ? <EngagementTracker /> : null}

      {analyticsEnabled && consent === "unset" ? <ConsentBanner /> : null}
    </>
  );
}

/** Fires page_view on every route change (App Router). Isolated so useSearchParams can
 *  live behind a Suspense boundary without suspending the whole tree. */
function PageViewTracker({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!enabled) return;
    const qs = searchParams.toString();
    analytics.pageView(qs ? `${pathname}?${qs}` : pathname, typeof document !== "undefined" ? document.title : undefined);
  }, [enabled, pathname, searchParams]);
  return null;
}
