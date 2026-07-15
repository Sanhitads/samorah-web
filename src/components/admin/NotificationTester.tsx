"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Fire a test operational notification and show the per-channel result (verify Slack/SMS live). */
export function NotificationTester() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ channel: string; status: string; target?: string; error?: string }[] | null>(null);
  const [channels, setChannels] = useState<string[]>(["in_app", "slack"]);
  const toggle = (c: string) => setChannels((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
  const fire = async () => {
    setBusy(true); setResults(null);
    try {
      const r = await fetch("/api/admin/notifications/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channels, severity: channels.includes("sms") ? "critical" : "info" }) });
      const d = await r.json().catch(() => ({}));
      setResults(d.results ?? []); router.refresh();
    } finally { setBusy(false); }
  };
  return (
    <div className="nt">
      <div className="nt__pick">
        {["in_app", "email", "slack", "sms", "whatsapp", "push"].map((c) => (
          <label key={c} className="nt__opt"><input type="checkbox" checked={channels.includes(c)} onChange={() => toggle(c)} /> {c}</label>
        ))}
      </div>
      <button type="button" className="op-item__btn op-item__btn--primary" disabled={busy || !channels.length} onClick={fire}>{busy ? "Sending…" : "Send test notification"}</button>
      {results ? (
        <ul className="nt__results">
          {results.map((r, i) => (
            <li key={i} className={`nt__result nt__result--${r.status}`}><b>{r.channel}</b> · {r.status}{r.target ? ` → ${r.target}` : ""}{r.error ? ` · ${r.error}` : ""}</li>
          ))}
        </ul>
      ) : null}
      <p className="admin__muted" style={{ fontSize: 11, marginTop: 6 }}>SMS is skipped unless severity is critical (selecting SMS sends a critical test). WhatsApp/Push report “not configured” until their env is set.</p>
    </div>
  );
}
