import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getRecentAuditEvents } from "@/services/auditService";

/**
 * Activity — `/admin/audit`. The platform-wide immutable event feed (every business
 * action across order/fulfillment/shipment/return/refund/settings). Read-only;
 * order numbers + staff names resolved so it reads in plain language.
 */
export const metadata: Metadata = { title: "Activity", robots: { index: false } };
export const dynamic = "force-dynamic";

const dt = (v: string) => new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const EVENT_LABEL = (e: string) => e.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const TONE: Record<string, string> = { order: "paid", shipment: "pending", fulfillment: "refundprog", return: "pending", payment: "refunded", settings: "pending", rule: "pending" };

export default async function AuditPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");

  const events = await getRecentAuditEvents({ limit: 200 });

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Insights · {staff.role}</p>
        <h1 className="admin__title">Activity</h1>
        <p className="admin__count">{events.length} recent events · newest first</p>
      </header>

      <ol className="od-timeline od-timeline--feed">
        {events.map((e) => (
          <li key={e.id} className="od-tl">
            <span className="od-tl__time">{dt(e.created_at)}</span>
            <span className="od-tl__event">
              <span className="au-entity" data-e={TONE[e.entity_type] ?? "pending"}>{e.entity_type}</span>
              {" "}{EVENT_LABEL(e.event)}
              {e.previous_state && e.new_state ? <span className="admin__muted"> · {e.previous_state}→{e.new_state}</span> : null}
              {e.orderNumber ? <> · <Link href={`/admin/orders/${e.orderNumber}`} className="admin__mono">{e.orderNumber}</Link></> : null}
            </span>
            <span className="od-tl__actor admin__muted">{e.actorName ?? e.actor_type}{e.notes ? ` · ${e.notes}` : ""}</span>
          </li>
        ))}
        {events.length === 0 ? <li className="admin__muted">No activity yet.</li> : null}
      </ol>
    </main>
  );
}
