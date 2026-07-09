"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Cond = { field: string; op: string; value: string };
type Act = { type: string; value: string };
export type AdminRule = { id: string; name: string; trigger: string; conditions: Cond[]; actions: Act[]; priority: number; active: boolean };

const TRIGGERS = ["order.created", "shipment.pending", "shipment.create"];
const FIELDS = ["order.total", "order.weightKg", "order.paymentMode", "order.city", "order.state", "order.isGift", "order.itemCount", "order.fragile"];
const OPS = ["eq", "neq", "gt", "gte", "lt", "lte", "in", "nin", "contains"];
const ACTIONS = ["add_insurance", "set_courier", "set_provider", "set_delivery_mode", "set_packaging_profile", "add_surcharge"];

const summary = (r: AdminRule) =>
  (r.conditions.length ? r.conditions.map((c) => `${c.field} ${c.op} ${JSON.stringify(c.value)}`).join(" AND ") : "always") +
  " → " +
  (r.actions.map((a) => a.value != null && a.value !== "" ? `${a.type}(${a.value})` : a.type).join(", ") || "—");

export function RulesManager({ rules }: { rules: AdminRule[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState<AdminRule | null>(null);
  const [test, setTest] = useState<Record<string, string>>({ "order.total": "", "order.paymentMode": "", "order.city": "", "order.weightKg": "", "order.isGift": "", "order.itemCount": "" });
  const [testOut, setTestOut] = useState<{ name: string; active: boolean; matched: boolean; actions: Act[] }[] | null>(null);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok || d.ok === false) { setErr(d.error ?? d.reason ?? "Failed"); return null; }
      return d;
    } catch { setBusy(false); setErr("Network error"); return null; }
  };

  const refresh = () => startTransition(() => router.refresh());
  const saveRule = async (r: AdminRule) => {
    const rule = { name: r.name, trigger: r.trigger, conditions: r.conditions, actions: r.actions, priority: r.priority, active: r.active };
    const d = await post(r.id ? { action: "update", id: r.id, rule } : { action: "create", rule });
    if (d) { setEditing(null); refresh(); }
  };
  const toggle = async (r: AdminRule) => { if (await post({ action: "toggle", id: r.id, active: !r.active })) refresh(); };
  const del = async (r: AdminRule) => { if (await post({ action: "delete", id: r.id })) refresh(); };
  const runTest = async () => {
    const context: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(test)) if (v !== "") context[k.replace("order.", "")] = v;
    const d = await post({ action: "test", context });
    if (d) setTestOut(d.results);
  };

  const blank = (): AdminRule => ({ id: "", name: "", trigger: "order.created", conditions: [], actions: [{ type: "add_insurance", value: "" }], priority: 100, active: true });

  return (
    <div className="cfg">
      <div className="cfg-actions">
        <button type="button" className="ff-btn ff-btn--primary" onClick={() => setEditing(blank())}>New rule</button>
        {pending ? <span className="ff-refreshing">updating…</span> : null}
        {err && !editing ? <span className="ff-err">{err}</span> : null}
      </div>

      <table className="admin__table admin__table--board">
        <thead><tr><th>Name</th><th>Trigger</th><th>Rule</th><th>Priority</th><th>Active</th><th>Actions</th></tr></thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td className="admin__muted">{r.trigger}</td>
              <td className="cfg-rule-summary">{summary(r)}</td>
              <td className="admin__mono">{r.priority}</td>
              <td><button type="button" className="cfg-toggle" data-on={r.active ? "1" : "0"} disabled={busy} onClick={() => toggle(r)}>{r.active ? "On" : "Off"}</button></td>
              <td>
                <div className="ff-actions">
                  <button type="button" className="ff-btn" onClick={() => setEditing({ ...r, conditions: [...r.conditions], actions: [...r.actions] })}>Edit</button>
                  <button type="button" className="ff-btn ff-btn--danger" disabled={busy} onClick={() => del(r)}>Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {rules.length === 0 ? <tr><td colSpan={6} className="admin__empty">No rules yet. Rules let the business change behaviour (insurance, courier, packaging) without a deploy.</td></tr> : null}
        </tbody>
      </table>

      {/* Rule tester */}
      <section className="cfg-test">
        <h3 className="cfg-section__title">Test against a sample order</h3>
        <div className="cfg-grid">
          {Object.keys(test).map((k) => (
            <label key={k} className="cfg-field"><span>{k}</span>
              <input value={test[k]} onChange={(e) => setTest((t) => ({ ...t, [k]: e.target.value }))} placeholder={k === "order.paymentMode" ? "cod / prepaid" : k === "order.isGift" ? "true / false" : ""} />
            </label>
          ))}
        </div>
        <div className="cfg-actions">
          <button type="button" className="ff-btn" disabled={busy} onClick={runTest}>Run test</button>
        </div>
        {testOut ? (
          <ul className="cfg-test-out">
            {testOut.map((r, i) => (
              <li key={i} data-match={r.matched ? "1" : "0"}>
                <strong>{r.matched ? "✓" : "○"} {r.name}</strong>{!r.active ? " (inactive)" : ""}
                {r.matched ? <span className="admin__muted"> → {r.actions.map((a) => a.type).join(", ") || "—"}</span> : null}
              </li>
            ))}
            {testOut.length === 0 ? <li className="admin__muted">No rules to evaluate.</li> : null}
          </ul>
        ) : null}
      </section>

      {editing ? <RuleEditor rule={editing} onChange={setEditing} onSave={saveRule} onClose={() => setEditing(null)} busy={busy} err={err} /> : null}
    </div>
  );
}

function RuleEditor({ rule, onChange, onSave, onClose, busy, err }: { rule: AdminRule; onChange: (r: AdminRule) => void; onSave: (r: AdminRule) => void; onClose: () => void; busy: boolean; err: string }) {
  const setC = (i: number, patch: Partial<Cond>) => onChange({ ...rule, conditions: rule.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const setA = (i: number, patch: Partial<Act>) => onChange({ ...rule, actions: rule.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  return (
    <div className="om-modal" role="dialog" aria-modal="true" onClick={() => !busy && onClose()}>
      <div className="om-modal__card om-modal__card--wide" onClick={(e) => e.stopPropagation()}>
        <h2 className="om-modal__title">{rule.id ? "Edit rule" : "New rule"}</h2>
        <div className="cfg-grid">
          <label className="cfg-field"><span>Name</span><input value={rule.name} onChange={(e) => onChange({ ...rule, name: e.target.value })} placeholder="Insure high-value orders" /></label>
          <label className="cfg-field"><span>Trigger</span><select value={rule.trigger} onChange={(e) => onChange({ ...rule, trigger: e.target.value })}>{TRIGGERS.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          <label className="cfg-field"><span>Priority</span><input type="number" value={rule.priority} onChange={(e) => onChange({ ...rule, priority: Number(e.target.value) })} /></label>
          <label className="om-check" style={{ alignSelf: "end" }}><input type="checkbox" checked={rule.active} onChange={(e) => onChange({ ...rule, active: e.target.checked })} /><span>Active</span></label>
        </div>

        <p className="cfg-sub">Conditions (all must match; none = always)</p>
        {rule.conditions.map((c, i) => (
          <div key={i} className="cfg-row">
            <select value={c.field} onChange={(e) => setC(i, { field: e.target.value })}>{FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}</select>
            <select value={c.op} onChange={(e) => setC(i, { op: e.target.value })}>{OPS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
            <input value={c.value} onChange={(e) => setC(i, { value: e.target.value })} placeholder="value" />
            <button type="button" className="ff-btn" onClick={() => onChange({ ...rule, conditions: rule.conditions.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
        <button type="button" className="ff-btn" onClick={() => onChange({ ...rule, conditions: [...rule.conditions, { field: FIELDS[0], op: "gt", value: "" }] })}>+ condition</button>

        <p className="cfg-sub">Actions</p>
        {rule.actions.map((a, i) => (
          <div key={i} className="cfg-row">
            <select value={a.type} onChange={(e) => setA(i, { type: e.target.value })}>{ACTIONS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <input value={a.value} onChange={(e) => setA(i, { value: e.target.value })} placeholder="value (optional)" />
            <button type="button" className="ff-btn" onClick={() => onChange({ ...rule, actions: rule.actions.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
        <button type="button" className="ff-btn" onClick={() => onChange({ ...rule, actions: [...rule.actions, { type: ACTIONS[0], value: "" }] })}>+ action</button>

        {err ? <p className="ff-err">{err}</p> : null}
        <div className="om-modal__actions">
          <button type="button" className="ff-btn" disabled={busy} onClick={onClose}>Cancel</button>
          <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !rule.name.trim()} onClick={() => onSave(rule)}>{busy ? "Saving…" : "Save rule"}</button>
        </div>
      </div>
    </div>
  );
}
