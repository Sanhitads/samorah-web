import type { Metadata } from "next";
import Link from "next/link";
import { getShipmentForOrderNumber } from "@/services/shipmentService";
import { verifyOrderToken } from "@/lib/orderToken";
import { toCustomerStatus, CUSTOMER_STATUS_LABEL, type ShipmentStatus, type CustomerShipmentStatus } from "@/lib/shipment/state";

/**
 * Customer tracking — `/order/[orderNumber]/track?t=<token>`. A unified shipment
 * timeline built from shipment_events, identical regardless of courier (Tracking
 * Engine). Token-gated like the confirmation page.
 */
export const metadata: Metadata = { title: "Track Order", robots: { index: false } };

const STEPS: { key: CustomerShipmentStatus; label: string }[] = [
  { key: "preparing", label: "Preparing" },
  { key: "shipped", label: "Shipped" },
  { key: "in_transit", label: "In Transit" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
];

const fmt = (v: unknown) => {
  try {
    return new Date(String(v)).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
};

interface Ev { id: string; status: string; customer_status: string | null; description: string | null; location: string | null; created_at: string }

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { orderNumber } = await params;
  const { t } = await searchParams;

  let data: Awaited<ReturnType<typeof getShipmentForOrderNumber>> = null;
  if (verifyOrderToken(orderNumber, t)) {
    try {
      data = await getShipmentForOrderNumber(orderNumber);
    } catch {
      data = null;
    }
  }

  if (!data) {
    return (
      <main className="order-page">
        <div className="order-conf order-conf--missing">
          <p className="order-conf__eyebrow">Tracking</p>
          <h1 className="order-conf__title">We couldn’t find that order.</h1>
          <Link href="/shop" className="order-conf__cta">Discover Another Chapter</Link>
        </div>
      </main>
    );
  }

  const { order, shipment } = data;
  const current: CustomerShipmentStatus = shipment ? toCustomerStatus(shipment.status as ShipmentStatus) : "preparing";
  const offPath = current === "returned" || current === "cancelled" || current === "exception";
  const reached = STEPS.findIndex((s) => s.key === current);
  const events: Ev[] = ((shipment?.shipment_events ?? []) as Ev[])
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <main className="order-page">
      <div className="order-conf">
        <header className="order-conf__head">
          <p className="order-conf__eyebrow">Tracking · {order.order_number}</p>
          <h1 className="order-conf__title">{CUSTOMER_STATUS_LABEL[current]}</h1>
          {shipment?.courier_name || shipment?.awb ? (
            <p className="order-conf__lead">
              {shipment?.courier_name ?? "Courier"}{shipment?.awb ? ` · ${shipment.awb}` : ""}
            </p>
          ) : (
            <p className="order-conf__lead">Your collection is being prepared in our studio.</p>
          )}
        </header>

        {offPath ? (
          <div className="track-notice">This shipment needs attention: <strong>{CUSTOMER_STATUS_LABEL[current]}</strong>. Our team will be in touch.</div>
        ) : (
          <ol className="order-conf__timeline" aria-label="Shipment progress">
            {STEPS.map((step, i) => (
              <li key={step.key} className="oc-step" data-done={i <= reached} data-current={i === reached}>
                <span className="oc-step__dot" aria-hidden="true">{i <= reached ? "✓" : ""}</span>
                <span className="oc-step__label">{step.label}</span>
              </li>
            ))}
          </ol>
        )}

        {events.length ? (
          <ul className="track-events">
            {events.map((e) => (
              <li key={e.id} className="track-event">
                <span className="track-event__dot" aria-hidden="true" />
                <div className="track-event__body">
                  <span className="track-event__status">{e.customer_status ? CUSTOMER_STATUS_LABEL[e.customer_status as CustomerShipmentStatus] ?? e.customer_status : e.status}</span>
                  {e.description ? <span className="track-event__desc">{e.description}</span> : null}
                  <span className="track-event__time">{fmt(e.created_at)}{e.location ? ` · ${e.location}` : ""}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="track-empty">Tracking updates will appear here once your parcel is on the move.</p>
        )}

        <div className="order-conf__ship">
          <p className="order-conf__ship-label">Delivering to</p>
          <p className="order-conf__ship-body">
            {order.ship_full_name}<br />
            {order.ship_line1}{order.ship_line2 ? `, ${order.ship_line2}` : ""}<br />
            {order.ship_city}, {order.ship_state} {order.ship_pincode}
          </p>
        </div>

        <Link href="/shop" className="order-conf__cta">Discover Another Chapter</Link>
      </div>
    </main>
  );
}
