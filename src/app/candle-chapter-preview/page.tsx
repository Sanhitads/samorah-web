"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { PageView } from "@/components/page";
import { buildChapterPage, chapterContentVars, chapterAccentCss, chapterGradientCss, type ChapterInput, type ChapterSummary, type ChapterContent } from "@/lib/chapterPage";

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
  const receivedRef = useRef(false); // true once the first draft arrives → stops the ready-retry

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
      if (e.data.kind === "draft") { receivedRef.current = true; setDraft(e.data.product); }
      if (e.data.kind === "focus") focusSection(e.data.id);
    };
    const onClick = (ev: MouseEvent) => { if ((ev.target as HTMLElement)?.closest?.("a")) ev.preventDefault(); };
    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);
    // Retry "ready" until the editor answers with a draft (a one-shot "ready" can be missed if the
    // parent listener isn't attached yet — React StrictMode mount/remount in dev — leaving it stuck).
    const announce = () => window.parent?.postMessage({ source: SRC, kind: "ready" }, origin);
    announce();
    let tries = 0;
    const readyTimer = setInterval(() => {
      if (receivedRef.current || tries++ > 25) { clearInterval(readyTimer); return; }
      announce();
    }, 200);
    return () => {
      window.removeEventListener("message", onMessage);
      document.removeEventListener("click", onClick, true);
      clearInterval(readyTimer);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  if (!draft) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#9a938a", fontSize: 14 }}>Preview loading…</div>;
  }

  try {
    const content = (draft.chapter?.chapter_content ?? undefined) as ChapterContent | undefined;
    const page = buildChapterPage(draft.chapter as ChapterInput, (draft.allChapters ?? []) as ChapterSummary[], {}, content);
    const vars = chapterContentVars(content);
    const cid = `chapter-${page.slug}`;
    const scoped = [chapterAccentCss(content, cid), chapterGradientCss(content, cid)].filter(Boolean).join("");
    const view = <PageView page={page} options={{ preview: true }} />;
    return vars || scoped ? (
      <div style={vars as CSSProperties} data-cid={cid}>
        {scoped ? <style dangerouslySetInnerHTML={{ __html: scoped }} /> : null}
        {view}
      </div>
    ) : view;
  } catch {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#b4534b", fontSize: 14 }}>Preview unavailable for this chapter.</div>;
  }
}
