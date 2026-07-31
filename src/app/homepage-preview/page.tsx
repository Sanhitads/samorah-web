"use client";

import { useEffect, useRef, useState } from "react";
import { ComposedSections } from "@/components/page/ComposedSections";
import type { ComposedSection } from "@/services/pageComposerService";

/**
 * Live homepage/composed-page preview surface (visual CMS parity with the PDP + chapter editors).
 * Rendered inside an <iframe> by the Page Builder's side-by-side preview. It holds NO data of its own —
 * the builder streams the current draft (the section array with resolved settings) via postMessage and
 * this route renders the REAL storefront renderer (ComposedSections) from it, so the preview never
 * diverges from the shipped page. Links are neutralised so a click never navigates the iframe away.
 * Nothing here writes to the database.
 */
const SRC = "samorah-pdp-preview"; // shared message tag (see LivePreviewPanel + the other preview routes)

export default function HomepagePreviewRoute() {
  const [sections, setSections] = useState<ComposedSection[] | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const receivedRef = useRef(false); // becomes true once the first draft arrives → stops the ready-retry

  useEffect(() => {
    const origin = window.location.origin;
    const focusSection = (id: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      el.classList.add("cs-anchor--flash");
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => el.classList.remove("cs-anchor--flash"), 1600);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.data?.source !== SRC) return;
      if (e.data.kind === "draft") { receivedRef.current = true; setSections(Array.isArray(e.data.product) ? (e.data.product as ComposedSection[]) : []); }
      if (e.data.kind === "focus") focusSection(e.data.id);
    };
    // A click inside a section tells the editor to open + scroll to it (preview → editor). Links are
    // still neutralised so nothing navigates the iframe away.
    const onClick = (ev: MouseEvent) => {
      const t = ev.target as HTMLElement;
      if (t?.closest?.("a")) ev.preventDefault();
      const sectionEl = t?.closest?.("[data-preview-section]") as HTMLElement | null;
      const id = sectionEl?.getAttribute("data-preview-section");
      if (id) window.parent?.postMessage({ source: SRC, kind: "navigate", id }, origin);
    };
    window.addEventListener("message", onMessage);
    document.addEventListener("click", onClick, true);
    // Robust handshake: keep announcing "ready" until the parent answers with a draft. A one-shot
    // "ready" can be missed if the parent's message listener isn't attached at that instant — e.g.
    // React StrictMode's mount→unmount→remount in dev tears the parent listener down briefly — which
    // would leave the preview stuck on "loading" forever. Retrying makes the handshake deterministic.
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

  if (!sections) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#9a938a", fontSize: 14 }}>Preview loading…</div>;
  }
  // Only enabled sections render on the live page — mirror the storefront exactly.
  const visible = sections.filter((s) => s.enabled);
  return (
    <main className="home-preview">
      {visible.length ? <ComposedSections sections={visible} anchors /> : (
        <div style={{ minHeight: "60vh", display: "grid", placeItems: "center", color: "#9a938a", fontSize: 14 }}>All sections are hidden.</div>
      )}
    </main>
  );
}
