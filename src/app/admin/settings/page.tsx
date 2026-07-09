import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getSettingsAdminView } from "@/services/settingsService";
import { ShippingSettingsForm } from "@/components/admin/ShippingSettingsForm";

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

  const { settings, providers, warehouses } = await getSettingsAdminView();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Configuration · {staff.role}</p>
        <h1 className="admin__title">Settings</h1>
        <p className="admin__count">Shipping & logistics {canConfigure ? "" : "· read-only (needs shipping.configure)"}</p>
      </header>

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
