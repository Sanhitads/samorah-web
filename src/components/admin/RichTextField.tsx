"use client";

import { useEffect, useRef, useState } from "react";
import { sanitizeHtml } from "@/lib/cms/richText";

/**
 * Lightweight WYSIWYG rich-text editor (Phase 4 · point 16) — contentEditable + a formatting toolbar
 * (bold / italic / link / bullet + numbered lists / quote / H2 / H3 / inline image upload). Emits
 * sanitised HTML. No dependency: uses execCommand with tag-based formatting (styleWithCSS off) so the
 * output is clean `<b>/<i>/<h2>/<blockquote>/<ul>` markup that the allowlist keeps.
 */
const cmd = (name: string, value?: string) => { try { document.execCommand(name, false, value); } catch { /* ignore */ } };

export function RichTextField({ value, onChange, placeholder }: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const savedRange = useRef<Range | null>(null);
  // The last HTML this editor emitted. Used to distinguish our own change echoes (value coming back
  // sanitised) from a genuine EXTERNAL value change — so we never reassign innerHTML mid-typing, which
  // would collapse the caret to the start and drop characters during rapid input.
  const lastEmitted = useRef<string | null>(null);

  // Sync the DOM from `value` ONLY on external changes (initial mount, undo, programmatic set) —
  // never when `value` is simply the sanitised echo of what the user just typed.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (value === lastEmitted.current) return;      // our own echo — leave the live DOM (and caret) alone
    if (el.innerHTML !== (value || "")) el.innerHTML = value || "";
  }, [value]);
  useEffect(() => { try { document.execCommand("styleWithCSS", false, "false"); } catch { /* ignore */ } }, []);

  const emit = () => { const el = ref.current; if (el) { const clean = sanitizeHtml(el.innerHTML); lastEmitted.current = clean; onChange(clean); } };
  // On blur, focus is leaving, so it's safe to normalise the visible DOM to the sanitised form
  // (cleans up any pasted/disallowed markup on-screen to match what gets stored).
  const emitBlur = () => { const el = ref.current; if (el) { const clean = sanitizeHtml(el.innerHTML); lastEmitted.current = clean; if (el.innerHTML !== clean) el.innerHTML = clean; onChange(clean); } };
  const rememberSelection = () => { const s = window.getSelection(); if (s && s.rangeCount) savedRange.current = s.getRangeAt(0).cloneRange(); };
  const restoreSelection = () => { const s = window.getSelection(); if (s && savedRange.current) { s.removeAllRanges(); s.addRange(savedRange.current); } };
  const run = (name: string, val?: string) => { ref.current?.focus(); cmd(name, val); emit(); };

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file); fd.append("folder", "homepage");
      const res = await fetch("/api/admin/media", { method: "POST", body: fd });
      const d = await res.json(); setUploading(false);
      if (d?.url) { ref.current?.focus(); restoreSelection(); cmd("insertImage", d.url); emit(); }
    } catch { setUploading(false); }
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    setLinking(false); setLinkUrl("");
    if (!url) return;
    ref.current?.focus(); restoreSelection();
    cmd("createLink", /^https?:\/\/|^\/|^#|^mailto:/.test(url) ? url : `https://${url}`);
    emit();
  };

  const Btn = ({ label, title, on }: { label: string; title: string; on: () => void }) => (
    <button type="button" className="rte-btn" title={title} aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={on}>{label}</button>
  );

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <Btn label="B" title="Bold" on={() => run("bold")} />
        <Btn label="I" title="Italic" on={() => run("italic")} />
        <span className="rte-sep" />
        <Btn label="H2" title="Heading" on={() => run("formatBlock", "h2")} />
        <Btn label="H3" title="Subheading" on={() => run("formatBlock", "h3")} />
        <Btn label="❝" title="Quote" on={() => run("formatBlock", "blockquote")} />
        <Btn label="¶" title="Paragraph" on={() => run("formatBlock", "p")} />
        <span className="rte-sep" />
        <Btn label="• List" title="Bullet list" on={() => run("insertUnorderedList")} />
        <Btn label="1. List" title="Numbered list" on={() => run("insertOrderedList")} />
        <span className="rte-sep" />
        <button type="button" className="rte-btn" title="Link" aria-label="Link" onMouseDown={(e) => e.preventDefault()} onClick={() => { rememberSelection(); setLinking((v) => !v); }}>🔗</button>
        <label className="rte-btn" title="Insert image" style={{ cursor: uploading ? "default" : "pointer" }} onMouseDown={() => rememberSelection()}>
          {uploading ? "…" : "🖼"}
          <input type="file" accept="image/*" hidden disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
        </label>
      </div>
      {linking ? (
        <div className="rte-link">
          <input autoFocus value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" onKeyDown={(e) => { if (e.key === "Enter") applyLink(); if (e.key === "Escape") { setLinking(false); setLinkUrl(""); } }} />
          <button type="button" className="ff-btn ff-btn--mini" onClick={applyLink}>Add link</button>
          <button type="button" className="ff-btn ff-btn--mini" onClick={() => { setLinking(false); setLinkUrl(""); }}>Cancel</button>
        </div>
      ) : null}
      <div
        ref={ref}
        className="rte-area"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder ?? "Write…"}
        onInput={emit}
        onBlur={emitBlur}
      />
    </div>
  );
}
