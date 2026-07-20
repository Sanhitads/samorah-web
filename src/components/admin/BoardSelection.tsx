"use client";

import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { BulkUndo } from "@/lib/admin/orderBulk";

/**
 * Safe bulk WAREHOUSE operations (Phase 2 #5). A client island around the server-rendered board:
 * per-row checkboxes share selection via context, and a bar runs NON-DESTRUCTIVE actions — Assign
 * picker · Start Picking · Print Pick List · Print Labels. No bulk dispatch here (that stays the
 * existing narrow BoardBulk batch). Assign reuses the orders bulk endpoint (which already audits +
 * supports undo); Start Picking uses the fulfillment bulk endpoint. Print actions open a print tab.
 */

interface StaffOpt { id: string; name: string; }

interface SelCtx {
  selected: Set<string>;
  toggle: (n: string) => void;
  isSelected: (n: string) => boolean;
}
const Ctx = createContext<SelCtx | null>(null);

/** Per-row checkbox. No-op outside a provider. */
export function BoardCheckbox({ orderNumber }: { orderNumber: string }) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return (
    <input type="checkbox" className="obulk-check" checked={ctx.isSelected(orderNumber)} onChange={() => ctx.toggle(orderNumber)} aria-label={`Select ${orderNumber}`} />
  );
}

export function BoardSelectionProvider({
  children, pageNumbers, staff,
}: {
  children: ReactNode;
  pageNumbers: string[];
  staff: StaffOpt[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const ctx = useMemo<SelCtx>(() => ({
    selected,
    isSelected: (n) => selected.has(n),
    toggle: (n) => setSelected((prev) => { const next = new Set(prev); if (next.has(n)) next.delete(n); else next.add(n); return next; }),
  }), [selected]);

  const selectPage = () => setSelected(new Set(pageNumbers));
  const clear = () => setSelected(new Set());

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {selected.size > 0 ? (
        <BoardBar
          numbers={[...selected]}
          staff={staff}
          pending={pending}
          onSelectPage={selectPage}
          onClear={clear}
          onDone={() => startTransition(() => router.refresh())}
        />
      ) : (
        <div className="obulk-hint"><button type="button" className="obulk-link" onClick={selectPage}>Select all {pageNumbers.length} on board</button></div>
      )}
    </Ctx.Provider>
  );
}

function BoardBar({
  numbers, staff, pending, onSelectPage, onClear, onDone,
}: {
  numbers: string[];
  staff: StaffOpt[];
  pending: boolean;
  onSelectPage: () => void;
  onClear: () => void;
  onDone: () => void;
}) {
  const [active, setActive] = useState<null | "assign">(null);
  const [staffId, setStaffId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [undo, setUndo] = useState<BulkUndo | null>(null);

  const count = numbers.length;

  const assign = async () => {
    if (!staffId) { setMsg("Pick a picker."); return; }
    const name = staff.find((s) => s.id === staffId)?.name ?? "picker";
    if (!window.confirm(`Assign ${count} order${count === 1 ? "" : "s"} to ${name}?`)) return;
    setBusy(true); setMsg(""); setUndo(null);
    try {
      const res = await fetch("/api/admin/orders/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "assign", orderNumbers: numbers, staffId }) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) { setMsg(d.error ?? "Failed"); return; }
      setMsg(`Assigned ${d.done}${d.failed?.length ? ` · ${d.failed.length} failed` : ""}`);
      if (d.undo) setUndo(d.undo);
      setActive(null);
      onDone();
    } catch { setBusy(false); setMsg("Network error"); }
  };

  const startPicking = async () => {
    if (!window.confirm(`Start picking ${count} order${count === 1 ? "" : "s"}? (only eligible orders advance)`)) return;
    setBusy(true); setMsg(""); setUndo(null);
    try {
      const res = await fetch("/api/admin/fulfillment/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "startPicking", orderNumbers: numbers }) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) { setMsg(d.error ?? "Failed"); return; }
      setMsg(`Picking started on ${d.done}${d.failed?.length ? ` · ${d.failed.length} skipped` : ""}`);
      onDone();
    } catch { setBusy(false); setMsg("Network error"); }
  };

  const runUndo = async () => {
    if (!undo) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/orders/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", restore: undo.records }) });
      const d = await res.json();
      setBusy(false);
      setMsg(res.ok ? `Reverted ${d.done}` : (d.error ?? "Undo failed"));
      setUndo(null);
      onDone();
    } catch { setBusy(false); setMsg("Network error"); }
  };

  const printList = () => window.open(`/api/admin/fulfillment/pick-list?numbers=${encodeURIComponent(numbers.join(","))}`, "_blank");
  const printLabels = () => window.open(`/api/admin/fulfillment/labels?numbers=${encodeURIComponent(numbers.join(","))}`, "_blank");

  return (
    <div className="obulk-bar" role="region" aria-label="Bulk warehouse actions">
      <div className="obulk-bar__head">
        <strong>{count}</strong> selected
        <button type="button" className="obulk-link" onClick={onSelectPage}>All</button>
        <button type="button" className="obulk-link obulk-link--clear" onClick={onClear}>Clear</button>
      </div>
      <div className="obulk-bar__actions">
        <button type="button" className="ff-btn" disabled={busy} onClick={() => setActive("assign")}>Assign picker</button>
        <button type="button" className="ff-btn" disabled={busy} onClick={startPicking}>Start picking</button>
        <button type="button" className="ff-btn" disabled={busy} onClick={printList}>Print pick list</button>
        <button type="button" className="ff-btn" disabled={busy} onClick={printLabels}>Print labels</button>
      </div>
      {active === "assign" ? (
        <div className="obulk-bar__form">
          <select value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Picker">
            <option value="">Pick a picker…</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={assign}>{busy ? "…" : "Assign"}</button>
          <button type="button" className="ff-btn" disabled={busy} onClick={() => setActive(null)}>Cancel</button>
        </div>
      ) : null}
      {msg ? <div className="obulk-bar__msg">{msg}{undo ? <button type="button" className="obulk-link" disabled={busy} onClick={runUndo}>Undo</button> : null}</div> : null}
      {pending ? <span className="ff-refreshing">refreshing…</span> : null}
    </div>
  );
}
