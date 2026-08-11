import { KpiCard } from "@/components/admin/KpiCard";

/**
 * Reports route loading skeleton (R4). Shown while the server renders /admin/reports. Mirrors the page's
 * structure (header · executive summary · P&L metric row) using the SHARED KpiCard skeleton so the loading
 * boxes occupy the same layout as the loaded content — no layout jump / CLS when real data arrives. Pure
 * presentation: no data fetching, no new CSS.
 */
const EXEC = ["Revenue", "Operating Profit", "Margin", "Orders", "Customers"];
const PNL = ["Operating profit", "Margin", "Revenue", "COGS"];

export default function ReportsLoading() {
  return (
    <main className="admin" aria-busy="true" aria-label="Loading reports">
      <header className="admin__head">
        <p className="admin__eyebrow">Insights</p>
        <h1 className="admin__title">Reports</h1>
      </header>

      <section className="ash-metrics" aria-label="Loading executive summary">
        <div className="ash-jump__head">
          <h2 className="ash-jump__title">Executive summary</h2>
        </div>
        <div className="ash-metrics__row">
          {EXEC.map((l) => <KpiCard key={l} label={l} value="" loading />)}
        </div>
      </section>

      <section className="ash-metrics" aria-label="Loading profit and loss">
        <div className="ash-activity__head">
          <h2 className="ash-jump__title">Profit &amp; loss</h2>
        </div>
        <div className="ash-metrics__row">
          {PNL.map((l) => <KpiCard key={l} label={l} value="" loading />)}
        </div>
      </section>
    </main>
  );
}
