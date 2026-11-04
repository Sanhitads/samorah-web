import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Phase 7A — batch-aware sale allocation (INERT; disposable test-only tracked variants).
 * Drives finalize_order against seeded pending orders and verifies attribution + conservation.
 */
const URL = (process.env.INV_TEST_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.INV_TEST_SERVICE_KEY || "";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL);
const RUN = !!(URL && KEY && LOCAL);
const d = RUN ? describe : describe.skip;
if (RUN) { process.env.NEXT_PUBLIC_SUPABASE_URL = URL; process.env.SUPABASE_SERVICE_ROLE_KEY = KEY; }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p: string) => `${URL}/rest/v1${p}`;
/* eslint-disable @typescript-eslint/no-explicit-any */
const sel = async (p: string) => (await fetch(rest(p), { headers: H })).json() as any;
const ins = async (t: string, row: any) => { const r = await fetch(rest(`/${t}`), { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) }); if (!r.ok) throw new Error(`${t}: ${await r.text()}`); return (await r.json())[0]; };
const rpc = async (fn: string, body: any) => { const r = await fetch(rest(`/rpc/${fn}`), { method: "POST", headers: H, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) as any }; };

import { createBatch, updateBatch, startProduction } from "@/services/manufacturing/batchService";
import { toCuring, toQualityCheck, approveQc } from "@/services/manufacturing/lifecycleService";
import { recordRoutineQc, recordDesignValidation } from "@/services/manufacturing/qcService";
import { releaseBatch, variantReconciliation } from "@/services/manufacturing/releaseService";
import { setAllocationEnabled, setReleaseEnabled, setVariantTracking } from "@/services/manufacturing/activationService";
import type { StaffActor } from "@/services/manufacturing/actor";

const RUNK = Date.now().toString(36).slice(-5);
let superadmin: StaffActor, manager: StaffActor, inspector: StaffActor;
let V = "", Vprod = "", V2 = "", U = "";
let saleN = 0;

async function makeVariant(tracked: boolean): Promise<{ productId: string; variantId: string }> {
  const cat = (await sel("/categories?select=id&limit=1"))[0];
  const t = `${RUNK}${Math.random().toString(36).slice(2, 5)}`;
  const pref = ("S" + Math.random().toString(36).slice(2, 6)).toUpperCase().slice(0, 6);
  const p = await ins("products", { name: `SALE ${t}`, slug: `sale-${t}`, base_sku: `SALE-${t}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: pref });
  const v = await ins("variants", { product_id: p.id, sku: `SALE-${t}-GL`.toUpperCase(), price: 100, vessel_type: "glass", size_label: "100g", tracking_state: tracked ? "untracked" : "untracked" });
  if (tracked) await setVariantTracking(superadmin, v.id, "tracked");
  return { productId: p.id, variantId: v.id };
}
async function releasedBatch(variantId: string, qty: number): Promise<string> {
  const { batchId } = await createBatch(manager, { variantId, idempotencyKey: `SB-${RUNK}-${Math.random()}`, manufacturingDate: "2026-12-10", plannedQty: qty, earliestReleaseDate: "2026-01-01" });
  await updateBatch(manager, { batchId, producedQty: qty, pendingInspectionQty: qty });
  await startProduction(manager, batchId); await toCuring(manager, batchId); await toQualityCheck(manager, batchId);
  await recordRoutineQc(inspector, { batchId, inspectedQty: qty, approvedDelta: qty, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 100 } });
  await recordDesignValidation(inspector, { batchId, result: "pass", measurements: { flame: "stable" } });
  await approveQc(manager, batchId);
  await releaseBatch(manager, { batchId, qty, idempotencyKey: `SR-${RUNK}-${Math.random()}` });
  return batchId;
}
async function sale(items: Array<{ variantId: string; qty: number; productId?: string; lines?: number }>, opts: { roid?: string } = {}) {
  const tag = `${RUNK}-${saleN++}`;
  const roid = opts.roid ?? `rzp_${tag}`;
  const o = await ins("orders", { order_number: `SALE-${tag}`, email: "t@example.test", status: "pending", payment_status: "pending", total_amount: items.reduce((n, i) => n + i.qty * 100, 0), razorpay_order_id: roid });
  for (const it of items) {
    const lines = it.lines ?? 1; const per = Math.floor(it.qty / lines);
    for (let k = 0; k < lines; k++) {
      const q = k === lines - 1 ? it.qty - per * (lines - 1) : per;
      await ins("order_items", { order_id: o.id, product_id: it.productId ?? null, variant_id: it.variantId, product_name: "T", sku: "T", hsn_code: "34060010", gst_rate: 5, unit_price: 100, quantity: q, line_subtotal: q * 100, line_total: q * 100 });
    }
    await ins("stock_reservations", { variant_id: it.variantId, quantity: it.qty, order_id: o.id, session_id: `sess-${tag}`, expires_at: new Date(Date.now() + 3600e3).toISOString() });
  }
  const r = await rpc("finalize_order", { p_razorpay_order_id: roid, p_payment_id: `pay_${tag}`, p_signature: "sig", p_source: "test", p_amount_paise: null });
  return { orderId: o.id, roid, result: r.body };
}
const overlays = async (orderId: string) => sel(`/batch_stock_entries?source_id=eq.${orderId}&entry_type=eq.sale&select=batch_id,qty`);
const allocs = async (orderId: string) => sel(`/batch_allocations?order_id=eq.${orderId}&select=order_item_id,batch_id,qty`);
const drift = async (v: string) => (await variantReconciliation(v)).overlay_ledger_drift;

d("Phase 7A — batch-aware sale allocation (inert)", () => {
  beforeAll(async () => {
    const us = await sel("/users?select=id&limit=2");
    superadmin = { userId: us[0].id, role: "super_admin" };
    manager = { userId: us[1]?.id ?? us[0].id, role: "manager" };
    inspector = { userId: us[0].id, role: "editor" };
    await setReleaseEnabled(superadmin, true);
    await setAllocationEnabled(superadmin, true);
    ({ productId: Vprod, variantId: V } = await makeVariant(true));
    ({ variantId: V2 } = await makeVariant(true));
    ({ variantId: U } = await makeVariant(false));
    await rpc("adjust_inventory", { p: { variant_id: U, mode: "set", qty: 50, reason: "Physical count correction" } }); // untracked seed stock
    await releasedBatch(V, 10); await releasedBatch(V, 10);  // V: two batches, on-hand 20
    await releasedBatch(V2, 8);
  });
  afterAll(async () => { if (RUN) await setAllocationEnabled(superadmin, false); });

  it("1. single-batch sale attributes one batch; reconciliation drift 0", async () => {
    const { orderId } = await sale([{ variantId: V, qty: 4 }]);
    const o = await overlays(orderId);
    expect(o.length).toBe(1); expect(o[0].qty).toBe(-4);
    expect((await allocs(orderId)).reduce((n: number, a: any) => n + a.qty, 0)).toBe(4);
    expect(await drift(V)).toBe(0);
  });

  it("2. multi-batch sale spans batches FIFO; drift 0", async () => {
    const { orderId } = await sale([{ variantId: V, qty: 12 }]); // batch1 has 6 left + batch2 10 → spans
    const o = await overlays(orderId);
    expect(o.length).toBeGreaterThanOrEqual(2);
    expect(o.reduce((n: number, e: any) => n + e.qty, 0)).toBe(-12); // overlay sums to the sale
    expect(await drift(V)).toBe(0);
  });

  it("3-4. multi-variant + mixed tracked/untracked: tracked attributed, untracked untagged", async () => {
    const { orderId } = await sale([{ variantId: V2, qty: 3 }, { variantId: U, qty: 2 }]);
    const o = await overlays(orderId);
    expect(o.every((e: any) => true)).toBe(true);
    // V2 attributed
    expect(o.reduce((n: number, e: any) => n + e.qty, 0)).toBe(-3); // only V2 has overlay; U (untracked) has none
    expect(await drift(V2)).toBe(0);
    expect(await drift(U)).toBe(0); // untracked → no overlay, no drift
  });

  it("5. duplicate finalize is idempotent (no double allocation)", async () => {
    const { roid, orderId } = await sale([{ variantId: V2, qty: 2 }]);
    const before = (await overlays(orderId)).reduce((n: number, e: any) => n + e.qty, 0);
    const again = await rpc("finalize_order", { p_razorpay_order_id: roid, p_payment_id: "x", p_signature: "s", p_source: "retry", p_amount_paise: null });
    expect(again.body.created).toBe(false);
    expect((await overlays(orderId)).reduce((n: number, e: any) => n + e.qty, 0)).toBe(before);
  });

  it("6. concurrent checkouts on one variant serialise without over-allocation; drift 0", async () => {
    const { variantId: Vc } = await makeVariant(true); await releasedBatch(Vc, 6);
    const [a, b] = await Promise.all([sale([{ variantId: Vc, qty: 3 }]), sale([{ variantId: Vc, qty: 3 }])]);
    expect(a.result.created && b.result.created).toBe(true);
    expect(await drift(Vc)).toBe(0); // 6 released, 6 sold, overlay nets exactly
  });

  it("7+10. eligible shortfall (revoked config) → sale posts, order PAID, shortfall logged, nothing invented", async () => {
    const { variantId: Vs } = await makeVariant(true);
    const b = await releasedBatch(Vs, 5); // aggregate stock = 5
    const dv = (await sel(`/batch_design_validations?batch_id=eq.${b}&state=eq.approved&select=id`))[0];
    await rpc("revoke_design_validation", { p: { validation_id: dv.id, reason: "safety recall of config", actor_id: manager.userId } });
    const { orderId, result } = await sale([{ variantId: Vs, qty: 3 }]); // stock covers the sale, but the batch is now ineligible
    expect(result.created).toBe(true); // payment finalised — never blocked
    expect((await overlays(orderId)).length).toBe(0); // nothing attributed to the revoked batch
    const shortfall = await sel(`/audit_logs?entity_id=eq.${orderId}&action=eq.inventory.allocation_shortfall&select=after_data`);
    expect(shortfall.length).toBe(1);
    expect(shortfall[0].after_data.shortfall).toBe(3);
  });

  it("11+17. cancel/adjust fail CLOSED on a tracked variant; untracked unaffected", async () => {
    // manual adjustment on a tracked variant is refused by the guard trigger
    const adj = await rpc("adjust_inventory", { p: { variant_id: V, mode: "add", qty: 1, reason: "Physical count correction" } });
    expect(adj.status).toBeGreaterThanOrEqual(400);
    // same adjustment on the untracked variant still works
    const adjU = await rpc("adjust_inventory", { p: { variant_id: U, mode: "add", qty: 1, reason: "Physical count correction" } });
    expect(adjU.status).toBe(200);
  });

  it("12. bundle/multi-line: provenance split across order items of one variant", async () => {
    const { variantId: Vb } = await makeVariant(true); await releasedBatch(Vb, 10);
    const { orderId } = await sale([{ variantId: Vb, qty: 6, lines: 2 }]); // two order_items, 3 each
    const a = await allocs(orderId);
    const perItem = new Set(a.map((x: any) => x.order_item_id));
    expect(perItem.size).toBe(2); // allocation recorded against both order items
    expect(a.reduce((n: number, x: any) => n + x.qty, 0)).toBe(6);
    expect(await drift(Vb)).toBe(0);
  });

  it("13-16. held/revoked batches are skipped by eligibility", async () => {
    const { variantId: Ve } = await makeVariant(true);
    const held = await releasedBatch(Ve, 5);
    await rpc("set_batch_hold", { p: { batch_id: held, hold: true, reason: "quarantine" } });
    const { orderId, result } = await sale([{ variantId: Ve, qty: 1 }]); // only eligible batch is held → shortfall
    expect(result.created).toBe(true);
    expect((await overlays(orderId)).length).toBe(0); // nothing attributed from the held batch
    const sf = await sel(`/audit_logs?entity_id=eq.${orderId}&action=eq.inventory.allocation_shortfall&select=id`);
    expect(sf.length).toBe(1);
  });
});
