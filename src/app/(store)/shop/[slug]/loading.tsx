import type { CSSProperties } from "react";

/**
 * Product (PDP) route loading state — the Suspense fallback for `/shop/[slug]` while it resolves (ISR
 * generation / data fetch). The instant a navigation to a product begins, this REPLACES the previous
 * product as the active destination, so the stale PDP no longer lingers/interactive during the wait.
 *
 * A restrained storefront skeleton that mirrors the PDP hero GEOMETRY (breadcrumb · gallery · sticky info)
 * by reusing the page's own layout classes, so there is no layout jump when the real page arrives. Quiet
 * static fills — no spinner, no shimmer (matches the storefront's static-fill skeleton, not the admin
 * shimmer), no animation → reduced-motion safe by construction. Pure presentation: no data, no client hooks.
 * It does NOT reproduce the page transition — the approved `(store)/template.tsx` opacity fade owns the enter.
 */
const fill = (extra?: CSSProperties): CSSProperties => ({ background: "var(--surface-alt, #efe9df)", borderRadius: 2, ...extra });
const bar = (width: number | string, height = 12, marginBottom = 0): CSSProperties => fill({ display: "block", width, height, marginBottom });

export default function ProductLoading() {
  return (
    <main className="pdp" data-theme="warm-ivory" aria-busy="true" aria-label="Loading product">
      <div className="pdp__head">
        {/* breadcrumb */}
        <div aria-hidden="true" style={{ display: "flex", gap: 10, marginBottom: "clamp(20px, 3vw, 36px)" }}>
          <span style={bar(56, 11)} />
          <span style={bar(84, 11)} />
          <span style={bar(64, 11)} />
        </div>

        <div className="pdp__layout">
          {/* gallery (3/4 portrait, matching .pdp gallery aspect) */}
          <div className="pdp__gallery" aria-hidden="true">
            <div style={fill({ width: "100%", aspectRatio: "3 / 4" })} />
          </div>

          {/* sticky info column */}
          <div className="pdp__info" aria-hidden="true">
            <span style={bar(130, 11, 20)} />
            <span style={bar(72, 11, 22)} />
            <span style={bar("70%", 34, 18)} />
            <span style={bar("85%", 14, 8)} />
            <span style={bar("55%", 14, 30)} />
            <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
              <span style={fill({ width: 66, height: 44 })} />
              <span style={fill({ width: 66, height: 44 })} />
              <span style={fill({ width: 66, height: 44 })} />
            </div>
            <span style={bar(120, 22, 22)} />
            <span style={fill({ display: "block", width: "100%", height: 54 })} />
          </div>
        </div>
      </div>
    </main>
  );
}
