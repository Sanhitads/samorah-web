"use client";
/**
 * Reports error backstop (R1A — resilient foundation). Per-section fallbacks in page.tsx handle a single
 * failing aggregation; this catches any unexpected render-time error so the founder sees a calm, recoverable
 * message in the Samorah admin language instead of a blank page or raw 500. No new business logic.
 */
export default function ReportsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Insights</p>
        <h1 className="admin__title">Reports</h1>
      </header>
      <p className="admin__empty">
        The report couldn’t be generated right now. This is a display issue — your data is unaffected.
      </p>
      <p className="cfg-hint">
        <button type="button" className="text-link" onClick={() => reset()}>Try again</button>
        {error?.digest ? <span className="admin__muted"> · ref {error.digest}</span> : null}
      </p>
    </main>
  );
}
