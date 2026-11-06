"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { mfgAction } from "@/lib/admin/mfgClient";
import { BatchLabels } from "@/components/admin/BatchLabels";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Caps = { operate: boolean; qc: boolean; approve: boolean };
const today = () => new Date().toISOString().slice(0, 10);
const EDITABLE = ["draft", "in_production"];

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", in_production: "In production", curing: "Curing", quality_check: "Quality check",
  qc_approved: "QC approved", rejected: "Rejected", released: "Released", closed: "Closed",
};
/** The single next step an operator with these caps may take now (mirrors the lifecycle buttons). */
function nextPermittedAction(batch: any, caps: Caps): string {
  if (batch.recall_state === "recalled") return "Contained by a recall — no lifecycle action.";
  if (batch.recall_state === "on_hold") return caps.approve ? "Resume (lift the hold) to continue." : "On hold — a manager must resume.";
  switch (batch.lifecycle_status) {
    case "draft": return caps.operate ? "Start production." : "Waiting on an operator to start production.";
    case "in_production": return caps.operate ? "Record the produced quantity in the Production record, then move to curing." : "In production.";
    case "curing": return caps.qc ? "Move to quality check when curing is complete." : "Curing.";
    case "quality_check": return caps.approve ? "Record QC, then approve once blockers clear." : "Awaiting QC approval (manager).";
    case "qc_approved": return "Approved — eligible for release and retail labels.";
    case "rejected": return "Rejected — terminal.";
    default: return STATUS_LABEL[batch.lifecycle_status] ?? batch.lifecycle_status;
  }
}

/** Reasons qc_approved is currently blocked (mirrors the server gate; display-only). */
function approvalBlockers(batch: any, qc: any[]): string[] {
  const out: string[] = [];
  if (batch.lifecycle_status !== "quality_check") out.push(`lifecycle is ${batch.lifecycle_status} (must be quality_check)`);
  if (batch.recall_state !== "none") out.push("batch is on hold");
  if (batch.pending_inspection_qty !== 0) out.push(`${batch.pending_inspection_qty} units still pending inspection`);
  if (batch.approved_qty <= 0) out.push("no approved quantity");
  if (!qc.some((c) => c.check_type === "routine" && c.result === "pass")) out.push("no passing routine QC");
  if (!batch.earliest_release_date) out.push("cure eligible date not set");
  else if (batch.earliest_release_date > today()) out.push(`cure not complete (eligible ${batch.earliest_release_date})`);
  return out;
}

export function BatchDetail({ batch, timeline, qc, validations, designValidation, consumed, templates, materials, lots, caps }: {
  batch: any; timeline: any[]; qc: any[]; validations: any[]; designValidation: { validated: boolean; fingerprint: string };
  consumed: any[]; templates: any[]; materials: any[]; lots: any[]; caps: Caps;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qcRef = useRef<HTMLDivElement | null>(null);
  const goToQc = () => qcRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const spec = batch.batch_candle_spec || null;
  const editable = EDITABLE.includes(batch.lifecycle_status);
  // Recovery: a batch advanced to quality_check WITHOUT a recorded produced quantity can still record it
  // (nothing has been inspected yet), so it is not trapped.
  const canEditProduction = editable || (batch.lifecycle_status === "quality_check" && batch.produced_qty === 0);
  const blockers = approvalBlockers(batch, qc);

  async function act(action: string, payload: Record<string, unknown> = {}, opts: { reason?: boolean; confirm?: string } = {}) {
    setErr(null);
    let reason: string | undefined;
    if (opts.reason) { reason = window.prompt("Reason (required):") ?? ""; if (!reason.trim()) return; }
    if (opts.confirm && !window.confirm(opts.confirm)) return;
    setBusy(true);
    try { await mfgAction(action, { ...payload, ...(reason !== undefined ? { reason } : {}) }); router.refresh(); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  }

  const productName = batch.products?.name ?? batch.product_name ?? null;
  const variantName = batch.variants?.variant_name ?? null;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      {err && <p className="admin__error" role="alert">{err}</p>}

      {/* At-a-glance summary (Phase 12A UI): friendly name first; status, next action and blockers up top. */}
      <section className="admin__card" aria-label="Batch summary">
        <h2 style={{ margin: 0 }}>{productName ?? batch.batch_code}{variantName ? ` · ${variantName}` : ""}</h2>
        <p className="admin__muted" style={{ margin: "2px 0 10px" }}>{batch.batch_code} · {batch.sku_snapshot} · {batch.product_type}</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="ff-status" data-s={batch.lifecycle_status}>{STATUS_LABEL[batch.lifecycle_status] ?? batch.lifecycle_status}</span>
          {batch.recall_state !== "none" && <span className="ff-status" data-s="rejected">{batch.recall_state === "recalled" ? "RECALLED" : "ON HOLD"}</span>}
        </div>
        <p style={{ margin: "10px 0 0" }}><strong>Next:</strong> {nextPermittedAction(batch, caps)}</p>
        {batch.lifecycle_status === "quality_check" && blockers.length > 0 && (
          <div className="admin__note" style={{ marginTop: 8 }}>
            <strong>QC approval unavailable — resolve these first:</strong>
            <ul style={{ margin: "4px 0 0" }}>{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
            {caps.qc && <button type="button" className="admin__btn" style={{ marginTop: 8 }} onClick={goToQc}>Go to Quality Inspection ↓</button>}
          </div>
        )}
      </section>

      {/* Lifecycle actions */}
      <section className="admin__card">
        <h3>Lifecycle · {batch.lifecycle_status}{batch.recall_state === "on_hold" ? " (on hold)" : ""}</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {caps.operate && batch.lifecycle_status === "draft" && <button className="admin__btn" disabled={busy} onClick={() => act("start_production", { batchId: batch.id })}>Start production</button>}
          {caps.operate && batch.lifecycle_status === "in_production" && <button className="admin__btn" disabled={busy} onClick={() => act("to_curing", { batchId: batch.id }, batch.produced_qty === 0 ? { confirm: "No produced quantity has been recorded. You should record it in the Production record first. Continue to curing anyway?" } : {})}>Move to curing</button>}
          {caps.qc && batch.lifecycle_status === "curing" && <button className="admin__btn" disabled={busy} onClick={() => act("to_quality_check", { batchId: batch.id })}>Move to quality check</button>}
          {caps.approve && batch.lifecycle_status === "quality_check" && <button className="admin__btn" disabled={busy || blockers.length > 0} onClick={() => act("approve", { batchId: batch.id }, { confirm: "Approve QC for this batch?" })}>Approve QC</button>}
          {caps.approve && batch.lifecycle_status === "qc_approved" && <button className="admin__btn" disabled={busy} onClick={() => act("reopen", { batchId: batch.id }, { reason: true, confirm: "Reopen? This invalidates the current approval." })}>Reopen</button>}
          {caps.approve && ["in_production", "curing", "quality_check"].includes(batch.lifecycle_status) && <button className="admin__btn" disabled={busy} onClick={() => act("reject", { batchId: batch.id }, { reason: true, confirm: "Reject this batch?" })}>Reject</button>}
          {caps.approve && batch.recall_state === "none" && <button className="admin__btn" disabled={busy} onClick={() => act("hold", { batchId: batch.id }, { reason: true })}>Hold</button>}
          {caps.approve && batch.recall_state === "on_hold" && <button className="admin__btn" disabled={busy} onClick={() => act("resume", { batchId: batch.id })}>Resume</button>}
        </div>
        {batch.lifecycle_status === "quality_check" && blockers.length > 0 && caps.approve && (
          <p className="admin__note" style={{ marginTop: 8 }}>Approve QC is disabled — see the blockers in the summary above, then record inspection in <button type="button" className="admin__btn admin__btn--link" onClick={goToQc} style={{ padding: 0, border: 0, background: "none", textDecoration: "underline", cursor: "pointer" }}>Quality Inspection</button>.</p>
        )}
      </section>

      {/* Labels (Phase 10/11A) — reuses /api/admin/labels + LabelPreview; server enforces eligibility */}
      {caps.operate && <BatchLabels batchId={batch.id} batchCode={batch.batch_code} lifecycle={batch.lifecycle_status} recallState={batch.recall_state} />}

      {/* Production record */}
      <section className="admin__card">
        <h3>Production record</h3>
        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px" }}>
          <dt>Planned</dt><dd>{batch.planned_qty}</dd>
          <dt>Produced</dt><dd>{batch.produced_qty}</dd>
          <dt>Pending inspection</dt><dd>{batch.pending_inspection_qty}</dd>
          <dt>Approved</dt><dd>{batch.approved_qty}</dd>
          <dt>Rejected</dt><dd>{batch.rejected_qty}</dd>
          <dt>Destructive samples</dt><dd>{batch.qc_sampled_destroyed_qty}</dd>
          <dt>Mfg date</dt><dd>{batch.manufacturing_date ?? "—"}</dd>
          <dt>Cure start / eligible</dt><dd>{batch.cure_start_date ?? "—"} / {batch.earliest_release_date ?? "—"}</dd>
          <dt>Production started / completed</dt><dd>{batch.production_started_at ?? "—"} / {batch.production_completed_at ?? "—"}</dd>
          <dt>QC revision</dt><dd>{batch.qc_revision}</dd>
        </dl>
        {spec && (
          <div style={{ marginTop: 12 }}>
            <strong>Candle specification (snapshot)</strong>
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 16px" }}>
              <dt>Wax formula</dt><dd>{spec.wax_formula_code ?? "—"} v{spec.wax_formula_version ?? "—"}</dd>
              <dt>Fragrance formula</dt><dd>{spec.fragrance_formula_code ?? "—"} v{spec.fragrance_formula_version ?? "—"} (load {spec.fragrance_load_pct ?? "—"}%)</dd>
              <dt>Wick / Vessel</dt><dd>{spec.wick_spec ?? "—"} / {spec.vessel_spec ?? "—"}</dd>
              <dt>Fill (target/actual)</dt><dd>{spec.fill_weight_target_g ?? "—"} / {spec.fill_weight_actual_g ?? "—"} g</dd>
              <dt>Pour / add temp</dt><dd>{spec.pour_temp_c ?? "—"} / {spec.fragrance_add_temp_c ?? "—"} °C</dd>
            </dl>
          </div>
        )}
        {caps.operate && canEditProduction && (<>
          {!editable && <p className="admin__note">No produced quantity was recorded before inspection — record it here (produced must equal approved + rejected + samples + pending) to continue to QC.</p>}
          <ProductionEdit batch={batch} spec={spec} onDone={() => router.refresh()} />
        </>)}
        {!canEditProduction && <p style={{ fontSize: 12, opacity: 0.7 }}>Production record is read-only in the {STATUS_LABEL[batch.lifecycle_status] ?? batch.lifecycle_status} state.</p>}
      </section>

      {/* Quality Inspection & Approval — where approved/rejected quantities are recorded (routine QC). */}
      <div ref={qcRef} id="quality-inspection" style={{ display: "grid", gap: 24 }}>
        <section className="admin__card">
          <h3>Quality Inspection &amp; Approval</h3>
          <p className="admin__muted" style={{ marginTop: 0 }}>Approved and rejected quantities are set here by recording routine QC. Conservation: Produced = Approved + Rejected + Destructive samples + Pending inspection.</p>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "6px 0 2px" }}>
            {([["Produced", batch.produced_qty], ["Approved", batch.approved_qty], ["Rejected", batch.rejected_qty], ["Destructive samples", batch.qc_sampled_destroyed_qty], ["Pending inspection", batch.pending_inspection_qty]] as [string, number][]).map(([l, v]) => (
              <span key={l} style={{ display: "inline-flex", flexDirection: "column" }}><b style={{ fontSize: 20 }}>{v}</b><span className="admin__muted" style={{ fontSize: 12 }}>{l}</span></span>
            ))}
          </div>
          {!caps.qc && <p className="admin__note">You do not have the QC capability, so you cannot record inspection here.</p>}
          {caps.qc && !["curing", "quality_check"].includes(batch.lifecycle_status) && <p className="admin__muted">QC is recorded during the curing / quality-check stages (current: {STATUS_LABEL[batch.lifecycle_status] ?? batch.lifecycle_status}).</p>}
          {caps.qc && batch.lifecycle_status === "quality_check" && batch.pending_inspection_qty <= 0 && (batch.approved_qty + batch.rejected_qty + batch.qc_sampled_destroyed_qty) === 0 && (
            <p className="admin__note"><b>Nothing to inspect yet:</b> no units are pending inspection. Record the <b>produced quantity</b> in the Production record above first (it is editable here because inspection hasn&apos;t started) — then record QC.</p>
          )}
        </section>
        {caps.qc && ["curing", "quality_check"].includes(batch.lifecycle_status) && <QcForm batch={batch} templates={templates} onDone={() => router.refresh()} />}
      <section className="admin__card">
        <h3>QC history</h3>
        {qc.length === 0 ? <p className="admin__empty">No QC records.</p> : (
          <table className="admin__table"><thead><tr><th>When</th><th>Result</th><th>Inspected</th><th>Appr/Rej/Smp</th><th>Measurements</th></tr></thead>
            <tbody>{qc.map((c) => <tr key={c.id}><td>{c.performed_at?.slice(0, 16)?.replace("T", " ")}</td><td>{c.result ?? "—"}</td><td>{c.inspected_qty}</td><td>{c.approved_delta}/{c.rejected_delta}/{c.sampled_destroyed_delta}</td><td><code style={{ fontSize: 11 }}>{JSON.stringify(c.measurements)}</code></td></tr>)}</tbody>
          </table>
        )}
      </section>
      </div>

      {/* Burn validation */}
      <section className="admin__card">
        <h3>Design burn validation {designValidation.validated ? "· ✓ current config validated" : "· not validated for current config"}</h3>
        {caps.qc && <DesignValidationForm batchId={batch.id} onDone={() => router.refresh()} />}
        {validations.length > 0 && (
          <table className="admin__table"><thead><tr><th>When</th><th>Result</th><th>State</th><th>Fingerprint</th><th></th></tr></thead>
            <tbody>{validations.map((v) => <tr key={v.id}><td>{v.validated_at?.slice(0, 16)?.replace("T", " ")}</td><td>{v.result}</td><td>{v.state}</td><td><code style={{ fontSize: 10 }}>{v.config_fingerprint?.slice(0, 10)}</code></td>
              <td>{caps.approve && v.state === "approved" && <button className="admin__btn" disabled={busy} onClick={() => act("revoke_design_validation", { validationId: v.id }, { reason: true, confirm: "Revoke this validation?" })}>Revoke</button>}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      {/* Materials */}
      <section className="admin__card">
        <h3>Material lots consumed</h3>
        {consumed.length === 0 ? <p className="admin__empty">None recorded.</p> : (
          <table className="admin__table"><thead><tr><th>Material</th><th>Supplier lot</th><th>Qty</th></tr></thead>
            <tbody>{consumed.map((c, i) => <tr key={i}><td>{c.material_lots?.materials?.name} ({c.material_lots?.materials?.material_type})</td><td>{c.material_lots?.supplier_lot_code}</td><td>{c.qty_consumed} {c.uom}</td></tr>)}</tbody>
          </table>
        )}
        {caps.operate && editable && <MaterialForms batchId={batch.id} materials={materials} lots={lots} onDone={() => router.refresh()} />}
      </section>

      {/* Timeline */}
      <section className="admin__card">
        <h3>Audit timeline</h3>
        <ul>{timeline.map((t) => <li key={t.id}>{t.created_at?.slice(0, 16)?.replace("T", " ")} · {t.dimension}: {t.from_state ?? "∅"} → {t.to_state}{t.reason ? ` — ${t.reason}` : ""}</li>)}</ul>
      </section>
    </div>
  );
}

function ProductionEdit({ batch, spec, onDone }: { batch: any; spec: any; onDone: () => void }) {
  const [produced, setProduced] = useState(String(batch.produced_qty));
  const [pending, setPending] = useState(String(batch.pending_inspection_qty));
  const [wick, setWick] = useState(spec?.wick_spec ?? "");
  const [vessel, setVessel] = useState(spec?.vessel_spec ?? "");
  const [fill, setFill] = useState(spec?.fill_weight_actual_g != null ? String(spec.fill_weight_actual_g) : "");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await mfgAction("update_batch", { input: { batchId: batch.id, producedQty: Number(produced) || 0, pendingInspectionQty: Number(pending) || 0, candle: { wick_spec: wick || undefined, vessel_spec: vessel || undefined, fill_weight_actual_g: fill ? Number(fill) : undefined } } });
      onDone();
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Failed"); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 8, maxWidth: 420, marginTop: 12 }}>
      <strong>Edit production record</strong>
      <label>Produced<input className="admin__input" type="number" min={0} value={produced} onChange={(e) => setProduced(e.target.value)} /></label>
      <label>Pending inspection<input className="admin__input" type="number" min={0} value={pending} onChange={(e) => setPending(e.target.value)} /></label>
      <label>Wick spec<input className="admin__input" value={wick} onChange={(e) => setWick(e.target.value)} /></label>
      <label>Vessel spec<input className="admin__input" value={vessel} onChange={(e) => setVessel(e.target.value)} /></label>
      <label>Actual fill (g)<input className="admin__input" type="number" value={fill} onChange={(e) => setFill(e.target.value)} /></label>
      <p style={{ fontSize: 12, opacity: 0.7 }}>Produced must equal approved + rejected + samples + pending (enforced).</p>
      {err && <p className="admin__error">{err}</p>}
      <button className="admin__btn" disabled={busy}>Save</button>
    </form>
  );
}

type QcField = { key: string; label: string; kind: "number" | "select" | "text"; options?: string[]; mandatory: boolean; min?: number; max?: number; critical?: boolean };
const humanize = (k: string) => k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const DEFAULT_CANDLE_FIELDS: QcField[] = [
  { key: "fill_weight", label: "Fill weight (g)", kind: "number", mandatory: true },
  { key: "wick_centering", label: "Wick centering", kind: "select", options: ["centered", "off"], mandatory: true },
  { key: "vessel_condition", label: "Vessel condition", kind: "select", options: ["ok", "chipped", "cracked"], mandatory: true },
  { key: "surface", label: "Surface", kind: "select", options: ["smooth", "frosting", "sinkhole"], mandatory: false },
  { key: "fragrance_consistency", label: "Fragrance consistency", kind: "select", options: ["consistent", "weak", "off"], mandatory: false },
];
function templateFields(tpl: any): QcField[] {
  const raw = tpl?.required_checks;
  const arr = Array.isArray(raw) ? raw : raw?.required;
  if (!Array.isArray(arr) || arr.length === 0) return DEFAULT_CANDLE_FIELDS;
  return arr.map((e: any) => {
    if (typeof e === "string") return { key: e, label: humanize(e), kind: "text", mandatory: true };
    const min = e.min != null ? Number(e.min) : undefined, max = e.max != null ? Number(e.max) : undefined;
    const kind: QcField["kind"] = Array.isArray(e.allowed) ? "select" : (min != null || max != null) ? "number" : "text";
    return { key: e.key, label: humanize(e.key), kind, options: e.allowed, mandatory: e.mandatory !== false, min, max, critical: !!e.critical };
  });
}

function QcForm({ batch, templates, onDone }: { batch: any; templates: any[]; onDone: () => void }) {
  const [templateId, setTemplateId] = useState("");
  const [inspected, setInspected] = useState("0"); const [approved, setApproved] = useState("0");
  const [rejected, setRejected] = useState("0"); const [sampled, setSampled] = useState("0");
  const [result, setResult] = useState("pass");
  const [vals, setVals] = useState<Record<string, string>>({});
  const [deviations, setDeviations] = useState(""); const [exceptionReason, setExceptionReason] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const fields = templateFields(templates.find((t) => t.id === templateId));

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    // Build measurements from the labelled fields — numbers coerced, blanks dropped.
    const m: Record<string, unknown> = {};
    for (const f of fields) {
      const v = (vals[f.key] ?? "").trim();
      if (v === "") continue;
      m[f.key] = f.kind === "number" ? Number(v) : v;
    }
    try {
      await mfgAction("record_qc", { input: { batchId: batch.id, templateId: templateId || undefined, inspectedQty: Number(inspected) || 0, approvedDelta: Number(approved) || 0, rejectedDelta: Number(rejected) || 0, sampledDestroyedDelta: Number(sampled) || 0, result, measurements: m, deviations: deviations || undefined, exceptionReason: exceptionReason || undefined, idempotencyKey: crypto.randomUUID() } });
      onDone();
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Failed"); } finally { setBusy(false); }
  }
  const setVal = (k: string, v: string) => setVals((s) => ({ ...s, [k]: v }));

  return (
    <section className="admin__card">
      <h3>Record routine QC</h3>
      <form onSubmit={submit} style={{ display: "grid", gap: 10, maxWidth: 520 }}>
        <label>Template<select className="admin__input" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setVals({}); }}><option value="">Default candle checks</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name ?? t.product_type} v{t.version}</option>)}</select></label>

        <fieldset style={{ border: "1px solid var(--ad-hair)", borderRadius: 3, padding: 10, display: "grid", gap: 8 }}>
          <legend style={{ fontSize: 12 }}>Measurements</legend>
          {fields.map((f) => (
            <label key={f.key}>{f.label}{f.mandatory ? " *" : ""}{f.critical ? " (critical)" : ""}
              {f.kind === "select" ? (
                <select className="admin__input" value={vals[f.key] ?? ""} onChange={(e) => setVal(f.key, e.target.value)} required={f.mandatory && result === "pass"}>
                  <option value="">—</option>{(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input className="admin__input" type={f.kind === "number" ? "number" : "text"} step="any" min={f.min} max={f.max}
                  value={vals[f.key] ?? ""} onChange={(e) => setVal(f.key, e.target.value)} required={f.mandatory && result === "pass"} />
              )}
            </label>
          ))}
        </fieldset>

        <div style={{ display: "flex", gap: 8 }}>
          <label>Inspected<input className="admin__input" type="number" min={0} value={inspected} onChange={(e) => setInspected(e.target.value)} /></label>
          <label>Approved<input className="admin__input" type="number" min={0} value={approved} onChange={(e) => setApproved(e.target.value)} /></label>
          <label>Rejected<input className="admin__input" type="number" min={0} value={rejected} onChange={(e) => setRejected(e.target.value)} /></label>
          <label>Samples<input className="admin__input" type="number" min={0} value={sampled} onChange={(e) => setSampled(e.target.value)} /></label>
        </div>
        <label>Result<select className="admin__input" value={result} onChange={(e) => setResult(e.target.value)}><option value="pass">pass</option><option value="conditional">conditional</option><option value="fail">fail</option></select></label>
        <label>Deviations<input className="admin__input" value={deviations} onChange={(e) => setDeviations(e.target.value)} /></label>
        <label>Exception reason (to pass despite a mandatory, non-critical failure)<input className="admin__input" value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} /></label>
        <p className="admin__note">Inspected must equal approved + rejected + samples. * = required to record a pass. Critical failures can never be bypassed.</p>
        {err && <p className="admin__error">{err}</p>}
        <button className="admin__btn" disabled={busy}>Record QC</button>
      </form>
    </section>
  );
}

// Structured burn-test entry (Phase 12A UX) — ordinary inputs that build the same measurements payload the
// backend already stores. Only fields the validation payload supports; nothing is fabricated or auto-passed.
const SELECT = { flame: ["stable", "flickering", "high", "self-extinguished"], soot: ["none", "light", "heavy"],
  mushrooming: ["none", "slight", "significant"], melt_pool: ["full", "partial", "tunnelling"] } as const;
function DesignValidationForm({ batchId, onDone }: { batchId: string; onDone: () => void }) {
  const [result, setResult] = useState("pass");
  const [m, setM] = useState<Record<string, string>>({ flame: "stable", melt_pool: "full", soot: "none", mushrooming: "none", vessel_temp_c: "", burn_hours: "", notes: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string) => setM((s) => ({ ...s, [k]: v }));
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null);
    const payload: Record<string, unknown> = {};               // drop blanks; coerce numbers
    for (const [k, v] of Object.entries(m)) { const t = (v ?? "").trim(); if (!t) continue; payload[k] = (k === "vessel_temp_c" || k === "burn_hours") ? Number(t) : t; }
    try { await mfgAction("record_design_validation", { input: { batchId, result, measurements: payload, idempotencyKey: crypto.randomUUID() } }); onDone(); }
    catch (e2) { setErr(e2 instanceof Error ? e2.message : "Failed"); } finally { setBusy(false); }
  }
  const Sel = ({ k, label }: { k: keyof typeof SELECT; label: string }) => (
    <label>{label}<select className="admin__input" value={m[k] ?? ""} onChange={(e) => set(k, e.target.value)}><option value="">—</option>{SELECT[k].map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
  );
  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 8, maxWidth: 480, marginBottom: 12 }}>
      <p className="admin__muted" style={{ margin: 0 }}>Record the burn test. The operator sets the outcome — it is never auto-passed.</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Sel k="flame" label="Flame stability" />
        <Sel k="melt_pool" label="Melt pool" />
        <Sel k="soot" label="Soot" />
        <Sel k="mushrooming" label="Mushrooming" />
        <label>Burn duration (hours)<input className="admin__input" type="number" step="any" min={0} value={m.burn_hours} onChange={(e) => set("burn_hours", e.target.value)} /></label>
        <label>Vessel temperature (°C)<input className="admin__input" type="number" step="any" value={m.vessel_temp_c} onChange={(e) => set("vessel_temp_c", e.target.value)} /></label>
      </div>
      <label>Notes / remarks<input className="admin__input" value={m.notes} onChange={(e) => set("notes", e.target.value)} /></label>
      <label>Outcome<select className="admin__input" value={result} onChange={(e) => setResult(e.target.value)}><option value="pass">pass</option><option value="conditional">conditional</option><option value="fail">fail</option></select></label>
      {err && <p className="admin__error">{err}</p>}
      <button className="admin__btn" disabled={busy}>Record burn validation</button>
    </form>
  );
}

const MATERIAL_TYPES = ["wax", "fragrance", "wick", "vessel", "packaging", "dye", "other"];

function MaterialForms({ batchId, materials, lots, onDone }: { batchId: string; materials: any[]; lots: any[]; onDone: () => void }) {
  const [lotId, setLotId] = useState(""); const [qty, setQty] = useState(""); const [uom, setUom] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  // register material
  const [mName, setMName] = useState(""); const [mType, setMType] = useState("wax"); const [mUom, setMUom] = useState("");
  // register lot
  const [lMaterial, setLMaterial] = useState(""); const [lCode, setLCode] = useState(""); const [lSupplier, setLSupplier] = useState(""); const [lQty, setLQty] = useState(""); const [lUom, setLUom] = useState("");

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr(null);
    try { await fn(); onDone(); } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Failed"); } finally { setBusy(false); }
  }
  const consume = (e: FormEvent) => { e.preventDefault(); run(async () => { await mfgAction("record_consumption", { input: { batchId, materialLotId: lotId, qtyConsumed: Number(qty) || 0, uom: uom || undefined, idempotencyKey: crypto.randomUUID() } }); setQty(""); }); };
  const addMaterial = (e: FormEvent) => { e.preventDefault(); run(async () => { await mfgAction("register_material", { input: { name: mName, materialType: mType, defaultUom: mUom || undefined } }); setMName(""); setMUom(""); }); };
  const addLot = (e: FormEvent) => { e.preventDefault(); run(async () => { await mfgAction("register_lot", { input: { materialId: lMaterial, supplierLotCode: lCode, supplierName: lSupplier || undefined, receivedQty: lQty ? Number(lQty) : undefined, uom: lUom || undefined } }); setLCode(""); setLSupplier(""); setLQty(""); }); };

  return (
    <div style={{ display: "grid", gap: 16, marginTop: 12 }}>
      {err && <p className="admin__error">{err}</p>}
      <p className="admin__note">Traceability only — materials never affect sellable stock.</p>

      <form onSubmit={consume} style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <strong>Record material consumption</strong>
        <label>Supplier lot<select className="admin__input" value={lotId} onChange={(e) => setLotId(e.target.value)} required><option value="">Select a lot…</option>{lots.map((l) => <option key={l.id} value={l.id}>{l.materials?.name} · {l.supplier_lot_code}</option>)}</select></label>
        <div style={{ display: "flex", gap: 8 }}>
          <label>Qty<input className="admin__input" type="number" step="any" value={qty} onChange={(e) => setQty(e.target.value)} required /></label>
          <label>Unit<input className="admin__input" value={uom} onChange={(e) => setUom(e.target.value)} placeholder="kg" /></label>
        </div>
        <button className="admin__btn" disabled={busy || !lotId}>Record consumption</button>
        {lots.length === 0 && <p style={{ fontSize: 12 }}>No supplier lots yet — register one below.</p>}
      </form>

      <form onSubmit={addMaterial} style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <strong>Register material</strong>
        <label>Name<input className="admin__input" value={mName} onChange={(e) => setMName(e.target.value)} required /></label>
        <div style={{ display: "flex", gap: 8 }}>
          <label>Type<select className="admin__input" value={mType} onChange={(e) => setMType(e.target.value)}>{MATERIAL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
          <label>Default unit<input className="admin__input" value={mUom} onChange={(e) => setMUom(e.target.value)} placeholder="kg" /></label>
        </div>
        <button className="admin__btn" disabled={busy || !mName}>Register material</button>
      </form>

      <form onSubmit={addLot} style={{ display: "grid", gap: 8, maxWidth: 480 }}>
        <strong>Register supplier lot</strong>
        <label>Material<select className="admin__input" value={lMaterial} onChange={(e) => setLMaterial(e.target.value)} required><option value="">Select a material…</option>{materials.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.material_type})</option>)}</select></label>
        <label>Supplier lot code<input className="admin__input" value={lCode} onChange={(e) => setLCode(e.target.value)} required /></label>
        <label>Supplier<input className="admin__input" value={lSupplier} onChange={(e) => setLSupplier(e.target.value)} /></label>
        <div style={{ display: "flex", gap: 8 }}>
          <label>Received qty<input className="admin__input" type="number" step="any" value={lQty} onChange={(e) => setLQty(e.target.value)} /></label>
          <label>Unit<input className="admin__input" value={lUom} onChange={(e) => setLUom(e.target.value)} placeholder="kg" /></label>
        </div>
        <p style={{ fontSize: 12, opacity: 0.7 }}>The supplier lot code is immutable once registered.</p>
        <button className="admin__btn" disabled={busy || !lMaterial || !lCode}>Register lot</button>
        {materials.length === 0 && <p style={{ fontSize: 12 }}>Register a material first.</p>}
      </form>
    </div>
  );
}
