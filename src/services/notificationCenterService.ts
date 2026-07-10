/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Admin notification center (refinement R6). DERIVED from live signals rather than
 * a push table — so it's always current and never drifts from reality (no risk of
 * a producer forgetting to emit). Each alert is an actionable condition with a
 * count + a deep link to the filtered view that resolves it.
 */
import { createAdminClient } from "@/lib/supabase/admin";

export type AlertSeverity = "info" | "warn" | "critical";
export interface AdminAlert { key: string; severity: AlertSeverity; title: string; count: number; href: string }

export async function getAdminAlerts(): Promise<AdminAlert[]> {
  const db = createAdminClient() as any;
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const alerts: AdminAlert[] = [];
  const cnt = async (build: () => Promise<{ count: number | null }>): Promise<number> => { try { return (await build()).count ?? 0; } catch { return 0; } };

  // Low stock (active variants at/below threshold) — computed in JS (column-vs-column).
  try {
    const { data } = await db.from("variants").select("stock,low_stock_threshold,is_active").eq("is_active", true);
    const low = (data ?? []).filter((v: any) => Number(v.stock) <= Number(v.low_stock_threshold ?? 0)).length;
    if (low) alerts.push({ key: "low_stock", severity: "warn", title: "Low-stock variants", count: low, href: "/admin/products" });
  } catch { /* ignore */ }

  const [returnsPending, shipExceptions, refundFailed, payFailed, emailFailed, jobsFailed] = await Promise.all([
    cnt(() => db.from("returns").select("id", { count: "exact", head: true }).eq("status", "requested")),
    cnt(() => db.from("shipments").select("id", { count: "exact", head: true }).eq("status", "exception")),
    cnt(() => db.from("refunds").select("id", { count: "exact", head: true }).eq("status", "failed")),
    cnt(() => db.from("payment_attempts").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", weekAgo)),
    cnt(() => db.from("notification_dispatches").select("id", { count: "exact", head: true }).eq("status", "failed").gte("created_at", weekAgo)),
    cnt(() => db.from("fulfillment_jobs").select("id", { count: "exact", head: true }).eq("status", "failed")),
  ]);

  if (returnsPending) alerts.push({ key: "returns_pending", severity: "info", title: "Return requests awaiting review", count: returnsPending, href: "/admin/returns" });
  if (shipExceptions) alerts.push({ key: "shipment_exception", severity: "warn", title: "Shipments in exception (NDR)", count: shipExceptions, href: "/admin/shipments" });
  if (refundFailed) alerts.push({ key: "refund_failed", severity: "critical", title: "Refunds failed", count: refundFailed, href: "/admin/orders" });
  if (payFailed) alerts.push({ key: "failed_payments", severity: "warn", title: "Failed payments (7d)", count: payFailed, href: "/admin/orders?payment=failed" });
  if (emailFailed) alerts.push({ key: "email_failed", severity: "warn", title: "Failed customer emails (7d)", count: emailFailed, href: "/admin/audit?search=email" });
  if (jobsFailed) alerts.push({ key: "jobs_failed", severity: "critical", title: "Failed background jobs", count: jobsFailed, href: "/admin/health" });

  const rank: Record<AlertSeverity, number> = { critical: 0, warn: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** Total alert count for the nav badge. */
export async function getAlertCount(): Promise<number> {
  const alerts = await getAdminAlerts();
  return alerts.reduce((s, a) => s + a.count, 0);
}
