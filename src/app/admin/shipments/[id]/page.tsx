import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getShipmentDetail } from "@/services/shipmentService";
import { getShipmentTimeline } from "@/services/auditService";
import { getOrderNotifications } from "@/services/notificationService";
import { ShipmentTimelineFilter } from "@/components/admin/ShipmentTimelineFilter";
import { ShipmentActions } from "@/components/admin/ShipmentActions";
import { ShipmentNote } from "@/components/admin/ShipmentNote";
import { ShipmentCostEditor } from "@/components/admin/ShipmentCostEditor";
import { CopyButton } from "@/components/admin/CopyButton";
import { nextShipmentStates, toCustomerStatus, CUSTOMER_STATUS_LABEL, type ShipmentStatus, type CustomerShipmentStatus } from "@/lib/shipment/state";
import { shipmentStatusIcon, shipmentStatusLabel, providerBrand, shipmentPriorityBadge, isManualProvider } from "@/lib/shipment/display";
import { shipmentSla, shipmentSettled } from "@/lib/shipment/sla";
import { shipmentHealth } from "@/lib/shipment/health";

/**
 * Shipment detail — `/admin/shipments/[id]`. One parcel, in collapsible sections (mirrors the return
 * detail): summary + priority + health/SLA, ship-to with contact + copy, an audited cost/weight
 * editor, tracking history, exception history, internal notes, customer notifications, and a filtered
 * audit timeline. Quick actions (view order, copy AWB, call/email/WhatsApp, print, courier tracking)
 * sit up top. Additive readers over the existing tables. Staff view.
 */
export const metadata: Metadata = { title: "Shipment", robots: { index: false } };
export const dynamic = "force-dynamic";

const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const num = (v: unknown) => (v != null ? Number(v) : null);
const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, "").replace(/^0+/, "").replace(/^(\d{10})$/, "91$1")}`;
const EVENT_LABEL = (e: string) => e.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const SHIP_NOTIFY = /(dispatch|deliver|transit|shipment|shipping|rto|exception|out_for)/i;

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const { id } = await params;
  const detail = await getShipmentDetail(id);
  if (!detail) notFound();
  const { sh, order, events } = detail;
  const [timeline, notifications] = await Promise.all([getShipmentTimeline(id), getOrderNotifications(sh.order_id)]);
  const canOperate = hasCapability(staff.role, "fulfillment.operate");

  const status = sh.status as ShipmentStatus;
  const sla = shipmentSla(sh.created_at, status, sh.delivered_at ?? null);
  const health = shipmentHealth({ status, exceptionReason: sh.exception_reason ?? null, createdAt: sh.created_at, deliveredAt: sh.delivered_at ?? null, slaBreached: sla.state === "breached" });
  const brand = providerBrand(sh.provider);
  const manual = isManualProvider(sh.provider);
  const prio = shipmentPriorityBadge(order?.priority);
  const nextStates = nextShipmentStates(status);
  const notes = timeline.filter((e) => e.event === "shipment.note");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evList = events as any[];
  const exceptions = evList.filter((e) => e.status === "exception");
  const addr = order ? [order.ship_line1, order.ship_line2, [order.ship_city, order.ship_state, order.ship_pincode].filter(Boolean).join(", "), order.ship_country].filter(Boolean) : [];
  const addrText = order ? [order.ship_full_name, ...addr, order.ship_phone].filter(Boolean).join("\n") : "";
  const shipNotifs = notifications.filter((n) => SHIP_NOTIFY.test(n.event));

  const costValues = { shipping_cost: num(sh.shipping_cost), courier_cost: num(sh.courier_cost), packaging_cost: num(sh.packaging_cost), insurance_cost: num(sh.insurance_cost), fuel_surcharge: num(sh.fuel_surcharge), cod_fee: num(sh.cod_fee), tax_cost: num(sh.tax_cost), total_logistics_cost: num(sh.total_logistics_cost) };
  const weightValues = { packaging_weight_kg: num(sh.packaging_weight_kg), chargeable_weight_kg: num(sh.chargeable_weight_kg), net_weight_kg: num(sh.net_weight_kg), shipping_weight_kg: num(sh.shipping_weight_kg), volumetric_weight_kg: num(sh.volumetric_weight_kg), length_cm: num(sh.length_cm), width_cm: num(sh.width_cm), height_cm: num(sh.height_cm) };

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow"><Link href="/admin/shipments" className="od-back">← Shipments</Link></p>
        <h1 className="admin__title">{sh.awb || (order?.order_number ?? "Shipment")}</h1>
        <p className="admin__count">
          <span className="ff-status" data-s={status}>{shipmentStatusIcon(status)} {shipmentStatusLabel(status)}</span>
          {prio ? <span className="bc-eff" data-p={prio.p} style={{ marginLeft: 8 }}>{prio.label}</span> : null}
          <span className="oh-badge" data-h={health.tone} title={health.reason} style={{ marginLeft: 8 }}>{health.dot} {health.label}</span>
          {!shipmentSettled(status) ? <span className="bc-slabadge" data-tone={sla.tone} style={{ marginLeft: 8 }}>{sla.label}</span> : null}
        </p>
      </header>

      {/* Quick actions (review A–E, G, H) */}
      <div className="ship-quick">
        {order ? <Link href={`/admin/orders/${order.order_number}`} className="ff-btn ff-btn--primary">View Order →</Link> : null}
        {sh.awb ? <CopyButton text={sh.awb} label="AWB" title="Copy AWB" /> : null}
        {order ? <CopyButton text={addrText} label="Address" title="Copy ship-to address" /> : null}
        {order?.ship_phone ? <a className="ff-btn" href={`tel:${order.ship_phone}`}>☎ Call</a> : null}
        {order?.email ? <a className="ff-btn" href={`mailto:${order.email}`}>📧 Email</a> : null}
        {order?.ship_phone ? <a className="ff-btn" href={waLink(order.ship_phone)} target="_blank" rel="noreferrer">💬 WhatsApp</a> : null}
        {sh.tracking_url ? <a className="ff-btn" href={sh.tracking_url} target="_blank" rel="noreferrer">🔗 Open Courier Tracking</a> : null}
        <a className="ff-btn" href={`/api/admin/shipments/packing-slips?ids=${sh.id}`} target="_blank" rel="noreferrer">🖨 Packing slip</a>
        {sh.label_url ? <a className="ff-btn" href={sh.label_url} target="_blank" rel="noreferrer">🏷️ Label</a> : null}
      </div>

      {/* Shipment + ship-to */}
      <details className="od-group" open>
        <summary className="od-group__sum">Shipment</summary>
        <div className="od-grid">
          <section className="od-card">
            <h2 className="od-card__title">Summary</h2>
            <dl className="od-dl">
              <div><dt>Provider</dt><dd>{brand.icon} {brand.label}</dd></div>
              <div><dt>Courier</dt><dd>{sh.courier_name ?? "—"}</dd></div>
              <div><dt>AWB</dt><dd className="admin__mono">{sh.awb ?? "—"}</dd></div>
              <div><dt>Customer status</dt><dd>{CUSTOMER_STATUS_LABEL[toCustomerStatus(status) as CustomerShipmentStatus]}</dd></div>
              <div><dt>Payment</dt><dd>{sh.payment_mode === "cod" ? `COD${Number(sh.cod_amount) > 0 ? ` · ${inr(sh.cod_amount)}` : ""}` : "Prepaid"}</dd></div>
              <div><dt>Created</dt><dd>{dt(sh.created_at)}</dd></div>
              {sh.delivered_at ? <div><dt>Delivered</dt><dd>{dt(sh.delivered_at)}</dd></div> : null}
              {sh.rto_at ? <div><dt>RTO at</dt><dd>{dt(sh.rto_at)}</dd></div> : null}
            </dl>
          </section>
          <section className="od-card">
            <h2 className="od-card__title">Ship to {order ? <CopyButton text={addrText} label="Copy" /> : null}</h2>
            {order ? (
              <>
                <p className="od-name">{order.ship_full_name ?? "—"}{prio ? <span className="bc-eff" data-p={prio.p} style={{ marginLeft: 8 }}>{prio.label}</span> : null}</p>
                <p className="admin__muted" style={{ whiteSpace: "pre-line" }}>{addr.join("\n") || "—"}</p>
                {order.ship_phone ? <p className="admin__muted">{order.ship_phone}</p> : null}
                {order.email ? <p className="admin__muted">{order.email}</p> : null}
              </>
            ) : <p className="admin__muted">Order not found.</p>}
          </section>
        </div>
      </details>

      {/* Costs (editable, audited) */}
      <details className="od-group" open>
        <summary className="od-group__sum">Costs</summary>
        <section className="od-card">
          <ShipmentCostEditor shipmentId={sh.id} manual={manual} canEdit={canOperate} section="costs" values={costValues} />
          <p className="om-field__hint">Total logistics cost = courier + packaging + insurance + COD + fuel + GST (18%). Shipping charge is what the customer paid (revenue), shown for reference. Declared value {inr(sh.declared_value)}.{manual ? "" : " Courier-provided costs are locked; an edit is an audited override."}</p>
        </section>
      </details>

      {/* Weight & dimensions (editable, audited) */}
      <details className="od-group" open>
        <summary className="od-group__sum">Weight &amp; dimensions</summary>
        <section className="od-card">
          <ShipmentCostEditor shipmentId={sh.id} manual={manual} canEdit={canOperate} section="weights" values={weightValues} />
          <p className="om-field__hint">Net (product) weight comes from the order and is read-only; package weight + dimensions are operationally editable{manual ? "" : "; chargeable weight is courier-calculated (read-only)"}. Volumetric + total package weight recompute automatically.</p>
        </section>
      </details>

      {/* Tracking history */}
      <details className="od-group" open={events.length > 0}>
        <summary className="od-group__sum">Tracking history <span className="count-badge" data-empty={events.length === 0}>{events.length}</span></summary>
        {events.length ? (
          <ol className="ship-track">
            {evList.map((e) => (
              <li key={e.id} className="ship-track__row">
                <span className="ship-track__icon" aria-hidden>{shipmentStatusIcon(e.status)}</span>
                <span className="ship-track__status">{shipmentStatusLabel(e.status)}{e.description ? <span className="admin__muted"> · {e.description}</span> : null}</span>
                <span className="admin__muted">{e.location ? `${e.location} · ` : ""}{dt(e.created_at)} · {e.source}</span>
              </li>
            ))}
          </ol>
        ) : <p className="admin__muted">No tracking events yet.</p>}
      </details>

      {/* Exception history (review I) */}
      <details className="od-group" open={exceptions.length > 0 || !!sh.exception_reason}>
        <summary className="od-group__sum">Exceptions <span className="count-badge" data-empty={exceptions.length === 0}>{exceptions.length}</span></summary>
        <section className="od-card">
          {sh.exception_reason && status === "exception" ? <p className="bc-inv" data-inv="missing">Open: {sh.exception_reason}</p> : null}
          {exceptions.length ? (
            <div className="admin__table-wrap">
              <table className="admin__table">
                <thead><tr><th>Date</th><th>Reason</th><th>Operator</th><th>Resolved</th></tr></thead>
                <tbody>
                  {exceptions.map((e) => {
                    const resolved = evList.some((x) => new Date(x.created_at).getTime() > new Date(e.created_at).getTime() && ["in_transit", "out_for_delivery", "delivered", "rto"].includes(x.status));
                    return (
                      <tr key={e.id}>
                        <td className="admin__muted">{dt(e.created_at)}</td>
                        <td>{e.description || "—"}</td>
                        <td className="admin__muted">{e.source ?? "—"}</td>
                        <td>{resolved ? <span className="adm-badge" data-b="fraudok">Resolved</span> : <span className="pending-badge">Open</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : <p className="admin__muted">No exceptions recorded.</p>}
        </section>
      </details>

      {/* Cost / weight breakdown quick facts */}
      <details className="od-group">
        <summary className="od-group__sum">Proof of delivery</summary>
        <section className="od-card">
          {status === "delivered" ? (
            <>
              <p className="od-name">{sh.delivered_to ? `Received by ${sh.delivered_to}` : "Delivered"}</p>
              {sh.pod_note ? <p className="admin__muted">{sh.pod_note}</p> : null}
              <p className="admin__muted">{dt(sh.delivered_at)}</p>
              <p className="om-field__hint">Signature / delivery photo capture is post-launch (courier integration).</p>
            </>
          ) : <p><span className="pending-badge">Awaiting POD</span></p>}
        </section>
      </details>

      {/* Customer notifications (review J) */}
      <details className="od-group" open={shipNotifs.length > 0}>
        <summary className="od-group__sum">Customer notifications <span className="count-badge" data-empty={shipNotifs.length === 0}>{shipNotifs.length}</span></summary>
        <section className="od-card">
          {shipNotifs.length ? shipNotifs.map((n, i) => (
            <div key={i} className="od-line"><span>{EVENT_LABEL(n.event)} · {n.channel}</span><span className="om-pay" data-tone={n.status === "sent" ? "paid" : n.status === "failed" ? "failed" : "pending"}>{n.status}</span><span className="admin__muted">{dt(n.created_at)}</span></div>
          )) : <p className="admin__muted">No shipment notifications sent yet.</p>}
        </section>
      </details>

      {/* Internal notes */}
      <details className="od-group" open={notes.length > 0}>
        <summary className="od-group__sum">Internal notes <span className="count-badge" data-empty={notes.length === 0}>{notes.length}</span></summary>
        <section className="od-card">
          {notes.length ? (
            <ul className="ship-events">
              {notes.map((e) => <li key={e.id}><span className="admin__muted">{dt(e.created_at)} · {e.actorName || e.actor_type}</span> — {e.notes}</li>)}
            </ul>
          ) : <p className="admin__muted">No notes yet.</p>}
          {canOperate ? <ShipmentNote shipmentId={sh.id} /> : null}
        </section>
      </details>

      {/* Lifecycle */}
      {canOperate ? (
        <section className="od-section">
          <h2 className="od-card__title">Lifecycle</h2>
          <ShipmentActions shipmentId={sh.id} status={status} nextStates={nextStates} hasLabel={Boolean(sh.label_url)} providerShipmentId={Boolean(sh.provider_shipment_id)} />
        </section>
      ) : null}

      {/* Audit timeline with filters (review F) */}
      <details className="od-group">
        <summary className="od-group__sum">Audit timeline <span className="count-badge">{timeline.length}</span></summary>
        <ShipmentTimelineFilter events={timeline} />
      </details>
    </main>
  );
}
