"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Side-by-side live preview panel for the air PDP (review: visual CMS). Embeds the /pdp-preview route
 * in an <iframe> and streams the editor's *draft* product to it via postMessage — so edits appear
 * instantly, WITHOUT saving. A Desktop / Tablet / Mobile switch renders the real page at true device
 * widths (the iframe is scaled to fit the panel). "Refresh from live" reloads the saved DB state
 * (discarding the unsaved draft). `focusId` scrolls + highlights the matching storefront section.
 */
const SRC = "samorah-pdp-preview"; // shared message tag (also used by /pdp-preview)
const DEVICES = [
  { k: "desktop", l: "Desktop", w: 1280 },
  { k: "tablet", l: "Tablet", w: 834 },
  { k: "mobile", l: "Mobile", w: 390 },
] as const;

export function AirPdpLivePreview({
  draft,
  focusId,
  onRefresh,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  draft: any;
  focusId: string | null;
  onRefresh: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const readyRef = useRef(false);
  const [device, setDevice] = useState<(typeof DEVICES)[number]["k"]>("desktop");
  const [stage, setStage] = useState({ w: 0, h: 0 });

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
  const scale = stage.w > 0 ? Math.min(1, stage.w / dev.w) : 1;
  const frameW = dev.w;
  const frameH = stage.h > 0 ? stage.h / scale : 0;

  const refresh = () => {
    readyRef.current = false;
    onRefresh(); // reload saved DB state into the editor → draft memo updates → re-posted on ready
    if (iframeRef.current) iframeRef.current.src = `/pdp-preview?r=${Date.now()}`; // force reload → fresh ready handshake
  };

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
        </div>
        <span className="pe-live__hint">Live draft · not saved</span>
        <button type="button" className="ff-btn ff-btn--mini" onClick={refresh}>Refresh from live</button>
      </div>
      <div className="pe-live__stage" ref={stageRef}>
        <iframe
          ref={iframeRef}
          src="/pdp-preview"
          title="PDP live preview"
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
