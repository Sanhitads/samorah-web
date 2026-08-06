"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { RtoReceivingModel } from "@/services/rtoReceivingService";

/**
 * RTO Receiving & Inspection panel (Phase 1B-2). Collects PHYSICAL FACTS only — received / restockable /
 * damaged / note per variant — never raw stock ±, never money. Live reconciliation (restockable + damaged
 * = received, received ≤ outstanding) disables Commit locally; the DB CHECKs + commit_receipt stay
 * authoritative. Restock flows only through the RTO receipt path; "Close receiving" is the authoritative
 * boundary. Damaged is NEVER labelled restocked; "Final missing" shows only after closure.
 */
type Draft = { received: string; restockable: string; damaged: string };

export function ShipmentRtoReceiving({ model, canOperate }: { model: RtoReceivingModel; canOperate: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(model.variants.map((v) => [v.variantRef, { received: "", restockable: "", damaged: "" }])),
  );

  const set = (ref: string, k: keyof Draft, val: string) =>
    setDrafts((d) => ({ ...d, [ref]: { ...d[ref], [k]: val.replace(/[^0-9]/g, "") } }));

  const rows = model.variants.map((v) => {
    const d = drafts[v.variantRef] ?? { received: "", restockable: "", damaged: "" };
    const received = Number(d.received || 0);
    const restockable = Number(d.restockable || 0);
    const damaged = Number(d.damaged || 0);
    const touched = d.received !== "" || d.restockable !== "" || d.damaged !== "";
    const splitOk = restockable + damaged === received;
    const withinOutstanding = received <= v.outstanding;
    const valid = !touched || (received > 0 && splitOk && withinOutstanding);
    return { v, received, restockable, damaged, touched, splitOk, withinOutstanding, valid };
  });

  const anyEntered = rows.some((r) => r.touched && r.received > 0);
  const allValid = rows.every((r) => r.valid);
  const canSubmit = canOperate && model.canReceive && anyEntered && allValid && !busy;

  const submitReceipt = async () => {
    setBusy(true);
    setErr(null);
    const lines = rows
      .filter((r) => r.touched && r.received > 0)
      .map((r) => ({ variantId: r.v.variantRef, received: r.received, restockable: r.restockable, damaged: r.damaged }));
    try {
      const res = await fetch("/api/admin/shipments/receive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId: model.shipmentId, note: note || undefined, lines }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setErr(body.error ?? "Could not record receipt.");
      else {
        setNote("");
        setDrafts(Object.fromEntries(model.variants.map((v) => [v.variantRef, { received: "", restockable: "", damaged: "" }])));
        router.refresh();
      }
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const closeReceiving = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/shipments/receiving/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId: model.shipmentId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setErr(body.error ?? "Could not close receiving.");
      else router.refresh();
    } catch {
      setErr("Network error.");
    } finally {
      setBusy(false);
    }
  };

  const historyReceipts = useMemo(() => model.receipts.filter((r) => r.status !== "void"), [model.receipts]);

  return (
    <div className="rcv">
      {model.closed ? (
        <p className="rcv-banner rcv-banner--done">🔒 RTO receiving closed{model.closedByName ? ` by ${model.closedByName}` : ""}. Final shortage is fixed per variant below.</p>
      ) : !model.isRto ? (
        <p className="rcv-banner rcv-banner--muted">Receiving is available once the shipment is in RTO (return-to-origin) status.</p>
      ) : null}

      <div className="admin__table-wrap">
        <table className="admin__table rcv-table">
          <thead>
            <tr>
              <th>SKU</th><th>Expected</th><th>Received</th><th>Outstanding</th>
              <th>Restocked</th><th>Damaged</th>{model.closed ? <th>Final missing</th> : null}
            </tr>
          </thead>
          <tbody>
            {model.variants.map((v) => (
              <tr key={v.variantRef}>
                <td>{v.sku ?? v.variantRef.slice(0, 8)}</td>
                <td className="admin__mono">{v.expected}</td>
                <td className="admin__mono">{v.received}</td>
                <td className="admin__mono">{model.closed ? "—" : v.outstanding}</td>
                <td className="admin__mono">{v.restockable}</td>
                <td className="admin__mono">{v.damaged}</td>
                {model.closed ? <td className="admin__mono" data-short={v.finalMissing ? "1" : "0"}>{v.finalMissing ?? 0}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {model.canReceive && canOperate ? (
        <div className="rcv-entry">
          <h3 className="od-card__title">Record a physical RTO receipt</h3>
          <div className="admin__table-wrap">
            <table className="admin__table">
              <thead><tr><th>SKU</th><th>Outstanding</th><th>Received</th><th>Restockable</th><th>Damaged</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.v.variantRef} data-invalid={r.touched && !r.valid ? "1" : "0"}>
                    <td>{r.v.sku ?? r.v.variantRef.slice(0, 8)}</td>
                    <td className="admin__mono">{r.v.outstanding}</td>
                    <td><input inputMode="numeric" className="rcv-num" value={drafts[r.v.variantRef]?.received ?? ""} onChange={(e) => set(r.v.variantRef, "received", e.target.value)} disabled={r.v.outstanding === 0} /></td>
                    <td><input inputMode="numeric" className="rcv-num" value={drafts[r.v.variantRef]?.restockable ?? ""} onChange={(e) => set(r.v.variantRef, "restockable", e.target.value)} disabled={r.v.outstanding === 0} /></td>
                    <td><input inputMode="numeric" className="rcv-num" value={drafts[r.v.variantRef]?.damaged ?? ""} onChange={(e) => set(r.v.variantRef, "damaged", e.target.value)} disabled={r.v.outstanding === 0} /></td>
                    <td className="rcv-hint">
                      {r.touched && !r.splitOk ? <span className="rcv-bad">restockable + damaged must equal received</span> : null}
                      {r.touched && r.splitOk && !r.withinOutstanding ? <span className="rcv-bad">exceeds outstanding</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="om-field"><span>Note (optional)</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Condition, packaging, courier…" />
          </label>
          <div className="rcv-actions">
            <button className="admin__btn" onClick={submitReceipt} disabled={!canSubmit}>Record &amp; commit receipt</button>
            <button className="admin__btn admin__btn--ghost" onClick={closeReceiving} disabled={!model.canClose || busy}
              title={model.openDraftCount > 0 ? "Commit or void open drafts first" : model.canClose ? "" : "Only while in RTO status"}>
              Close receiving
            </button>
          </div>
          {model.openDraftCount > 0 ? <p className="admin__muted om-field__hint">{model.openDraftCount} open draft receipt(s) must be committed or voided before closing.</p> : null}
        </div>
      ) : null}

      {err ? <p className="rcv-bad" role="alert">{err}</p> : null}

      {historyReceipts.length ? (
        <details className="rcv-hist">
          <summary className="od-group__sum">Receipt history <span className="count-badge">{historyReceipts.length}</span></summary>
          <ul className="rcv-hist__list">
            {historyReceipts.map((r) => (
              <li key={r.id} className="rcv-hist__item">
                <span className="ff-status" data-s={r.status}>{r.status}</span>
                <span className="admin__muted"> {r.committed_at ? `committed ${r.committed_by_name ?? ""}` : `received ${r.received_by_name ?? ""}`}</span>
                <ul className="rcv-hist__items">
                  {r.items.map((it, i) => (
                    <li key={i} className="admin__muted">
                      {it.sku ?? it.variantRef.slice(0, 8)}: received {it.received} · restockable {it.restockable} · damaged {it.damaged}
                      {it.movementId ? <span className="admin__mono"> · mv {it.movementId.slice(0, 8)}</span> : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
