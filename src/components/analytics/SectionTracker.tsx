"use client";

import { useEffect } from "react";
import { consentGranted, onConsentChange } from "@/lib/analytics/consent";
import { queueEvent, flushNow, setLastSection, type SectionEvent } from "@/lib/analytics/sectionTracking";

/**
 * Live homepage section tracker (Phase 6 · point 26). Observes each `[data-sa-id]` wrapper (rendered by
 * ComposedSections in `track` mode with `display:contents`, so zero layout impact) and records, per
 * section: a de-duped **view** (≥50% visible), the max **scroll** depth reached, and **clicks** (a CTA
 * click also stamps the section for conversion attribution). Consent-gated end to end; no PII.
 */
export function SectionTracker({ pageKey = "homepage" }: { pageKey?: string }) {
  useEffect(() => {
    let stop: () => void = () => {};
    const start = () => { if (consentGranted()) stop = init(pageKey); };
    start();
    const off = onConsentChange(() => { stop(); start(); });
    return () => { stop(); off?.(); flushNow(); };
  }, [pageKey]);
  return null;
}

function init(pageKey: string): () => void {
  const wrappers = Array.from(document.querySelectorAll<HTMLElement>("[data-sa-id]"));
  if (!wrappers.length) return () => {};

  // Each wrapper is display:contents; observe its real box (first element child).
  const boxes = new Map<Element, { id: string; type: string }>();
  for (const w of wrappers) {
    const box = w.firstElementChild;
    if (box) boxes.set(box, { id: w.dataset.saId || "", type: w.dataset.saType || "" });
  }

  const viewed = new Set<string>();
  const scrollMax = new Map<string, number>();
  const emit = (e: SectionEvent) => queueEvent({ ...e, pageKey });

  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      const info = boxes.get(en.target);
      if (!info) continue;
      if (en.isIntersecting && en.intersectionRatio >= 0.5 && !viewed.has(info.id)) {
        viewed.add(info.id);
        emit({ sectionId: info.id, sectionType: info.type, eventType: "view" });
      }
    }
  }, { threshold: [0, 0.5, 1] });
  boxes.forEach((_info, box) => io.observe(box));

  // Scroll depth: how far through each section the viewport has travelled (max, 0–100).
  let raf = 0;
  const measure = () => {
    raf = 0;
    const vpBottom = window.innerHeight;
    boxes.forEach((info, box) => {
      const r = box.getBoundingClientRect();
      if (r.height <= 0 || r.top > vpBottom || r.bottom < 0) return;
      const pct = Math.max(0, Math.min(100, ((vpBottom - r.top) / r.height) * 100));
      if (pct > (scrollMax.get(info.id) ?? 0)) scrollMax.set(info.id, pct);
    });
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(measure); };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  measure();

  // Clicks — delegate; a CTA (anchor/button) click also stamps the section for conversion attribution.
  const onClick = (ev: MouseEvent) => {
    const w = (ev.target as HTMLElement)?.closest?.("[data-sa-id]") as HTMLElement | null;
    if (!w) return;
    const id = w.dataset.saId || "", type = w.dataset.saType || "";
    emit({ sectionId: id, sectionType: type, eventType: "click" });
    if ((ev.target as HTMLElement)?.closest?.("a,button")) setLastSection(id, type, pageKey);
  };
  document.addEventListener("click", onClick, true);

  // Flush scroll depths + queued events when the page is hidden / unloaded.
  const flushScroll = () => { for (const [id, pct] of scrollMax) emit({ sectionId: id, eventType: "scroll", scrollPct: Math.round(pct) }); scrollMax.clear(); flushNow(); };
  const onHide = () => { if (document.visibilityState === "hidden") flushScroll(); };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", flushScroll);

  return () => {
    io.disconnect();
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", flushScroll);
    if (raf) cancelAnimationFrame(raf);
    flushScroll();
  };
}
