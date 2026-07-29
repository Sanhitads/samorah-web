"use client";

import { useEffect, useRef, useState } from "react";
import { PageView } from "@/components/page";
import { buildChapterPage, type ChapterInput, type ChapterSummary } from "@/lib/chapterPage";

/**
 * Live candle-chapter preview surface (review: visual CMS). Rendered inside an <iframe> by the
 * collection editor. It holds NO data of its own — the editor posts the current draft (the collection
 * fields + its candle products + all chapters) and this route rebuilds the REAL chapter page
 * (buildChapterPage / PageView) from it, so the preview never diverges from the shipped page. A "focus"
 * message scrolls to + highlights the matching section. Nothing here writes to the database.
 */
const SRC = "samorah-pdp-preview"; // shared message tag

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = { chapter: any; allChapters: any[] } | null;

export default function CandleChapterPreviewRoute() {
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

  try {
    const page = buildChapterPage(draft.chapter as ChapterInput, (draft.allChapters ?? []) as ChapterSummary[]);
    return <PageView page={page} options={{ preview: true }} />;
  } catch {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#b4534b", fontSize: 14 }}>Preview unavailable for this chapter.</div>;
  }
}
