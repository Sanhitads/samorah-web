"use client";

import { useEffect, useRef, useState } from "react";
import { AirProductDetail } from "@/components/product/AirProductDetail";
import { buildAirViewFromDb } from "@/lib/airFromProduct";

/**
 * Live PDP preview surface (review: visual CMS). Rendered inside an <iframe> by the product editor's
 * side-by-side preview. It holds NO data of its own — the editor posts the current draft product
 * (unsaved) via postMessage and this route renders the REAL storefront component (AirProductDetail)
 * from it, so the preview never diverges from the shipped page. A "focus" message scrolls to and
 * briefly highlights the matching section. Nothing here writes to the database.
 */
const SRC = "samorah-pdp-preview"; // shared message tag (also used by AirPdpLivePreview)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DraftProduct = any;

export default function PdpPreviewRoute() {
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
    window.addEventListener("message", onMessage);
    // Tell the editor we're mounted and ready to receive the first draft.
    window.parent?.postMessage({ source: SRC, kind: "ready" }, origin);
    return () => {
      window.removeEventListener("message", onMessage);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  if (!product) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--ink-soft, #9a938a)", fontSize: 14 }}>Preview loading…</div>;
  }

  let view;
  try {
    view = buildAirViewFromDb(product, product.__siblings ?? []);
  } catch {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#b4534b", fontSize: 14 }}>Preview unavailable for this product.</div>;
  }
  return <AirProductDetail hour={view.hour} group={view.group} volume={view.volume} others={view.others} />;
}
