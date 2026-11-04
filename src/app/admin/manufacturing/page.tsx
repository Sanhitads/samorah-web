import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { listBatchesAdmin, listVariantOptions } from "@/services/manufacturing/batchService";
import { ManufacturingManager } from "@/components/admin/ManufacturingManager";

/**
 * Manufacturing & Batches — `/admin/manufacturing` (Phase 5). Batch overview with
 * search / lifecycle filter / pagination + create. Viewing needs manufacturing.operate
 * (editor+). All mutations go through /api/admin/manufacturing, server-enforced per action.
 */
export const metadata: Metadata = { title: "Manufacturing", robots: { index: false } };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export default async function ManufacturingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "manufacturing.operate")) {
    return (
      <main className="admin">
        <header className="admin__head"><p className="admin__eyebrow">Operations · {staff.role}</p><h1 className="admin__title">Manufacturing</h1></header>
        <p className="admin__empty">Needs the manufacturing.operate capability (editor+).</p>
      </main>
    );
  }
  const sp = await searchParams;
  const page = Math.max(parseInt(sp.page ?? "1", 10) || 1, 1);
  const q = (sp.q ?? "").trim();
  const status = (sp.status ?? "").trim();
  const hold = sp.hold === "1";
  const [{ rows, total }, variants] = await Promise.all([
    listBatchesAdmin({ q, status, hold, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    listVariantOptions(),
  ]);
  const caps = {
    operate: hasCapability(staff.role, "manufacturing.operate"),
    qc: hasCapability(staff.role, "manufacturing.qc"),
    approve: hasCapability(staff.role, "manufacturing.qc_approve"),
  };

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Operations · {staff.role}</p>
        <h1 className="admin__title">Manufacturing &amp; Batches</h1>
        <p className="admin__count">{total} batch{total === 1 ? "" : "es"}</p>
      </header>
      <ManufacturingManager
        rows={rows}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        filters={{ q, status, hold }}
        variants={variants}
        caps={caps}
      />
    </main>
  );
}
