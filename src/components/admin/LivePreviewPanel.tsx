"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reusable side-by-side live preview panel (review: visual CMS). Embeds a preview route (`src`) in an
 * <iframe> and streams the editor's *draft* to it via postMessage — so edits appear instantly, WITHOUT
 * saving. A Desktop / Tablet / Mobile switch renders the real page at true device widths (the iframe is
 * scaled to fit the panel). "Refresh from live" reloads the saved DB state. `focusId` scrolls +
 * highlights the matching section. Used by the product PDP editor and the air-chapter editor.
 */
const SRC = "samorah-pdp-preview"; // shared message tag (also used by the preview routes)

export function LivePreviewPanel({
  src = "/pdp-preview",
  draft,
  focusId,
  onRefresh,
  desktopWidth = 0,
}: {
  src?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draft: any;
  focusId: string | null;
  onRefresh: () => void;
  /** Width the "Desktop" tab renders at, then scales to fit the panel. 0 = native panel width (the
   *  PDP default — crisp, no scaling). Set a real desktop width (e.g. 1280) when the panel is narrow
   *  (the Homepage builder), so "Desktop" shows the true desktop layout instead of the mobile fallback. */
  desktopWidth?: number;
}) {
  const DEVICES = [
    { k: "desktop", l: "Desktop", w: desktopWidth }, // 0 = native panel width (no down-scaling)
    { k: "tablet", l: "Tablet", w: 834 },
    { k: "mobile", l: "Mobile", w: 390 },
  ] as const;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const readyRef = useRef(false);
  const [device, setDevice] = useState<(typeof DEVICES)[number]["k"]>("desktop");
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [dark, setDark] = useState(false); // dark-preview toggle (point 36)

  // Latest draft/focus, so the async "ready" handshake always posts current values (not a stale closure).
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const focusRef = useRef(focusId);
  focusRef.current = focusId;

  const post = useCallback((msg: object) => {
    iframeRef.current?.contentWindow?.postMessage({ source: SRC, ...msg }, window.location.origin);
  }, []);

  // Measure the stage so we can scale the (fixed device-width) iframe to fit.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStage({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setStage({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Handshake: when the iframe reports ready, push the current draft.
  useEffect(() => {
    const origin = window.location.origin;
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== origin || e.data?.source !== SRC || e.data.kind !== "ready") return;
      readyRef.current = true;
      post({ kind: "draft", product: draftRef.current });
      if (focusRef.current) post({ kind: "focus", id: focusRef.current });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [post]);

  // Stream draft edits to the preview (debounced so typing stays smooth).
  useEffect(() => {
    if (!readyRef.current) return;
    const t = setTimeout(() => post({ kind: "draft", product: draft }), 120);
    return () => clearTimeout(t);
  }, [draft, post]);

  // Scroll + highlight the section being edited.
  useEffect(() => {
    if (readyRef.current && focusId) post({ kind: "focus", id: focusId });
  }, [focusId, post]);

  const dev = DEVICES.find((d) => d.k === device)!;
  // Desktop (w: 0) renders at the panel's native width — full-size, crisp, no shrinking. Tablet/Mobile
  // render at their true device width, scaled down to fit the panel so responsive layout is faithful.
  const targetW = dev.w === 0 ? stage.w : dev.w;
  const scale = stage.w > 0 && targetW > 0 ? Math.min(1, stage.w / targetW) : 1;
  const frameW = targetW || stage.w || 0;
  const frameH = stage.h > 0 ? stage.h / scale : 0;

  const refresh = () => {
    readyRef.current = false;
    setDark(false);
    onRefresh(); // reload saved DB state into the editor → draft memo updates → re-posted on ready
    if (iframeRef.current) iframeRef.current.src = `${src}?r=${Date.now()}`; // force reload → fresh ready handshake
  };

  // Dark preview (point 36) — the iframe is same-origin, so we inject a dark treatment directly: invert
  // the page then re-invert media so photos stay true. An approximation until a real dark theme lands.
  const DARK_CSS = "html{filter:invert(0.92) hue-rotate(180deg);background:#0e0e0e!important}img,video,canvas,svg,[style*='background-image'],[style*='url(']{filter:invert(1) hue-rotate(180deg)}";
  const toggleDark = () => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const existing = doc.getElementById("sa-dark-preview");
    if (existing) { existing.remove(); setDark(false); return; }
    const style = doc.createElement("style"); style.id = "sa-dark-preview"; style.textContent = DARK_CSS;
    doc.head.appendChild(style); setDark(true);
  };
  // Print (point 36) — print just the previewed page via the same-origin iframe.
  const printPreview = () => { try { iframeRef.current?.contentWindow?.focus(); iframeRef.current?.contentWindow?.print(); } catch { /* ignore */ } };

  return (
    <div className="pe-live__panel">
      <div className="pe-live__bar">
        <div className="pe-live__devices">
          {DEVICES.map((d) => (
            <button
              key={d.k}
              type="button"
              className={`pe-live__dev${device === d.k ? " is-active" : ""}`}
              onClick={() => setDevice(d.k)}
            >
              {d.l}
            </button>
          ))}
          <button type="button" className={`pe-live__dev${dark ? " is-active" : ""}`} title="Preview in dark mode (approximation)" onClick={toggleDark}>🌙 Dark</button>
          <button type="button" className="pe-live__dev" title="Print the preview" onClick={printPreview}>🖨 Print</button>
        </div>
        <span className="pe-live__hint">Live draft · not saved</span>
        <button type="button" className="ff-btn ff-btn--mini" onClick={refresh}>Refresh from live</button>
      </div>
      <div className="pe-live__stage" ref={stageRef}>
        <iframe
          ref={iframeRef}
          src={src}
          title="Live preview"
          className="pe-live__frame"
          style={{
            width: frameW,
            height: frameH || "100%",
            transform: `scale(${scale})`,
            transformOrigin: "top center",
          }}
        />
      </div>
    </div>
  );
}
