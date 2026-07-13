"use client";

import { useState } from "react";

/** Editable profile fields — display name (independent of the Google name) + marketing
 *  consent (Privacy & Data). Posts to /api/account/profile. */
export function AccountSettings({ initialName, initialConsent }: { initialName: string; initialConsent: boolean }) {
  const [name, setName] = useState(initialName);
  const [consent, setConsent] = useState(initialConsent);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: string; text: string } | null>(null);

  const save = async (patch: Record<string, unknown>, ok: string) => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/account/profile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      const d = await res.json(); setBusy(false);
      if (d.ok === false) { setMsg({ tone: "err", text: d.reason ?? "Failed" }); return false; }
      setMsg({ tone: "ok", text: ok }); return true;
    } catch { setBusy(false); setMsg({ tone: "err", text: "Network error" }); return false; }
  };

  return (
    <div className="acc-settings">
      <label className="acc-field">
        <span>Display name</span>
        <div className="acc-field__row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={160} />
          <button type="button" className="acc-btn" disabled={busy || name === initialName} onClick={() => save({ fullName: name }, "Name updated.")}>Save</button>
        </div>
      </label>

      <label className="acc-toggle">
        <input type="checkbox" checked={consent} onChange={(e) => { const v = e.target.checked; setConsent(v); save({ marketingConsent: v }, v ? "Subscribed to updates." : "Unsubscribed."); }} />
        <span>Email me new fragrances, chapters and private launches</span>
      </label>

      {msg ? <p className={`acc-msg acc-msg--${msg.tone}`}>{msg.text}</p> : null}
    </div>
  );
}
