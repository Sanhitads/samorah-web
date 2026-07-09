import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getPackagingAdminView } from "@/services/packagingService";
import { AssetsManager, ProfilesManager, PackagingRulesManager } from "@/components/admin/PackagingManagers";

/**
 * Packaging Management — `/admin/packaging`. The four packaging things (Assets ·
 * Profiles · Rules · Inventory). What's entered here drives real parcel weights,
 * dimensions and packaging cost on every shipment (the engine reads this catalog,
 * falling back to config only while empty). Editing needs shipping.configure.
 */
export const metadata: Metadata = { title: "Packaging", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function PackagingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = hasCapability(staff.role, "shipping.configure");
  if (!canManage) {
    return (
      <main className="admin">
        <header className="admin__head"><p className="admin__eyebrow">Configuration · {staff.role}</p><h1 className="admin__title">Packaging</h1></header>
        <p className="admin__empty">Read-only — packaging management needs the shipping.configure capability.</p>
      </main>
    );
  }

  const { tab } = await searchParams;
  const active = tab === "profiles" || tab === "rules" ? tab : "assets";
  const view = await getPackagingAdminView();

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Configuration · {staff.role}</p>
        <h1 className="admin__title">Packaging</h1>
        <p className="admin__count">
          {view.usingDbCatalog ? "Live: this catalog drives packing" : "Falling back to the config catalog until assets + a profile are active"}
          {view.reorderCount > 0 ? ` · ${view.reorderCount} to reorder` : ""}
        </p>
      </header>

      <nav className="ff-queues" aria-label="Packaging sections">
        <a href="/admin/packaging" className="ff-queue" data-active={active === "assets" ? "1" : "0"}>Assets <span className="ff-queue__n">{view.assets.length}</span></a>
        <a href="/admin/packaging?tab=profiles" className="ff-queue" data-active={active === "profiles" ? "1" : "0"}>Profiles <span className="ff-queue__n">{view.profiles.length}</span></a>
        <a href="/admin/packaging?tab=rules" className="ff-queue" data-active={active === "rules" ? "1" : "0"}>Rules <span className="ff-queue__n">{view.rules.length}</span></a>
      </nav>

      {active === "assets" ? <AssetsManager assets={view.assets} /> : null}
      {active === "profiles" ? <ProfilesManager profiles={view.profiles} assets={view.assets} /> : null}
      {active === "rules" ? <PackagingRulesManager rules={view.rules} profiles={view.profiles} /> : null}
    </main>
  );
}
