"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { mfgAction, newIdempotencyKey } from "@/lib/admin/mfgClient";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Caps = { operate: boolean; qc: boolean; approve: boolean };
const LIFECYCLES = ["draft", "in_production", "curing", "quality_check", "qc_approved", "rejected", "closed"];
const cap = (s?: string) => (s ? s.replace(/_/g, " ") : "");
const today = () => new Date().toISOString().slice(0, 10);

export function ManufacturingManager({ rows, total, page, pageSize, filters, variants, caps }: {
  rows: any[]; total: number; page: number; pageSize: number;
  filters: { q: string; status: string; hold: boolean }; variants: any[]; caps: Caps;
}) {
  const router = useRouter();
  const [q, setQ] = useState(filters.q);
  const [status, setStatus] = useState(filters.status);
  const [hold, setHold] = useState(filters.hold);
  const [showCreate, setShowCreate] = useState(false);
  const pages = Math.max(Math.ceil(total / pageSize), 1);

  function applyFilters(e: FormEvent) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    if (hold) p.set("hold", "1");
    router.push(`/admin/manufacturing?${p.toString()}`);
  }
  const go = (n: number) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q); if (status) p.set("status", status); if (hold) p.set("hold", "1");
    p.set("page", String(n));
    router.push(`/admin/manufacturing?${p.toString()}`);
  };

  return (
    <section className="admin__section">
      <form className="admin__filters" onSubmit={applyFilters} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        <input className="admin__input" placeholder="Search product name or batch code…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="admin__input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {LIFECYCLES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
        </select>
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} /> On hold
        </label>
        <button className="admin__btn" type="submit">Filter</button>
        {caps.operate && <button className="admin__btn" type="button" onClick={() => setShowCreate((s) => !s)}>{showCreate ? "Close" : "New batch"}</button>}
      </form>

      {showCreate && caps.operate && <CreateBatchForm variants={variants} onDone={() => { setShowCreate(false); router.refresh(); }} />}

      {rows.length === 0 ? (
        <p className="admin__empty">No batches match.</p>
      ) : (
        <table className="admin__table">
          <thead>
            <tr>
              <th>Batch code</th><th>Product · Variant</th><th>Mfg date</th><th>Planned/Produced</th>
              <th>Pending</th><th>Approved/Rejected</th><th>Status</th><th>Cure elig.</th><th>Hold</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/admin/manufacturing/${r.id}`}>{r.batch_code}</Link></td>
                <td>{r.products?.name ?? "—"} · {r.variants?.sku ?? "—"}</td>
                <td>{r.manufacturing_date ?? "—"}</td>
                <td>{r.planned_qty} / {r.produced_qty}</td>
                <td>{r.pending_inspection_qty}</td>
                <td>{r.approved_qty} / {r.rejected_qty}</td>
                <td>{cap(r.lifecycle_status)}</td>
                <td>{r.earliest_release_date ?? "—"}</td>
                <td>{r.recall_state === "on_hold" ? "On hold" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pages > 1 && (
        <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center" }}>
          <button className="admin__btn" disabled={page <= 1} onClick={() => go(page - 1)}>Prev</button>
          <span>Page {page} of {pages}</span>
          <button className="admin__btn" disabled={page >= pages} onClick={() => go(page + 1)}>Next</button>
        </div>
      )}
    </section>
  );
}

function CreateBatchForm({ variants, onDone }: { variants: any[]; onDone: () => void }) {
  const router = useRouter();
  const [variantId, setVariantId] = useState("");
  const [mfgDate, setMfgDate] = useState(today());
  const [planned, setPlanned] = useState("0");
  const [prefix, setPrefix] = useState("");
  const [cureStart, setCureStart] = useState("");
  const [earliest, setEarliest] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const selected = variants.find((v) => v.id === variantId);
  const needsPrefix = selected && !selected.products?.batch_prefix;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      if (needsPrefix) {
        if (!/^[A-Za-z0-9]{1,6}$/.test(prefix)) throw new Error("Enter a 1–6 char batch prefix for this product.");
        await mfgAction("set_prefix", { productId: selected.products ? selected.product_id : selected.product_id, prefix });
      }
      const res = await mfgAction<{ batchId: string }>("create_batch", {
        input: { variantId, manufacturingDate: mfgDate, plannedQty: Number(planned) || 0, cureStartDate: cureStart || undefined, earliestReleaseDate: earliest || undefined, idempotencyKey: newIdempotencyKey() },
      });
      onDone();
      if (res?.batchId) router.push(`/admin/manufacturing/${res.batchId}`);
    } catch (e2) { setErr(e2 instanceof Error ? e2.message : "Failed"); } finally { setBusy(false); }
  }

  return (
    <form className="admin__card" onSubmit={submit} style={{ display: "grid", gap: 10, maxWidth: 520, marginBottom: 20 }}>
      <h3>New manufacturing batch</h3>
      <label>Variant
        <select className="admin__input" value={variantId} onChange={(e) => setVariantId(e.target.value)} required>
          <option value="">Select a product variant…</option>
          {variants.map((v) => <option key={v.id} value={v.id}>{v.products?.name} · {v.sku} ({v.vessel_type ?? v.products?.product_type} {v.size_label})</option>)}
        </select>
      </label>
      {needsPrefix && (
        <label>Batch-code prefix (product has none yet)
          <input className="admin__input" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} placeholder="e.g. KC" maxLength={6} />
        </label>
      )}
      <label>Manufacturing date<input className="admin__input" type="date" value={mfgDate} onChange={(e) => setMfgDate(e.target.value)} required /></label>
      <label>Planned quantity<input className="admin__input" type="number" min={0} value={planned} onChange={(e) => setPlanned(e.target.value)} /></label>
      <label>Cure start<input className="admin__input" type="date" value={cureStart} onChange={(e) => setCureStart(e.target.value)} /></label>
      <label>Earliest release (cure eligible)<input className="admin__input" type="date" value={earliest} onChange={(e) => setEarliest(e.target.value)} /></label>
      <p style={{ fontSize: 12, opacity: 0.7 }}>The batch code is generated by the server from the product prefix + vessel/size + date.</p>
      {err && <p className="admin__error" role="alert">{err}</p>}
      <button className="admin__btn" type="submit" disabled={busy || !variantId}>{busy ? "Creating…" : "Create batch"}</button>
    </form>
  );
}
