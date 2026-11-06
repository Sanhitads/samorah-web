"use client";

import { useCallback, useEffect, useState } from "react";
import { LabelPreview, purposeLabel, type LabelPayload } from "@/components/admin/LabelPreview";

/**
 * Phase 11A — batch label workflow embedded in the batch detail screen: pick a template, preview, set a
 * print quantity, generate a printable output (GENERATION — not proof of physical print), view/reprint
 * history, and confirm a physical print. Reuses /api/admin/labels + LabelPreview (no redundant system).
 * Eligibility and batch-status warnings mirror the server gate; the server is authoritative.
 */
interface Template { id: string; template_key: string; version: number; purpose: string; title: string; dimensions_status: string }
interface Job { id: string; template_key: string; template_version: number; purpose: string; batch_code: string; quantity: number; status: string; created_at: string }

async function api(action: string, body: Record<string, unknown>): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch("/api/admin/labels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
  const d = await res.json();
  if (!res.ok || d.ok === false) throw new Error(d.error ?? "Request failed");
  return d.result;
}

export function BatchLabels({ batchId, batchCode, lifecycle, recallState }: { batchId: string; batchCode: string; lifecycle: string; recallState: string }) {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [history, setHistory] = useState<Job[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [qty, setQty] = useState("1");
  const [gen, setGen] = useState<{ payload: LabelPayload; encoded: string } | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const loadHistory = useCallback(async () => { try { setHistory(await api("history", { batchId })); } catch (e) { setErr(e instanceof Error ? e.message : "load failed"); } }, [batchId]);
  useEffect(() => { (async () => { try { setTemplates(await api("templates", {})); } catch (e) { setErr(e instanceof Error ? e.message : "load failed"); } await loadHistory(); })(); }, [batchId, loadHistory]);

  const eligible = recallState === "none" && lifecycle === "qc_approved";
  const chosen = (templates ?? []).find((t) => t.id === templateId) ?? null;

  const generate = async () => {
    if (!templateId) { setErr("Choose a template."); return; }
    setBusy(true); setErr("");
    try {
      const r = await api("generate", { batchId, templateId, quantity: Number(qty) || 1 });
      setGen({ payload: r.payload, encoded: r.encoded_value });
      await loadHistory();
    } catch (e) { setErr(e instanceof Error ? e.message : "generate failed"); } finally { setBusy(false); }
  };
  const confirmPrinted = async (jobId: string) => { setBusy(true); try { await api("confirm_printed", { jobId }); await loadHistory(); } catch (e) { setErr(e instanceof Error ? e.message : "confirm failed"); } finally { setBusy(false); } };

  return (
    <section className="admin__card" aria-label="Batch labels">
      <h3>Labels</h3>
      {eligible
        ? <p className="admin__note">Batch is <b>qc_approved</b> and not held/recalled — <b>retail, product-batch and internal</b> labels are eligible.</p>
        : <p className="admin__note">Batch is <b>{lifecycle}</b>{recallState !== "none" ? ` / ${recallState}` : ""} — only <b>internal manufacturing</b> labels are eligible. Retail / product-batch labels need a <b>qc_approved</b> batch that is not held or recalled (also enforced server-side), so they are shown disabled below.</p>}
      <div className="admin__filters">
        <select className="admin__input" value={templateId} onChange={(e) => { setTemplateId(e.target.value); setGen(null); }} aria-label="Label template">
          <option value="">Choose template…</option>
          {(templates ?? []).map((t) => {
            const blocked = (t.purpose === "retail" || t.purpose === "product_batch_id") && !eligible;
            return <option key={t.id} value={t.id} disabled={blocked}>{t.title} · v{t.version} · {purposeLabel(t.purpose)}{t.dimensions_status !== "verified" ? " · dims unverified" : ""}{blocked ? " — not eligible for this batch" : ""}</option>;
          })}
        </select>
        <input className="admin__input" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Print quantity" />
        <button type="button" className="admin__btn" disabled={busy || !templateId} onClick={generate}>Generate printable</button>
      </div>
      {chosen && chosen.dimensions_status !== "verified" ? <p className="admin__note">⚠ This template's dimensions are UNVERIFIED — confirm physical size/margins/scaling before a real print run.</p> : null}
      {err ? <p className="admin__error" role="alert">{err}</p> : null}

      {gen ? (
        <div className="admin__section">
          <h4>Preview <span className="admin__muted">(generated — not yet a physical print)</span></h4>
          <LabelPreview payload={gen.payload} encodedValue={gen.encoded} />
          <p className="admin__muted">Print via the browser, then mark the job printed in history below.</p>
        </div>
      ) : null}

      <div className="admin__section">
        <h4>Print history</h4>
        <ul className="prov-ship">
          {history.map((j) => (
            <li key={j.id}>{j.purpose} · v{j.template_version} · ×{j.quantity} · {j.batch_code} · <b>{j.status}</b>
              {j.status === "generated" ? <> · <button type="button" className="ff-btn" disabled={busy} onClick={() => confirmPrinted(j.id)}>Mark printed</button></> : null}
            </li>
          ))}
          {history.length === 0 ? <li className="admin__muted">No labels generated yet.</li> : null}
        </ul>
      </div>
    </section>
  );
}
