import { cacheAgeLabel } from "@/lib/analytics/dataFreshness";
import { REPORTS_CALC_VERSION } from "@/lib/reports/financialEngine";

/**
 * Report Status banner (Stage R2) — always-shown provenance strip for /admin/reports. States, in the
 * existing chip design language, WHAT this report is: selected period · generated timestamp · paid orders
 * included · GST basis · refund-adjustment status · data source / calculation basis · Calculation Version.
 * Pure presentation of values already computed upstream — no business logic, no financial calculation.
 *
 * REPORT METADATA (architectural — what this banner represents):
 *   Data Source        → Order Snapshots           (first-party `orders` rows; no external provider)
 *   Calculation Layer  → REPORTS_CALC_VERSION       (the frozen canonical Financial Engine version)
 *
 * The full provenance is ALSO exposed as a non-visual DOM attribute `data-report-generated-from`
 * ("Order Snapshots → Financial Engine v1") — never shown in the UI, present only to make debugging future
 * export / historical-report issues easy (read it straight off the element). Metadata, not UI.
 */
export const REPORT_GENERATED_FROM = `Order Snapshots → Financial Engine ${REPORTS_CALC_VERSION}`;

export function ReportStatusBanner({
  windowLabel,
  generatedAtMs,
  paidOrders,
}: {
  windowLabel: string;
  generatedAtMs: number | null;
  paidOrders: number;
}) {
  const chips = [
    `Period: ${windowLabel}`,
    `Generated ${cacheAgeLabel(generatedAtMs)}`,
    `${paidOrders.toLocaleString("en-IN")} paid orders included`,
    "GST: CGST/SGST/IGST from order snapshots",
    "Revenue refund-adjusted",
    "Based on order snapshots",
    `Calculation Version: ${REPORTS_CALC_VERSION}`,
  ];
  return (
    <div className="an-fresh rep-status" role="group" aria-label="Report status" data-report-generated-from={REPORT_GENERATED_FROM}>
      {chips.map((c) => (
        <span key={c} className="an-fresh__chip">{c}</span>
      ))}
    </div>
  );
}
