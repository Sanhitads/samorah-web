import type { AuditEvent } from "@/services/auditService";

/**
 * Shared audit timeline (extracted from the order detail page's inline od-timeline). Server
 * component — renders an immutable, chronological event list. Reused by the order detail page and
 * the return detail page so both read the SAME audit stream the same way (no parallel timeline).
 * A small leading icon (priority 6) makes the stream scannable; it's derived from the event name so
 * it works for both order and return events with no per-caller wiring.
 */
const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const EVENT_LABEL = (e: string) => e.replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Map an event name → a glyph. Ordered specific → general; first hit wins. */
function eventIcon(event: string): string {
  const e = event.toLowerCase();
  const rules: [RegExp, string][] = [
    [/evidence/, "📷"],
    [/refund/, "💰"],
    [/replacement|shipped|dispatch|awb|ship/, "📦"],
    [/inspect|qc/, "🔍"],
    [/pickup|transit|received|pick/, "🚚"],
    [/reject|cancel|fail/, "❌"],
    [/approve|received_ok|pass/, "✅"],
    [/warehouse|restock|destroy|vendor|sample/, "🏭"],
    [/close|complete|settle/, "🏁"],
    [/hold|pause/, "⏸️"],
    [/note|updated|comment/, "📝"],
    [/request|create|open/, "🟢"],
    [/refunded/, "💸"],
  ];
  for (const [re, icon] of rules) if (re.test(e)) return icon;
  return "•";
}

export function Timeline({ events, title = "Timeline", bare = false }: { events: AuditEvent[]; title?: string; bare?: boolean }) {
  const list = (
    <ol className="od-timeline">
      {events.map((e) => (
        <li key={e.id} className="od-tl">
          <span className="od-tl__time"><span className="od-tl__icon" aria-hidden>{eventIcon(e.event)}</span>{dt(e.created_at)}</span>
          <span className="od-tl__event">
            {EVENT_LABEL(e.event)}
            {e.previous_state && e.new_state ? <span className="admin__muted"> · {e.previous_state}→{e.new_state}</span> : e.new_state ? <span className="admin__muted"> · {e.new_state}</span> : null}
          </span>
          <span className="od-tl__actor admin__muted">{e.actorName || e.actor_type}{e.notes ? ` · ${e.notes}` : ""}</span>
        </li>
      ))}
      {events.length === 0 ? <li className="admin__muted">No events yet.</li> : null}
    </ol>
  );
  // `bare` renders just the list (the caller supplies the heading, e.g. a collapsible <summary>).
  if (bare) return list;
  return (
    <section className="od-section">
      <h2 className="od-card__title">{title} ({events.length})</h2>
      {list}
    </section>
  );
}
