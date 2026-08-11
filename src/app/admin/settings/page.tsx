import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getSettingsAdminView } from "@/services/settingsService";
import { getSiteSettings } from "@/services/siteSettingsService";
import { getRecentAuditEvents } from "@/services/auditService";
import { cacheAgeLabel } from "@/lib/analytics/dataFreshness";
import { ShippingSettingsForm } from "@/components/admin/ShippingSettingsForm";
import { SiteSettingsForm } from "@/components/admin/SiteSettingsForm";
import { IntegrationStatusSection } from "@/components/admin/IntegrationStatusSection";
import { ProviderConnectionTest } from "@/components/admin/ProviderConnectionTest";
import { COMMERCE } from "@/config/commerce";

/**
 * Settings — `/admin/settings`. Admin-editable shipping config (the engines read
 * these; here they change without a deploy — principle f) + a providers overview.
 * Editing needs shipping.configure; others see it read-only.
 */
export const metadata: Metadata = { title: "Settings", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canConfigure = hasCapability(staff.role, "shipping.configure");

  const [{ settings, providers, warehouses }, site, auditEvents] = await Promise.all([
    getSettingsAdminView(), getSiteSettings(),
    getRecentAuditEvents({ entityType: "settings", limit: 1 }).catch(() => []),
  ]);
  const lastAudit = auditEvents[0]; // Updated By · At · Changed Groups (reuse auditService — no new tracking)

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Configuration · {staff.role}</p>
        <h1 className="admin__title">Settings</h1>
        <p className="admin__count">Brand, support, SEO & logistics {canConfigure ? "" : "· read-only (needs shipping.configure)"}</p>
      </header>

      {/* S1A — read-only integration status & operational health (never blocks editing below). */}
      <IntegrationStatusSection />

      {/* S2B — read-only Razorpay connection test (reuses razorpaySettlementService; no side effects). */}
      <section className="cfg-section">
        <div className="ash-jump__head">
          <h2 className="cfg-section__title">Provider connection tests</h2>
          <span className="admin__muted">Read-only · Managed by Environment Variables</span>
        </div>
        <p className="cfg-hint">Verify Razorpay credentials reach the gateway — read-only (no payment, order, settlement, or webhook side effects). Email test-send is intentionally deferred; notifications use the Test action in Integration status above.</p>
        <ProviderConnectionTest />
      </section>

      {canConfigure ? (
        <section className="cfg-section">
          <div className="ash-jump__head">
            <h2 className="cfg-section__title">General</h2>
            {lastAudit ? (
              <span className="admin__muted">Last updated {cacheAgeLabel(Date.parse(lastAudit.created_at))} by {lastAudit.actorName ?? "system"}{lastAudit.notes ? ` · changed: ${lastAudit.notes}` : ""}</span>
            ) : null}
          </div>
          <SiteSettingsForm settings={site} />
        </section>
      ) : null}

      {/* Money-critical config stays in code (money-engine source of truth) — shown read-only. */}
      <section className="cfg-section">
        <h2 className="cfg-section__title">Tax & legal (code-managed)</h2>
        <dl className="cfg-readonly">
          <div><dt>GSTIN</dt><dd>{COMMERCE.gstin}</dd></div>
          <div><dt>Legal name</dt><dd>{COMMERCE.legalName}</dd></div>
          <div><dt>Store state</dt><dd>{COMMERCE.registeredAddress.state}</dd></div>
          <div><dt>Currency</dt><dd>{COMMERCE.currency}</dd></div>
        </dl>
        <p className="cfg-hint">These drive GST/invoicing and live in <code>config/commerce.ts</code> — changed by a developer, not here, to keep the money engine's single source of truth.</p>
      </section>

      <section className="cfg-section">
        <h2 className="cfg-section__title">Shipping</h2>
        {canConfigure ? (
          <ShippingSettingsForm settings={settings} providers={providers} warehouses={warehouses} />
        ) : (
          <dl className="cfg-readonly">
            <div><dt>Default provider</dt><dd>{settings.defaultProvider}</dd></div>
            <div><dt>Courier strategy</dt><dd>{settings.courierStrategy}</dd></div>
            <div><dt>Auto-create on payment</dt><dd>{settings.autoAssign ? "Yes" : "No"}</dd></div>
            <div><dt>Insurance threshold</dt><dd>₹{settings.insuranceThreshold}</dd></div>
            <div><dt>COD threshold</dt><dd>₹{settings.codThreshold}</dd></div>
            <div><dt>Fragile policy</dt><dd>{settings.fragilePolicy}</dd></div>
          </dl>
        )}
      </section>

      <section className="cfg-section">
        <h2 className="cfg-section__title">Providers</h2>
        <table className="admin__table">
          <thead><tr><th>Provider</th><th>Adapter</th><th>Default</th></tr></thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.name}>
                <td className="admin__mono">{p.name}</td>
                <td><span className="om-pay" data-tone={p.configured ? "paid" : "pending"}>{p.configured ? "Ready" : "No adapter"}</span></td>
                <td>{p.isDefault ? "✓" : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="cfg-hint">Providers without an adapter fall back to Manual, so the platform always ships. Add an adapter (implementing <code>ShippingProvider</code>) to activate one.</p>
      </section>
    </main>
  );
}
