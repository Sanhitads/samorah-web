"use client";

import { useEffect, useState } from "react";
import type { OrderContext } from "@/lib/admin/orderDialogs";

/**
 * Fetch the read-only per-order context both commercial dialogs need (money breakdown, items,
 * refund history, timeline). Enhancement-only: if it fails, the dialog still works with the summary
 * values it already has — the context just enriches the preview. Fetches once per activation.
 */
export function useOrderContext(orderNumber: string, active: boolean): { ctx: OrderContext | null; loading: boolean } {
  const [ctx, setCtx] = useState<OrderContext | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    setLoading(true);
    setCtx(null);
    fetch(`/api/admin/orders/${encodeURIComponent(orderNumber)}/context`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d?.ok) setCtx(d as OrderContext); })
      .catch(() => { /* enhancement-only — the action proceeds without it */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [orderNumber, active]);

  return { ctx, loading };
}
