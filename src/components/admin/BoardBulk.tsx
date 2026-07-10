"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Batch fulfillment bar — the "select many → dispatch" productivity win. Operates
 * on the eligible sets the board computed (ready-to-ship, dispatchable), so no
 * per-row checkbox juggling for the common case.
 */
export function BoardBulk({ readyToShip, dispatchable }: { readyToShip: string[]; dispatchable: string[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  if (!readyToShip.length && !dispatchable.length) return null;

  const run = async (action: string, orderNumbers: string[], key: string) => {
    if (!orderNumbers.length) return;
    setBusy(key); setMsg("");
    try {
      const res = await fetch("/api/admin/fulfillment/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, orderNumbers }) });
      const d = await res.json();
      setBusy(null);
      if (!res.ok) { setMsg(d.error ?? "Failed"); return; }
      setMsg(`${d.done} done${d.failed?.length ? ` · ${d.failed.length} failed` : ""}`);
      startTransition(() => router.refresh());
    } catch { setBusy(null); setMsg("Network error"); }
  };

  return (
    <div className="board-bulk">
      <span className="board-bulk__label">Batch</span>
      {readyToShip.length ? (
        <button type="button" className="ff-btn ff-btn--primary" disabled={busy !== null} onClick={() => run("createShipment", readyToShip, "ship")}>
          {busy === "ship" ? "…" : `Create shipments for all Ready (${readyToShip.length})`}
        </button>
      ) : null}
      {dispatchable.length ? (
        <button type="button" className="ff-btn ff-btn--primary" disabled={busy !== null} onClick={() => run("dispatch", dispatchable, "dispatch")}>
          {busy === "dispatch" ? "…" : `Dispatch all Courier-assigned (${dispatchable.length})`}
        </button>
      ) : null}
      {pending ? <span className="ff-refreshing">updating…</span> : null}
      {msg ? <span className="cfg-msg cfg-msg--ok">{msg}</span> : null}
    </div>
  );
}
