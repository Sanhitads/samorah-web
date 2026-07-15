"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const post = (body: unknown) => fetch("/api/admin/incidents/action", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const postConfig = (body: unknown) => fetch("/api/admin/incidents/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const CATEGORIES = [
  { v: "refund", l: "Refund" }, { v: "payment_gateway", l: "Payment Gateway" }, { v: "shipment", l: "Shipment" },
  { v: "inventory", l: "Inventory" }, { v: "email", l: "Email" }, { v: "import_export", l: "Import / Export" }, { v: "unknown", l: "Unknown" },
];
const ROOT_SYSTEMS = ["razorpay", "shiprocket", "smtp", "inventory", "database", "supabase"];
const SUBSYS = ["payments", "inventory", "shipping", "email", "checkout", "customers"];

// ── Escalation countdown timer (live) ───────────────────────────────────────────
export function EscalationCountdown({ next }: { next: { level: number; notify: string; atMs: number } | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!next) return <span className="inc-countdown inc-countdown--none">No further escalation scheduled</span>;
  if (now == null) return <span className="inc-countdown">Escalates to {next.notify}…</span>;
  const ms = next.atMs - now;
  if (ms <= 0) return <span className="inc-countdown inc-countdown--due">⏫ Escalation to {next.notify} is due</span>;
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return <span className={`inc-countdown${m < 5 ? " inc-countdown--soon" : ""}`}>⏱ Escalates to <b>{next.notify}</b> (L{next.level}) in <b>{m}m {String(s).padStart(2, "0")}s</b></span>;
}

// ── Runbook (guided workflow steps) ─────────────────────────────────────────────
const ACTION_ICON: Record<string, string> = { retry: "🔁", verify: "✅", check: "🔍", contact: "📞", wait: "⏳", escalate: "⏫", custom: "🔧" };
export function IncidentRunbook({ steps }: { steps: { id: string; stepNo: number; title: string; instruction: string | null; action: string | null; done: boolean; doneBy: string | null }[] }) {
  const router = useRouter();
  const toggle = async (id: string, done: boolean) => { const r = await post({ action: "runbook", stepId: id, done }); if (r.ok) router.refresh(); };
  if (!steps.length) return <p className="admin__muted">No runbook for this incident type.</p>;
  const nextIdx = steps.findIndex((s) => !s.done);
  return (
    <ol className="inc-runbook">
      {steps.map((s, i) => (
        <li key={s.id} className={`inc-runbook__step${s.done ? " is-done" : ""}${i === nextIdx ? " is-next" : ""}`}>
          <label className="inc-runbook__head">
            <input type="checkbox" checked={s.done} onChange={(e) => toggle(s.id, e.target.checked)} />
            <span className="inc-runbook__no">{s.action ? ACTION_ICON[s.action] ?? "•" : "•"} Step {s.stepNo}</span>
            <span className="inc-runbook__title">{s.title}</span>
            {i === nextIdx ? <span className="inc-runbook__badge">Next</span> : null}
          </label>
          {s.instruction ? <p className="inc-runbook__instruction">{s.instruction}</p> : null}
          {s.done && s.doneBy ? <p className="admin__muted" style={{ fontSize: 11 }}>Done · {s.doneBy}</p> : null}
        </li>
      ))}
    </ol>
  );
}

// ── Correction: merge / split / dismiss / reclassify ────────────────────────────
export function IncidentCorrection({ number, notifications, currentCategory }: { number: string; notifications: { alertKey: string; orderNumber: string | null }[]; currentCategory: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [mode, setMode] = useState<"" | "merge" | "split" | "dismiss" | "reclassify">("");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [cat, setCat] = useState(currentCategory);
  const [picked, setPicked] = useState<string[]>([]);

  const run = async (body: Record<string, unknown>) => {
    setBusy(true); setMsg("");
    try {
      const r = await post({ number, ...body });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setMode(""); if (d.number) router.push(`/admin/incidents/${d.number}`); else router.refresh(); }
      else setMsg(d.error ?? "Failed.");
    } finally { setBusy(false); }
  };

  return (
    <div className="inc-correct">
      <div className="inc-correct__tabs">
        <button type="button" className={`op-item__btn${mode === "merge" ? " is-active" : ""}`} onClick={() => setMode(mode === "merge" ? "" : "merge")}>Merge</button>
        <button type="button" className={`op-item__btn${mode === "split" ? " is-active" : ""}`} onClick={() => setMode(mode === "split" ? "" : "split")}>Split</button>
        <button type="button" className={`op-item__btn${mode === "reclassify" ? " is-active" : ""}`} onClick={() => setMode(mode === "reclassify" ? "" : "reclassify")}>Reclassify</button>
        <button type="button" className={`op-item__btn${mode === "dismiss" ? " is-active" : ""}`} onClick={() => setMode(mode === "dismiss" ? "" : "dismiss")}>Dismiss</button>
      </div>

      {mode === "merge" ? (
        <div className="inc-correct__body">
          <p className="admin__muted">Fold this incident into another (its notifications move across; this one is marked <i>merged</i>).</p>
          <input className="inc-input" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Target incident number, e.g. INC-00007" />
          <button type="button" className="op-item__btn op-item__btn--primary" disabled={busy || !target.trim()} onClick={() => run({ action: "merge", targetNumber: target.trim() })}>Merge into {target || "…"}</button>
        </div>
      ) : null}

      {mode === "split" ? (
        <div className="inc-correct__body">
          <p className="admin__muted">Move the selected notifications into a new incident.</p>
          <div className="inc-correct__picks">
            {notifications.map((n) => (
              <label key={n.alertKey} className="inc-correct__pick">
                <input type="checkbox" checked={picked.includes(n.alertKey)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, n.alertKey] : p.filter((k) => k !== n.alertKey))} />
                <span className="admin__mono" style={{ fontSize: 12 }}>{n.orderNumber ?? n.alertKey}</span>
              </label>
            ))}
            {notifications.length === 0 ? <span className="admin__muted">No notifications to split.</span> : null}
          </div>
          <button type="button" className="op-item__btn op-item__btn--primary" disabled={busy || !picked.length} onClick={() => run({ action: "split", alertKeys: picked })}>Split {picked.length} out</button>
        </div>
      ) : null}

      {mode === "reclassify" ? (
        <div className="inc-correct__body">
          <p className="admin__muted">Correct the category (records the previous one).</p>
          <select className="inc-input" value={cat} onChange={(e) => setCat(e.target.value)}>{CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select>
          <button type="button" className="op-item__btn op-item__btn--primary" disabled={busy || cat === currentCategory} onClick={() => run({ action: "reclassify", category: cat })}>Reclassify</button>
        </div>
      ) : null}

      {mode === "dismiss" ? (
        <div className="inc-correct__body">
          <p className="admin__muted">Mark as a false positive (kept, fully audited — never deleted).</p>
          <input className="inc-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this a false positive?" />
          <button type="button" className="op-item__btn op-item__btn--danger" disabled={busy || !reason.trim()} onClick={() => run({ action: "dismiss", reason: reason.trim() })}>Dismiss as false positive</button>
        </div>
      ) : null}

      {msg ? <p className="inc-resolve__err">{msg}</p> : null}
    </div>
  );
}

// ── Fire-drill launcher ─────────────────────────────────────────────────────────
export function SimulationLauncher() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [cat, setCat] = useState("refund");
  const [sev, setSev] = useState("high");
  const run = async () => {
    setBusy(true);
    try { const r = await post({ action: "simulate", category: cat, severity: sev }); const d = await r.json().catch(() => ({})); if (r.ok && d.number) router.push(`/admin/incidents/${d.number}`); }
    finally { setBusy(false); }
  };
  return (
    <div className="inc-sim">
      <select className="inc-input" value={cat} onChange={(e) => setCat(e.target.value)}>{CATEGORIES.slice(0, 5).map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select>
      <select className="inc-input" value={sev} onChange={(e) => setSev(e.target.value)}>{["critical", "high", "medium", "low"].map((s) => <option key={s} value={s}>{s}</option>)}</select>
      <button type="button" className="op-item__btn op-item__btn--primary" disabled={busy} onClick={run}>{busy ? "Starting…" : "🧪 Run fire drill"}</button>
    </div>
  );
}
export function DeleteSimulation({ number }: { number: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { const r = await post({ action: "delete_simulation", number }); if (r.ok) router.push("/admin/incidents/config"); } finally { setBusy(false); } };
  return <button type="button" className="op-item__btn op-item__btn--danger" disabled={busy} onClick={run}>Delete drill</button>;
}

// ── Suppression + maintenance manager ───────────────────────────────────────────
type Suppression = { id: string; reason: string; category: string | null; subsystem: string | null; rootCauseSystem: string | null; reasonPattern: string | null; startsAt: string | null; endsAt: string | null; enabled: boolean; createdBy: string | null };
type Maintenance = { id: string; title: string; rootCauseSystem: string | null; subsystem: string | null; startsAt: string; endsAt: string; reason: string | null; enabled: boolean; active: boolean; createdBy: string | null };

export function ConfigManager({ suppressions, maintenance }: { suppressions: Suppression[]; maintenance: Maintenance[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const act = async (body: Record<string, unknown>) => { setBusy(true); try { const r = await postConfig(body); if (r.ok) router.refresh(); } finally { setBusy(false); } };

  const [sReason, setSReason] = useState(""); const [sCat, setSCat] = useState(""); const [sSys, setSSys] = useState(""); const [sPattern, setSPattern] = useState("");
  const [mTitle, setMTitle] = useState(""); const [mSys, setMSys] = useState(""); const [mStart, setMStart] = useState(""); const [mEnd, setMEnd] = useState(""); const [mReason, setMReason] = useState("");

  return (
    <div className="od-grid">
      <section className="od-card">
        <h2 className="od-card__title">Suppression rules</h2>
        <p className="admin__muted" style={{ fontSize: 12 }}>Silence incident creation for a known-noisy signature. Existing incidents are never affected.</p>
        <div className="inc-cfg__form">
          <input className="inc-input" value={sReason} onChange={(e) => setSReason(e.target.value)} placeholder="Reason (required), e.g. Known Resend flakiness" />
          <select className="inc-input" value={sCat} onChange={(e) => setSCat(e.target.value)}><option value="">Any category</option>{CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}</select>
          <select className="inc-input" value={sSys} onChange={(e) => setSSys(e.target.value)}><option value="">Any root-cause system</option>{ROOT_SYSTEMS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <input className="inc-input" value={sPattern} onChange={(e) => setSPattern(e.target.value)} placeholder="Reason regex (optional)" />
          <button type="button" className="op-item__btn op-item__btn--primary" disabled={busy || !sReason.trim()} onClick={() => { act({ action: "suppression_create", reason: sReason, category: sCat, rootCauseSystem: sSys, reasonPattern: sPattern }); setSReason(""); setSPattern(""); }}>Add suppression</button>
        </div>
        <ul className="inc-cfg__list">
          {suppressions.map((s) => (
            <li key={s.id} className={`inc-cfg__item${s.enabled ? "" : " is-off"}`}>
              <div><b>{s.reason}</b><div className="admin__muted" style={{ fontSize: 11 }}>{[s.category, s.rootCauseSystem, s.reasonPattern && `/${s.reasonPattern}/`].filter(Boolean).join(" · ") || "matches any"} · by {s.createdBy ?? "—"}</div></div>
              <div className="inc-cfg__actions">
                <button type="button" className="op-item__btn" disabled={busy} onClick={() => act({ action: "suppression_toggle", id: s.id, enabled: !s.enabled })}>{s.enabled ? "Disable" : "Enable"}</button>
                <button type="button" className="op-item__btn op-item__btn--danger" disabled={busy} onClick={() => act({ action: "suppression_delete", id: s.id })}>Delete</button>
              </div>
            </li>
          ))}
          {suppressions.length === 0 ? <li className="admin__muted">No suppression rules.</li> : null}
        </ul>
      </section>

      <section className="od-card">
        <h2 className="od-card__title">Maintenance windows</h2>
        <p className="admin__muted" style={{ fontSize: 12 }}>Scope a time-boxed suppression to a system under maintenance (e.g. Shiprocket upgrade).</p>
        <div className="inc-cfg__form">
          <input className="inc-input" value={mTitle} onChange={(e) => setMTitle(e.target.value)} placeholder="Title, e.g. Shiprocket maintenance" />
          <select className="inc-input" value={mSys} onChange={(e) => setMSys(e.target.value)}><option value="">All systems</option>{ROOT_SYSTEMS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <label className="inc-cfg__lbl">Start <input className="inc-input" type="datetime-local" value={mStart} onChange={(e) => setMStart(e.target.value)} /></label>
          <label className="inc-cfg__lbl">End <input className="inc-input" type="datetime-local" value={mEnd} onChange={(e) => setMEnd(e.target.value)} /></label>
          <input className="inc-input" value={mReason} onChange={(e) => setMReason(e.target.value)} placeholder="Reason (optional)" />
          <button type="button" className="op-item__btn op-item__btn--primary" disabled={busy || !mTitle.trim() || !mStart || !mEnd} onClick={() => { act({ action: "maintenance_create", title: mTitle, rootCauseSystem: mSys, startsAt: mStart ? new Date(mStart).toISOString() : null, endsAt: mEnd ? new Date(mEnd).toISOString() : null, reason: mReason }); setMTitle(""); setMReason(""); }}>Add window</button>
        </div>
        <ul className="inc-cfg__list">
          {maintenance.map((m) => (
            <li key={m.id} className={`inc-cfg__item${m.enabled ? "" : " is-off"}`}>
              <div><b>{m.title}</b> {m.active ? <span className="inc-cfg__badge">ACTIVE</span> : null}<div className="admin__muted" style={{ fontSize: 11 }}>{[m.rootCauseSystem ?? "all systems", `${new Date(m.startsAt).toLocaleString("en-IN")} → ${new Date(m.endsAt).toLocaleString("en-IN")}`].join(" · ")}</div></div>
              <div className="inc-cfg__actions">
                <button type="button" className="op-item__btn" disabled={busy} onClick={() => act({ action: "maintenance_toggle", id: m.id, enabled: !m.enabled })}>{m.enabled ? "Disable" : "Enable"}</button>
                <button type="button" className="op-item__btn op-item__btn--danger" disabled={busy} onClick={() => act({ action: "maintenance_delete", id: m.id })}>Delete</button>
              </div>
            </li>
          ))}
          {maintenance.length === 0 ? <li className="admin__muted">No maintenance windows.</li> : null}
        </ul>
      </section>
    </div>
  );
}
