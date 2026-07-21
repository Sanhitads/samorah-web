import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getShipmentsQueue, getShipmentCounts, getShipmentCourierOptions, type ShipmentFilter } from "@/services/shipmentService";
import { ShipmentActions } from "@/components/admin/ShipmentActions";
import { ShipmentSelectionProvider, ShipmentCheckbox } from "@/components/admin/ShipmentSelection";
import { ShipmentProgress } from "@/components/admin/ShipmentProgress";
import { CUSTOMER_STATUS_LABEL, type CustomerShipmentStatus } from "@/lib/shipment/state";
import { SHIPMENT_STATUSES } from "@/lib/shipment/state";
import { shipmentStatusIcon, shipmentStatusLabel, providerBrand, shipmentPriorityBadge, SHIPMENT_STATUS_LABEL } from "@/lib/shipment/display";
import { shipmentSettled, shipmentEta, shipmentAgeDays, shipmentMovement } from "@/lib/shipment/sla";

/**
 * Shipment Management — `/admin/shipments`. The post-dispatch board, brought to the operational
 * maturity of Orders/Fulfillment/Returns (review): a morning analytics strip, global search +
 * filters, safe bulk operations, per-parcel SLA + health verdicts, status icons + courier branding,
 * and a clickable AWB into the shipment detail page. Additive over the same state machine + APIs.
 */
export const metadata: Metadata = { title: "Shipments", robots: { index: false } };
export const dynamic = "force-dynamic";

const WHOLESALE_FILTERS = [{ v: "any", l: "Wholesale or B2B" }, { v: "wholesale_order", l: "Wholesale order" }, { v: "b2b_customer", l: "B2B customer" }];
const DATE_RANGES = [{ v: "today", l: "Today" }, { v: "7d", l: "Last 7 days" }, { v: "30d", l: "Last 30 days" }];
const shortDate = (ms: number) => new Date(ms).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

interface ShipmentSearchParams {
  search?: string; status?: string; courier?: string; provider?: string; payment?: string;
  wholesale?: string; range?: string; exception?: string; rto?: string;
}

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<ShipmentSearchParams> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canOperate = hasCapability(staff.role, "fulfillment.operate");

  const sp = await searchParams;
  const filter: ShipmentFilter = {
    search: sp.search, status: sp.status, courier: sp.courier, provider: sp.provider,
    payment: sp.payment, wholesale: sp.wholesale, range: sp.range,
    exception: sp.exception === "1", rto: sp.rto === "1",
  };
  const [rows, counts, courierOptions] = await Promise.all([
    getShipmentsQueue(filter), getShipmentCounts(), getShipmentCourierOptions(),
  ]);
  const anyFilter = Object.entries(sp).some(([, v]) => v);
  const now = Date.now();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Shipment Management · {staff.role}</p>
        <h1 className="admin__title">Shipments</h1>
        <p className="admin__count">{rows.length} {rows.length === 1 ? "shipment" : "shipments"}{anyFilter ? " · filtered" : ""}</p>
      </header>

      {/* Analytics strip (priority 1.3) — the morning operations check */}
      <div className="oms-strip">
        <a href="/admin/shipments?range=today" className="oms-stat oms-stat--link" data-active={sp.range === "today" ? "1" : undefined}><span className="oms-stat__n">{counts.today}</span><span className="oms-stat__l">Today</span></a>
        <a href="/admin/shipments?status=in_transit" className="oms-stat oms-stat--link" data-active={sp.status === "in_transit" ? "1" : undefined}><span className="oms-stat__n">{counts.inTransit}</span><span className="oms-stat__l">In Transit</span></a>
        <a href="/admin/shipments?status=out_for_delivery" className="oms-stat oms-stat--link" data-active={sp.status === "out_for_delivery" ? "1" : undefined}><span className="oms-stat__n">{counts.outForDelivery}</span><span className="oms-stat__l">Out for Delivery</span></a>
        <a href="/admin/shipments?status=delivered" className="oms-stat oms-stat--link" data-active={sp.status === "delivered" ? "1" : undefined}><span className="oms-stat__n">{counts.delivered}</span><span className="oms-stat__l">Delivered</span></a>
        <a href="/admin/shipments?rto=1" className="oms-stat oms-stat--link" data-tone={counts.rto ? "over" : undefined} data-active={sp.rto === "1" ? "1" : undefined}><span className="oms-stat__n">{counts.rto}</span><span className="oms-stat__l">RTO</span></a>
        <a href="/admin/shipments?exception=1" className="oms-stat oms-stat--link" data-tone={counts.exceptions ? "warn" : undefined} data-active={sp.exception === "1" ? "1" : undefined}><span className="oms-stat__n">{counts.exceptions}</span><span className="oms-stat__l">Exceptions</span></a>
        <div className="oms-stat"><span className="oms-stat__n">{counts.avgDeliveryDays != null ? `${counts.avgDeliveryDays}d` : "—"}</span><span className="oms-stat__l">Avg delivery</span></div>
      </div>

      {/* Filters + search (priorities 1.1, 1.2) */}
      <form className="adm-filters" method="get">
        <input className="adm-filters__search" type="search" name="search" defaultValue={sp.search ?? ""} placeholder="Search order #, AWB, customer, courier, phone…" />
        <select name="status" defaultValue={sp.status ?? ""} aria-label="Status">
          <option value="">Any status</option>
          {SHIPMENT_STATUSES.map((s) => <option key={s} value={s}>{SHIPMENT_STATUS_LABEL[s] ?? s}</option>)}
        </select>
        <select name="courier" defaultValue={sp.courier ?? ""} aria-label="Courier">
          <option value="">Any courier</option>
          {courierOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select name="provider" defaultValue={sp.provider ?? ""} aria-label="Dispatch type">
          <option value="">Manual + Provider</option>
          <option value="manual">Manual dispatch</option>
          <option value="provider">Courier provider</option>
        </select>
        <select name="payment" defaultValue={sp.payment ?? ""} aria-label="Payment">
          <option value="">COD + Prepaid</option>
          <option value="cod">COD</option>
          <option value="prepaid">Prepaid</option>
        </select>
        <select name="wholesale" defaultValue={sp.wholesale ?? ""} aria-label="Wholesale">
          <option value="">Any wholesale</option>
          {WHOLESALE_FILTERS.map((w) => <option key={w.v} value={w.v}>{w.l}</option>)}
        </select>
        <select name="range" defaultValue={sp.range ?? ""} aria-label="Date range">
          <option value="">All time</option>
          {DATE_RANGES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
        </select>
        <label className="adm-filters__check"><input type="checkbox" name="exception" value="1" defaultChecked={sp.exception === "1"} /> Exceptions</label>
        <label className="adm-filters__check"><input type="checkbox" name="rto" value="1" defaultChecked={sp.rto === "1"} /> RTO</label>
        <button type="submit" className="ff-btn ff-btn--primary">Apply</button>
        {anyFilter ? <a href="/admin/shipments" className="ff-btn">Clear</a> : null}
      </form>

      <ShipmentSelectionProvider ids={rows.map((r) => r.id)} couriers={courierOptions}>
        <div className="admin__table-wrap">
          <table className="admin__table admin__table--board">
            <thead>
              <tr>
                {canOperate ? <th className="obulk-th" aria-label="Select"></th> : null}
                <th>Order</th>
                <th>Provider / Courier</th>
                <th>AWB</th>
                <th>Status</th>
                <th>Health</th>
                <th>Weight / Cost</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const brand = providerBrand(s.provider);
                const prio = shipmentPriorityBadge(s.priority);
                const settled = shipmentSettled(s.status);
                const age = shipmentAgeDays(s.createdAt, now);
                const eta = shipmentEta(s.createdAt, s.sla.targetHrs, now);
                const move = shipmentMovement(s.lastTrackingAt, s.status, now);
                return (
                  <tr key={s.id}>
                    {canOperate ? <td className="obulk-td"><ShipmentCheckbox shipmentId={s.id} /></td> : null}
                    <td>
                      <div className="admin__mono">{s.orderNumber}{prio ? <span className="prio-badge" data-p={prio.p}>{prio.dot} {prio.label}</span> : null}</div>
                      {s.customerName ? <div className="admin__muted">{s.customerName}</div> : null}
                      <div className="ship-tagrow">
                        {s.isCod ? <span className="adm-badge" data-b="rush">COD</span> : null}
                        {s.tags.map((t) => <span key={t} className="ship-tag">{t}</span>)}
                      </div>
                    </td>
                    <td>
                      <div title={s.provider}>{brand.icon} {brand.label}</div>
                      {s.courierName && s.courierName !== brand.label ? <div className="admin__muted">{s.courierName}</div> : null}
                    </td>
                    <td className="admin__mono">
                      <Link href={`/admin/shipments/${s.id}`} className="od-link">{s.awb ?? "detail →"}</Link>
                      {s.trackingUrl && s.awb ? <div><a className="admin__muted" href={s.trackingUrl} target="_blank" rel="noreferrer">track ↗</a></div> : null}
                    </td>
                    <td>
                      <span className="ff-status" data-s={s.status}>{shipmentStatusIcon(s.status)} {shipmentStatusLabel(s.status)}</span>
                      <ShipmentProgress status={s.status} compact />
                      {s.exceptionReason ? <div className="bc-inv" data-inv="missing">{s.exceptionReason}</div> : null}
                      {!settled ? (
                        <div className="ship-signals">
                          <span className="ship-eta" data-tone={eta.daysRemaining < 0 ? "over" : eta.daysRemaining <= 1 ? "warn" : undefined}>ETA {shortDate(eta.dateMs)} · {eta.daysRemaining >= 0 ? `${eta.daysRemaining}d left` : `${Math.abs(eta.daysRemaining)}d late`}</span>
                          <span className="admin__muted">{age}d old</span>
                          {move.stalled ? <span className="ship-nomove">⚠ No movement · {move.days}d</span> : null}
                        </div>
                      ) : <div className="admin__muted">{s.customerStatus === "delivered" && s.deliveredAt ? `Delivered ${shortDate(new Date(s.deliveredAt).getTime())}` : CUSTOMER_STATUS_LABEL[s.customerStatus as CustomerShipmentStatus]}</div>}
                    </td>
                    <td>
                      <span className="oh-badge" data-h={s.health.tone} title={s.health.reason}>{s.health.dot} {s.health.label}</span>
                    </td>
                    <td className="admin__muted">
                      {s.chargeableWeightKg != null ? `${s.chargeableWeightKg} kg` : "—"}
                      {s.declaredValue != null ? <div className="ship-value">₹{s.declaredValue.toLocaleString("en-IN")}</div> : null}
                      {s.totalCost != null ? <div className="admin__muted">cost ₹{s.totalCost.toFixed(2)}</div> : null}
                    </td>
                    <td>
                      {canOperate ? (
                        <ShipmentActions shipmentId={s.id} status={s.status} nextStates={s.nextStates} hasLabel={Boolean(s.labelUrl)} providerShipmentId={s.hasProviderShipmentId} />
                      ) : <span className="admin__muted">—</span>}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr><td colSpan={canOperate ? 8 : 7} className="admin__empty">No shipments{anyFilter ? " match these filters" : " yet"}.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </ShipmentSelectionProvider>
    </main>
  );
}
