import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Phase 1B-0b — inbound receipt foundation DB evidence. LOCAL Supabase only (localhost-gated).
 * Acceptance matrix: partial receipts · aggregation-safe expected (SUM of source lines) ·
 * over-receipt prevention (per-row CHECK + concurrent cross-receipt) · per-receipt-item idempotency ·
 * restockable→ledger vs damaged→audit-only · ledger linkage · Return/RTO source validation ·
 * committed immutability · void semantics · no bypass of apply_stock_movement.
 */
const URL = process.env.INV_TEST_SUPABASE_URL || "";
const KEY = process.env.INV_TEST_SERVICE_KEY || "";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL.replace(/\/$/, ""));
const RUN = !!(URL && KEY && LOCAL);
const d = RUN ? describe : describe.skip;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p: string) => `${URL.replace(/\/$/, "")}/rest/v1${p}`;
/* eslint-disable @typescript-eslint/no-explicit-any */
async function rpc<T = any>(fn: string, body: unknown): Promise<T> { const r = await fetch(rest(`/rpc/${fn}`), { method: "POST", headers: H, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${fn} ${r.status}: ${await r.text()}`); return r.json() as Promise<T>; }
async function ins(t: string, row: unknown) { const r = await fetch(rest(`/${t}`), { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) }); return { ok: r.ok, status: r.status, row: r.ok ? (await r.json())[0] : null, err: r.ok ? "" : await r.text() }; }
async function must(t: string, row: unknown) { const r = await ins(t, row); if (!r.ok) throw new Error(`ins ${t}: ${r.err}`); return r.row; }
async function sel<T = any[]>(p: string): Promise<T> { const r = await fetch(rest(p), { headers: H }); return r.json() as Promise<T>; }
async function patch(p: string, body: unknown) { const r = await fetch(rest(p), { method: "PATCH", headers: H, body: JSON.stringify(body) }); return { ok: r.ok, status: r.status }; }
async function del(p: string) { const r = await fetch(rest(p), { method: "DELETE", headers: H }); return { ok: r.ok, status: r.status }; }

const TAG = `RCPT-${Date.now()}`;
let catId = "", prodId = "", vId = "", sku = "";
let n = 0; const uniq = () => `${TAG}-${++n}`;
const stockOf = async () => (await sel<any[]>(`/variants?id=eq.${vId}&select=stock`))[0].stock as number;

async function makeReturn(status: string, lines: { qty: number }[]) {
  const o = await must("orders", { order_number: uniq(), email: "t@e.com", phone: "9", status: "delivered", payment_status: "paid", subtotal: 500, total_amount: 500, taxable_amount: 446, cgst_amount: 27, sgst_amount: 27, igst_amount: 0, ship_full_name: "T", ship_phone: "9", ship_line1: "1", ship_city: "C", ship_state: "Karnataka", ship_pincode: "560001" });
  const ret = await must("returns", { order_id: o.id, order_number: o.order_number, rma_number: uniq(), status });
  for (const l of lines) await must("return_items", { return_id: ret.id, variant_id: vId, sku, product_name: "p", quantity: l.qty, restock: true });
  return ret;
}
async function makeRto(status: string, qty: number) {
  const o = await must("orders", { order_number: uniq(), email: "t@e.com", phone: "9", status: "rto", payment_status: "paid", subtotal: 500, total_amount: 500, taxable_amount: 446, cgst_amount: 27, sgst_amount: 27, igst_amount: 0, ship_full_name: "T", ship_phone: "9", ship_line1: "1", ship_city: "C", ship_state: "Karnataka", ship_pincode: "560001" });
  await must("order_items", { order_id: o.id, variant_id: vId, product_name: "p", sku, hsn_code: "3406", gst_rate: 12, unit_price: 500, quantity: qty, line_subtotal: 500 * qty, line_discount: 0, line_taxable: 446 * qty, line_cgst: 27 * qty, line_sgst: 27 * qty, line_igst: 0, line_total: 500 * qty });
  const s = await must("shipments", { order_id: o.id, provider: "manual", status });
  return s;
}
async function mkReceipt(source_type: string, source_id: string, items: { received: number; restockable: number; damaged: number; expected: number }[]) {
  const rec = await must("inventory_receipts", { source_type, source_id, status: "draft" });
  const rows = [];
  for (const it of items) rows.push(await must("inventory_receipt_items", { receipt_id: rec.id, variant_id: vId, variant_ref: vId, sku_snapshot: sku, product_name_snapshot: "p", expected_qty: it.expected, received_qty: it.received, restockable_qty: it.restockable, damaged_qty: it.damaged }));
  return { rec, rows };
}
const reset = async (s: number) => rpc("adjust_inventory", { p: { variant_id: vId, mode: "set", qty: s, reason: "reset" } });

beforeAll(async () => {
  if (!RUN) return;
  sku = `${TAG}-SKU`;
  catId = (await must("categories", { name: TAG, slug: TAG.toLowerCase(), sku_prefix: "RCP", default_hsn_code: "3406" })).id;
  prodId = (await must("products", { name: `${TAG} p`, slug: TAG.toLowerCase(), base_sku: `${TAG}-B`, category_id: catId, status: "active", product_type: "candle", hsn_code: "3406", gst_rate: 12, price: 500 })).id;
  vId = (await must("variants", { product_id: prodId, sku, variant_name: "v", price: 500, stock: 0, low_stock_threshold: 1 })).id;
});
afterAll(async () => {
  if (!RUN || !vId) return;
  const recs = await sel<any[]>(`/inventory_receipts?source_type=in.(return,rto)&select=id,source_id,source_type`);
  await del(`/inventory_receipt_items?variant_ref=eq.${vId}`).catch(() => {});
  await del(`/inventory_receipts?id=in.(${recs.map((r) => r.id).join(",") || "0"})`).catch(() => {});
  await del(`/inventory_movements?variant_ref=eq.${vId}`);
  await del(`/return_items?variant_id=eq.${vId}`); await del(`/order_items?variant_id=eq.${vId}`);
  await del(`/returns?rma_number=like.${TAG}*`); await del(`/shipments?status=eq.rto`).catch(() => {});
  await del(`/orders?order_number=like.${TAG}*`);
  await del(`/variants?id=eq.${vId}`); await del(`/products?id=eq.${prodId}`); await del(`/categories?id=eq.${catId}`);
});

d("Phase 1B-0b — inbound receipts (local DB)", () => {
  it("partial receipts each restock (distinct keys, distinct movements); ledger links back", async () => {
    await reset(0);
    const ret = await makeReturn("received", [{ qty: 5 }]); // expected 5
    const r1 = await mkReceipt("return", ret.id, [{ received: 2, restockable: 2, damaged: 0, expected: 5 }]);
    expect(await rpc("commit_receipt", { p_receipt_id: r1.rec.id, p_actor_id: null })).toMatchObject({ ok: true, restocked: 2 });
    const r2 = await mkReceipt("return", ret.id, [{ received: 2, restockable: 2, damaged: 0, expected: 5 }]); // LATER partial
    expect(await rpc("commit_receipt", { p_receipt_id: r2.rec.id, p_actor_id: null })).toMatchObject({ ok: true, restocked: 2 });
    expect(await stockOf()).toBe(4); // 2 + 2 (cumulative 4 ≤ 5)
    const mv = await sel<any[]>(`/inventory_movements?source_id=eq.${ret.id}&movement_type=eq.return_restock&select=quantity_delta,source_type,reference,idempotency_key,metadata`);
    expect(mv.length).toBe(2); // two legitimate partial receipts → two movements (not suppressed)
    expect(mv.every((m) => m.source_type === "return" && m.reference === ret.rma_number)).toBe(true);
    const item1 = (await sel<any[]>(`/inventory_receipt_items?id=eq.${r1.rows[0].id}&select=movement_id`))[0];
    expect(item1.movement_id).toBeTruthy(); // linkage back to the ledger
  });

  it("per-receipt-item idempotency: re-commit is an explicit no-op, no second movement", async () => {
    await reset(0);
    const ret = await makeReturn("received", [{ qty: 3 }]);
    const r = await mkReceipt("return", ret.id, [{ received: 3, restockable: 3, damaged: 0, expected: 3 }]);
    await rpc("commit_receipt", { p_receipt_id: r.rec.id, p_actor_id: null });
    expect(await stockOf()).toBe(3);
    const again = await rpc<{ ok: boolean; already_committed?: boolean }>("commit_receipt", { p_receipt_id: r.rec.id, p_actor_id: null });
    expect(again).toMatchObject({ ok: true, already_committed: true });
    expect(await stockOf()).toBe(3); // unchanged
    expect((await sel<any[]>(`/inventory_movements?source_id=eq.${ret.id}&movement_type=eq.return_restock&select=id`)).length).toBe(1);
  });

  it("restockable → +stock + movement; damaged → NO movement, no stock change", async () => {
    await reset(0);
    const ret = await makeReturn("inspection", [{ qty: 3 }]);
    const r = await mkReceipt("return", ret.id, [{ received: 3, restockable: 2, damaged: 1, expected: 3 }]);
    expect(await rpc("commit_receipt", { p_receipt_id: r.rec.id, p_actor_id: null })).toMatchObject({ ok: true, restocked: 2 });
    expect(await stockOf()).toBe(2); // only restockable
    const mv = await sel<any[]>(`/inventory_movements?source_id=eq.${ret.id}&select=quantity_delta,movement_type`);
    expect(mv.length).toBe(1); expect(mv[0].quantity_delta).toBe(2); // no zero-delta damaged movement
  });

  it("aggregation-safe expected = SUM of duplicate same-variant source lines", async () => {
    await reset(0);
    const ret = await makeReturn("received", [{ qty: 2 }, { qty: 3 }]); // two lines, same variant → SUM 5
    const ok = await mkReceipt("return", ret.id, [{ received: 5, restockable: 5, damaged: 0, expected: 5 }]);
    expect(await rpc("commit_receipt", { p_receipt_id: ok.rec.id, p_actor_id: null })).toMatchObject({ ok: true, restocked: 5 });
    expect(await stockOf()).toBe(5);
    // a further receipt would exceed SUM(5) → over_receipt (proves expected came from SUM, not one line)
    const overR = await mkReceipt("return", ret.id, [{ received: 1, restockable: 1, damaged: 0, expected: 5 }]);
    await expect(rpc("commit_receipt", { p_receipt_id: overR.rec.id, p_actor_id: null })).rejects.toThrow(/over_receipt/);
  });

  it("over-receipt (per-row CHECK): received_qty > expected_qty is rejected at insert", async () => {
    const ret = await makeReturn("received", [{ qty: 5 }]);
    const rec = await must("inventory_receipts", { source_type: "return", source_id: ret.id, status: "draft" });
    const bad = await ins("inventory_receipt_items", { receipt_id: rec.id, variant_id: vId, variant_ref: vId, sku_snapshot: sku, product_name_snapshot: "p", expected_qty: 5, received_qty: 6, restockable_qty: 6, damaged_qty: 0 });
    expect(bad.ok).toBe(false); // received 6 > expected 5
    const split = await ins("inventory_receipt_items", { receipt_id: rec.id, variant_id: vId, variant_ref: vId, sku_snapshot: sku, product_name_snapshot: "p", expected_qty: 5, received_qty: 3, restockable_qty: 2, damaged_qty: 0 });
    expect(split.ok).toBe(false); // restockable(2)+damaged(0) != received(3)
  });

  it("over-receipt (concurrent cross-receipt): expected 5, committed 3, two parallel +2 → exactly one commits, cumulative ≤ 5", async () => {
    await reset(0);
    const ret = await makeReturn("received", [{ qty: 5 }]);
    const first = await mkReceipt("return", ret.id, [{ received: 3, restockable: 3, damaged: 0, expected: 5 }]);
    await rpc("commit_receipt", { p_receipt_id: first.rec.id, p_actor_id: null }); // cumulative 3
    const a = await mkReceipt("return", ret.id, [{ received: 2, restockable: 2, damaged: 0, expected: 5 }]);
    const b = await mkReceipt("return", ret.id, [{ received: 2, restockable: 2, damaged: 0, expected: 5 }]);
    const results = await Promise.all([
      rpc("commit_receipt", { p_receipt_id: a.rec.id, p_actor_id: null }).then(() => "ok").catch(() => "rejected"),
      rpc("commit_receipt", { p_receipt_id: b.rec.id, p_actor_id: null }).then(() => "ok").catch(() => "rejected"),
    ]);
    expect(results.filter((r) => r === "ok").length).toBe(1);       // exactly one commits
    expect(results.filter((r) => r === "rejected").length).toBe(1); // the other rejected (would exceed 5)
    expect(await stockOf()).toBe(5); // 3 + 2, never over
  });

  it("RTO source: shipment status='rto' restocks via rto_restock; expected from order_items", async () => {
    await reset(0);
    const ship = await makeRto("rto", 4); // order_items qty 4
    const r = await mkReceipt("rto", ship.id, [{ received: 3, restockable: 3, damaged: 0, expected: 4 }]);
    expect(await rpc("commit_receipt", { p_receipt_id: r.rec.id, p_actor_id: null })).toMatchObject({ ok: true, restocked: 3 });
    expect(await stockOf()).toBe(3);
    const mv = await sel<any[]>(`/inventory_movements?source_id=eq.${ship.id}&movement_type=eq.rto_restock&select=id,idempotency_key`);
    expect(mv.length).toBe(1); expect(mv[0].idempotency_key).toMatch(new RegExp(`^rto_receipt_item:`));
  });

  it("source validation: a return not in {received,inspection}, and a shipment not 'rto', are refused", async () => {
    const ret = await makeReturn("requested", [{ qty: 3 }]); // pre-arrival
    const r1 = await mkReceipt("return", ret.id, [{ received: 1, restockable: 1, damaged: 0, expected: 3 }]);
    expect(await rpc("commit_receipt", { p_receipt_id: r1.rec.id, p_actor_id: null })).toMatchObject({ ok: false, reason: "source_not_receivable" });
    const ship = await makeRto("delivered", 3); // not rto
    const r2 = await mkReceipt("rto", ship.id, [{ received: 1, restockable: 1, damaged: 0, expected: 3 }]);
    expect(await rpc("commit_receipt", { p_receipt_id: r2.rec.id, p_actor_id: null })).toMatchObject({ ok: false, reason: "source_not_receivable" });
  });

  // ── Final boundary verification V1–V6 ──
  const mkVariant = async (stock: number) => { const s = uniq() + "-V"; const v = await must("variants", { product_id: prodId, sku: s, variant_name: "v", price: 500, stock, low_stock_threshold: 1 }); return { id: v.id, sku: s }; };
  const mkReturnRaw = async (status: string, lines: { vid: string; sku: string; qty: number }[]) => {
    const o = await must("orders", { order_number: uniq(), email: "t@e.com", phone: "9", status: "delivered", payment_status: "paid", subtotal: 500, total_amount: 500, taxable_amount: 446, cgst_amount: 27, sgst_amount: 27, igst_amount: 0, ship_full_name: "T", ship_phone: "9", ship_line1: "1", ship_city: "C", ship_state: "Karnataka", ship_pincode: "560001" });
    const ret = await must("returns", { order_id: o.id, order_number: o.order_number, rma_number: uniq(), status });
    for (const l of lines) await must("return_items", { return_id: ret.id, variant_id: l.vid, sku: l.sku, product_name: "p", quantity: l.qty, restock: true });
    return ret;
  };
  const mkItem = (receiptId: string, v: { id: string; sku: string }, r: { received: number; restockable: number; damaged: number; expected: number }) =>
    ins("inventory_receipt_items", { receipt_id: receiptId, variant_id: v.id, variant_ref: v.id, sku_snapshot: v.sku, product_name_snapshot: "p", expected_qty: r.expected, received_qty: r.received, restockable_qty: r.restockable, damaged_qty: r.damaged });

  it("V1: multi-item receipt is ATOMIC — one item failing rolls the whole commit back (no partial state)", async () => {
    await reset(0);
    const B = await mkVariant(0);
    const ret = await mkReturnRaw("received", [{ vid: vId, sku, qty: 5 }, { vid: B.id, sku: B.sku, qty: 3 }]);
    const rec = await must("inventory_receipts", { source_type: "return", source_id: ret.id, status: "draft" });
    const a = (await mkItem(rec.id, { id: vId, sku }, { received: 2, restockable: 2, damaged: 0, expected: 5 })).row;   // valid (canonical 5)
    const b = (await mkItem(rec.id, B, { received: 5, restockable: 5, damaged: 0, expected: 5 })).row;                  // canonical for B = 3 → over
    await expect(rpc("commit_receipt", { p_receipt_id: rec.id, p_actor_id: null })).rejects.toThrow(/over_receipt/);
    expect(await stockOf()).toBe(0);                                                     // A rolled back
    expect((await sel<any[]>(`/variants?id=eq.${B.id}&select=stock`))[0].stock).toBe(0); // B untouched
    expect((await sel<any[]>(`/inventory_movements?source_id=eq.${ret.id}&select=id`)).length).toBe(0); // no movement
    const items = await sel<any[]>(`/inventory_receipt_items?receipt_id=eq.${rec.id}&select=movement_id`);
    expect(items.every((i) => i.movement_id === null)).toBe(true);                       // no movement_id left behind
    expect((await sel<any[]>(`/inventory_receipts?id=eq.${rec.id}&select=status`))[0].status).toBe("draft"); // stays draft
    expect(a.id && b.id).toBeTruthy();
  });

  it("V2: an EMPTY receipt cannot be committed (stays draft)", async () => {
    const ret = await mkReturnRaw("received", [{ vid: vId, sku, qty: 3 }]);
    const rec = await must("inventory_receipts", { source_type: "return", source_id: ret.id, status: "draft" });
    expect(await rpc("commit_receipt", { p_receipt_id: rec.id, p_actor_id: null })).toMatchObject({ ok: false, reason: "empty_receipt" });
    expect((await sel<any[]>(`/inventory_receipts?id=eq.${rec.id}&select=status`))[0].status).toBe("draft");
  });

  it("V3: a zero-received item cannot be inserted (received_qty > 0)", async () => {
    const ret = await mkReturnRaw("received", [{ vid: vId, sku, qty: 3 }]);
    const rec = await must("inventory_receipts", { source_type: "return", source_id: ret.id, status: "draft" });
    expect((await mkItem(rec.id, { id: vId, sku }, { received: 0, restockable: 0, damaged: 0, expected: 3 })).ok).toBe(false);
  });

  it("V4: source is authoritative — off-source variant rejected; inflated expected can't raise entitlement", async () => {
    await reset(0);
    const B = await mkVariant(0);
    const ret = await mkReturnRaw("received", [{ vid: vId, sku, qty: 5 }]); // source has only vId
    const rec1 = await must("inventory_receipts", { source_type: "return", source_id: ret.id, status: "draft" });
    await mkItem(rec1.id, B, { received: 2, restockable: 2, damaged: 0, expected: 2 });                 // B not in source → canonical 0
    await expect(rpc("commit_receipt", { p_receipt_id: rec1.id, p_actor_id: null })).rejects.toThrow(/over_receipt/);
    const ret2 = await mkReturnRaw("received", [{ vid: vId, sku, qty: 5 }]);
    const rec2 = await must("inventory_receipts", { source_type: "return", source_id: ret2.id, status: "draft" });
    await mkItem(rec2.id, { id: vId, sku }, { received: 10, restockable: 10, damaged: 0, expected: 100 }); // inflated stored expected
    await expect(rpc("commit_receipt", { p_receipt_id: rec2.id, p_actor_id: null })).rejects.toThrow(/over_receipt/); // canonical 5 < 10
    expect(await stockOf()).toBe(0);
  });

  it("V5: committed survives variant deletion (SET NULL + snapshot readable); draft with deleted variant rejects", async () => {
    await reset(0);
    // 5.1 committed → delete variant → history preserved
    const V = await mkVariant(0);
    const ret = await mkReturnRaw("received", [{ vid: V.id, sku: V.sku, qty: 3 }]);
    const rec = await must("inventory_receipts", { source_type: "return", source_id: ret.id, status: "draft" });
    const item = (await mkItem(rec.id, V, { received: 3, restockable: 3, damaged: 0, expected: 3 })).row;
    await rpc("commit_receipt", { p_receipt_id: rec.id, p_actor_id: null });
    expect((await del(`/variants?id=eq.${V.id}`)).ok).toBe(true);                        // deletion allowed (SET NULL)
    const ia = (await sel<any[]>(`/inventory_receipt_items?id=eq.${item.id}&select=variant_id,variant_ref,sku_snapshot`))[0];
    expect(ia.variant_id).toBeNull(); expect(ia.variant_ref).toBe(V.id); expect(ia.sku_snapshot).toBe(V.sku); // snapshot intact
    const mv = (await sel<any[]>(`/inventory_movements?variant_ref=eq.${V.id}&select=variant_id,sku_snapshot`))[0];
    expect(mv.variant_id).toBeNull(); expect(mv.sku_snapshot).toBe(V.sku);               // movement history readable
    // 5.2 draft → variant deleted before commit → reject (snapshot alone can't authorise a movement)
    const W = await mkVariant(0);
    const ret2 = await mkReturnRaw("received", [{ vid: W.id, sku: W.sku, qty: 3 }]);
    const rec2 = await must("inventory_receipts", { source_type: "return", source_id: ret2.id, status: "draft" });
    await mkItem(rec2.id, W, { received: 3, restockable: 3, damaged: 0, expected: 3 });
    await del(`/variants?id=eq.${W.id}`);
    await expect(rpc("commit_receipt", { p_receipt_id: rec2.id, p_actor_id: null })).rejects.toThrow(/variant_unavailable/);
    expect((await sel<any[]>(`/inventory_receipts?id=eq.${rec2.id}&select=status`))[0].status).toBe("draft");
  });

  it("V6: multiple receipt headers per source are supported (partial/multi-arrival receiving)", async () => {
    await reset(0);
    const ret = await mkReturnRaw("received", [{ vid: vId, sku, qty: 5 }]);
    const r1 = await must("inventory_receipts", { source_type: "return", source_id: ret.id, status: "draft" });
    const r2 = await must("inventory_receipts", { source_type: "return", source_id: ret.id, status: "draft" }); // no unique(source) blocks this
    expect(r1.id).not.toBe(r2.id);
    await mkItem(r1.id, { id: vId, sku }, { received: 2, restockable: 2, damaged: 0, expected: 5 });
    await mkItem(r2.id, { id: vId, sku }, { received: 3, restockable: 3, damaged: 0, expected: 5 });
    await rpc("commit_receipt", { p_receipt_id: r1.id, p_actor_id: null });
    await rpc("commit_receipt", { p_receipt_id: r2.id, p_actor_id: null });
    expect(await stockOf()).toBe(5); // 2 + 3 across two receipts, cumulative ≤ 5
  });

  it("committed receipts are immutable; draft→void allowed but committed→void refused", async () => {
    await reset(0);
    const draftRet = await makeReturn("received", [{ qty: 2 }]);
    const draft = await mkReceipt("return", draftRet.id, [{ received: 2, restockable: 2, damaged: 0, expected: 2 }]);
    expect((await patch(`/inventory_receipts?id=eq.${draft.rec.id}`, { status: "void" })).ok).toBe(true); // draft → void OK
    const ret = await makeReturn("received", [{ qty: 2 }]);
    const r = await mkReceipt("return", ret.id, [{ received: 2, restockable: 2, damaged: 0, expected: 2 }]);
    await rpc("commit_receipt", { p_receipt_id: r.rec.id, p_actor_id: null });
    expect((await patch(`/inventory_receipts?id=eq.${r.rec.id}`, { note: "tamper" })).ok).toBe(false); // committed header immutable
    expect((await patch(`/inventory_receipt_items?id=eq.${r.rows[0].id}`, { received_qty: 99 })).ok).toBe(false); // committed item immutable
    expect((await patch(`/inventory_receipts?id=eq.${r.rec.id}`, { status: "void" })).ok).toBe(false); // committed → void refused
    const stillCommitted = (await sel<any[]>(`/inventory_receipts?id=eq.${r.rec.id}&select=status`))[0];
    expect(stillCommitted.status).toBe("committed");
  });
});
