"use client";

import { useState } from "react";
import { Timeline } from "./Timeline";
import type { AuditEvent } from "@/services/auditService";

/**
 * Timeline with category filters (review F). After 50+ entries a flat audit stream is noisy, so this
 * lets an operator narrow to Tracking (status moves), Internal (notes + cost edits), or System
 * (automated events). Client-only filter over the same events; rendering reuses the shared Timeline.
 */
const TABS = [
  { k: "all", l: "All" },
  { k: "tracking", l: "Tracking" },
  { k: "internal", l: "Internal" },
  { k: "system", l: "System" },
] as const;

const TRACKING = /^shipment\.(created|dispatched|picked_up|in_transit|out_for_delivery|delivered|rto|exception|courier_assigned|cancelled)$/;

function matches(tab: string, e: AuditEvent): boolean {
  if (tab === "all") return true;
  if (tab === "tracking") return TRACKING.test(e.event);
  if (tab === "internal") return e.event === "shipment.note" || e.event === "shipment.logistics_edit";
  if (tab === "system") return e.actor_type === "system";
  return true;
}

export function ShipmentTimelineFilter({ events }: { events: AuditEvent[] }) {
  const [tab, setTab] = useState<string>("all");
  const filtered = events.filter((e) => matches(tab, e));
  const count = (k: string) => events.filter((e) => matches(k, e)).length;
  return (
    <div>
      <div className="tl-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.k} type="button" role="tab" className="tl-tab" data-active={tab === t.k ? "1" : undefined} onClick={() => setTab(t.k)}>
            {t.l} <span className="tl-tab__n">{count(t.k)}</span>
          </button>
        ))}
      </div>
      <Timeline events={filtered} bare />
    </div>
  );
}
