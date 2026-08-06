import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Phase 1B-2 — RTO receiving + closure boundary DB/service evidence. LOCAL Supabase only.
 * Exercises the REAL service (rtoReceivingService) against local Postgres. Acceptance matrix maps to the
 * approved requirements: (1) one-shipment-per-order invariant · (2) closure neutrality · (3) all-damaged ·
 * (4) financial neutrality · (5) commit-vs-close concurrency · (6) post-close protection · (7) retry
 * idempotency + webhook-status-never-restocks · (8/10) restock only via the frozen path.
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

import { receiveRtoGoods, closeRtoReceiving, getShipmentRtoReceiving } from "@/services/rtoReceivingService";

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p: string) => `${URL}/rest/v1${p}`;
/* eslint-disable @typescript-eslint/no-explicit-any */
async function rpc<T = any>(fn: string, body: unknown): Promise<T> { const r = await fetch(rest(`/rpc/${fn}`), { method: "POST", headers: H, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${fn} ${r.status}: ${await r.text()}`); return r.json() as Promise<T>; }
async function ins(t: string, row: unknown) { const r = await fetch(rest(`/${t}`), { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) }); return { ok: r.ok, status: r.status, row: r.ok ? (await r.json())[0] : null, err: r.ok ? "" : await r.text() }; }
async function must(t: string, row: unknown) { const r = await ins(t, row); if (!r.ok) throw new Error(`ins ${t}: ${r.err}`); return r.row; }
async function sel<T = any[]>(p: string): Promise<T> { const r = await fetch(rest(p), { headers: H }); return r.json() as Promise<T>; }
async function patch(p: string, body: unknown) { await fetch(rest(p), { method: "PATCH", headers: H, body: JSON.stringify(body) }); }
async function del(p: string) { await fetch(rest(p), { method: "DELETE", headers: H }); }

const TAG = `RTO1-${Date.now()}`;
let catId = "", prodId = "", vId = "", vId2 = "", sku = "", sku2 = "", actorUserId = "";
let n = 0; const uniq = () => `${TAG}-${++n}`;
const stockOf = async (v = vId) => (await sel<any[]>(`/variants?id=eq.${v}&select=stock`))[0].stock as number;

async function makeRto(lines: { v: string; s: string; qty: number }[]) {
  const o = await must("orders", { order_number: uniq(), email: "c@e.com", phone: "9", status: "rto", payment_status: "paid", subtotal: 500, total_amount: 500, taxable_amount: 446, cgst_amount: 27, sgst_amount: 27, igst_amount: 0, ship_full_name: "C", ship_phone: "9", ship_line1: "1", ship_city: "C", ship_state: "Karnataka", ship_pincode: "560001" });
  for (const l of lines) await must("order_items", { order_id: o.id, variant_id: l.v, product_name: "p", sku: l.s, hsn_code: "3406", gst_rate: 12, unit_price: 500, quantity: l.qty, line_subtotal: 500 * l.qty, line_discount: 0, line_taxable: 446 * l.qty, line_cgst: 27 * l.qty, line_sgst: 27 * l.qty, line_igst: 0, line_total: 500 * l.qty });
  const s = await must("shipments", { order_id: o.id, provider: "manual", status: "rto" });
  return { order: o, ship: s };
}
const resetStock = async (s: number, v = vId) => rpc("adjust_inventory", { p: { variant_id: v, mode: "set", qty: s, reason: "reset" } });

beforeAll(async () => {
  if (!RUN) return;
  sku = `${TAG}-SKU`; sku2 = `${TAG}-SKU2`;
  catId = (await must("categories", { name: TAG, slug: TAG.toLowerCase(), sku_prefix: "RT1", default_hsn_code: "3406" })).id;
  prodId = (await must("products", { name: `${TAG} p`, slug: TAG.toLowerCase(), base_sku: `${TAG}-B`, category_id: catId, status: "active", product_type: "candle", hsn_code: "3406", gst_rate: 12, price: 500 })).id;
  vId = (await must("variants", { product_id: prodId, sku, variant_name: "v", price: 500, stock: 0, low_stock_threshold: 1 })).id;
  vId2 = (await must("variants", { product_id: prodId, sku: sku2, variant_name: "v2", price: 500, stock: 0, low_stock_threshold: 1 })).id;
  // one real auth-backed actor for the actor-linkage test (public.users.id is FK'd to auth.users)
  const au = await fetch(`${URL}/auth/v1/admin/users`, { method: "POST", headers: H, body: JSON.stringify({ email: `${TAG.toLowerCase()}-actor@x.local`, password: "Password123!", email_confirm: true }) });
  actorUserId = (await au.json()).id ?? "";
  if (actorUserId) await patch(`/users?id=eq.${actorUserId}`, { role: "editor" });
});
afterAll(async () => {
  if (!RUN || !vId) return;
  await del(`/inventory_receipt_items?variant_ref=in.(${vId},${vId2})`);
  const recs = await sel<any[]>(`/inventory_receipts?source_type=eq.rto&select=id`);
  await del(`/inventory_receipts?id=in.(${recs.map((r) => r.id).join(",") || "0"})`);
  await del(`/inventory_movements?variant_ref=in.(${vId},${vId2})`);
  await del(`/order_items?variant_id=in.(${vId},${vId2})`);
  await del(`/shipments?status=eq.rto&provider=eq.manual`);
  await del(`/orders?order_number=like.${TAG}*`);
  await del(`/variants?id=in.(${vId},${vId2})`); await del(`/products?id=eq.${prodId}`); await del(`/categories?id=eq.${catId}`);
});

d("RTO receiving + closure (Phase 1B-2)", () => {
  it("req1 — one-shipment-per-order invariant (UNIQUE(order_id)) holds", async () => {
    const { order, ship } = await makeRto([{ v: vId, s: sku, qty: 5 }]);
    expect(ship.id).toBeTruthy();
    const dup = await ins("shipments", { order_id: order.id, provider: "manual", status: "pending" });
    expect(dup.ok).toBe(false); // second shipment for same order is rejected
    expect(dup.err).toMatch(/duplicate|unique/i);
  });

  it("normal receipt — restocks exactly once via rto_receipt_item key; expected from order_items", async () => {
    await resetStock(0);
    const { ship } = await makeRto([{ v: vId, s: sku, qty: 5 }]);
    const res = await receiveRtoGoods(ship.id, [{ variantId: vId, received: 3, restockable: 3, damaged: 0 }]);
    expect(res.ok).toBe(true);
    expect(res.restocked).toBe(3);
    expect(await stockOf()).toBe(3);
    const mv = await sel<any[]>(`/inventory_movements?source_id=eq.${ship.id}&movement_type=eq.rto_restock&select=idempotency_key`);
    expect(mv.length).toBe(1);
    expect(String(mv[0].idempotency_key)).toMatch(/^rto_receipt_item:/);
    const model = await getShipmentRtoReceiving(ship.id);
    expect(model!.variants.find((v) => v.variantRef === vId)).toMatchObject({ expected: 5, received: 3, outstanding: 2, restockable: 3, damaged: 0 });
  });

  it("req3 — all-damaged receipt commits with ZERO stock movement; outstanding 0; close → final missing 0", async () => {
    await resetStock(0);
    const { ship } = await makeRto([{ v: vId, s: sku, qty: 3 }]);
    const res = await receiveRtoGoods(ship.id, [{ variantId: vId, received: 3, restockable: 0, damaged: 3 }]);
    expect(res.ok).toBe(true);
    expect(res.restocked).toBe(0);
    expect(await stockOf()).toBe(0); // physical receipt ≠ restock
    expect((await sel<any[]>(`/inventory_movements?source_id=eq.${ship.id}&select=id`)).length).toBe(0);
    const beforeClose = await getShipmentRtoReceiving(ship.id);
    expect(beforeClose!.variants[0].outstanding).toBe(0); // received 3 = expected 3
    const c = await closeRtoReceiving(ship.id);
    expect(c.ok).toBe(true);
    const model = await getShipmentRtoReceiving(ship.id);
    expect(model!.variants[0].finalMissing).toBe(0);
  });

  it("req2 — closure is inventory-neutral (5/5→missing 0 and 5/3→missing 2); no stock/movement delta on close", async () => {
    for (const [recv, missing] of [[5, 0], [3, 2]] as const) {
      await resetStock(0);
      const { ship } = await makeRto([{ v: vId, s: sku, qty: 5 }]);
      const rcv = await receiveRtoGoods(ship.id, [{ variantId: vId, received: recv, restockable: recv, damaged: 0 }]);
      expect(rcv.ok).toBe(true);
      const stockBefore = await stockOf();
      const mvBefore = (await sel<any[]>(`/inventory_movements?source_id=eq.${ship.id}&select=id`)).length;
      const c = await closeRtoReceiving(ship.id);
      expect(c.ok).toBe(true);
      expect(await stockOf()).toBe(stockBefore); // zero stock delta from closure
      expect((await sel<any[]>(`/inventory_movements?source_id=eq.${ship.id}&select=id`)).length).toBe(mvBefore); // zero balancing movement
      const shp = (await sel<any[]>(`/shipments?id=eq.${ship.id}&select=rto_receiving_closed_at,*`))[0];
      expect(shp.rto_receiving_closed_at).not.toBeNull();
      expect(Object.keys(shp)).not.toContain("receiving_shortage");
      const audit = await sel<any[]>(`/audit_events?entity_id=eq.${ship.id}&event=eq.shipment.rto_receiving_closed&select=metadata`);
      expect(audit.length).toBe(1);
      expect(audit[0].metadata.variants.find((x: any) => x.variant_ref === vId)).toMatchObject({ expected: 5, received: recv, missing });
    }
  });

  it("req4/V1 — RTO receiving + closure mutate NO lifecycle or financial state (statuses stay 'rto')", async () => {
    await resetStock(0);
    const { order, ship } = await makeRto([{ v: vId, s: sku, qty: 4 }]);
    const snap = async () => ({
      shipStatus: (await sel<any[]>(`/shipments?id=eq.${ship.id}&select=status`))[0].status,
      order: (await sel<any[]>(`/orders?id=eq.${order.id}&select=status,payment_status,refund_amount,total_amount,refunded_at`))[0],
      refunds: (await sel<any[]>(`/refunds?order_id=eq.${order.id}&select=id`)).length,
      attempts: (await sel<any[]>(`/payment_attempts?order_id=eq.${order.id}&select=id`)).length,
    });
    const before = JSON.stringify(await snap());
    await receiveRtoGoods(ship.id, [{ variantId: vId, received: 4, restockable: 3, damaged: 1 }]);
    await closeRtoReceiving(ship.id);
    const after = JSON.stringify(await snap());
    expect(after).toBe(before); // identical: shipment.status='rto', order.status='rto', no financial mutation
    // closure must NOT convert the RTO lifecycle to returned/other
    expect((await sel<any[]>(`/orders?id=eq.${order.id}&select=status`))[0].status).toBe("rto");
    expect((await sel<any[]>(`/shipments?id=eq.${ship.id}&select=status`))[0].status).toBe("rto");
  });

  it("req5 — concurrent commit vs close serialize on the shipment row; never stock after closure", async () => {
    await resetStock(0);
    const { ship } = await makeRto([{ v: vId, s: sku, qty: 5 }]);
    const rec = await must("inventory_receipts", { source_type: "rto", source_id: ship.id, status: "draft" });
    await must("inventory_receipt_items", { receipt_id: rec.id, variant_id: vId, variant_ref: vId, sku_snapshot: sku, product_name_snapshot: "p", expected_qty: 5, received_qty: 3, restockable_qty: 3, damaged_qty: 0 });
    const [commitRes, closeRes] = await Promise.all([
      rpc<any>("commit_rto_receipt", { p_receipt_id: rec.id, p_actor_id: null }),
      rpc<any>("close_rto_receiving", { p_shipment_id: ship.id, p_actor_id: null }),
    ]);
    const finalReceipt = (await sel<any[]>(`/inventory_receipts?id=eq.${rec.id}&select=status`))[0].status;
    const closed = (await sel<any[]>(`/shipments?id=eq.${ship.id}&select=rto_receiving_closed_at`))[0].rto_receiving_closed_at != null;
    const stock = await stockOf();
    expect(stock).toBe(finalReceipt === "committed" ? 3 : 0); // stock matches the receipt's final committed status
    if (closed) expect(finalReceipt).not.toBe("draft"); // no draft stranded behind a closed boundary
    if (!closeRes.ok) { expect(closeRes.reason).toBe("open_receipts"); expect(commitRes.ok).toBe(true); expect(stock).toBe(3); }
  });

  it("req6 — post-close protection (create/commit rejected, direct bypass blocked, idempotent second close)", async () => {
    await resetStock(0);
    const { ship } = await makeRto([{ v: vId, s: sku, qty: 5 }]);
    // pre-existing draft, then force-close (simulate close-wins), then all commit paths blocked
    const rec = await must("inventory_receipts", { source_type: "rto", source_id: ship.id, status: "draft" });
    await must("inventory_receipt_items", { receipt_id: rec.id, variant_id: vId, variant_ref: vId, sku_snapshot: sku, product_name_snapshot: "p", expected_qty: 5, received_qty: 2, restockable_qty: 2, damaged_qty: 0 });
    await patch(`/shipments?id=eq.${ship.id}`, { rto_receiving_closed_at: new Date().toISOString() });
    expect((await rpc<any>("commit_rto_receipt", { p_receipt_id: rec.id, p_actor_id: null })).reason).toBe("rto_receiving_closed");
    let directErr = ""; try { await rpc("commit_receipt", { p_receipt_id: rec.id, p_actor_id: null }); } catch (e) { directErr = String(e); }
    expect(directErr).toMatch(/rto_receiving_closed/);
    const created = await ins("inventory_receipts", { source_type: "rto", source_id: ship.id, status: "draft" });
    expect(created.ok).toBe(false);
    expect(created.err).toMatch(/rto_receiving_closed/);
    expect(await stockOf()).toBe(0);
    // second close idempotent
    const c2 = await closeRtoReceiving(ship.id);
    expect(c2.ok).toBe(true); expect(c2.alreadyClosed).toBe(true);
  });

  it("req6b — open draft blocks close; void then close succeeds", async () => {
    const { ship } = await makeRto([{ v: vId, s: sku, qty: 5 }]);
    const rec = await must("inventory_receipts", { source_type: "rto", source_id: ship.id, status: "draft" });
    expect((await closeRtoReceiving(ship.id)).reason).toBe("open_receipts");
    await patch(`/inventory_receipts?id=eq.${rec.id}`, { status: "void" });
    expect((await closeRtoReceiving(ship.id)).ok).toBe(true);
  });

  it("req7 — duplicate commit yields exactly one movement; status-only RTO processing never restocks", async () => {
    await resetStock(0);
    const { ship } = await makeRto([{ v: vId, s: sku, qty: 5 }]);
    const rec = await must("inventory_receipts", { source_type: "rto", source_id: ship.id, status: "draft" });
    await must("inventory_receipt_items", { receipt_id: rec.id, variant_id: vId, variant_ref: vId, sku_snapshot: sku, product_name_snapshot: "p", expected_qty: 5, received_qty: 3, restockable_qty: 3, damaged_qty: 0 });
    const c1 = await rpc<any>("commit_rto_receipt", { p_receipt_id: rec.id, p_actor_id: null });
    const c2 = await rpc<any>("commit_rto_receipt", { p_receipt_id: rec.id, p_actor_id: null }); // duplicate
    expect(c1.ok).toBe(true); expect(c2.already_committed).toBe(true);
    expect((await sel<any[]>(`/inventory_movements?source_id=eq.${ship.id}&movement_type=eq.rto_restock&select=id`)).length).toBe(1);
    expect(await stockOf()).toBe(3);
    // "carrier RTO webhook/status retry": re-stamp shipment RTO status repeatedly → still no NEW movement
    const { ship: ship2 } = await makeRto([{ v: vId, s: sku, qty: 5 }]);
    for (let i = 0; i < 3; i++) await patch(`/shipments?id=eq.${ship2.id}`, { status: "rto", rto_at: new Date().toISOString() });
    expect((await sel<any[]>(`/inventory_movements?source_id=eq.${ship2.id}&select=id`)).length).toBe(0);
  });

  it("V2 — RTO receipt history survives variant deletion (variant_id→NULL, snapshots + movement intact)", async () => {
    // dedicated throwaway variant (never touch the shared vId/vId2)
    const vDel = (await must("variants", { product_id: prodId, sku: uniq(), variant_name: "del", price: 500, stock: 0, low_stock_threshold: 1 })).id;
    const o = await must("orders", { order_number: uniq(), email: "c@e.com", phone: "9", status: "rto", payment_status: "paid", subtotal: 500, total_amount: 500, taxable_amount: 446, cgst_amount: 27, sgst_amount: 27, igst_amount: 0, ship_full_name: "C", ship_phone: "9", ship_line1: "1", ship_city: "C", ship_state: "Karnataka", ship_pincode: "560001" });
    await must("order_items", { order_id: o.id, variant_id: vDel, product_name: "p", sku: "DEL", hsn_code: "3406", gst_rate: 12, unit_price: 500, quantity: 3, line_subtotal: 1500, line_discount: 0, line_taxable: 1339, line_cgst: 80, line_sgst: 80, line_igst: 0, line_total: 1500 });
    const ship = await must("shipments", { order_id: o.id, provider: "manual", status: "rto" });
    const rcv = await receiveRtoGoods(ship.id, [{ variantId: vDel, received: 3, restockable: 3, damaged: 0 }]);
    expect(rcv.ok).toBe(true);
    const mvId = (await sel<any[]>(`/inventory_movements?variant_ref=eq.${vDel}&movement_type=eq.rto_restock&select=id`))[0].id;

    await del(`/variants?id=eq.${vDel}`); // supported DB catalog delete (ON DELETE SET NULL)
    expect((await sel<any[]>(`/variants?id=eq.${vDel}&select=id`)).length).toBe(0);

    const item = (await sel<any[]>(`/inventory_receipt_items?variant_ref=eq.${vDel}&select=variant_id,variant_ref,sku_snapshot,product_name_snapshot,received_qty,movement_id`))[0];
    const mv = (await sel<any[]>(`/inventory_movements?id=eq.${mvId}&select=variant_id,variant_ref,sku_snapshot,quantity_delta`))[0];
    expect(item.variant_id).toBeNull();            // soft link nulled
    expect(item.variant_ref).toBe(vDel);           // immutable identity survives
    expect(item.sku_snapshot).not.toBeNull();      // snapshot intact
    expect(item.movement_id).toBe(mvId);           // linkage intact
    expect(mv.variant_id).toBeNull();
    expect(mv.variant_ref).toBe(vDel);
    expect(mv.quantity_delta).toBe(3);             // inventory history readable
  });

  it("V3 — multi-variant RTO receipt rolls back entirely when one variant over-receives", async () => {
    await resetStock(0); await resetStock(0, vId2);
    const { ship } = await makeRto([{ v: vId, s: sku, qty: 5 }, { v: vId2, s: sku2, qty: 3 }]);
    // fully receive B first so a further B receipt over-receives at commit time
    expect((await receiveRtoGoods(ship.id, [{ variantId: vId2, received: 3, restockable: 3, damaged: 0 }])).ok).toBe(true);
    const aBefore = await stockOf(vId), bBefore = await stockOf(vId2);
    const mvBefore = (await sel<any[]>(`/inventory_movements?source_id=eq.${ship.id}&select=id`)).length;
    // A valid + B over-receipt → whole receipt must roll back
    const res = await receiveRtoGoods(ship.id, [{ variantId: vId, received: 2, restockable: 2, damaged: 0 }, { variantId: vId2, received: 1, restockable: 1, damaged: 0 }]);
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/over_receipt/);
    expect(await stockOf(vId)).toBe(aBefore);      // A unchanged
    expect(await stockOf(vId2)).toBe(bBefore);     // B unchanged
    expect((await sel<any[]>(`/inventory_movements?source_id=eq.${ship.id}&select=id`)).length).toBe(mvBefore); // no new movement
    expect((await sel<any[]>(`/inventory_receipts?source_id=eq.${ship.id}&status=eq.draft&select=id`)).length).toBe(0); // no stranded draft
  });

  it("V4 — actor identity is captured across receive/commit/close and movement", async () => {
    await resetStock(0);
    const actorId = actorUserId; // real auth-backed staff user created once in beforeAll
    expect(actorId).toBeTruthy();
    const { ship } = await makeRto([{ v: vId, s: sku, qty: 3 }]);
    const rcv = await receiveRtoGoods(ship.id, [{ variantId: vId, received: 3, restockable: 3, damaged: 0 }], { actorId });
    expect(rcv.ok).toBe(true);
    await closeRtoReceiving(ship.id, { actorId });
    const rec = (await sel<any[]>(`/inventory_receipts?source_id=eq.${ship.id}&status=eq.committed&select=received_by,committed_by`))[0];
    expect(rec.received_by).toBe(actorId);
    expect(rec.committed_by).toBe(actorId);
    expect((await sel<any[]>(`/shipments?id=eq.${ship.id}&select=rto_receiving_closed_by`))[0].rto_receiving_closed_by).toBe(actorId);
    expect((await sel<any[]>(`/inventory_movements?source_id=eq.${ship.id}&movement_type=eq.rto_restock&select=actor_id`))[0].actor_id).toBe(actorId);
  });

  it("V5 — empty/zero/malformed receipts rejected; frozen DB invariants not bypassed", async () => {
    const { ship } = await makeRto([{ v: vId, s: sku, qty: 5 }]);
    // service rejects empty
    expect((await receiveRtoGoods(ship.id, [])).reason).toBe("no_lines");
    // frozen DB rejects an empty committed receipt
    const empty = await must("inventory_receipts", { source_type: "rto", source_id: ship.id, status: "draft" });
    expect((await rpc<any>("commit_rto_receipt", { p_receipt_id: empty.id, p_actor_id: null })).reason).toBe("empty_receipt");
    // frozen DB CHECKs: zero-received, malformed split, received>expected all rejected at insert
    const base = { receipt_id: empty.id, variant_id: vId, variant_ref: vId, sku_snapshot: sku, product_name_snapshot: "p", expected_qty: 5 };
    expect((await ins("inventory_receipt_items", { ...base, received_qty: 0, restockable_qty: 0, damaged_qty: 0 })).ok).toBe(false);
    expect((await ins("inventory_receipt_items", { ...base, received_qty: 3, restockable_qty: 1, damaged_qty: 0 })).ok).toBe(false);
    expect((await ins("inventory_receipt_items", { ...base, received_qty: 6, restockable_qty: 6, damaged_qty: 0 })).ok).toBe(false);
    // service mirrors the split invariant
    expect((await receiveRtoGoods(ship.id, [{ variantId: vId, received: 3, restockable: 1, damaged: 0 }])).reason).toBe("split_mismatch");
  });
});
