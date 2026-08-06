"use client";

/**
 * /admin/inventory — operational control surface over the Phase-0 canonical inventory.
 * All numbers come from the server (On Hand = variants.stock, Reserved = live holds, Available =
 * On Hand − Reserved). Adjustments route through adjust_inventory via /api/admin/inventory with a
 * stable client idempotency key (retry-safe). Managers see everything read-only; adjust needs admin+.
 */
import { useMemo, useState } from "react";
import type { InventoryRow, InventorySummary, UntrackedRow, MovementRow } from "@/services/inventoryService";
import { filterSortInventory, presentTypes, STATUS_LABEL, PRODUCT_TYPE_LABEL, type InvFilter, type InvSort } from "@/lib/inventory/inventoryList";
import type { AdjustMode } from "@/lib/inventory/adjustLogic";

const REASONS = ["Stock received", "Physical count correction", "Damaged", "Lost", "Sample or internal use", "Promotional giveaway", "Other"] as const;

function newKey(): string {
  try { return crypto.randomUUID(); } catch { return `adj-${Date.now()}-${Math.round(performance.now())}`; }
}

type AdjustState = { row: InventoryRow; mode: AdjustMode; qty: string; reason: string; reference: string; note: string; key: string; busy: boolean; error: string };

export function InventoryManager({ rows: initial, summary: initialSummary, untracked, canAdjust }: {
  rows: InventoryRow[]; summary: InventorySummary; untracked: UntrackedRow[]; canAdjust: boolean;
}) {
  const [rows, setRows] = useState(initial);
  const [summary, setSummary] = useState(initialSummary);
  const [filter, setFilter] = useState<InvFilter>({ search: "", status: "all", productType: "all", sort: "stock_asc" });
  const [adj, setAdj] = useState<AdjustState | null>(null);
  const [history, setHistory] = useState<{ row: InventoryRow; loading: boolean; movements: MovementRow[] } | null>(null);

  const shown = useMemo(() => filterSortInventory(rows, filter), [rows, filter]);
  const types = useMemo(() => presentTypes(rows), [rows]);

  const refresh = async () => {
    const r = await fetch("/api/admin/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list" }) });
    const d = await r.json();
    if (d.ok) { setRows(d.rows); setSummary(d.summary); }
  };

  const openAdjust = (row: InventoryRow) => setAdj({ row, mode: "add", qty: "", reason: REASONS[0], reference: "", note: "", key: newKey(), busy: false, error: "" });

  const submitAdjust = async () => {
    if (!adj) return;
    const qty = Number(adj.qty);
    if (!Number.isFinite(qty) || qty < 0) { setAdj({ ...adj, error: "Enter a valid quantity." }); return; }
    if (adj.reason === "Other" && adj.note.trim().length < 3) { setAdj({ ...adj, error: "Add a note explaining the Other adjustment." }); return; }
    setAdj({ ...adj, busy: true, error: "" });
    // The SAME key is reused on retry (network error / re-click) so the adjustment can never apply twice.
    const res = await fetch("/api/admin/inventory", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "adjust", variantId: adj.row.variantId, mode: adj.mode, qty, reason: adj.reason, reference: adj.reference || undefined, note: adj.note || undefined, idempotencyKey: adj.key }),
    }).then((r) => r.json()).catch(() => ({ ok: false, reason: "Network error — retry is safe (idempotent)." }));
    if (res.ok) { await refresh(); setAdj(null); }
    else setAdj((s) => (s ? { ...s, busy: false, error: reasonLabel(res.reason) } : s));
  };

  const openHistory = async (row: InventoryRow) => {
    setHistory({ row, loading: true, movements: [] });
    const r = await fetch("/api/admin/inventory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "movements", variantId: row.variantId }) });
    const d = await r.json();
    setHistory({ row, loading: false, movements: d.movements ?? [] });
  };

  const resulting = adj ? preview(adj.mode, Number(adj.qty) || 0, adj.row.onHand) : 0;
  const belowReserved = adj != null && resulting < adj.row.reserved;

  return (
    <div className="cfg">
      {/* Analytics strip — honest, canonical-backed metrics only */}
      <div className="seo-summary">
        <span className="seo-stat"><b>{summary.trackedVariants}</b> tracked variants</span>
        <span className="seo-stat"><b>{summary.inStock}</b> in stock</span>
        <span className={`seo-stat${summary.lowStock ? " seo-stat--warn" : ""}`}><b>{summary.lowStock}</b> low stock</span>
        <span className={`seo-stat${summary.outOfStock ? " seo-stat--warn" : ""}`}><b>{summary.outOfStock}</b> out of stock</span>
        <span className="seo-stat"><b>{summary.reservedUnits}</b> reserved units</span>
        <span className="seo-stat"><b>{summary.availableUnits}</b> available units</span>
        <span className="seo-stat"><b>{summary.notStockTracked}</b> not stock-tracked</span>
      </div>

      {/* Toolbar */}
      <div className="seo-toolbar" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <label className="cfg-field" style={{ flex: "1 1 220px" }}><span>Search</span>
          <input value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} placeholder="Product, SKU, variant…" /></label>
        <label className="cfg-field"><span>Status</span>
          <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value as InvFilter["status"] })}>
            <option value="all">All</option><option value="in_stock">In stock</option><option value="low_stock">Low stock</option><option value="out_of_stock">Out of stock</option></select></label>
        <label className="cfg-field"><span>Type</span>
          <select value={filter.productType} onChange={(e) => setFilter({ ...filter, productType: e.target.value })}>
            <option value="all">All</option>{types.map((t) => <option key={t} value={t}>{PRODUCT_TYPE_LABEL[t] ?? t}</option>)}</select></label>
        <label className="cfg-field"><span>Sort</span>
          <select value={filter.sort} onChange={(e) => setFilter({ ...filter, sort: e.target.value as InvSort })}>
            <option value="stock_asc">Lowest available</option><option value="stock_desc">Highest available</option>
            <option value="recent">Recently changed</option><option value="name_asc">Product A–Z</option><option value="sku_asc">SKU</option></select></label>
      </div>

      <div className="admin__table-wrap" style={{ marginTop: 10 }}>
        <table className="admin__table admin__table--board">
          <thead><tr><th>Product</th><th>SKU</th><th>Type</th><th>On hand</th><th>Reserved</th><th>Available</th><th>Threshold</th><th>Status</th><th>Last activity</th><th></th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.variantId} data-inactive={r.isActive ? "0" : "1"}>
                <td><strong>{r.productName}</strong>{r.variantName ? <span className="admin__muted"> · {r.variantName}</span> : null}{r.collectionName ? <div className="admin__muted" style={{ fontSize: 11 }}>{r.collectionName}</div> : null}</td>
                <td className="admin__mono">{r.sku}</td>
                <td>{PRODUCT_TYPE_LABEL[r.productType] ?? r.productType}</td>
                <td>{r.onHand}</td>
                <td>{r.reserved}</td>
                <td><strong>{r.available}</strong></td>
                <td>{r.lowStockThreshold}</td>
                <td><span className={`inv-badge inv-badge--${r.status}`}>{STATUS_LABEL[r.status]}</span></td>
                <td className="admin__muted" style={{ fontSize: 11 }}>{r.lastMovementAt ? `${r.lastMovementType} · ${new Date(r.lastMovementAt).toLocaleDateString()}` : "—"}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button type="button" className="ff-btn ff-btn--sm" onClick={() => openHistory(r)}>History</button>{" "}
                  {canAdjust ? <button type="button" className="ff-btn ff-btn--sm ff-btn--primary" onClick={() => openAdjust(r)}>Adjust</button> : null}
                </td>
              </tr>
            ))}
            {!shown.length ? <tr><td colSpan={10}><div className="seo-empty"><strong>No matching variants</strong><span>Adjust the search or filters.</span></div></td></tr> : null}
          </tbody>
        </table>
      </div>

      {/* Not stock-tracked */}
      {untracked.length ? (
        <details className="seo-details" style={{ marginTop: 18 }}>
          <summary className="seo-group__title">Not stock-tracked ({untracked.length})</summary>
          <p className="cfg-hint">These physical products are config-priced and have no variant-backed stock yet, so they are not counted here (never shown as On Hand 0). Variant-backed migration is deferred to Phase 2.</p>
          <div className="admin__table-wrap" style={{ marginTop: 8 }}>
            <table className="admin__table">
              <thead><tr><th>Product</th><th>Type</th><th>Status</th></tr></thead>
              <tbody>{untracked.map((u) => <tr key={u.slug}><td>{u.name}</td><td>{PRODUCT_TYPE_LABEL[u.productType] ?? u.productType}</td><td><span className="inv-badge inv-badge--untracked">Not stock-tracked</span></td></tr>)}</tbody>
            </table>
          </div>
        </details>
      ) : null}

      {/* Adjust dialog */}
      {adj ? (
        <div className="inv-modal" role="dialog" aria-modal="true" aria-label="Adjust stock">
          <div className="inv-modal__card">
            <h2 className="inv-modal__title">Adjust stock — {adj.row.productName}{adj.row.variantName ? ` · ${adj.row.variantName}` : ""}</h2>
            <p className="admin__muted" style={{ fontSize: 12 }}>SKU {adj.row.sku} · On hand <strong>{adj.row.onHand}</strong> · Reserved (live) {adj.row.reserved} · Available {adj.row.available}</p>
            <div className="cfg-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <label className="cfg-field"><span>Action</span>
                <select value={adj.mode} onChange={(e) => setAdj({ ...adj, mode: e.target.value as AdjustMode })}>
                  <option value="add">Add</option><option value="remove">Remove</option><option value="set">Set / correct to</option></select></label>
              <label className="cfg-field"><span>{adj.mode === "set" ? "New on-hand" : "Quantity"}</span>
                <input type="number" min={0} value={adj.qty} onChange={(e) => setAdj({ ...adj, qty: e.target.value })} /></label>
              <label className="cfg-field"><span>Reason</span>
                <select value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })}>{REASONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
              <label className="cfg-field"><span>Reference (optional)</span>
                <input value={adj.reference} onChange={(e) => setAdj({ ...adj, reference: e.target.value })} placeholder="GRN / doc no." /></label>
              <label className="cfg-field" style={{ gridColumn: "1 / -1" }}><span>Note (optional)</span>
                <input value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} placeholder="Context for the ledger" /></label>
            </div>
            <p className="cfg-hint" style={{ marginTop: 8 }}>Resulting on hand: <strong>{resulting}</strong>. {belowReserved ? <span className="cfg-msg cfg-msg--warn">Below the reserved quantity — the server rejects any result below protected reservations.</span> : "The server (adjust_inventory) is authoritative and re-checks against protected reservations."}</p>
            {adj.error ? <p className="cfg-msg cfg-msg--warn">{adj.error}</p> : null}
            <div className="cfg-actions" style={{ marginTop: 12 }}>
              <button type="button" className="ff-btn ff-btn--primary" disabled={adj.busy} onClick={submitAdjust}>{adj.busy ? "Applying…" : "Apply adjustment"}</button>
              <button type="button" className="ff-btn ff-btn--ghost" disabled={adj.busy} onClick={() => setAdj(null)}>Cancel</button>
            </div>
          </div>
        </div>
      ) : null}

      {/* History modal */}
      {history ? (
        <div className="inv-modal" role="dialog" aria-modal="true" aria-label="Movement history" onClick={() => setHistory(null)}>
          <div className="inv-modal__card inv-modal__card--wide" onClick={(e) => e.stopPropagation()}>
            <h2 className="inv-modal__title">Movement history — {history.row.productName} · {history.row.sku}</h2>
            {history.loading ? <p className="admin__muted">Loading…</p> : (
              <div className="admin__table-wrap">
                <table className="admin__table">
                  <thead><tr><th>When</th><th>Type</th><th>Reason</th><th>Before → Δ → After</th><th>Source</th><th>Reference</th></tr></thead>
                  <tbody>
                    {history.movements.map((m) => (
                      <tr key={m.id}>
                        <td className="admin__muted" style={{ fontSize: 11 }}>{new Date(m.createdAt).toLocaleString()}</td>
                        <td>{m.movementType}</td>
                        <td>{m.reason ?? "—"}{m.note ? <div className="admin__muted" style={{ fontSize: 11 }}>{m.note}</div> : null}</td>
                        <td className="admin__mono">{m.quantityBefore} → {m.quantityDelta >= 0 ? `+${m.quantityDelta}` : m.quantityDelta} → {m.quantityAfter}</td>
                        <td>{m.sourceType}</td>
                        <td className="admin__muted">{m.reference ?? "—"}</td>
                      </tr>
                    ))}
                    {!history.movements.length ? <tr><td colSpan={6}><span className="admin__muted">No movements.</span></td></tr> : null}
                  </tbody>
                </table>
              </div>
            )}
            <div className="cfg-actions" style={{ marginTop: 12 }}><button type="button" className="ff-btn ff-btn--ghost" onClick={() => setHistory(null)}>Close</button></div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function preview(mode: AdjustMode, qty: number, onHand: number): number {
  return mode === "add" ? onHand + qty : mode === "remove" ? onHand - qty : qty;
}
function reasonLabel(reason?: string): string {
  const map: Record<string, string> = {
    below_reserved: "Rejected — the result would be below the protected reserved quantity.",
    negative_stock: "Rejected — on-hand cannot go negative.",
    variant_not_found: "Variant not found.", bad_request: "Invalid request.", zero_quantity: "Enter a non-zero quantity.",
  };
  return (reason && map[reason]) || reason || "Adjustment failed.";
}
