import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Phase 1B-1 — Return receiving + closure boundary DB/service evidence. LOCAL Supabase only.
 * Exercises the REAL service (returnReceivingService) against local Postgres by pointing the admin
 * client at the local instance, plus direct RPC/trigger probes. Acceptance matrix (cases 8–28):
 * receipt-driven restock exactly once · legacy guard · resolution gate + no-return zero movement ·
 * close open_receipts / void-then-close / committed-doesn't-block · idempotent close · invalid-state ·
 * create-after-close · commit-after-close · commit-vs-close serialization (both orderings) ·
 * multi-variant final-missing derivation.
 */
const URL = (process.env.INV_TEST_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.INV_TEST_SERVICE_KEY || "";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL);
const RUN = !!(URL && KEY && LOCAL);
const d = RUN ? describe : describe.skip;

// Point the service's admin client at LOCAL (gated on the local INV_TEST vars — never hosted).
if (RUN) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEY;
}

import { receiveReturnGoods, closeReturnReceiving, getReturnReceiving } from "@/services/returnReceivingService";

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p: string) => `${URL}/rest/v1${p}`;
/* eslint-disable @typescript-eslint/no-explicit-any */
async function rpc<T = any>(fn: string, body: unknown): Promise<T> { const r = await fetch(rest(`/rpc/${fn}`), { method: "POST", headers: H, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${fn} ${r.status}: ${await r.text()}`); return r.json() as Promise<T>; }
async function ins(t: string, row: unknown) { const r = await fetch(rest(`/${t}`), { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) }); return { ok: r.ok, status: r.status, row: r.ok ? (await r.json())[0] : null, err: r.ok ? "" : await r.text() }; }
async function must(t: string, row: unknown) { const r = await ins(t, row); if (!r.ok) throw new Error(`ins ${t}: ${r.err}`); return r.row; }
async function sel<T = any[]>(p: string): Promise<T> { const r = await fetch(rest(p), { headers: H }); return r.json() as Promise<T>; }
async function patch(p: string, body: unknown) { const r = await fetch(rest(p), { method: "PATCH", headers: H, body: JSON.stringify(body) }); return { ok: r.ok, status: r.status }; }
async function del(p: string) { await fetch(rest(p), { method: "DELETE", headers: H }); }

const TAG = `RCV1-${Date.now()}`;
let catId = "", prodId = "", vId = "", vId2 = "", sku = "", sku2 = "";
let n = 0; const uniq = () => `${TAG}-${++n}`;
const stockOf = async (v = vId) => (await sel<any[]>(`/variants?id=eq.${v}&select=stock`))[0].stock as number;

async function makeReturn(status: string, resolution: string | null, lines: { v: string; s: string; qty: number }[]) {
  const o = await must("orders", { order_number: uniq(), email: "t@e.com", phone: "9", status: "delivered", payment_status: "paid", subtotal: 500, total_amount: 500, taxable_amount: 446, cgst_amount: 27, sgst_amount: 27, igst_amount: 0, ship_full_name: "T", ship_phone: "9", ship_line1: "1", ship_city: "C", ship_state: "Karnataka", ship_pincode: "560001" });
  const ret = await must("returns", { order_id: o.id, order_number: o.order_number, rma_number: uniq(), status, return_type: "refund", resolution });
  for (const l of lines) await must("return_items", { return_id: ret.id, variant_id: l.v, sku: l.s, product_name: "p", quantity: l.qty, restock: true });
  return ret;
}
const resetStock = async (s: number, v = vId) => rpc("adjust_inventory", { p: { variant_id: v, mode: "set", qty: s, reason: "reset" } });

beforeAll(async () => {
  if (!RUN) return;
  sku = `${TAG}-SKU`; sku2 = `${TAG}-SKU2`;
  catId = (await must("categories", { name: TAG, slug: TAG.toLowerCase(), sku_prefix: "RC1", default_hsn_code: "3406" })).id;
  prodId = (await must("products", { name: `${TAG} p`, slug: TAG.toLowerCase(), base_sku: `${TAG}-B`, category_id: catId, status: "active", product_type: "candle", hsn_code: "3406", gst_rate: 12, price: 500 })).id;
  vId = (await must("variants", { product_id: prodId, sku, variant_name: "v", price: 500, stock: 0, low_stock_threshold: 1 })).id;
  vId2 = (await must("variants", { product_id: prodId, sku: sku2, variant_name: "v2", price: 500, stock: 0, low_stock_threshold: 1 })).id;
});
afterAll(async () => {
  if (!RUN || !vId) return;
  await del(`/inventory_receipt_items?variant_ref=in.(${vId},${vId2})`);
  const recs = await sel<any[]>(`/inventory_receipts?source_type=eq.return&select=id`);
  await del(`/inventory_receipts?id=in.(${recs.map((r) => r.id).join(",") || "0"})`);
  await del(`/inventory_movements?variant_ref=in.(${vId},${vId2})`);
  await del(`/return_items?variant_id=in.(${vId},${vId2})`);
  await del(`/returns?rma_number=like.${TAG}*`);
  await del(`/orders?order_number=like.${TAG}*`);
  await del(`/variants?id=in.(${vId},${vId2})`); await del(`/products?id=eq.${prodId}`); await del(`/categories?id=eq.${catId}`);
});

d("Return receiving + closure (Phase 1B-1)", () => {
  it("case 9 — receiveReturnGoods restocks exactly once via return_receipt_item key", async () => {
    await resetStock(0);
    const ret = await makeReturn("received", "return_required", [{ v: vId, s: sku, qty: 5 }]);
    const res = await receiveReturnGoods(ret.id, [{ variantId: vId, received: 3, restockable: 3, damaged: 0 }], { actorId: undefined });
    expect(res.ok).toBe(true);
    expect(res.restocked).toBe(3);
    expect(await stockOf()).toBe(3);
    const mv = await sel<any[]>(`/inventory_movements?source_id=eq.${ret.id}&movement_type=eq.return_restock&select=idempotency_key`);
    expect(mv.length).toBe(1);
    expect(String(mv[0].idempotency_key)).toMatch(/^return_receipt_item:/);
  });

  it("case 11 — no-physical-return resolution is refused; zero movement, zero stock", async () => {
    await resetStock(0);
    // return_waived that somehow sits in a receiving state → inconsistent, refused
    const waived = await makeReturn("received", "return_waived", [{ v: vId, s: sku, qty: 5 }]);
    const r1 = await receiveReturnGoods(waived.id, [{ variantId: vId, received: 2, restockable: 2, damaged: 0 }]);
    expect(r1.ok).toBe(false);
    expect(r1.reason).toBe("inconsistent_no_physical_return");
    // unset resolution → resolution_no_physical_return
    const unset = await makeReturn("received", null, [{ v: vId, s: sku, qty: 5 }]);
    const r2 = await receiveReturnGoods(unset.id, [{ variantId: vId, received: 2, restockable: 2, damaged: 0 }]);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe("resolution_no_physical_return");
    expect(await stockOf()).toBe(0);
    const mv = await sel<any[]>(`/inventory_movements?source_id=eq.${waived.id}&select=id`);
    expect(mv.length).toBe(0);
  });

  it("case 10/21 — legacy-restocked return cannot restock via receipts", async () => {
    await resetStock(0);
    const ret = await makeReturn("received", "return_required", [{ v: vId, s: sku, qty: 5 }]);
    // simulate the OLD path having restocked (legacy key namespace)
    await rpc("apply_stock_movement", { p_variant_id: vId, p_delta: 5, p_movement_type: "return_restock", p_source_type: "return", p_source_id: ret.id, p_reference: "RMA", p_actor_id: null, p_reason: null, p_note: null, p_metadata: null, p_idempotency_key: `return:${ret.id}:${vId}` });
    await resetStock(0); // ignore the legacy delta for a clean stock assertion
    const model = await getReturnReceiving(ret.id);
    expect(model?.legacyRestocked).toBe(true);
    expect(model?.canReceive).toBe(false);
    const res = await receiveReturnGoods(ret.id, [{ variantId: vId, received: 3, restockable: 3, damaged: 0 }]);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("legacy_restocked");
    expect(await stockOf()).toBe(0);
  });

  it("case 25 — close rejected while a draft receipt is open (open_receipts)", async () => {
    const ret = await makeReturn("inspection", "return_required", [{ v: vId, s: sku, qty: 5 }]);
    await must("inventory_receipts", { source_type: "return", source_id: ret.id, status: "draft" });
    const res = await closeReturnReceiving(ret.id);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("open_receipts");
  });

  it("case 26 — void the draft, then close succeeds", async () => {
    const ret = await makeReturn("inspection", "return_required", [{ v: vId, s: sku, qty: 5 }]);
    const rec = await must("inventory_receipts", { source_type: "return", source_id: ret.id, status: "draft" });
    await patch(`/inventory_receipts?id=eq.${rec.id}`, { status: "void" });
    const res = await closeReturnReceiving(ret.id);
    expect(res.ok).toBe(true);
    const row = (await sel<any[]>(`/returns?id=eq.${ret.id}&select=receiving_closed_at`))[0];
    expect(row.receiving_closed_at).not.toBeNull();
  });

  it("committed receipt does not block close; case 17 valid close; case 18 idempotent second close", async () => {
    await resetStock(0);
    const ret = await makeReturn("inspection", "return_required", [{ v: vId, s: sku, qty: 5 }]);
    const rcv = await receiveReturnGoods(ret.id, [{ variantId: vId, received: 5, restockable: 4, damaged: 1 }]);
    expect(rcv.ok).toBe(true);
    expect(await stockOf()).toBe(4); // only restockable
    const c1 = await closeReturnReceiving(ret.id);
    expect(c1.ok).toBe(true);
    const c2 = await closeReturnReceiving(ret.id);
    expect(c2.ok).toBe(true);
    expect(c2.alreadyClosed).toBe(true);
  });

  it("case 16 — close rejected from an invalid (non-receiving) state", async () => {
    const ret = await makeReturn("approved", "return_required", [{ v: vId, s: sku, qty: 5 }]);
    const res = await closeReturnReceiving(ret.id);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("invalid_state");
  });

  it("case 14 — creating a receipt after close is rejected at the DB (trigger)", async () => {
    const ret = await makeReturn("inspection", "return_required", [{ v: vId, s: sku, qty: 5 }]);
    await closeReturnReceiving(ret.id);
    const r = await ins("inventory_receipts", { source_type: "return", source_id: ret.id, status: "draft" });
    expect(r.ok).toBe(false);
    expect(r.err).toMatch(/receiving_closed/);
  });

  it("case 15/23 — committing a pre-existing draft after close is rejected; zero post-close stock", async () => {
    await resetStock(0);
    const ret = await makeReturn("inspection", "return_required", [{ v: vId, s: sku, qty: 5 }]);
    const rec = await must("inventory_receipts", { source_type: "return", source_id: ret.id, status: "draft" });
    await must("inventory_receipt_items", { receipt_id: rec.id, variant_id: vId, variant_ref: vId, sku_snapshot: sku, product_name_snapshot: "p", expected_qty: 5, received_qty: 2, restockable_qty: 2, damaged_qty: 0 });
    // force the closure boundary to have won (simulates close-wins ordering)
    await patch(`/returns?id=eq.${ret.id}`, { receiving_closed_at: new Date().toISOString() });
    const viaWrapper = await rpc<any>("commit_return_receipt", { p_receipt_id: rec.id, p_actor_id: null });
    expect(viaWrapper.ok).toBe(false);
    expect(viaWrapper.reason).toBe("receiving_closed");
    // direct frozen commit_receipt must ALSO be blocked by the commit trigger
    let directErr = "";
    try { await rpc("commit_receipt", { p_receipt_id: rec.id, p_actor_id: null }); } catch (e) { directErr = String(e); }
    expect(directErr).toMatch(/receiving_closed/);
    expect(await stockOf()).toBe(0);
  });

  it("case 22 — concurrent commit vs close: single safe outcome, never stock after closure", async () => {
    await resetStock(0);
    const ret = await makeReturn("inspection", "return_required", [{ v: vId, s: sku, qty: 5 }]);
    const rec = await must("inventory_receipts", { source_type: "return", source_id: ret.id, status: "draft" });
    await must("inventory_receipt_items", { receipt_id: rec.id, variant_id: vId, variant_ref: vId, sku_snapshot: sku, product_name_snapshot: "p", expected_qty: 5, received_qty: 3, restockable_qty: 3, damaged_qty: 0 });
    // fire both against the shared return-row FOR UPDATE lock
    const [commitRes, closeRes] = await Promise.all([
      rpc<any>("commit_return_receipt", { p_receipt_id: rec.id, p_actor_id: null }),
      rpc<any>("close_return_receiving", { p_return_id: ret.id, p_actor_id: null }),
    ]);
    const finalReceipt = (await sel<any[]>(`/inventory_receipts?id=eq.${rec.id}&select=status`))[0].status;
    const closed = (await sel<any[]>(`/returns?id=eq.${ret.id}&select=receiving_closed_at`))[0].receiving_closed_at != null;
    const stock = await stockOf();
    // Safe-outcome invariants:
    //  • stock reflects the receipt's final committed status exactly (3 if committed, else 0)
    expect(stock).toBe(finalReceipt === "committed" ? 3 : 0);
    //  • a successful close implies the draft was resolved first — never a draft stranded behind a closed boundary
    if (closed) expect(finalReceipt).not.toBe("draft");
    //  • never both "committed after a close won open_receipts": if close rejected open_receipts, commit still succeeded
    if (!closeRes.ok) { expect(closeRes.reason).toBe("open_receipts"); expect(commitRes.ok).toBe(true); expect(stock).toBe(3); }
  });

  it("case 20 — multi-variant final missing is derived per variant after closure", async () => {
    await resetStock(0); await resetStock(0, vId2);
    const ret = await makeReturn("inspection", "return_required", [{ v: vId, s: sku, qty: 5 }, { v: vId2, s: sku2, qty: 4 }]);
    // receive 3 of variant A (2 missing), 4 of variant B (0 missing)
    const rcv = await receiveReturnGoods(ret.id, [
      { variantId: vId, received: 3, restockable: 3, damaged: 0 },
      { variantId: vId2, received: 4, restockable: 4, damaged: 0 },
    ]);
    expect(rcv.ok).toBe(true);
    await closeReturnReceiving(ret.id);
    const model = await getReturnReceiving(ret.id);
    const a = model!.variants.find((v) => v.variantRef === vId)!;
    const b = model!.variants.find((v) => v.variantRef === vId2)!;
    expect(a.expected).toBe(5); expect(a.received).toBe(3); expect(a.finalMissing).toBe(2);
    expect(b.expected).toBe(4); expect(b.received).toBe(4); expect(b.finalMissing).toBe(0);
  });

  it("V3 — close_return_receiving is inventory-neutral (zero movement, zero stock delta)", async () => {
    await resetStock(0);
    // expected 5; receive 3 → 2 restockable (+stock), 1 damaged (audit-only); 2 remain missing
    const ret = await makeReturn("inspection", "return_required", [{ v: vId, s: sku, qty: 5 }]);
    const rcv = await receiveReturnGoods(ret.id, [{ variantId: vId, received: 3, restockable: 2, damaged: 1 }]);
    expect(rcv.ok).toBe(true);
    const stockBefore = await stockOf();
    expect(stockBefore).toBe(2); // only restockable moved
    const mvBefore = (await sel<any[]>(`/inventory_movements?source_id=eq.${ret.id}&select=id`)).length;

    const res = await closeReturnReceiving(ret.id);
    expect(res.ok).toBe(true);

    // Closure mutates NO inventory: no stock delta, no new/balancing movement.
    expect(await stockOf()).toBe(stockBefore);
    const mvAfter = (await sel<any[]>(`/inventory_movements?source_id=eq.${ret.id}&select=id`)).length;
    expect(mvAfter).toBe(mvBefore);
    // Boundary set; missing stays DERIVED (no scalar column exists to store it).
    const row = (await sel<any[]>(`/returns?id=eq.${ret.id}&select=receiving_closed_at,receiving_closed_by`))[0];
    expect(row.receiving_closed_at).not.toBeNull();
    const cols = await sel<any[]>(`/returns?id=eq.${ret.id}&select=*`);
    expect(Object.keys(cols[0])).not.toContain("receiving_shortage");
    // Audit event carries the correct per-variant final breakdown.
    const audit = await sel<any[]>(`/audit_events?entity_id=eq.${ret.id}&event=eq.return.receiving_closed&select=metadata`);
    expect(audit.length).toBe(1);
    const v = audit[0].metadata.variants.find((x: any) => x.variant_ref === vId);
    expect(v).toMatchObject({ expected: 5, received: 3, missing: 2 });
  });
});
