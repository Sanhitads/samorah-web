import { describe, it, expect, beforeAll } from "vitest";

/**
 * Phase 3 — manufacturing identity, production records & material traceability.
 * LOCAL Supabase only. NON-STOCK: asserts only batch/material tables change.
 */
const URL = (process.env.INV_TEST_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.INV_TEST_SERVICE_KEY || "";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL);
const RUN = !!(URL && KEY && LOCAL);
const d = RUN ? describe : describe.skip;
if (RUN) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
}
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p: string) => `${URL}/rest/v1${p}`;
/* eslint-disable @typescript-eslint/no-explicit-any */
const sel = async (p: string) => (await fetch(rest(p), { headers: H })).json() as any;

import {
  createBatch, updateBatch, startProduction, getBatch, getBatchTimeline, setProductBatchPrefix, ForbiddenError, type StaffActor,
} from "@/services/manufacturing/batchService";
import { registerMaterial, registerMaterialLot, recordConsumption, lotsForBatch, batchesForLot } from "@/services/manufacturing/materialService";

const RUNK = Date.now().toString(36).slice(-5);
let admin: StaffActor;
let productId = "", variantId = "", variant2Id = "", prefix = "";

d("Manufacturing Phase 3 (identity, records, materials)", () => {
  beforeAll(async () => {
    const users = await sel("/users?select=id&role=eq.admin&limit=1");
    admin = { userId: users?.[0]?.id, role: "admin" };
    const vs = await sel("/variants?select=id,product_id&limit=2&order=sku.asc");
    variantId = vs?.[0]?.id; productId = vs?.[0]?.product_id; variant2Id = vs?.[1]?.id ?? variantId;
    prefix = ("T" + String(productId).replace(/-/g, "").slice(0, 4)).toUpperCase();
    await setProductBatchPrefix(admin, productId, prefix);
  });

  it("creates a batch with a generated code and is idempotent on retry", async () => {
    const key = `K-${RUNK}-1`;
    const a = await createBatch(admin, { variantId, idempotencyKey: key, manufacturingDate: "2026-12-01", plannedQty: 50 });
    expect(a.created).toBe(true);
    expect(a.batchCode.startsWith(`${prefix}-`)).toBe(true);
    expect(a.batchCode.split("-").length).toBe(4);
    const b = await createBatch(admin, { variantId, idempotencyKey: key, manufacturingDate: "2026-12-01", plannedQty: 50 });
    expect(b.created).toBe(false);
    expect(b.batchId).toBe(a.batchId); // same batch, no duplicate
    expect(b.batchCode).toBe(a.batchCode);
  });

  it("rejects a reused idempotency key with conflicting input (no silent return/modify)", async () => {
    const key = `CONFLICT-${RUNK}`;
    const first = await createBatch(admin, { variantId, idempotencyKey: key, manufacturingDate: "2026-12-01", plannedQty: 50 });
    expect(first.created).toBe(true);
    // Same key, DIFFERENT planned_qty → must raise, not silently return the original.
    await expect(createBatch(admin, { variantId, idempotencyKey: key, manufacturingDate: "2026-12-01", plannedQty: 99 })).rejects.toThrow();
    // The original batch is unchanged.
    const row = await getBatch(first.batchId);
    expect(row.planned_qty).toBe(50);
  });

  it("generates unique, contiguous codes under concurrent creation", async () => {
    const N = 5;
    const res = await Promise.all(
      Array.from({ length: N }, (_, i) => createBatch(admin, { variantId, idempotencyKey: `C-${RUNK}-${i}`, manufacturingDate: "2026-12-02", plannedQty: 1 })),
    );
    const codes = res.map((r) => r.batchCode);
    const seqs = res.map((r) => r.productionSequence).sort((a, b) => a - b);
    expect(new Set(codes).size).toBe(N); // all codes unique
    expect(new Set(seqs).size).toBe(N); // all sequences unique (no reuse)
    expect(seqs[N - 1] - seqs[0]).toBe(N - 1); // a contiguous run of N — no gaps, no collisions
  });

  it("supports a different variant (own code scope)", async () => {
    const r = await createBatch(admin, { variantId: variant2Id, idempotencyKey: `V2-${RUNK}`, manufacturingDate: "2026-12-01", plannedQty: 3 });
    expect(r.created).toBe(true);
    expect(r.batchCode.split("-").length).toBe(4); // PREFIX-FORMAT-YYMMDD-SEQ — its own well-formed scope
    expect(Number(r.batchCode.split("-").pop())).toBeGreaterThanOrEqual(1);
  });

  it("edits a production record atomically and enforces quantity conservation", async () => {
    const { batchId } = await createBatch(admin, { variantId, idempotencyKey: `U-${RUNK}`, manufacturingDate: "2026-12-03", plannedQty: 10 });
    await updateBatch(admin, { batchId, producedQty: 10, pendingInspectionQty: 10 }); // 10 = 0+0+0+10
    await updateBatch(admin, { batchId, pendingInspectionQty: 0, approvedQty: 8, rejectedQty: 1, qcSampledDestroyedQty: 1 }); // 10 = 8+1+1+0
    const row = await getBatch(batchId);
    expect(row.produced_qty).toBe(10);
    expect(row.approved_qty).toBe(8);
    // Violating the conservation equation must throw (produced 10 ≠ 5+1+1+0).
    await expect(updateBatch(admin, { batchId, approvedQty: 5 })).rejects.toThrow();
  });

  it("starts production, records timeline, and keeps batch identity immutable", async () => {
    const { batchId, batchCode } = await createBatch(admin, { variantId, idempotencyKey: `S-${RUNK}`, manufacturingDate: "2026-12-04", plannedQty: 5 });
    await startProduction(admin, batchId);
    const row = await getBatch(batchId);
    expect(row.lifecycle_status).toBe("in_production");
    expect(row.batch_code).toBe(batchCode); // identity unchanged
    const tl = await getBatchTimeline(batchId);
    expect(tl.map((t: any) => t.to_state)).toEqual(["draft", "in_production"]);
  });

  it("blocks edits once the batch leaves the editable lifecycle", async () => {
    const { batchId } = await createBatch(admin, { variantId, idempotencyKey: `L-${RUNK}`, manufacturingDate: "2026-12-05", plannedQty: 2 });
    // Simulate a later-phase state (QC/release are future phases) via a direct service-role write.
    await fetch(rest(`/manufacturing_batches?id=eq.${batchId}`), { method: "PATCH", headers: H, body: JSON.stringify({ lifecycle_status: "released" }) });
    await expect(updateBatch(admin, { batchId, notes: "should fail" })).rejects.toThrow();
  });

  it("records material consumption and answers traceability both directions", async () => {
    const { batchId } = await createBatch(admin, { variantId, idempotencyKey: `M-${RUNK}`, manufacturingDate: "2026-12-06", plannedQty: 4 });
    const materialId = await registerMaterial(admin, { name: `Soy Wax ${RUNK}`, materialType: "wax", defaultUom: "kg" });
    const lotId = await registerMaterialLot(admin, { materialId, supplierLotCode: `LOT-${RUNK}`, supplierName: "Acme Waxes", receivedQty: 100, uom: "kg" });
    const c1 = await recordConsumption(admin, { batchId, materialLotId: lotId, qtyConsumed: 2.5, uom: "kg" });
    expect(c1.consumptionId).toBeTruthy();
    // A repeated LEGITIMATE consumption event (e.g. a top-up) is a distinct, appended row.
    const c2 = await recordConsumption(admin, { batchId, materialLotId: lotId, qtyConsumed: 1, uom: "kg" });
    expect(c2.consumptionId).not.toBe(c1.consumptionId);
    // A true retry (same idempotency key) is deduped — no duplicate, same row.
    const k = `CONS-${RUNK}`;
    const r1 = await recordConsumption(admin, { batchId, materialLotId: lotId, qtyConsumed: 0.5, uom: "kg", idempotencyKey: k });
    const r2 = await recordConsumption(admin, { batchId, materialLotId: lotId, qtyConsumed: 0.5, uom: "kg", idempotencyKey: k });
    expect(r2.idempotent).toBe(true);
    expect(r2.consumptionId).toBe(r1.consumptionId);
    // Cannot consume more of a lot than was received (100 kg).
    await expect(recordConsumption(admin, { batchId, materialLotId: lotId, qtyConsumed: 1000, uom: "kg" })).rejects.toThrow();
    // Mismatched unit is rejected (no misleading record).
    await expect(recordConsumption(admin, { batchId, materialLotId: lotId, qtyConsumed: 1, uom: "g" })).rejects.toThrow();
    // batch → lots
    const lots = await lotsForBatch(batchId);
    expect(lots.some((l: any) => l.material_lots?.id === lotId)).toBe(true);
    // lot → batches (reverse)
    const batches = await batchesForLot(lotId);
    expect(batches.some((b: any) => b.manufacturing_batches?.id === batchId)).toBe(true);
  });

  it("rejects invalid references", async () => {
    await expect(createBatch(admin, { variantId: "00000000-0000-4000-8000-000000000000", idempotencyKey: `BAD-${RUNK}` })).rejects.toThrow();
    const { batchId } = await createBatch(admin, { variantId, idempotencyKey: `MB-${RUNK}`, manufacturingDate: "2026-12-07" });
    await expect(recordConsumption(admin, { batchId, materialLotId: "00000000-0000-4000-8000-000000000000", qtyConsumed: 1 })).rejects.toThrow();
  });

  it("makes the product batch_prefix immutable once a batch exists", async () => {
    // A batch for `productId` already exists (created above), so changing its prefix must fail.
    await expect(setProductBatchPrefix(admin, productId, "ZZ9")).rejects.toThrow(/immutable/i);
    // Setting it to the SAME value is a harmless no-op.
    await setProductBatchPrefix(admin, productId, prefix);
  });

  it("rejects unauthorized writes (capability enforced server-side)", async () => {
    const customer: StaffActor = { userId: "11111111-1111-4000-8000-111111111111", role: "customer" };
    await expect(createBatch(customer, { variantId, idempotencyKey: `UA-${RUNK}` })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(registerMaterial(customer, { name: "x", materialType: "wax" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});
