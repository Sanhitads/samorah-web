import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getRecentAuditEvents } from "@/services/auditService";
import { eventSeverity } from "@/lib/audit/severity";

/**
 * Activity — `/admin/audit`. The platform-wide immutable event feed (every business
 * action). Filterable (entity/search/since), colour-coded by severity, CSV export.
 */
export const metadata: Metadata = { title: "Activity", robots: { index: false } };
export const dynamic = "force-dynamic";

const dt = (v: string) => new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const EVENT_LABEL = (e: string) => e.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const ENTITIES = ["order", "shipment", "fulfillment", "return", "payment", "product", "settings", "rule"];
const ACTORS = ["staff", "system", "webhook", "customer"];

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string; actor?: string; search?: string; since?: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canExport = hasCapability(staff.role, "data.export");

  const sp = await searchParams;
  const since = sp.since ? new Date(sp.since).toISOString() : undefined;
  const events = await getRecentAuditEvents({ limit: 300, entityType: sp.entity, actorType: sp.actor, search: sp.search, since });
  const qs = new URLSearchParams(Object.entries({ entity: sp.entity, actor: sp.actor, search: sp.search, since: sp.since }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Insights · {staff.role}</p>
        <h1 className="admin__title">Activity</h1>
        <p className="admin__count">{events.length} events · newest first</p>
      </header>

      <form className="adm-filters" method="get">
        <input className="adm-filters__search" type="search" name="search" defaultValue={sp.search ?? ""} placeholder="Search event or note…" />
        <select name="entity" defaultValue={sp.entity ?? ""}>
          <option value="">All modules</option>
          {ENTITIES.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select name="actor" defaultValue={sp.actor ?? ""}>
          <option value="">Any actor</option>
          {ACTORS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input type="date" name="since" defaultValue={sp.since ?? ""} />
        <button type="submit" className="ff-btn ff-btn--primary">Apply</button>
        {sp.entity || sp.actor || sp.search || sp.since ? <a href="/admin/audit" className="ff-btn">Clear</a> : null}
        {canExport ? <a className="ff-btn adm-filters__export" href={`/api/admin/audit/export${qs ? `?${qs}` : ""}`}>Export CSV</a> : null}
      </form>

      <ol className="od-timeline od-timeline--feed">
        {events.map((e) => (
          <li key={e.id} className="od-tl" data-sev={eventSeverity(e.event)}>
            <span className="od-tl__time"><span className="au-dot" data-sev={eventSeverity(e.event)} aria-hidden />{dt(e.created_at)}</span>
            <span className="od-tl__event">
              <span className="au-entity">{e.entity_type}</span>{" "}{EVENT_LABEL(e.event)}
              {e.previous_state && e.new_state ? <span className="admin__muted"> · {e.previous_state}→{e.new_state}</span> : null}
              {e.orderNumber ? <> · <Link href={`/admin/orders/${e.orderNumber}`} className="admin__mono">{e.orderNumber}</Link></> : null}
            </span>
            <span className="od-tl__actor"><span className="au-actor" data-actor={e.actor_type}>{e.actorName ?? e.actor_type}</span>{e.notes ? <span className="admin__muted"> · {e.notes}</span> : null}</span>
          </li>
        ))}
        {events.length === 0 ? <li className="admin__muted" style={{ padding: 16 }}>No activity matches.</li> : null}
      </ol>
    </main>
  );
}
