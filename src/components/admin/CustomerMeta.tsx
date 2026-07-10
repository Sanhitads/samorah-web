"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

const PRESET = ["VIP", "Wholesale", "Influencer", "Repeat", "At risk", "Gift buyer"];

/** CRM notes + tags editor. */
export function CustomerMeta({ id, notes, tags }: { id: string; notes: string | null; tags: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [noteVal, setNoteVal] = useState(notes ?? "");
  const [tagList, setTagList] = useState<string[]>(tags);

  const post = async (body: Record<string, unknown>, key: string) => {
    setBusy(key); setMsg("");
    try {
      const res = await fetch("/api/admin/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
      const d = await res.json();
      setBusy(null);
      if (!res.ok || d.ok === false) { setMsg(d.error ?? d.reason ?? "Failed"); return; }
      setMsg("Saved."); startTransition(() => router.refresh());
    } catch { setBusy(null); setMsg("Network error"); }
  };
  const toggle = (t: string) => setTagList((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]));

  return (
    <section className="od-card">
      <h2 className="od-card__title">CRM</h2>
      <div className="om-meta-tags">
        {PRESET.map((t) => (
          <button key={t} type="button" className="bc-tag" data-derived={tagList.includes(t) ? "0" : "1"} style={{ cursor: "pointer", opacity: tagList.includes(t) ? 1 : 0.5 }} onClick={() => toggle(t)}>{t}</button>
        ))}
      </div>
      <button type="button" className="ff-btn" disabled={busy !== null} onClick={() => post({ action: "tags", tags: tagList }, "tags")}>{busy === "tags" ? "…" : "Save tags"}</button>
      <label className="om-field" style={{ marginTop: 14 }}><span>Notes</span><textarea rows={3} value={noteVal} onChange={(e) => setNoteVal(e.target.value)} placeholder="Internal CRM notes" /></label>
      <div className="ff-actions">
        <button type="button" className="ff-btn" disabled={busy !== null} onClick={() => post({ action: "note", note: noteVal }, "note")}>{busy === "note" ? "…" : "Save note"}</button>
        {pending ? <span className="ff-refreshing">updating…</span> : null}
        {msg ? <span className="cfg-msg cfg-msg--ok">{msg}</span> : null}
      </div>
    </section>
  );
}
