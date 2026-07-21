"use client";

import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

/**
 * Safe bulk SHIPMENT operations (review priority 1.4). A client island around the server-rendered
 * board: per-row checkboxes share selection via context, and a bar runs NON-DESTRUCTIVE batch
 * actions — Mark In Transit / Out for Delivery / Delivered, Assign Courier, Print Labels, Packing
 * Slips, Export Manifest. RTO and Exception are deliberately absent (they need a per-parcel reason);
 * the bulk API rejects them too. Mirrors the fulfillment BoardSelection pattern.
 */
interface SelCtx { selected: Set<string>; toggle: (id: string) => void; isSelected: (id: string) => boolean; }
const Ctx = createContext<SelCtx | null>(null);

/** Per-row checkbox. No-op outside a provider. */
export function ShipmentCheckbox({ shipmentId }: { shipmentId: string }) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return <input type="checkbox" className="obulk-check" checked={ctx.isSelected(shipmentId)} onChange={() => ctx.toggle(shipmentId)} aria-label={`Select ${shipmentId}`} />;
}

export function ShipmentSelectionProvider({ children, ids, couriers }: { children: ReactNode; ids: string[]; couriers: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const ctx = useMemo<SelCtx>(() => ({
    selected,
    isSelected: (id) => selected.has(id),
    toggle: (id) => setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; }),
  }), [selected]);

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {selected.size > 0 ? (
        <ShipmentBar numbers={[...selected]} couriers={couriers} pending={pending} onSelectPage={() => setSelected(new Set(ids))} onClear={() => setSelected(new Set())} onDone={() => startTransition(() => router.refresh())} />
      ) : (
        <div className="obulk-hint"><button type="button" className="obulk-link" onClick={() => setSelected(new Set(ids))}>Select all {ids.length} on board</button></div>
      )}
    </Ctx.Provider>
  );
}

function ShipmentBar({ numbers, couriers, pending, onSelectPage, onClear, onDone }: {
  numbers: string[]; couriers: string[]; pending: boolean; onSelectPage: () => void; onClear: () => void; onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [active, setActive] = useState<null | "courier">(null);
  const [courier, setCourier] = useState("");
  const count = numbers.length;

  const run = async (action: string, extra: Record<string, unknown> = {}, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/admin/shipments/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, shipmentIds: numbers, ...extra }) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) { setMsg(d.error ?? "Failed"); return; }
      setMsg(`${d.done} done${d.failed?.length ? ` · ${d.failed.length} skipped` : ""}`);
      setActive(null);
      onDone();
    } catch { setBusy(false); setMsg("Network error"); }
  };

  const ids = encodeURIComponent(numbers.join(","));
  const openPrint = (path: string) => window.open(`${path}?ids=${ids}`, "_blank");

  return (
    <div className="obulk-bar" role="region" aria-label="Bulk shipment actions">
      <div className="obulk-bar__head">
        <strong>{count}</strong> selected
        <button type="button" className="obulk-link" onClick={onSelectPage}>All</button>
        <button type="button" className="obulk-link obulk-link--clear" onClick={onClear}>Clear</button>
      </div>
      <div className="obulk-bar__actions">
        <button type="button" className="ff-btn" disabled={busy} onClick={() => run("markInTransit", {}, `Mark ${count} shipment(s) In Transit? (only eligible ones advance)`)}>Mark In Transit</button>
        <button type="button" className="ff-btn" disabled={busy} onClick={() => run("markOutForDelivery", {}, `Mark ${count} Out for Delivery? (only eligible ones advance)`)}>Out for Delivery</button>
        <button type="button" className="ff-btn" disabled={busy} onClick={() => run("markDelivered", {}, `Mark ${count} Delivered? (only eligible ones advance)`)}>Mark Delivered</button>
        <button type="button" className="ff-btn" disabled={busy} onClick={() => setActive(active === "courier" ? null : "courier")}>Assign Courier</button>
        <button type="button" className="ff-btn" disabled={busy} onClick={() => openPrint("/api/admin/shipments/labels")}>Print Labels</button>
        <button type="button" className="ff-btn" disabled={busy} onClick={() => openPrint("/api/admin/shipments/packing-slips")}>Packing Slips</button>
        <button type="button" className="ff-btn" disabled={busy} onClick={() => openPrint("/api/admin/shipments/manifest")}>Export Manifest</button>
      </div>
      {active === "courier" ? (
        <div className="obulk-bar__form">
          <input list="ship-couriers" value={courier} onChange={(e) => setCourier(e.target.value)} placeholder="Courier name" aria-label="Courier" />
          <datalist id="ship-couriers">{couriers.map((c) => <option key={c} value={c} />)}</datalist>
          <button type="button" className="ff-btn ff-btn--primary" disabled={busy || !courier.trim()} onClick={() => run("assignCourier", { courier: courier.trim() })}>{busy ? "…" : "Assign"}</button>
          <button type="button" className="ff-btn" disabled={busy} onClick={() => setActive(null)}>Cancel</button>
        </div>
      ) : null}
      {msg ? <div className="obulk-bar__msg">{msg}</div> : null}
      {pending ? <span className="ff-refreshing">refreshing…</span> : null}
    </div>
  );
}
