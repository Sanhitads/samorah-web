"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const PRESET_TAGS = ["VIP", "Gift Wrap", "Fragile", "Priority", "Wholesale", "Replacement", "Watch"];

/** Order annotations (internal note + tags) + resend confirmation email. */
export function OrderMeta({ orderId, note, tags, canResend }: { orderId: string; note: string | null; tags: string[]; canResend: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [noteVal, setNoteVal] = useState(note ?? "");
  const [tagList, setTagList] = useState<string[]>(tags);

  const post = async (body: Record<string, unknown>, key: string) => {
    setBusy(key); setMsg("");
    try {
      const res = await fetch("/api/admin/orders/meta", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: orderId, ...body }) });
      const d = await res.json();
      setBusy(null);
      if (!res.ok || d.ok === false) { setMsg(d.error ?? d.reason ?? "Failed"); return; }
      setMsg(key === "resend" ? "Confirmation email sent." : "Saved.");
      startTransition(() => router.refresh());
    } catch { setBusy(null); setMsg("Network error"); }
  };
  const toggleTag = (t: string) => setTagList((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]));

  return (
    <section className="od-card">
      <h2 className="od-card__title">Internal</h2>

      <div className="om-meta-tags">
        {PRESET_TAGS.map((t) => (
          <button key={t} type="button" className="bc-tag" data-derived={tagList.includes(t) ? "0" : "1"} style={{ cursor: "pointer", opacity: tagList.includes(t) ? 1 : 0.5 }} onClick={() => toggleTag(t)}>{t}</button>
        ))}
      </div>
      <button type="button" className="ff-btn" disabled={busy !== null} onClick={() => post({ action: "tags", tags: tagList }, "tags")}>{busy === "tags" ? "…" : "Save tags"}</button>

      <label className="om-field" style={{ marginTop: 14 }}>
        <span>Internal note</span>
        <textarea rows={2} value={noteVal} onChange={(e) => setNoteVal(e.target.value)} placeholder="Visible to staff only" />
      </label>
      <div className="ff-actions">
        <button type="button" className="ff-btn" disabled={busy !== null} onClick={() => post({ action: "note", note: noteVal }, "note")}>{busy === "note" ? "…" : "Save note"}</button>
        {canResend ? <button type="button" className="ff-btn" disabled={busy !== null} onClick={() => post({ action: "resend" }, "resend")}>{busy === "resend" ? "…" : "Resend confirmation"}</button> : null}
        {pending ? <span className="ff-refreshing">updating…</span> : null}
        {msg ? <span className="cfg-msg cfg-msg--ok">{msg}</span> : null}
      </div>
    </section>
  );
}
