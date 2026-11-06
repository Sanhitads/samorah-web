import { describe, it, expect, beforeAll, vi } from "vitest";

/**
 * Phase 9 — /api/admin/recalls route: single-capability gate (manufacturing.recall), server-derived actor,
 * and dispatch into the recall service. LOCAL Supabase only.
 */
const URL = (process.env.INV_TEST_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.INV_TEST_SERVICE_KEY || "";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL);
const RUN = !!(URL && KEY && LOCAL);
const d = RUN ? describe : describe.skip;
if (RUN) { process.env.NEXT_PUBLIC_SUPABASE_URL = URL; process.env.SUPABASE_SERVICE_ROLE_KEY = KEY; }

const staff = vi.hoisted(() => ({ role: "admin", userId: "" }));
vi.mock("@/lib/auth/requireStaff", async () => {
  const { hasCapability } = await import("@/lib/auth/capabilities");
  return { requireCapability: async (cap: string) => ({ ok: !!staff.userId && hasCapability(staff.role, cap as never), role: staff.role, userId: staff.userId }), requireStaff: async () => ({ ok: !!staff.userId, role: staff.role, userId: staff.userId }) };
});

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p: string) => `${URL}/rest/v1${p}`;
/* eslint-disable @typescript-eslint/no-explicit-any */
const sel = async (p: string) => (await fetch(rest(p), { headers: H })).json() as any;
const ins = async (t: string, row: any) => { const r = await fetch(rest(`/${t}`), { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) }); if (!r.ok) throw new Error(`${t}: ${await r.text()}`); return (await r.json())[0]; };
const rpc = async (fn: string, body: any) => (await fetch(rest(`/rpc/${fn}`), { method: "POST", headers: H, body: JSON.stringify(body) })).json().catch(() => null);

import { POST } from "@/app/api/admin/recalls/route";
import { createBatch, updateBatch, startProduction } from "@/services/manufacturing/batchService";
import { toCuring, toQualityCheck, approveQc } from "@/services/manufacturing/lifecycleService";
import { recordRoutineQc, recordDesignValidation } from "@/services/manufacturing/qcService";
import { releaseBatch } from "@/services/manufacturing/releaseService";
import { setAllocationEnabled, setReleaseEnabled, setVariantTracking } from "@/services/manufacturing/activationService";
import { confirmPickBatch, recordPackingQc, confirmShipmentProvenance } from "@/services/manufacturing/fulfillmentProvenanceService";
import type { StaffActor } from "@/services/manufacturing/actor";

const post = async (body: any) => { const res = await POST(new Request("http://t/api/admin/recalls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })); return { status: res.status, json: (await res.json()) as any }; };
const RUNK = Date.now().toString(36).slice(-5);
let sup: StaffActor, mgr: StaffActor, ed: StaffActor; let batchId = "";

d("POST /api/admin/recalls", () => {
  beforeAll(async () => {
    const us = await sel("/users?select=id&limit=2"); staff.userId = us[0].id;
    sup = { userId: us[0].id, role: "super_admin" }; mgr = { userId: us[1]?.id ?? us[0].id, role: "manager" }; ed = { userId: us[0].id, role: "editor" };
    await setReleaseEnabled(sup, true); await setAllocationEnabled(sup, true);
    const cat = (await sel("/categories?select=id&limit=1"))[0]; const t = `${RUNK}${Math.random().toString(36).slice(2, 5)}`;
    const p = await ins("products", { name: `RAPI ${t}`, slug: `rapi-${t}`, base_sku: `RAPI-${t}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: ("RA" + Math.random().toString(36).slice(2, 5)).toUpperCase().slice(0, 6) });
    const v = await ins("variants", { product_id: p.id, sku: `RAPI-${t}-GL`.toUpperCase(), price: 100, vessel_type: "glass", size_label: "100g", tracking_state: "untracked", is_active: false });
    await setVariantTracking(sup, v.id, "tracked");
    const { batchId: b } = await createBatch(mgr, { variantId: v.id, idempotencyKey: `RAB-${RUNK}`, manufacturingDate: "2026-10-01", plannedQty: 10, earliestReleaseDate: "2026-10-10" });
    batchId = b;
    await updateBatch(mgr, { batchId: b, producedQty: 10, pendingInspectionQty: 10 }); await startProduction(mgr, b); await toCuring(mgr, b); await toQualityCheck(mgr, b);
    await recordRoutineQc(ed, { batchId: b, inspectedQty: 10, approvedDelta: 10, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 100 } });
    await recordDesignValidation(ed, { batchId: b, result: "pass", measurements: { flame: "stable" } });
    await approveQc(mgr, b); await releaseBatch(mgr, { batchId: b, qty: 10, idempotencyKey: `RAR-${RUNK}` });
    // a shipped order so impact/notifications have actual provenance
    const roid = `rzp_rapi_${RUNK}`;
    const o = await ins("orders", { order_number: `RAPI-${RUNK}`, email: `r-${RUNK}@example.test`, status: "pending", payment_status: "pending", total_amount: 200, razorpay_order_id: roid, ship_full_name: "R" });
    const oi = await ins("order_items", { order_id: o.id, variant_id: v.id, product_name: "T", sku: "T", hsn_code: "34060010", gst_rate: 5, unit_price: 100, quantity: 2, line_subtotal: 200, line_total: 200 });
    await ins("stock_reservations", { variant_id: v.id, quantity: 2, order_id: o.id, session_id: `s-${RUNK}`, expires_at: new Date(Date.now() + 3600e3).toISOString() });
    await rpc("finalize_order", { p_razorpay_order_id: roid, p_payment_id: `pay_${RUNK}`, p_signature: "sig", p_source: "test", p_amount_paise: null });
    await confirmPickBatch(ed, { orderItemId: oi.id, batchId: b, qty: 2 }); await recordPackingQc(ed, o.id, { product_ok: true, variant_ok: true, batch_ok: true, qty_ok: true, vessel_ok: true, label_ok: true, packaging_ok: true });
    const sh = await ins("shipments", { order_id: o.id, status: "pending", provider: "manual" }); await confirmShipmentProvenance(ed, sh.id);
  });

  it("rejects unknown action; 403s roles below manufacturing.recall", async () => {
    staff.role = "admin"; expect((await post({ action: "nope" })).status).toBe(400);
    for (const role of ["customer", "editor", "manager"]) { staff.role = role; expect((await post({ action: "list" })).status).toBe(403); }
    staff.role = "admin";
  });

  it("runs the full console flow through the route (actor from session)", async () => {
    staff.role = "admin";
    const created = await post({ action: "create", kind: "recall", reason: "api test" });
    expect(created.status).toBe(200); const recallId = created.json.result.recallId;
    expect((await post({ action: "add_batches", recallId, batchIds: [batchId] })).json.result.added).toBe(1);
    expect((await post({ action: "transition", recallId, toState: "initiated" })).json.result.status).toBe("initiated");
    // containment stamped the batch (fail-closed)
    expect((await sel(`/manufacturing_batches?id=eq.${batchId}&select=recall_state`))[0].recall_state).toBe("recalled");
    const impact = await post({ action: "impact", batchId });
    expect(impact.json.result.some((i: any) => i.provenance === "shipped")).toBe(true);
    const prep = await post({ action: "prepare_notifications", recallId });
    expect(prep.json.result.ok).toBe(true);
    const notes = await post({ action: "list_notifications", recallId });
    expect(notes.json.result.length).toBeGreaterThanOrEqual(1);
    expect(notes.json.result.every((x: any) => x.attempts === 0)).toBe(true); // nothing sent
    // customer-PII action also requires the capability (admin ok here; lower roles 403 as above)
    const custs = await post({ action: "affected_customers", batchId });
    expect(custs.status).toBe(200);
  });
});
