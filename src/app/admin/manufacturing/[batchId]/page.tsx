import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth/requireStaff";
import { hasCapability } from "@/lib/auth/capabilities";
import { getBatchWithSpec, getBatchTimeline } from "@/services/manufacturing/batchService";
import { listQcForBatch, listDesignValidations, designValidationStatus, listTemplates } from "@/services/manufacturing/qcService";
import { lotsForBatch, listMaterials, listMaterialLots } from "@/services/manufacturing/materialService";
import { BatchDetail } from "@/components/admin/BatchDetail";

export const metadata: Metadata = { title: "Batch", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function BatchDetailPage({ params }: { params: Promise<{ batchId: string }> }) {
  const staff = await requireStaff("editor");
  if (!staff.ok) redirect("/login");
  if (!hasCapability(staff.role, "manufacturing.operate")) {
    return <main className="admin"><p className="admin__empty">Needs the manufacturing.operate capability (editor+).</p></main>;
  }
  const { batchId } = await params;
  const batch = await getBatchWithSpec(batchId);
  if (!batch) notFound();

  const [timeline, qc, validations, dv, consumed, templates, materials, lots] = await Promise.all([
    getBatchTimeline(batchId),
    listQcForBatch(batchId),
    listDesignValidations(batchId),
    designValidationStatus(batchId),
    lotsForBatch(batchId),
    listTemplates(batch.product_type ?? undefined),
    listMaterials(),
    listMaterialLots(),
  ]);
  const caps = {
    operate: hasCapability(staff.role, "manufacturing.operate"),
    qc: hasCapability(staff.role, "manufacturing.qc"),
    approve: hasCapability(staff.role, "manufacturing.qc_approve"),
  };

  return (
    <main className="admin">
      <header className="admin__head">
        <p className="admin__eyebrow">Manufacturing · {batch.lifecycle_status}{batch.recall_state === "on_hold" ? " · on hold" : ""}</p>
        <h1 className="admin__title">{batch.batch_code}</h1>
        <p className="admin__count">{batch.sku_snapshot} · {batch.product_type}</p>
      </header>
      <BatchDetail
        batch={batch} timeline={timeline} qc={qc} validations={validations} designValidation={dv}
        consumed={consumed} templates={templates} materials={materials} lots={lots} caps={caps}
      />
    </main>
  );
}
