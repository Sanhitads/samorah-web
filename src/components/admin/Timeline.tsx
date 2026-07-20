import type { AuditEvent } from "@/services/auditService";

/**
 * Shared audit timeline (extracted from the order detail page's inline od-timeline). Server
 * component — renders an immutable, chronological event list. Reused by the order detail page and
 * the return detail page so both read the SAME audit stream the same way (no parallel timeline).
 */
const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const EVENT_LABEL = (e: string) => e.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function Timeline({ events, title = "Timeline" }: { events: AuditEvent[]; title?: string }) {
  return (
    <section className="od-section">
      <h2 className="od-card__title">{title} ({events.length})</h2>
      <ol className="od-timeline">
        {events.map((e) => (
          <li key={e.id} className="od-tl">
            <span className="od-tl__time">{dt(e.created_at)}</span>
            <span className="od-tl__event">
              {EVENT_LABEL(e.event)}
              {e.previous_state && e.new_state ? <span className="admin__muted"> · {e.previous_state}→{e.new_state}</span> : e.new_state ? <span className="admin__muted"> · {e.new_state}</span> : null}
            </span>
            <span className="od-tl__actor admin__muted">{e.actor_type}{e.notes ? ` · ${e.notes}` : ""}</span>
          </li>
        ))}
        {events.length === 0 ? <li className="admin__muted">No events yet.</li> : null}
      </ol>
    </section>
  );
}
