"use client";

import { useEffect, useRef, useState } from "react";
import { CandleProductDetail } from "@/components/product/CandleProductDetail";
import { buildProductPage, type ProductInput } from "@/lib/productPage";
import { buildCandleEditorial, buildProductArtist, type RelatedProductInput, type CandlePdpContent } from "@/lib/productEditorial";
import { chapterTheme } from "@/lib/chapterPage";

/**
 * Live candle-PDP preview surface (review: visual CMS). Rendered inside an <iframe> by the product
 * editor's side-by-side preview. It holds NO data of its own — the editor posts the current draft
 * product (unsaved) via postMessage and this route rebuilds the REAL storefront component
 * (CandleProductDetail) from it, so the preview never diverges from the shipped page. A "focus"
 * message scrolls to and briefly highlights the matching section. Nothing here writes to the database.
 */
const SRC = "samorah-pdp-preview"; // shared message tag (also used by the air preview + LivePreviewPanel)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DraftProduct = any;

export default function CandlePreviewRoute() {
  const [product, setProduct] = useState<DraftProduct | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const origin = window.location.origin;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.data?.source !== SRC) return;
      if (e.data.kind === "draft") setProduct(e.data.product);
      if (e.data.kind === "focus") focusSection(e.data.id);
    };
    const focusSection = (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("pdp-flash");
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => el.classList.remove("pdp-flash"), 1500);
    };
    // In the preview, links must not navigate the iframe away (that 404s / breaks the preview).
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.("a");
      if (a) e.preventDefault();
    };
    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);
    // Tell the editor we're mounted and ready to receive the first draft.
    window.parent?.postMessage({ source: SRC, kind: "ready" }, origin);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  if (!product) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--ink-soft, #9a938a)", fontSize: 14 }}>Preview loading…</div>;
  }

  try {
    const p = buildProductPage(product as ProductInput);
    if (product.__edition) p.edition = product.__edition;
    const artist = buildProductArtist(product);
    const related = (product.__related ?? []) as RelatedProductInput[];
    const content = (product.pdp_content ?? undefined) as CandlePdpContent | undefined;
    const editorial = buildCandleEditorial({ view: p, artist, related, content });
    const palette = content?.palette || chapterTheme(p.chapterSlug);
    return <CandleProductDetail p={p} editorial={editorial} palette={palette} content={content} preview />;
  } catch {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#b4534b", fontSize: 14 }}>Preview unavailable for this product.</div>;
  }
}
