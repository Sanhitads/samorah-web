import Script from "next/script";

/**
 * GA4 loader — renders ONLY when NEXT_PUBLIC_GA_ID is set, so the site runs
 * cleanly with no analytics account today and lights up the moment the ID lands
 * (no code change). track() (lib/analytics/track) routes events to gtag once this
 * is present.
 */
export function GoogleAnalytics() {
  const id = process.env.NEXT_PUBLIC_GA_ID;
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
