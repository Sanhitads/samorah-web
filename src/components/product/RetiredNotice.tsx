import Link from "next/link";

/**
 * Shown in place of the purchase panel on an archived/retired PDP (SEO Phase 8). The historic product
 * page stays live at its original /shop/[slug] URL (HTTP 200) with its story, notes and artwork intact;
 * this block makes the retired status clear, removes any purchasing path, and links back to The Archive.
 */
export function RetiredNotice() {
  return (
    <div className="pdp__retired" role="note" aria-label="Archived product">
      <p className="pdp__retired-eyebrow">Retired from the collection</p>
      <p className="pdp__retired-copy">
        This fragrance has left the current collection and now lives in The Samorah Archive. It is no longer available to purchase.
      </p>
      <Link href="/archive" className="pdp__retired-link">Return to The Archive</Link>
    </div>
  );
}
