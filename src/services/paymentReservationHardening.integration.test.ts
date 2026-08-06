import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Phase 1B-0a — payment/reservation hardening DB evidence. LOCAL Supabase only (gated on
 * INV_TEST_SUPABASE_URL = localhost). Proves at the RPC layer:
 *   §6 order-linked holds extend to the payable window; abandoned cart holds keep 15-min TTL.
 *   §5.1 finalize wins → normal finalization.
 *   §5.2 cancellation wins → late finalize is refused (terminal); no invoice/stock/resurrection.
 *   §5.3 finalize wins first → later expire_stale cannot cancel a finalized order.
 *   refund exactly-once: late_payment begin_refund is idempotent per payment_id; not_paid guard intact.
 */
const URL = process.env.INV_TEST_SUPABASE_URL || "";
const KEY = process.env.INV_TEST_SERVICE_KEY || "";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL.replace(/\/$/, ""));
const RUN = !!(URL && KEY && LOCAL);
const d = RUN ? describe : describe.skip;

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p: string) => `${URL.replace(/\/$/, "")}/rest/v1${p}`;
async function rpc<T = any>(fn: string, body: unknown): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch(rest(`/rpc/${fn}`), { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${fn} ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}
async function ins(t: string, row: unknown) {
  const r = await fetch(rest(`/${t}`), { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) });
  if (!r.ok) throw new Error(`ins ${t} ${r.status}: ${await r.text()}`);
  return (await r.json())[0];
}
async function sel<T = any[]>(p: string): Promise<T> { const r = await fetch(rest(p), { headers: H }); return r.json() as Promise<T>; } // eslint-disable-line @typescript-eslint/no-explicit-any
async function patch(p: string, body: unknown) { await fetch(rest(p), { method: "PATCH", headers: H, body: JSON.stringify(body) }); }
async function del(p: string) { await fetch(rest(p), { method: "DELETE", headers: H }); }

const TAG = `PAYQA-${Date.now()}`;
let categoryId = "", productId = "", variantId = "", sku = "";

async function makeOrder(rzp: string, session: string, qty = 1) {
  await rpc("reserve_stock", { p: { session_id: session, ttl_minutes: 15, items: [{ variant_id: variantId, quantity: qty, sku }] } });
  const line = { product_id: productId, variant_id: variantId, product_name: `${TAG} p`, sku, hsn_code: "3406", gst_rate: 12, unit_price: 500, quantity: qty, line_subtotal: 500 * qty, line_discount: 0, line_taxable: 446.43 * qty, line_cgst: 26.79 * qty, line_sgst: 26.79 * qty, line_igst: 0, line_total: 500 * qty };
  const payload = { email: "t@example.com", phone: "9999999999", subtotal: 500 * qty, discount_amount: 0, shipping_amount: 0, total_amount: 500 * qty, taxable_amount: 446.43 * qty, cgst_amount: 26.79 * qty, sgst_amount: 26.79 * qty, igst_amount: 0, ship_full_name: "T", ship_phone: "9999999999", ship_line1: "1", ship_city: "C", ship_state: "Karnataka", ship_pincode: "560001", razorpay_order_id: rzp, shipping_charge: 0, shipping_gst: 0, reservation_session: session, items: [line] };
  return rpc<{ order_id: string; order_number: string }>("create_pending_order", { p: payload });
}
const stockOf = async () => (await sel<any[]>(`/variants?id=eq.${variantId}&select=stock`))[0].stock as number; // eslint-disable-line @typescript-eslint/no-explicit-any
const minutesOut = (iso: string) => (new Date(iso).getTime() - Date.now()) / 60000;

beforeAll(async () => {
  if (!RUN) return;
  sku = `${TAG}-SKU`;
  const cat = await ins("categories", { name: `${TAG} c`, slug: `${TAG.toLowerCase()}-c`, sku_prefix: "PAY", default_hsn_code: "3406" });
  categoryId = cat.id;
  const p = await ins("products", { name: `${TAG} p`, slug: `${TAG.toLowerCase()}`, base_sku: `${TAG}-B`, category_id: categoryId, status: "active", product_type: "candle", hsn_code: "3406", gst_rate: 12, price: 500 });
  productId = p.id;
  const v = await ins("variants", { product_id: productId, sku, variant_name: "v", price: 500, stock: 5, low_stock_threshold: 1 });
  variantId = v.id;
});
afterAll(async () => {
  if (!RUN || !variantId) return;
  await del(`/inventory_movements?variant_ref=eq.${variantId}`);
  await del(`/stock_reservations?variant_id=eq.${variantId}`);
  await del(`/order_items?variant_id=eq.${variantId}`);
  await del(`/refunds?order_id=in.(${(await sel<any[]>(`/orders?order_number=like.${TAG}*&select=id`)).map((o: any) => o.id).join(",") || "00000000-0000-0000-0000-000000000000"})`); // eslint-disable-line @typescript-eslint/no-explicit-any
  await del(`/orders?order_number=like.${TAG}*`);
  await del(`/variants?id=eq.${variantId}`);
  await del(`/products?id=eq.${productId}`);
  await del(`/categories?id=eq.${categoryId}`);
});

d("Phase 1B-0a — payment/reservation hardening (local DB)", () => {
  it("§6: order-linked hold extends to the payable window (~30m); an abandoned cart hold keeps 15m", async () => {
    const linked = await makeOrder(`${TAG}-r1`, `${TAG}-s1`);
    const held = await sel<any[]>(`/stock_reservations?order_id=eq.${linked.order_id}&select=expires_at`); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(held.length).toBe(1);
    expect(minutesOut(held[0].expires_at)).toBeGreaterThan(20); // extended to the payable window, not 15
    // an abandoned cart hold (reserve only, never linked to an order)
    await rpc("reserve_stock", { p: { session_id: `${TAG}-cart`, ttl_minutes: 15, items: [{ variant_id: variantId, quantity: 1, sku }] } });
    const cart = await sel<any[]>(`/stock_reservations?session_id=eq.${TAG}-cart&order_id=is.null&select=expires_at`); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(minutesOut(cart[0].expires_at)).toBeLessThan(20); // short TTL retained
    await del(`/stock_reservations?variant_id=eq.${variantId}`);
  });

  it("§5.1: finalize wins → normal finalization (invoice + sale decrement)", async () => {
    await rpc("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 5, reason: "reset" } });
    const rzp = `${TAG}-rz2`;
    await makeOrder(rzp, `${TAG}-s2`);
    const f = await rpc<{ created: boolean; invoice_number: string }>("finalize_order", { p_razorpay_order_id: rzp, p_payment_id: `${TAG}-pay2`, p_signature: "", p_source: "test", p_amount_paise: null });
    expect(f.created).toBe(true);
    expect(f.invoice_number).toBeTruthy();
    expect(await stockOf()).toBe(4);
  });

  it("§5.2: cancellation wins → late finalize is REFUSED (terminal); no invoice, no stock, no resurrection", async () => {
    await rpc("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 5, reason: "reset" } });
    const rzp = `${TAG}-rz3`;
    const o = await makeOrder(rzp, `${TAG}-s3`);
    // simulate the stale-cancellation cron winning first (status cancelled, holds deleted) — exactly what expire_stale does
    await patch(`/orders?id=eq.${o.order_id}`, { status: "cancelled", payment_status: "failed" });
    await del(`/stock_reservations?order_id=eq.${o.order_id}`);
    const before = await stockOf();
    const f = await rpc<{ created: boolean; terminal: boolean; status: string; invoice_number?: string }>("finalize_order", { p_razorpay_order_id: rzp, p_payment_id: `${TAG}-pay3`, p_signature: "", p_source: "webhook", p_amount_paise: null });
    expect(f).toMatchObject({ created: false, terminal: true, status: "cancelled" });
    const ord = (await sel<any[]>(`/orders?id=eq.${o.order_id}&select=status,payment_status,invoice_number,idempotency_key`))[0]; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(ord.status).toBe("cancelled");           // NOT resurrected
    expect(ord.payment_status).toBe("failed");
    expect(ord.invoice_number).toBeNull();           // no invoice
    expect(ord.idempotency_key).toBeNull();
    expect(await stockOf()).toBe(before);            // no decrement
    const sales = (await sel<any[]>(`/inventory_movements?source_id=eq.${o.order_id}&movement_type=eq.sale&select=id`)); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(sales.length).toBe(0);                    // no sale movement
  });

  it("§5.3: finalize wins first → later expire_stale cannot cancel a finalized order", async () => {
    await rpc("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 5, reason: "reset" } });
    const rzp = `${TAG}-rz4`;
    const o = await makeOrder(rzp, `${TAG}-s4`);
    await rpc("finalize_order", { p_razorpay_order_id: rzp, p_payment_id: `${TAG}-pay4`, p_signature: "", p_source: "verify", p_amount_paise: null });
    await rpc<number>("expire_stale_pending_orders", { p_minutes: 0 }); // force: cancel anything still pending
    const ord = (await sel<any[]>(`/orders?id=eq.${o.order_id}&select=status,payment_status`))[0]; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(ord.status).toBe("confirmed");            // WHERE status='pending' excludes it → untouched
    expect(ord.payment_status).toBe("paid");
  });

  it("refund exactly-once: late_payment begin_refund is idempotent per payment_id; not_paid guard intact", async () => {
    const rzp = `${TAG}-rz5`;
    const o = await makeOrder(rzp, `${TAG}-s5`);
    await patch(`/orders?id=eq.${o.order_id}`, { status: "cancelled", payment_status: "failed" });
    const pay = `${TAG}-pay5`;
    // without late_payment → refused (order not paid)
    const blocked = await rpc<{ ok: boolean; reason: string }>("begin_refund", { p: { order_id: o.order_id, amount: 500, payment_id: pay } });
    expect(blocked).toMatchObject({ ok: false, reason: "not_paid" });
    // late_payment → one obligation, and a duplicate returns the SAME refund idempotently
    const r1 = await rpc<{ ok: boolean; refund_id: string }>("begin_refund", { p: { order_id: o.order_id, amount: 500, payment_id: pay, late_payment: true } });
    const r2 = await rpc<{ ok: boolean; refund_id: string; idempotent?: boolean }>("begin_refund", { p: { order_id: o.order_id, amount: 500, payment_id: pay, late_payment: true } });
    expect(r1.ok).toBe(true); expect(r2).toMatchObject({ ok: true, idempotent: true });
    expect(r2.refund_id).toBe(r1.refund_id);
    const rows = await sel<any[]>(`/refunds?order_id=eq.${o.order_id}&razorpay_payment_id=eq.${pay}&select=id`); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(rows.length).toBe(1); // exactly one obligation for the capture
    // late_payment without a payment id is rejected
    const noPay = await rpc<{ ok: boolean; reason: string }>("begin_refund", { p: { order_id: o.order_id, amount: 500, late_payment: true } });
    expect(noPay).toMatchObject({ ok: false, reason: "late_payment_needs_payment_id" });
  });

  it("§5 concurrency: parallel finalize + expire_stale on one order → exactly ONE outcome, never negative", async () => {
    await rpc("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 5, reason: "reset" } });
    const rzp = `${TAG}-rz6`;
    const o = await makeOrder(rzp, `${TAG}-s6`);
    const before = await stockOf();
    // Both contend on the order row lock (finalize FOR UPDATE vs expire_stale FOR UPDATE SKIP LOCKED).
    await Promise.all([
      rpc("finalize_order", { p_razorpay_order_id: rzp, p_payment_id: `${TAG}-pay6`, p_signature: "", p_source: "webhook", p_amount_paise: null }).catch(() => null),
      rpc<number>("expire_stale_pending_orders", { p_minutes: 0 }).catch(() => null),
    ]);
    const ord = (await sel<any[]>(`/orders?id=eq.${o.order_id}&select=status,payment_status,invoice_number`))[0]; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(["confirmed", "cancelled"]).toContain(ord.status); // exactly one deterministic outcome
    if (ord.status === "confirmed") {
      expect(ord.invoice_number).toBeTruthy();
      expect(await stockOf()).toBe(before - 1); // finalize won → decremented exactly once
    } else {
      expect(ord.invoice_number).toBeNull();     // cancelled won → no invoice, no decrement
      expect(await stockOf()).toBe(before);
    }
    expect(await stockOf()).toBeGreaterThanOrEqual(0); // never negative under the race
  });

  it("#2/#4: payment_attempts are unique per capture — a duplicate late webhook records ONE attempt row", async () => {
    const rzp = `${TAG}-rz8`;
    const o = await makeOrder(rzp, `${TAG}-s8`);
    await patch(`/orders?id=eq.${o.order_id}`, { status: "cancelled", payment_status: "failed" });
    const pay = `${TAG}-pay8`;
    const callVoid = async (fn: string, body: unknown) => { const r = await fetch(rest(`/rpc/${fn}`), { method: "POST", headers: H, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${fn} ${r.status}: ${await r.text()}`); };
    // two webhook deliveries recording the SAME capture
    for (let i = 0; i < 2; i++) await callVoid("record_payment_attempt", { p: { order_id: o.order_id, razorpay_order_id: rzp, razorpay_payment_id: pay, status: "paid", amount: 500, currency: "INR", source: "webhook" } });
    const rows = await sel<any[]>(`/payment_attempts?razorpay_payment_id=eq.${pay}&select=id`); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(rows.length).toBe(1); // unique(razorpay_payment_id) + on conflict do nothing → one canonical capture record
  });

  it("regression: a PAID order still allows multiple partial refunds (dedup is late-payment-scoped)", async () => {
    await rpc("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 5, reason: "reset" } });
    const rzp = `${TAG}-rz9`, pay = `${TAG}-pay9`;
    await makeOrder(rzp, `${TAG}-s9`);
    await rpc("finalize_order", { p_razorpay_order_id: rzp, p_payment_id: pay, p_signature: "", p_source: "verify", p_amount_paise: null });
    const oid = (await sel<any[]>(`/orders?razorpay_order_id=eq.${rzp}&select=id`))[0].id; // eslint-disable-line @typescript-eslint/no-explicit-any
    const r1 = await rpc<{ ok: boolean; refund_id: string }>("begin_refund", { p: { order_id: oid, amount: 200, payment_id: pay, method: "gateway" } });
    const r2 = await rpc<{ ok: boolean; refund_id: string }>("begin_refund", { p: { order_id: oid, amount: 100, payment_id: pay, method: "gateway" } });
    expect(r1.ok).toBe(true); expect(r2.ok).toBe(true);
    expect(r2.refund_id).not.toBe(r1.refund_id); // NOT deduped — two legitimate partials on the same payment
    expect((await sel<any[]>(`/refunds?order_id=eq.${oid}&status=neq.failed&select=id`)).length).toBe(2); // eslint-disable-line @typescript-eslint/no-explicit-any
    // over-refund guard still caps the total (200+100+300 > 500)
    const over = await rpc<{ ok: boolean; reason: string }>("begin_refund", { p: { order_id: oid, amount: 300, payment_id: pay, method: "gateway" } });
    expect(over).toMatchObject({ ok: false, reason: "over_refund" });
  });

  it("late-payment retry: re-issuing a FAILED obligation creates ONE new attempt, idempotent on duplicate", async () => {
    const rzp = `${TAG}-rz10`, pay = `${TAG}-pay10`;
    const o = await makeOrder(rzp, `${TAG}-s10`);
    await patch(`/orders?id=eq.${o.order_id}`, { status: "cancelled", payment_status: "failed" });
    // the obligation to recover: a prior late-payment auto-refund that FAILED at the gateway
    await ins("refunds", { order_id: o.order_id, razorpay_payment_id: pay, amount: 500, currency: "INR", status: "failed", method: "gateway", reason: "late capture auto-refund" });
    const retry = await rpc<{ ok: boolean; refund_id: string }>("begin_refund", { p: { order_id: o.order_id, amount: 500, payment_id: pay, late_payment: true, method: "gateway" } });
    expect(retry.ok).toBe(true);
    expect((await sel<any[]>(`/refunds?order_id=eq.${o.order_id}&status=neq.failed&select=id`)).length).toBe(1); // one active attempt; the failed obligation stays as history // eslint-disable-line @typescript-eslint/no-explicit-any
    const dup = await rpc<{ ok: boolean; idempotent?: boolean; refund_id: string }>("begin_refund", { p: { order_id: o.order_id, amount: 500, payment_id: pay, late_payment: true, method: "gateway" } });
    expect(dup).toMatchObject({ ok: true, idempotent: true, refund_id: retry.refund_id }); // duplicate retry → same attempt
    expect((await sel<any[]>(`/refunds?order_id=eq.${o.order_id}&status=neq.failed&select=id`)).length).toBe(1); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  it("duplicate late-webhook: repeated finalize on a cancelled order stays terminal (no resurrection, no stock)", async () => {
    await rpc("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 5, reason: "reset" } });
    const rzp = `${TAG}-rz7`;
    const o = await makeOrder(rzp, `${TAG}-s7`);
    await patch(`/orders?id=eq.${o.order_id}`, { status: "cancelled", payment_status: "failed" });
    await del(`/stock_reservations?order_id=eq.${o.order_id}`);
    const before = await stockOf();
    const f1 = await rpc<{ terminal: boolean }>("finalize_order", { p_razorpay_order_id: rzp, p_payment_id: `${TAG}-pay7`, p_signature: "", p_source: "webhook", p_amount_paise: null });
    const f2 = await rpc<{ terminal: boolean }>("finalize_order", { p_razorpay_order_id: rzp, p_payment_id: `${TAG}-pay7`, p_signature: "", p_source: "webhook", p_amount_paise: null });
    expect(f1.terminal).toBe(true); expect(f2.terminal).toBe(true); // both refuse, idempotently
    const ord = (await sel<any[]>(`/orders?id=eq.${o.order_id}&select=status,invoice_number`))[0]; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(ord.status).toBe("cancelled");
    expect(ord.invoice_number).toBeNull();
    expect(await stockOf()).toBe(before);
  });
});
