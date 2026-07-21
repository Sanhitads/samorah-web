import { TRACK_STEPS, trackingStep } from "@/lib/shipment/display";

/**
 * Tracking progress bar (review priority 2.5): Created → Picked Up → In Transit → Out for Delivery →
 * Delivered as filled / current / pending nodes. Pure server component. Branch states (exception /
 * RTO / cancelled) render the bar up to in-transit with a coloured end flag rather than a fake step,
 * so the visual never lies about where the parcel is. `compact` drops the labels for dense rows.
 */
export function ShipmentProgress({ status, compact = false }: { status: string; compact?: boolean }) {
  const step = trackingStep(status);
  const special = step < 0; // exception / rto / cancelled
  const active = status === "delivered" ? 4 : special ? 2 : step;
  const flag = status === "rto" ? { label: "↩ RTO", s: "rto" } : status === "cancelled" ? { label: "✕ Cancelled", s: "cancelled" } : status === "exception" ? { label: "⚠ Exception", s: "exception" } : null;

  return (
    <div className={`sprog${compact ? " sprog--compact" : ""}`} role="img" aria-label={`Status: ${status}`}>
      <div className="sprog__track">
        {TRACK_STEPS.map((label, i) => (
          <div key={i} className="sprog__node" data-done={i < active ? "1" : undefined} data-current={!special && i === active ? "1" : undefined} data-flagged={special && i === active ? flag?.s : undefined}>
            <span className="sprog__dot" />
            {!compact ? <span className="sprog__label">{label}</span> : null}
          </div>
        ))}
      </div>
      {flag ? <span className="sprog__flag" data-s={flag.s}>{flag.label}</span> : null}
    </div>
  );
}
