import type { Metadata } from "next";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getShipmentDetail } from "@/services/shipmentService";
import { getShipmentTimeline } from "@/services/auditService";
import { Timeline } from "@/components/admin/Timeline";
import { ShipmentActions } from "@/components/admin/ShipmentActions";
import { ShipmentNote } from "@/components/admin/ShipmentNote";
import { nextShipmentStates, toCustomerStatus, CUSTOMER_STATUS_LABEL, type ShipmentStatus, type CustomerShipmentStatus } from "@/lib/shipment/state";
import { shipmentStatusIcon, shipmentStatusLabel, providerBrand } from "@/lib/shipment/display";
import { shipmentSla, shipmentSettled } from "@/lib/shipment/sla";
import { shipmentHealth } from "@/lib/shipment/health";

/**
 * Shipment detail — `/admin/shipments/[id]`. Everything about one parcel in one place (review): the
 * summary + health/SLA verdict, courier + AWB, ship-to address, cost breakdown, weight + dimensions,
 * proof of delivery, exception history, internal notes, tracking history (shipment_events), lifecycle
 * actions, and the audit timeline. Additive reader over the existing tables. Staff view.
 */
export const metadata: Metadata = { title: "Shipment", robots: { index: false } };
export const dynamic = "force-dynamic";

const inr = (v: unknown) => `₹${Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const kg = (v: unknown) => (v != null ? `${Number(v)} kg` : "—");

export default async function ShipmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const { id } = await params;
  const detail = await getShipmentDetail(id);
  if (!detail) notFound();
  const { sh, order, events } = detail;
  const timeline = await getShipmentTimeline(id);
  const canOperate = hasCapability(staff.role, "fulfillment.operate");

  const status = sh.status as ShipmentStatus;
  const sla = shipmentSla(sh.created_at, status, sh.delivered_at ?? null);
  const health = shipmentHealth({ status, exceptionReason: sh.exception_reason ?? null, createdAt: sh.created_at, deliveredAt: sh.delivered_at ?? null, slaBreached: sla.state === "breached" });
  const brand = providerBrand(sh.provider);
  const nextStates = nextShipmentStates(status);
  const notes = timeline.filter((e) => e.event === "shipment.note");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exceptions = (events as any[]).filter((e) => e.status === "exception");
  const addr = order ? [order.ship_line1, order.ship_line2, [order.ship_city, order.ship_state, order.ship_pincode].filter(Boolean).join(", "), order.ship_country].filter(Boolean) : [];

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow"><Link href="/admin/shipments" className="od-back">← Shipments</Link></p>
        <h1 className="admin__title">{sh.awb || (order?.order_number ?? "Shipment")}</h1>
        <p className="admin__count">
          <span className="ff-status" data-s={status}>{shipmentStatusIcon(status)} {shipmentStatusLabel(status)}</span>
          <span className="oh-badge" data-h={health.tone} title={health.reason} style={{ marginLeft: 8 }}>{health.dot} {health.label}</span>
          {!shipmentSettled(status) ? <span className="bc-slabadge" data-tone={sla.tone} style={{ marginLeft: 8 }}>{sla.label}</span> : null}
          {order ? <span className="admin__muted"> · <Link href={`/admin/orders/${order.order_number}`} className="text-link">{order.order_number}</Link></span> : null}
        </p>
      </header>

      <div className="od-grid">
        {/* Summary */}
        <section className="od-card">
          <h2 className="od-card__title">Shipment</h2>
          <dl className="od-dl">
            <div><dt>Provider</dt><dd>{brand.icon} {brand.label}</dd></div>
            <div><dt>Courier</dt><dd>{sh.courier_name ?? "—"}</dd></div>
            <div><dt>AWB</dt><dd className="admin__mono">{sh.awb ?? "—"}{sh.tracking_url ? <> · <a href={sh.tracking_url} target="_blank" rel="noreferrer" className="text-link">track ↗</a></> : null}</dd></div>
            <div><dt>Customer status</dt><dd>{CUSTOMER_STATUS_LABEL[toCustomerStatus(status) as CustomerShipmentStatus]}</dd></div>
            <div><dt>Payment</dt><dd>{sh.payment_mode === "cod" ? `COD${Number(sh.cod_amount) > 0 ? ` · ${inr(sh.cod_amount)}` : ""}` : "Prepaid"}</dd></div>
            <div><dt>Created</dt><dd>{dt(sh.created_at)}</dd></div>
            {sh.delivered_at ? <div><dt>Delivered</dt><dd>{dt(sh.delivered_at)}</dd></div> : null}
            {sh.rto_at ? <div><dt>RTO at</dt><dd>{dt(sh.rto_at)}</dd></div> : null}
            {sh.label_url ? <div><dt>Label</dt><dd><a href={sh.label_url} target="_blank" rel="noreferrer" className="text-link">open ↗</a></dd></div> : null}
          </dl>
        </section>

        {/* Ship-to */}
        <section className="od-card">
          <h2 className="od-card__title">Ship to</h2>
          {order ? (
            <>
              <p className="od-name">{order.ship_full_name ?? "—"}</p>
              <p className="admin__muted" style={{ whiteSpace: "pre-line" }}>{addr.join("\n") || "—"}</p>
              {order.ship_phone ? <p className="admin__muted">{order.ship_phone}</p> : null}
              {order.email ? <p className="admin__muted">{order.email}</p> : null}
            </>
          ) : <p className="admin__muted">Order not found.</p>}
        </section>
      </div>

      <div className="od-grid">
        {/* Cost breakdown (priority 2.12) */}
        <section className="od-card">
          <h2 className="od-card__title">Cost</h2>
          <dl className="od-dl od-dl--fin">
            <div><dt>Shipping charge</dt><dd>{sh.shipping_cost != null ? inr(sh.shipping_cost) : "—"}</dd></div>
            <div><dt>Courier cost</dt><dd>{sh.courier_cost != null ? inr(sh.courier_cost) : "—"}</dd></div>
            <div><dt>Packaging</dt><dd>{sh.packaging_cost != null ? inr(sh.packaging_cost) : "—"}</dd></div>
            <div><dt>Insurance{sh.insured ? "" : " (n/a)"}</dt><dd>{sh.insurance_cost != null ? inr(sh.insurance_cost) : "—"}</dd></div>
            {Number(sh.cod_fee) > 0 ? <div><dt>COD fee</dt><dd>{inr(sh.cod_fee)}</dd></div> : null}
            {Number(sh.fuel_surcharge) > 0 ? <div><dt>Fuel surcharge</dt><dd>{inr(sh.fuel_surcharge)}</dd></div> : null}
            {Number(sh.tax_cost) > 0 ? <div><dt>Tax</dt><dd>{inr(sh.tax_cost)}</dd></div> : null}
            <div className="od-dl__net"><dt>Total logistics cost</dt><dd>{sh.total_logistics_cost != null ? inr(sh.total_logistics_cost) : "—"}</dd></div>
          </dl>
          <p className="om-field__hint">Declared value {inr(sh.declared_value)}.</p>
        </section>

        {/* Weight + dimensions */}
        <section className="od-card">
          <h2 className="od-card__title">Weight &amp; dimensions</h2>
          <dl className="od-dl">
            <div><dt>Chargeable</dt><dd>{kg(sh.chargeable_weight_kg)}</dd></div>
            <div><dt>Net</dt><dd>{kg(sh.net_weight_kg)}</dd></div>
            <div><dt>Packaging</dt><dd>{kg(sh.packaging_weight_kg)}</dd></div>
            <div><dt>Volumetric</dt><dd>{kg(sh.volumetric_weight_kg)}</dd></div>
            <div><dt>Dimensions</dt><dd>{sh.length_cm ? `${sh.length_cm}×${sh.width_cm}×${sh.height_cm} cm` : "—"}</dd></div>
          </dl>
        </section>
      </div>

      <div className="od-grid">
        {/* Proof of delivery (priority: placeholder) */}
        <section className="od-card">
          <h2 className="od-card__title">Proof of delivery</h2>
          {status === "delivered" ? (
            <>
              <p className="od-name">{sh.delivered_to ? `Received by ${sh.delivered_to}` : "Delivered"}</p>
              {sh.pod_note ? <p className="admin__muted">{sh.pod_note}</p> : null}
              <p className="admin__muted">{dt(sh.delivered_at)}</p>
              <p className="om-field__hint">Signature / delivery photo capture is post-launch (courier integration).</p>
            </>
          ) : <p><span className="pending-badge">Awaiting POD</span></p>}
        </section>

        {/* Exception history */}
        <section className="od-card">
          <h2 className="od-card__title">Exceptions ({exceptions.length})</h2>
          {sh.exception_reason ? <p className="bc-inv" data-inv="missing">Current: {sh.exception_reason}</p> : null}
          {exceptions.length ? (
            <ul className="ship-events">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {exceptions.map((e: any) => <li key={e.id}><span className="admin__muted">{dt(e.created_at)}</span> — {e.description || "Exception"}{e.location ? ` · ${e.location}` : ""}</li>)}
            </ul>
          ) : (sh.exception_reason ? null : <p className="admin__muted">No exceptions recorded.</p>)}
        </section>
      </div>

      {/* Tracking history (shipment_events) */}
      <section className="od-section">
        <h2 className="od-card__title">Tracking history ({events.length})</h2>
        {events.length ? (
          <ol className="ship-track">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(events as any[]).map((e) => (
              <li key={e.id} className="ship-track__row">
                <span className="ship-track__icon" aria-hidden>{shipmentStatusIcon(e.status)}</span>
                <span className="ship-track__status">{shipmentStatusLabel(e.status)}{e.description ? <span className="admin__muted"> · {e.description}</span> : null}</span>
                <span className="admin__muted">{e.location ? `${e.location} · ` : ""}{dt(e.created_at)} · {e.source}</span>
              </li>
            ))}
          </ol>
        ) : <p className="admin__muted">No tracking events yet.</p>}
      </section>

      {/* Internal notes (priority 2.10) */}
      <section className="od-section">
        <h2 className="od-card__title">Internal notes ({notes.length})</h2>
        {notes.length ? (
          <ul className="ship-events">
            {notes.map((e) => <li key={e.id}><span className="admin__muted">{dt(e.created_at)} · {e.actorName || e.actor_type}</span> — {e.notes}</li>)}
          </ul>
        ) : <p className="admin__muted">No notes yet.</p>}
        {canOperate ? <ShipmentNote shipmentId={sh.id} /> : null}
      </section>

      {/* Lifecycle */}
      {canOperate ? (
        <section className="od-section">
          <h2 className="od-card__title">Lifecycle</h2>
          <ShipmentActions shipmentId={sh.id} status={status} nextStates={nextStates} hasLabel={Boolean(sh.label_url)} providerShipmentId={Boolean(sh.provider_shipment_id)} />
        </section>
      ) : null}

      {/* Audit timeline (collapsed) */}
      <details className="od-group" open={timeline.length <= 8}>
        <summary className="od-group__sum">Audit timeline <span className="count-badge">{timeline.length}</span></summary>
        <Timeline events={timeline} bare />
      </details>
    </main>
  );
}
