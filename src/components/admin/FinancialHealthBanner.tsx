import type { FinancialHealth } from "@/lib/reports/financialHealth";

/**
 * Financial Health banner (Stage R2) — severity-aware data-quality strip for /admin/reports. Three states —
 * Healthy · Warning · Attention required — expressed through the existing Samorah design language (a bordered
 * card with a severity accent using existing colour tokens; no new component library, no redesign). It only
 * surfaces existing system conditions classified by `assessFinancialHealth`; it performs no business logic.
 */
const LABEL: Record<FinancialHealth["severity"], string> = {
  healthy: "Healthy",
  warning: "Warning",
  attention: "Attention required",
};
const ICON: Record<FinancialHealth["severity"], string> = {
  healthy: "✓",
  warning: "⚠",
  attention: "⛔",
};

export function FinancialHealthBanner({ health }: { health: FinancialHealth }) {
  const { severity, items } = health;
  return (
    <div className="rep-health" data-severity={severity} role="status" aria-label={`Financial integrity: ${LABEL[severity]}`}>
      <span className="rep-health__badge">{ICON[severity]} Financial integrity · {LABEL[severity]}</span>
      {items.length ? (
        <ul className="rep-health__items">
          {items.map((it, i) => (
            <li key={i} data-sev={it.severity}>{it.text}</li>
          ))}
        </ul>
      ) : (
        <ul className="rep-health__items"><li>All financial inputs configured — figures are fully costed.</li></ul>
      )}
    </div>
  );
}
