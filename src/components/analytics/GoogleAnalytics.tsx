import Script from "next/script";
import { getSiteSettings } from "@/services/siteSettingsService";

/**
 * GA4 loader — renders ONLY when a measurement ID exists (admin Site Settings, or
 * NEXT_PUBLIC_GA_ID as fallback), so analytics lights up the moment the ID is set
 * in the admin — no code change. track() routes events to gtag once this is present.
 */
export async function GoogleAnalytics() {
  const settings = await getSiteSettings();
  const id = settings.analytics.gaId || process.env.NEXT_PUBLIC_GA_ID;
  if (!id) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}',{send_page_view:true});`}
      </Script>
    </>
  );
}
