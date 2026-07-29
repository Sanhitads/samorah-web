"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { PageView } from "@/components/page";
import { buildAirVolumeFromDb, airChapterVars, airChapterAccentCss } from "@/lib/airFromProduct";
import { buildAirVolumePage } from "@/lib/airPage";

/**
 * Live air-chapter preview surface (review: visual CMS). Rendered inside an <iframe> by the collection
 * editor. It holds NO data of its own — the editor posts the current draft (the collection's air_chapter
 * config + its air products + the next coming-soon collection) and this route renders the REAL chapter
 * page (PageView / buildAirVolumePage) from it. A "focus" message scrolls to + highlights the matching
 * section. Nothing here writes to the database.
 */
const SRC = "samorah-pdp-preview"; // shared message tag

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = { col: any; products: any[]; nextCol?: any } | null;

export default function ChapterPreviewRoute() {
  const [draft, setDraft] = useState<Draft>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const origin = window.location.origin;
    const focusSection = (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("pdp-flash");
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => el.classList.remove("pdp-flash"), 1500);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.data?.source !== SRC) return;
      if (e.data.kind === "draft") setDraft(e.data.product);
      if (e.data.kind === "focus") focusSection(e.data.id);
    };
    // Preview links must not navigate the iframe away.
    const onClick = (ev: MouseEvent) => { if ((ev.target as HTMLElement)?.closest?.("a")) ev.preventDefault(); };
    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);
    window.parent?.postMessage({ source: SRC, kind: "ready" }, origin);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  if (!draft) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#9a938a", fontSize: 14 }}>Preview loading…</div>;
  }

  let page, vars: Record<string, string> | undefined, accentCss: string | null = null;
  const cid = "air-chapter-preview";
  try {
    const vol = buildAirVolumeFromDb(draft.col, draft.products ?? [], draft.nextCol);
    if (!vol) throw new Error("no air products");
    page = buildAirVolumePage(vol);
    vars = airChapterVars(vol);
    accentCss = airChapterAccentCss(vol, cid);
  } catch {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#b4534b", fontSize: 14 }}>This chapter has no Room / Linen products to preview yet.</div>;
  }
  return vars || accentCss ? (
    <div style={vars as CSSProperties} data-cid={cid}>
      {accentCss ? <style dangerouslySetInnerHTML={{ __html: accentCss }} /> : null}
      <PageView page={page} />
    </div>
  ) : (
    <PageView page={page} />
  );
}
