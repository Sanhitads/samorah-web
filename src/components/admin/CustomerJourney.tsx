/**
 * Customer journey (review priority 4) — the relationship's milestones as a vertical, iconed timeline
 * (Joined → First order → Repeat → Delivery → Return → Latest). Pure server component; a more visual,
 * story-like companion to the flat audit timeline. Milestones are pre-derived by getCustomer360.
 */
const ICON: Record<string, string> = { joined: "👤", first_order: "🛍️", repeat: "🔁", delivered: "📦", return: "↩", latest: "⭐" };
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—");

export function CustomerJourney({ milestones }: { milestones: { key: string; label: string; date: string | null; detail: string | null }[] }) {
  if (!milestones.length) return <p className="admin__muted">No journey yet.</p>;
  return (
    <ol className="cjourney">
      {milestones.map((m, i) => (
        <li key={`${m.key}-${i}`} className="cjourney__step" data-last={i === milestones.length - 1 ? "1" : undefined}>
          <span className="cjourney__dot" aria-hidden>{ICON[m.key] ?? "•"}</span>
          <div className="cjourney__body">
            <span className="cjourney__label">{m.label}{m.detail ? <span className="admin__muted"> · {m.detail}</span> : null}</span>
            <span className="cjourney__date">{fmt(m.date)}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
