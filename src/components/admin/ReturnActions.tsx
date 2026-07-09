"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ReturnStatus } from "@/lib/returns/state";

const LABEL: Record<string, string> = {
  approved: "Approve",
  rejected: "Reject",
  pickup_scheduled: "Schedule Pickup",
  received: "Mark Received",
  qc: "Start QC",
  refund: "Refund & Restock",
  closed: "Close",
};

export function ReturnActions({ returnId, nextStates }: { returnId: string; nextStates: ReturnStatus[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const disabled = busy !== null || pending;

  const advance = async (to: ReturnStatus) => {
    setBusy(to);
    setErr("");
    try {
      const res = await fetch("/api/admin/returns/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnId, to }),
      });
      const d = await res.json();
      if (!res.ok) {
        setErr(d.error ?? "Failed");
        setBusy(null);
        return;
      }
      startTransition(() => router.refresh());
    } catch {
      setErr("Network error");
    }
    setBusy(null);
  };

  if (!nextStates.length) return <span className="ff-done">✓ Closed</span>;

  const forward = nextStates.filter((s) => s !== "rejected");
  const canReject = nextStates.includes("rejected");

  return (
    <div className="ff-actions">
      {forward.map((s) => (
        <button key={s} type="button" disabled={disabled} onClick={() => advance(s)} className={`ff-btn${s === "refund" ? " ff-btn--primary" : ""}`}>
          {busy === s ? "…" : LABEL[s] ?? s}
        </button>
      ))}
      {canReject ? (
        <button type="button" disabled={disabled} onClick={() => advance("rejected")} className="ff-btn ff-btn--danger">
          {busy === "rejected" ? "…" : "Reject"}
        </button>
      ) : null}
      {pending ? <span className="ff-refreshing">updating…</span> : null}
      {err ? <span className="ff-err">{err}</span> : null}
    </div>
  );
}
