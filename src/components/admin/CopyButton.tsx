"use client";

import { useState } from "react";

/**
 * Copy-to-clipboard button (review: Copy AWB / Copy Address). Tiny quality-of-life control — warehouse
 * staff paste AWBs and addresses into courier portals constantly. Shows a brief ✓ on success.
 */
export function CopyButton({ text, label = "Copy", title }: { text: string; label?: string; title?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch { /* clipboard unavailable (insecure context) — no-op */ }
  };
  return (
    <button type="button" className="copy-btn" onClick={copy} title={title ?? `Copy ${label}`}>
      {done ? "✓ Copied" : `⧉ ${label}`}
    </button>
  );
}
