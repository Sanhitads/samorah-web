import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listCoupons, listTargetOptions, listRedemptions } from "@/services/couponAdminService";
import { CouponsManager } from "@/components/admin/CouponsManager";
import { RedemptionsPanel } from "@/components/admin/RedemptionsPanel";

/**
 * Coupons — `/admin/coupons`. Create/expire discount codes; the pricing engine
 * reads active coupons live (min-order, expiry, usage-limit, percent-cap all
 * enforced). Editing needs catalog.manage.
 */
export const metadata: Metadata = { title: "Coupons", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CouponsPage() {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  const canManage = hasCapability(staff.role, "catalog.manage");

  const coupons = await listCoupons();
  const targetOptions = canManage ? await listTargetOptions() : { categories: [], collections: [], products: [], productTypes: [] };
  const redemptions = canManage ? await listRedemptions() : [];

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Catalog · {staff.role}</p>
        <h1 className="admin__title">Coupons</h1>
        <p className="admin__count">{coupons.length} {coupons.length === 1 ? "coupon" : "coupons"}{canManage ? "" : " · read-only (needs catalog.manage)"}</p>
      </header>

      {canManage ? (
        <>
          <CouponsManager coupons={coupons} targetOptions={targetOptions} />
          <RedemptionsPanel rows={redemptions} />
        </>
      ) : (
        <div className="admin__table-wrap">
          <table className="admin__table admin__table--board">
            <thead><tr><th>Code</th><th>Discount</th><th>Usage</th><th>Active</th></tr></thead>
            <tbody>
              {coupons.map((c) => (
                <tr key={c.id}><td className="admin__mono">{c.code}</td><td>{c.type === "percent" ? `${c.value}%` : `₹${c.value}`}</td><td className="admin__mono">{c.usedCount}{c.maxUses != null ? ` / ${c.maxUses}` : ""}</td><td>{c.isActive ? "On" : "Off"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
