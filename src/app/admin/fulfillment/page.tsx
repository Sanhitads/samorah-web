import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { getFulfillmentQueue, getQueueCounts, getAssignmentBalance, getWarehouseCapacity, type FulfillmentFilter } from "@/services/fulfillmentService";
import { getStaffOptions, getCourierOptions, getOperationalMetrics } from "@/services/orderAdminService";
import { FulfillmentActions } from "@/components/admin/FulfillmentActions";
import { PriorityControl, AssigneeControl, TagsControl } from "@/components/admin/BoardControls";
import { BoardBulk } from "@/components/admin/BoardBulk";
import { BoardSelectionProvider, BoardCheckbox } from "@/components/admin/BoardSelection";
import { WORK_QUEUES, refundBadge, type WorkQueue, type EffectivePriority } from "@/lib/fulfillment/derive";
import type { FulfillmentStatus } from "@/lib/fulfillment/state";

/**
 * Fulfillment dashboard — `/admin/fulfillment`. Staff (editor+) drive orders through
 * pick → pack → QC → ready → create shipment → dispatch. Rows carry the triage
 * context an operator reads without interpreting (SLP 11–17 + review refinements):
 * effective priority, next action, work queue, refined inventory + refund states.
 */
export const metadata: Metadata = { title: "Fulfillment", robots: { index: false } };
export const dynamic = "force-dynamic";

const FS_LABEL: Record<FulfillmentStatus, string> = {
  reserved: "Reserved", picking: "Picking", picked: "Picked", packing: "Packing", packed: "Packed",
  qc_passed: "QC Passed", qc_failed: "QC Failed", ready_for_dispatch: "Ready for Dispatch",
  courier_assigned: "Courier Assigned", picked_up: "Picked Up", shipped: "Shipped",
  on_hold: "On Hold", cancelled: "Cancelled",
};
const EFF_LABEL: Record<EffectivePriority, string> = { critical: "Critical", high: "High", normal: "Normal" };
const INV_LABEL: Record<string, string> = { reserved: "Reserved", allocated: "Allocated", picking: "Picking", missing: "Missing Stock", backordered: "Backordered", unknown: "—" };

/** Base payment badge; a refund sub-state (point 4) overrides it when present. */
function paymentBadge(paymentStatus: string, isCod: boolean, latestRefundStatus: string | null): { label: string; tone: string } {
  const rb = refundBadge(paymentStatus, latestRefundStatus);
  if (rb) return rb;
  if (paymentStatus === "paid") return { label: isCod ? "COD Paid" : "Paid", tone: "paid" };
  if (paymentStatus === "failed") return { label: "Failed", tone: "failed" };
  return { label: isCod ? "COD" : "Pending", tone: "pending" };
}

function sla(placedAt: string, now: number): string {
  const hrs = Math.max(0, (now - new Date(placedAt).getTime()) / 3.6e6);
  return hrs < 1 ? "just now" : hrs < 24 ? `${Math.floor(hrs)}h` : `${Math.floor(hrs / 24)}d`;
}

interface FulfillmentSearchParams {
  queue?: string; search?: string; picker?: string; courier?: string; collection?: string;
  priority?: string; payment?: string; wholesale?: string; gift?: string; range?: string; breached?: string;
}
const PRIORITY_FILTERS = [{ v: "vip", l: "VIP" }, { v: "urgent", l: "Urgent" }, { v: "high", l: "High" }, { v: "normal", l: "Normal" }];
const DATE_RANGES = [{ v: "today", l: "Today" }, { v: "7d", l: "Last 7 days" }, { v: "30d", l: "Last 30 days" }];

export default async function FulfillmentDashboard({ searchParams }: { searchParams: Promise<FulfillmentSearchParams> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");

  const sp = await searchParams;
  const queue = (WORK_QUEUES.find((q) => q.key === sp.queue)?.key ?? undefined) as WorkQueue | undefined;
  const filter: FulfillmentFilter = {
    queue, search: sp.search, picker: sp.picker, courier: sp.courier, collection: sp.collection,
    priority: sp.priority, payment: sp.payment, wholesale: sp.wholesale, gift: sp.gift === "1", range: sp.range,
    breached: sp.breached === "1",
  };
  const [rows, counts, staffOptions, courierOptions, metrics, assignment, capacity] = await Promise.all([
    getFulfillmentQueue(filter), getQueueCounts(), getStaffOptions(), getCourierOptions(),
    getOperationalMetrics(), getAssignmentBalance(), getWarehouseCapacity(),
  ]);
  const total = counts.pick + counts.pack + counts.ship + counts.exceptions + counts.hold;
  const now = Date.now();
  // Preserve active filters (minus queue) when switching queue tabs.
  const filterEntries = Object.entries(sp).filter(([k, v]) => v && k !== "queue") as [string, string][];
  const anyFilter = filterEntries.length > 0;
  const tabHref = (qKey?: string) => {
    const p = new URLSearchParams(filterEntries);
    if (qKey) p.set("queue", qKey);
    const s = p.toString();
    return `/admin/fulfillment${s ? `?${s}` : ""}`;
  };

  // Batch-eligible sets (the "select many → dispatch" productivity win).
  const readyToShip = rows.filter((r) => r.fulfillmentStatus === "ready_for_dispatch" && !r.shipmentStatus).map((r) => r.orderNumber);
  const dispatchable = rows.filter((r) => r.shipmentStatus === "courier_assigned").map((r) => r.orderNumber);

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Fulfillment · {staff.role}</p>
        <h1 className="admin__title">Fulfillment Queue</h1>
        <p className="admin__count">{rows.length} {rows.length === 1 ? "order" : "orders"}{queue ? ` in ${WORK_QUEUES.find((q) => q.key === queue)?.label}` : ""} · sorted by priority</p>
      </header>

      {/* Operations summary (point 16) + assignment balance (point 18) */}
      <div className="oms-strip">
        <a href={sp.breached === "1" ? "/admin/fulfillment" : "/admin/fulfillment?breached=1"} className="oms-stat oms-stat--link" data-tone={counts.breached ? "over" : undefined} data-active={sp.breached === "1" ? "1" : undefined}><span className="oms-stat__n">{counts.breached}</span><span className="oms-stat__l">Breached SLA{sp.breached === "1" ? " ✕" : ""}</span></a>
        <div className="oms-stat"><span className="oms-stat__n">{metrics.ordersWaiting}</span><span className="oms-stat__l">Awaiting</span></div>
        <div className="oms-stat"><span className="oms-stat__n">{metrics.avgPickMinutes != null ? `${metrics.avgPickMinutes}m` : "—"}</span><span className="oms-stat__l">Avg pick</span></div>
        <div className="oms-stat"><span className="oms-stat__n">{metrics.avgPackMinutes != null ? `${metrics.avgPackMinutes}m` : "—"}</span><span className="oms-stat__l">Avg pack</span></div>
        <div className="oms-stat" data-tone={metrics.oldestWaitingHours != null && metrics.oldestWaitingHours >= 24 ? "warn" : undefined}><span className="oms-stat__n">{metrics.oldestWaitingHours != null ? `${metrics.oldestWaitingHours}h` : "—"}</span><span className="oms-stat__l">Oldest wait</span></div>
        <div className="oms-stat" data-tone={metrics.ordersOnHold ? "warn" : undefined}><span className="oms-stat__n">{metrics.ordersOnHold}</span><span className="oms-stat__l">On hold</span></div>
        <div className="oms-stat" data-tone={capacity.pct != null && capacity.pct >= 90 ? "warn" : undefined}>
          <span className="oms-stat__n">{capacity.pct != null ? `${capacity.pct}%` : "—"}</span>
          <span className="oms-stat__l">{capacity.capacity != null ? `Capacity · ${capacity.used}/${capacity.capacity}` : "Capacity · setup required"}</span>
        </div>
      </div>

      <div className="ff-balance" aria-label="Picker workload">
        <span className="ff-balance__label">Workload</span>
        {assignment.balance.length === 0 ? <span className="admin__muted">nobody assigned yet</span> : null}
        {assignment.balance.map((b) => (
          <a key={b.id} href={`/admin/fulfillment?picker=${b.id}`} className="ff-balance__chip" data-heavy={b.count >= 15 ? "1" : undefined}>{b.name} <b>{b.count}</b></a>
        ))}
        {assignment.unassigned ? <span className="ff-balance__chip ff-balance__chip--none">Unassigned <b>{assignment.unassigned}</b></span> : null}
      </div>

      <nav className="ff-queues" aria-label="Work queues">
        <Link href={tabHref()} className="ff-queue" data-active={!queue ? "1" : "0"}>All <span className="ff-queue__n">{total}</span></Link>
        {WORK_QUEUES.map((q) => (
          <Link key={q.key} href={tabHref(q.key)} className="ff-queue" data-active={queue === q.key ? "1" : "0"} data-q={q.key}>
            {q.label} <span className="ff-queue__n">{counts[q.key]}</span>
          </Link>
        ))}
      </nav>

      <form className="adm-filters" method="get">
        {queue ? <input type="hidden" name="queue" value={queue} /> : null}
        <input className="adm-filters__search" type="search" name="search" defaultValue={sp.search ?? ""} placeholder="Search order #, customer, SKU, AWB, courier…" />
        <select name="picker" defaultValue={sp.picker ?? ""} aria-label="Picker">
          <option value="">Any picker</option>
          {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select name="courier" defaultValue={sp.courier ?? ""} aria-label="Courier">
          <option value="">Any courier</option>
          {courierOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select name="priority" defaultValue={sp.priority ?? ""} aria-label="Priority">
          <option value="">Any priority</option>
          {PRIORITY_FILTERS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
        </select>
        <select name="payment" defaultValue={sp.payment ?? ""} aria-label="Payment">
          <option value="">COD + Prepaid</option>
          <option value="cod">COD</option>
          <option value="prepaid">Prepaid</option>
        </select>
        <select name="wholesale" defaultValue={sp.wholesale ?? ""} aria-label="Wholesale">
          <option value="">Any wholesale</option>
          <option value="any">Wholesale or B2B</option>
          <option value="wholesale_order">Wholesale order</option>
          <option value="b2b_customer">B2B customer</option>
        </select>
        <select name="range" defaultValue={sp.range ?? ""} aria-label="Date range">
          <option value="">All time</option>
          {DATE_RANGES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
        </select>
        <input className="adm-filters__search" type="search" name="collection" defaultValue={sp.collection ?? ""} placeholder="Collection…" style={{ flex: "0 1 160px" }} />
        <label className="adm-filters__check"><input type="checkbox" name="gift" value="1" defaultChecked={sp.gift === "1"} /> Gift</label>
        <button type="submit" className="ff-btn ff-btn--primary">Apply</button>
        {anyFilter ? <a href={queue ? `/admin/fulfillment?queue=${queue}` : "/admin/fulfillment"} className="ff-btn">Clear</a> : null}
      </form>

      <BoardBulk readyToShip={readyToShip} dispatchable={dispatchable} />

      <BoardSelectionProvider pageNumbers={rows.map((r) => r.orderNumber)} staff={staffOptions}>
      <div className="admin__table-wrap">
        <table className="admin__table admin__table--board">
          <thead>
            <tr>
              <th className="obulk-th" aria-label="Select"></th>
              <th>Priority</th>
              <th>Order</th>
              <th>Customer</th>
              <th>Fulfillment</th>
              <th>Payment</th>
              <th>Age</th>
              <th>Owner</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const pay = paymentBadge(r.paymentStatus, r.isCod, r.latestRefundStatus);
              return (
                <tr key={r.orderNumber}>
                  <td className="obulk-td"><BoardCheckbox orderNumber={r.orderNumber} /></td>
                  <td>
                    <span className="bc-eff" data-p={r.effectivePriority}>{EFF_LABEL[r.effectivePriority]}</span>
                    <div className="bc-eff-set"><PriorityControl orderNumber={r.orderNumber} priority={r.priority} /></div>
                  </td>
                  <td>
                    <div className="bc-order">
                      <Link href={`/admin/orders/${r.orderNumber}`} className="od-link admin__mono">{r.orderNumber}</Link>
                      <span className="admin__muted">{r.itemCount} {r.itemCount === 1 ? "item" : "items"}</span>
                      {r.isGift ? <span className="bc-gift" title="Gift order">🎁 Gift</span> : null}
                    </div>
                    {r.itemCount > 0 && (r.pickedUnits > 0 || r.fulfillmentStatus === "picking") ? (
                      <div className="bc-pickbar" title={`${r.pickedUnits} of ${r.itemCount} picked`}>
                        <span className="bc-pickbar__label">Picked {r.pickedUnits}/{r.itemCount}</span>
                        <span className="bc-pickbar__track"><span className="bc-pickbar__fill" data-done={r.pickedUnits >= r.itemCount ? "1" : undefined} style={{ width: `${Math.min(100, Math.round((r.pickedUnits / r.itemCount) * 100))}%` }} /></span>
                      </div>
                    ) : null}
                    <TagsControl orderNumber={r.orderNumber} tags={r.tags} />
                    {r.note ? <div className="bc-note" title={r.note}>📝 {r.note}</div> : null}
                  </td>
                  <td>{r.customerName}</td>
                  <td>
                    <span className="ff-status" data-s={r.fulfillmentStatus}>{FS_LABEL[r.fulfillmentStatus] ?? r.fulfillmentStatus}</span>
                    <div className="bc-next">→ {r.nextAction}</div>
                    <div className="bc-inv" data-inv={r.inventory}>{INV_LABEL[r.inventory]}</div>
                    {r.fulfillmentStatus === "packing" && r.packingTotal > 0 ? (
                      <div className="bc-pack" data-done={r.packingDone >= r.packingTotal ? "1" : undefined}>Checklist {r.packingDone}/{r.packingTotal}{r.packingDone >= r.packingTotal ? " ✓" : ""}</div>
                    ) : null}
                    {r.qcAt ? <div className="bc-qc">QC ✓ {r.qcByName ?? "—"} · {new Date(r.qcAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div> : null}
                    {r.shipmentStatus ? <div className="admin__muted">{r.shipmentStatus}{r.courierName ? ` · ${r.courierName}` : ""}{r.awb ? ` · ${r.awb}` : ""}</div> : null}
                    {r.shipping ? (
                      <div className="bc-ship" aria-label="Shipping milestones">
                        <span data-done={r.shipping.label ? "1" : "0"}>Label</span>
                        <span data-done={r.shipping.awb ? "1" : "0"}>AWB</span>
                        <span data-done={r.shipping.booked ? "1" : "0"}>Booked</span>
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <span className="om-pay" data-tone={pay.tone}>{pay.label}</span>
                    {r.refundAmount > 0 ? <div className="admin__muted">₹{r.refundAmount.toFixed(2)}</div> : null}
                  </td>
                  <td>
                    <span className="bc-sla" data-tone={r.slaTone}>{sla(r.placedAt, now)}</span>
                    <div className="bc-slabadge" data-tone={r.sla.tone} title={r.sla.state === "breached" ? `${Math.abs(r.sla.hoursLeft)}h late (target ${r.sla.targetHrs}h)` : `${r.sla.hoursLeft}h left of ${r.sla.targetHrs}h`}>{r.sla.label}</div>
                  </td>
                  <td><AssigneeControl orderNumber={r.orderNumber} assigneeName={r.assigneeName} /></td>
                  <td>
                    <FulfillmentActions
                      orderNumber={r.orderNumber}
                      fulfillmentStatus={r.fulfillmentStatus}
                      nextStates={r.nextStates}
                      shipmentStatus={r.shipmentStatus}
                      holdReason={r.holdReason}
                    />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="admin__empty">No orders in this queue.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      </BoardSelectionProvider>
    </main>
  );
}
