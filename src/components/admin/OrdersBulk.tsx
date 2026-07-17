"use client";

import { createContext, useContext, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { parseTags, bulkConfirmText, BULK_PRIORITIES, type BulkAction, type BulkUndo } from "@/lib/admin/orderBulk";

/**
 * Safe bulk-operations layer (Phase 1). A client island wrapped around the server-rendered orders
 * table: per-row checkboxes share selection via context, and a floating bar runs NON-DESTRUCTIVE
 * actions (assign / priority / tags / note / export) with confirmation, success/failure counts, and
 * undo where the action is reversible. No cancel/refund/ship here — those are deferred by design.
 */

interface StaffOpt { id: string; name: string; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Filter = Record<string, any>;

interface SelectionCtx {
  selected: Set<string>;
  allFiltered: boolean;
  toggle: (orderNumber: string) => void;
  isSelected: (orderNumber: string) => boolean;
}
const Ctx = createContext<SelectionCtx | null>(null);

/** Per-row checkbox. Reads the shared selection; a no-op outside a provider (defensive). */
export function OrderCheckbox({ orderNumber }: { orderNumber: string }) {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return (
    <input
      type="checkbox"
      className="obulk-check"
      checked={ctx.isSelected(orderNumber)}
      onChange={() => ctx.toggle(orderNumber)}
      aria-label={`Select ${orderNumber}`}
    />
  );
}

export function OrdersBulkProvider({
  children,
  pageNumbers,
  filteredCount,
  filter,
  staff,
  canExport,
}: {
  children: ReactNode;
  pageNumbers: string[];
  filteredCount: number;
  filter: Filter;
  staff: StaffOpt[];
  canExport: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allFiltered, setAllFiltered] = useState(false);
  const [pending, startTransition] = useTransition();

  const ctx = useMemo<SelectionCtx>(() => ({
    selected,
    allFiltered,
    isSelected: (n) => selected.has(n),
    toggle: (n) => {
      setAllFiltered(false);
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(n)) next.delete(n); else next.add(n);
        return next;
      });
    },
  }), [selected, allFiltered]);

  const selectPage = () => { setAllFiltered(false); setSelected(new Set(pageNumbers)); };
  const selectAllFiltered = () => { setAllFiltered(true); setSelected(new Set(pageNumbers)); };
  const clear = () => { setAllFiltered(false); setSelected(new Set()); };

  const effectiveCount = allFiltered ? filteredCount : selected.size;

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {effectiveCount > 0 ? (
        <BulkBar
          count={effectiveCount}
          allFiltered={allFiltered}
          selectedNumbers={[...selected]}
          filter={filter}
          staff={staff}
          canExport={canExport}
          pending={pending}
          onSelectPage={selectPage}
          onSelectAllFiltered={selectAllFiltered}
          onClear={clear}
          onDone={() => startTransition(() => router.refresh())}
        />
      ) : (
        <div className="obulk-hint">
          <button type="button" className="obulk-link" onClick={selectPage}>Select page ({pageNumbers.length})</button>
          {filteredCount > pageNumbers.length ? (
            <button type="button" className="obulk-link" onClick={selectAllFiltered}>Select all {filteredCount} filtered</button>
          ) : null}
        </div>
      )}
    </Ctx.Provider>
  );
}

function BulkBar({
  count, allFiltered, selectedNumbers, filter, staff, canExport, pending,
  onSelectPage, onSelectAllFiltered, onClear, onDone,
}: {
  count: number;
  allFiltered: boolean;
  selectedNumbers: string[];
  filter: Filter;
  staff: StaffOpt[];
  canExport: boolean;
  pending: boolean;
  onSelectPage: () => void;
  onSelectAllFiltered: () => void;
  onClear: () => void;
  onDone: () => void;
}) {
  const [active, setActive] = useState<BulkAction | "export" | null>(null);
  const [staffId, setStaffId] = useState("");
  const [priority, setPriority] = useState("high");
  const [tagInput, setTagInput] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [undo, setUndo] = useState<BulkUndo | null>(null);

  const base = () => (allFiltered ? { allFiltered: true, filter } : { orderNumbers: selectedNumbers });

  const post = async (payload: Record<string, unknown>, confirmText: string) => {
    if (!window.confirm(confirmText)) return;
    setBusy(true); setMsg(""); setUndo(null);
    try {
      const res = await fetch("/api/admin/orders/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...base(), ...payload }) });
      const d = await res.json();
      setBusy(false);
      if (!res.ok) { setMsg(d.error ?? "Failed"); return; }
      setMsg(`${d.done} done${d.failed?.length ? ` · ${d.failed.length} failed` : ""}`);
      if (d.undo) setUndo(d.undo);
      setActive(null);
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

  const exportSelected = () => {
    // Reuse the existing export endpoint. All-filtered → the CURRENT url's query (already in the exact
    // param format the export route reads); explicit selection → the chosen order numbers.
    const qs = allFiltered
      ? window.location.search.replace(/^\?/, "")
      : new URLSearchParams({ numbers: selectedNumbers.join(",") }).toString();
    window.open(`/api/admin/orders/export${qs ? `?${qs}` : ""}`, "_blank");
    setActive(null);
  };

  const apply = () => {
    if (active === "assign") { const name = staff.find((s) => s.id === staffId)?.name ?? "staff"; post({ action: "assign", staffId }, bulkConfirmText("assign", count, name)); }
    else if (active === "priority") post({ action: "priority", priority }, bulkConfirmText("priority", count, priority));
    else if (active === "addTags") { const tags = parseTags(tagInput); post({ action: "addTags", tags }, bulkConfirmText("addTags", count, tags.join(", "))); }
    else if (active === "removeTags") { const tags = parseTags(tagInput); post({ action: "removeTags", tags }, bulkConfirmText("removeTags", count, tags.join(", "))); }
    else if (active === "note") post({ action: "note", note: note.trim() }, bulkConfirmText("note", count, ""));
    else if (active === "export") exportSelected();
  };

  return (
    <div className="obulk-bar" role="region" aria-label="Bulk actions">
      <div className="obulk-bar__head">
        <strong>{count}</strong> selected{allFiltered ? " (all filtered)" : ""}
        <button type="button" className="obulk-link" onClick={onSelectPage}>Page</button>
        <button type="button" className="obulk-link" onClick={onSelectAllFiltered}>All filtered</button>
        <button type="button" className="obulk-link obulk-link--clear" onClick={onClear}>Clear</button>
      </div>

      <div className="obulk-bar__actions">
        <button type="button" className="ff-btn" disabled={busy} onClick={() => setActive("assign")}>Assign</button>
        <button type="button" className="ff-btn" disabled={busy} onClick={() => setActive("priority")}>Priority</button>
        <button type="button" className="ff-btn" disabled={busy} onClick={() => setActive("addTags")}>Add tags</button>
        <button type="button" className="ff-btn" disabled={busy} onClick={() => setActive("removeTags")}>Remove tags</button>
        <button type="button" className="ff-btn" disabled={busy} onClick={() => setActive("note")}>Add note</button>
        {canExport ? <button type="button" className="ff-btn" disabled={busy} onClick={() => setActive("export")}>Export</button> : null}
      </div>

      {active ? (
        <div className="obulk-bar__form">
          {active === "assign" ? (
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} aria-label="Assignee">
              <option value="">Pick staff…</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : null}
          {active === "priority" ? (
            <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Priority">
              {BULK_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          ) : null}
          {active === "addTags" || active === "removeTags" ? (
            <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="tag1, tag2" aria-label="Tags" />
          ) : null}
          {active === "note" ? (
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Internal note (audited)" aria-label="Note" />
          ) : null}
          {active === "export" ? <span className="admin__muted">Export {count} order{count === 1 ? "" : "s"} as CSV</span> : null}
          <button type="button" className="ff-btn ff-btn--primary" disabled={busy} onClick={apply}>{busy ? "…" : active === "export" ? "Download" : "Apply"}</button>
          <button type="button" className="ff-btn" disabled={busy} onClick={() => setActive(null)}>Cancel</button>
        </div>
      ) : null}

      {msg ? <div className="obulk-bar__msg">{msg}{undo ? <button type="button" className="obulk-link" disabled={busy} onClick={runUndo}>Undo</button> : null}</div> : null}
      {pending ? <span className="ff-refreshing">refreshing…</span> : null}
    </div>
  );
}
