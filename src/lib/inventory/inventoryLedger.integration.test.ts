import { describe, it, expect, beforeAll, afterAll } from "vitest";

/**
 * Phase-0 inventory-ledger DB evidence. Runs ONLY against a LOCAL Supabase — gated on
 * INV_TEST_SUPABASE_URL pointing at localhost/127.0.0.1 (a hard guard so this can never
 * touch a hosted/production database). Provide:
 *   INV_TEST_SUPABASE_URL=http://127.0.0.1:54321
 *   INV_TEST_SERVICE_KEY=<local service_role key from `supabase status`>
 * then: npx vitest run src/lib/inventory/inventoryLedger.integration.test.ts
 *
 * Proves: opening-balance backfill · add/remove/set + ledger before/delta/after ·
 * INV-2 negative reject · INV-3 below-reserved reject · INV-9 idempotency ·
 * variant_reserved(live) · concurrency (no lost update/movement) · ledger immutability ·
 * full sale lifecycle (reserve→pending→finalize) sale movement + idempotent re-finalize ·
 * INV-11 cancel_order unconditional hold cleanup.
 */
const URL = process.env.INV_TEST_SUPABASE_URL || "";
const KEY = process.env.INV_TEST_SERVICE_KEY || "";
const ANON = process.env.INV_TEST_ANON_KEY || "";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL.replace(/\/$/, ""));
const RUN = !!(URL && KEY && LOCAL);
const d = RUN ? describe : describe.skip;

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p: string) => `${URL.replace(/\/$/, "")}/rest/v1${p}`;
async function rpc<T = unknown>(fn: string, body: unknown): Promise<T> {
  const r = await fetch(rest(`/rpc/${fn}`), { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${fn} ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}
async function ins(table: string, row: unknown) {
  const r = await fetch(rest(`/${table}`), { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) });
  if (!r.ok) throw new Error(`insert ${table} ${r.status}: ${await r.text()}`);
  return (await r.json())[0];
}
async function sel<T = any[]>(p: string): Promise<T> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = await fetch(rest(p), { headers: H });
  if (!r.ok) throw new Error(`select ${p} ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T>;
}
async function del(p: string) { await fetch(rest(p), { method: "DELETE", headers: H }); }

const TAG = `INVTEST-${Date.now()}`;
let categoryId = "", productId = "", variantId = "", sku = "";
const movements = () => sel<any[]>(`/inventory_movements?variant_ref=eq.${variantId}&order=created_at.asc`); // eslint-disable-line @typescript-eslint/no-explicit-any
const stockOf = async () => (await sel<any[]>(`/variants?id=eq.${variantId}&select=stock`))[0].stock as number; // eslint-disable-line @typescript-eslint/no-explicit-any

beforeAll(async () => {
  if (!RUN) return;
  sku = `${TAG}-SKU`;
  const cat = await ins("categories", { name: `${TAG} cat`, slug: `${TAG.toLowerCase()}-cat`, sku_prefix: "TST", default_hsn_code: "3307" });
  categoryId = cat.id;
  const p = await ins("products", { name: `${TAG} product`, slug: `${TAG.toLowerCase()}`, base_sku: `${TAG}-BASE`, category_id: categoryId, status: "active", product_type: "candle", hsn_code: "3307", gst_rate: 18, price: 500 });
  productId = p.id;
  // Insert a variant WITHOUT opening backfill (backfill only ran at migration time), then create its
  // opening balance explicitly is NOT needed — Phase-0 opening backfill covers pre-existing variants.
  // For a fresh test variant we assert adjust/ledger behaviour directly (stock starts at 10).
  const v = await ins("variants", { product_id: productId, sku, variant_name: "Test 100g", price: 500, stock: 10, low_stock_threshold: 3 });
  variantId = v.id;
});

afterAll(async () => {
  if (!RUN || !variantId) return;
  await del(`/inventory_movements?variant_ref=eq.${variantId}`);
  await del(`/stock_reservations?variant_id=eq.${variantId}`);
  await del(`/order_items?variant_id=eq.${variantId}`);
  await del(`/orders?order_number=like.${TAG}*`);
  await del(`/variants?id=eq.${variantId}`);
  await del(`/products?id=eq.${productId}`);
  await del(`/categories?id=eq.${categoryId}`);
});

d("Phase 0 — inventory ledger + adjust_inventory (local DB evidence)", () => {
  it("opening balance is anchored at variant CREATE (trigger), reconciles, and backfill is idempotent", async () => {
    // The AFTER INSERT trigger anchored our variant's opening balance atomically at creation.
    const ms = await movements();
    const opening = ms.filter((m) => m.movement_type === "opening_balance");
    expect(opening.length).toBe(1);
    expect([opening[0].quantity_before, opening[0].quantity_delta, opening[0].quantity_after]).toEqual([0, 10, 10]);
    expect(opening[0].note).toMatch(/opening balance/i); // labelled Opening balance, not Stock received
    const n = await rpc<number>("backfill_opening_balances", {}); // already anchored → no-op
    expect(n).toBe(0);
    expect(ms.reduce((s, m) => s + m.quantity_delta, 0)).toBe(await stockOf()); // Σ deltas == on-hand
  });

  it("authority switch: direct UPDATE of variants.stock is REFUSED; other columns still writable", async () => {
    const before = await stockOf();
    const bad = await fetch(rest(`/variants?id=eq.${variantId}`), { method: "PATCH", headers: H, body: JSON.stringify({ stock: 999 }) });
    expect(bad.ok).toBe(false); // UPDATE(stock) revoked from the API role → refused
    expect(await stockOf()).toBe(before); // unchanged
    const ok = await fetch(rest(`/variants?id=eq.${variantId}`), { method: "PATCH", headers: H, body: JSON.stringify({ price: 501 }) });
    expect(ok.ok).toBe(true); // non-stock columns remain editable by the Product Editor
    const av = await fetch(rest(`/variants?id=eq.${variantId}`), { method: "PATCH", headers: H, body: JSON.stringify({ price: 500, stock: 5 }) });
    expect(av.ok).toBe(false); // an update that INCLUDES stock is refused as a whole
    expect(await stockOf()).toBe(before);
  });

  it("add / remove / set append correct before·delta·after movements (INV-4)", async () => {
    const a = await rpc<{ ok: boolean; on_hand: number; delta: number }>("adjust_inventory", { p: { variant_id: variantId, mode: "add", qty: 20, reason: "Stock received" } });
    expect(a).toMatchObject({ ok: true, on_hand: 30, delta: 20 });
    await rpc("adjust_inventory", { p: { variant_id: variantId, mode: "remove", qty: 2, reason: "Damaged" } });
    const s = await rpc<{ ok: boolean; on_hand: number }>("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 27, reason: "Physical count correction" } });
    expect(s).toMatchObject({ ok: true, on_hand: 27 });
    expect(await stockOf()).toBe(27);
    const ms = await movements();
    const last3 = ms.slice(-3);
    expect(last3.map((m) => [m.quantity_before, m.quantity_delta, m.quantity_after])).toEqual([[10, 20, 30], [30, -2, 28], [28, -1, 27]]);
    expect(last3.every((m) => m.movement_type === "manual_adjustment" && m.sku_snapshot === sku)).toBe(true);
  });

  it("INV-2: cannot remove/set below zero", async () => {
    const r = await rpc<{ ok: boolean; reason: string }>("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 0, reason: "x" } });
    expect(r.ok).toBe(true); // 0 is allowed (no reservations)
    await rpc("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 27, reason: "reset" } });
    const neg = await rpc<{ ok: boolean; reason: string }>("adjust_inventory", { p: { variant_id: variantId, mode: "remove", qty: 999, reason: "x" } });
    expect(neg).toMatchObject({ ok: false, reason: "negative_stock" });
  });

  it("INV-3: cannot set/remove below live reserved; variant_reserved counts live only", async () => {
    await ins("stock_reservations", { variant_id: variantId, quantity: 5, session_id: `${TAG}-s`, expires_at: new Date(Date.now() + 3_600_000).toISOString() });
    await ins("stock_reservations", { variant_id: variantId, quantity: 4, session_id: `${TAG}-x`, expires_at: new Date(Date.now() - 3_600_000).toISOString() }); // expired → ignored
    const vr = await rpc<{ variant_id: string; reserved: number }[]>("variant_reserved", { p_variant_ids: [variantId] });
    expect(vr[0].reserved).toBe(5); // live only
    const below = await rpc<{ ok: boolean; reason: string; reserved: number }>("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 3, reason: "x" } });
    expect(below).toMatchObject({ ok: false, reason: "below_reserved", reserved: 5 });
    const ok = await rpc<{ ok: boolean }>("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 5, reason: "down to reserved" } });
    expect(ok.ok).toBe(true);
    await del(`/stock_reservations?variant_id=eq.${variantId}`);
  });

  it("INV-9: idempotency_key makes a repeated adjust a no-op", async () => {
    await rpc("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 50, reason: "reset" } });
    const key = `${TAG}-idem-1`;
    const before = (await movements()).length;
    const r1 = await rpc<{ ok: boolean }>("adjust_inventory", { p: { variant_id: variantId, mode: "add", qty: 5, reason: "Stock received", idempotency_key: key } });
    const r2 = await rpc<{ ok: boolean; idempotent?: boolean }>("adjust_inventory", { p: { variant_id: variantId, mode: "add", qty: 5, reason: "Stock received", idempotency_key: key } });
    expect(r1.ok).toBe(true); expect(r2).toMatchObject({ ok: true, idempotent: true });
    expect(await stockOf()).toBe(55); // applied once
    expect((await movements()).length).toBe(before + 1);
  });

  it("concurrency: two parallel adjusts serialise — no lost update, both ledgered", async () => {
    await rpc("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 100, reason: "reset" } });
    const before = (await movements()).length;
    await Promise.all([
      rpc("adjust_inventory", { p: { variant_id: variantId, mode: "add", qty: 5, reason: "Stock received" } }),
      rpc("adjust_inventory", { p: { variant_id: variantId, mode: "add", qty: 3, reason: "Stock received" } }),
    ]);
    expect(await stockOf()).toBe(108); // 100+5+3, no lost update
    const ms = await movements();
    expect(ms.length).toBe(before + 2);
    // before/after chain of the two new rows is consistent (no overlap)
    const news = ms.slice(-2).sort((a, b) => a.quantity_before - b.quantity_before);
    expect(news[0].quantity_after).toBe(news[1].quantity_before);
  });

  it("concurrent SAME-KEY adjustments apply EXACTLY once (§4 — real race, one movement)", async () => {
    await rpc("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 20, reason: "reset" } });
    const key = `${TAG}-concurrent`;
    // Two identical +10 requests fired together with the SAME operation key (double-click / retry).
    const fire = () => rpc("adjust_inventory", { p: { variant_id: variantId, mode: "add", qty: 10, reason: "Stock received", idempotency_key: key } }).catch((e) => ({ error: String(e) }));
    await Promise.all([fire(), fire()]);
    expect(await stockOf()).toBe(30); // 20 + exactly one +10
    const withKey = (await movements()).filter((m) => m.idempotency_key === key);
    expect(withKey.length).toBe(1); // exactly ONE movement attributable to the key — the retry did not duplicate
    expect(withKey[0].quantity_delta).toBe(10);
  });

  it("ledger is append-only: UPDATE and DELETE are rejected", async () => {
    const m = (await movements())[0];
    const up = await fetch(rest(`/inventory_movements?id=eq.${m.id}`), { method: "PATCH", headers: H, body: JSON.stringify({ note: "tamper" }) });
    expect(up.ok).toBe(false); // no UPDATE grant
    const dl = await fetch(rest(`/inventory_movements?id=eq.${m.id}`), { method: "DELETE", headers: H });
    const still = await sel<any[]>(`/inventory_movements?id=eq.${m.id}`); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(dl.ok === false || still.length === 1).toBe(true); // no DELETE grant → row survives
  });

  it("req#2: arithmetic + non-negative CHECK constraints reject malformed movement rows", async () => {
    const base = { variant_ref: variantId, sku_snapshot: sku, product_name_snapshot: `${TAG} product`, movement_type: "manual_adjustment", source_type: "admin" };
    const badMath = await fetch(rest(`/inventory_movements`), { method: "POST", headers: H, body: JSON.stringify({ ...base, quantity_before: 10, quantity_delta: 5, quantity_after: 99 }) });
    expect(badMath.ok).toBe(false); // after != before+delta → arithmetic CHECK
    const negative = await fetch(rest(`/inventory_movements`), { method: "POST", headers: H, body: JSON.stringify({ ...base, quantity_before: 0, quantity_delta: -1, quantity_after: -1 }) });
    expect(negative.ok).toBe(false); // after < 0 → non-negative CHECK
  });

  it("RBAC: adjust_inventory is server-only (anon execute revoked)", async () => {
    if (!ANON) return; // provide INV_TEST_ANON_KEY to exercise this
    const r = await fetch(rest(`/rpc/adjust_inventory`), {
      method: "POST",
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p: { variant_id: variantId, mode: "add", qty: 1, reason: "x" } }),
    });
    expect(r.ok).toBe(false); // anon holds no EXECUTE grant on adjust_inventory
  });

  it("full sale lifecycle: reserve → pending → finalize emits ONE 'sale' movement, idempotent re-finalize", async () => {
    await rpc("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 10, reason: "reset" } });
    const session = `${TAG}-sale`, rzp = `${TAG}-rzp`;
    // TWO holds of the SAME variant (e.g. a 2x-same composition) → finalize must AGGREGATE to one 'sale' movement of -2.
    const rr = await rpc<{ ok: boolean }>("reserve_stock", { p: { session_id: session, ttl_minutes: 15, items: [{ variant_id: variantId, quantity: 1, sku }, { variant_id: variantId, quantity: 1, sku }] } });
    expect(rr.ok).toBe(true);
    const line = { product_id: productId, variant_id: variantId, product_name: `${TAG} product`, sku, hsn_code: "3307", gst_rate: 18, unit_price: 500, quantity: 2, line_subtotal: 1000, line_discount: 0, line_taxable: 847.46, line_cgst: 76.27, line_sgst: 76.27, line_igst: 0, line_total: 1000 };
    const payload = { email: "t@example.com", phone: "9999999999", subtotal: 1000, discount_amount: 0, shipping_amount: 0, total_amount: 1000, taxable_amount: 847.46, cgst_amount: 76.27, sgst_amount: 76.27, igst_amount: 0, ship_full_name: "T", ship_phone: "9999999999", ship_line1: "1", ship_city: "C", ship_state: "Karnataka", ship_pincode: "560001", razorpay_order_id: rzp, shipping_charge: 0, shipping_gst: 0, reservation_session: session, items: [line] };
    const po = await rpc<{ order_number: string }>("create_pending_order", { p: payload });
    expect(po.order_number).toBeTruthy();
    const f1 = await rpc<{ created: boolean }>("finalize_order", { p_razorpay_order_id: rzp, p_payment_id: `${TAG}-pay`, p_signature: "", p_source: "test", p_amount_paise: null });
    expect(f1.created).toBe(true);
    expect(await stockOf()).toBe(8); // decremented by 2
    const sales = (await movements()).filter((m) => m.movement_type === "sale");
    expect(sales.length).toBe(1);
    expect([sales[0].quantity_before, sales[0].quantity_delta, sales[0].quantity_after]).toEqual([10, -2, 8]);
    const f2 = await rpc<{ created: boolean }>("finalize_order", { p_razorpay_order_id: rzp, p_payment_id: `${TAG}-pay`, p_signature: "", p_source: "test", p_amount_paise: null });
    expect(f2.created).toBe(false); // idempotent
    expect((await movements()).filter((m) => m.movement_type === "sale").length).toBe(1); // still one
  });

  it("INV-11: cancel_order releases order-linked holds even without release_inventory", async () => {
    const session = `${TAG}-cancel`, rzp = `${TAG}-rzp2`;
    await rpc("reserve_stock", { p: { session_id: session, ttl_minutes: 15, items: [{ variant_id: variantId, quantity: 1, sku }] } });
    const line = { product_id: productId, variant_id: variantId, product_name: `${TAG} product`, sku, hsn_code: "3307", gst_rate: 18, unit_price: 500, quantity: 1, line_subtotal: 500, line_discount: 0, line_taxable: 423.73, line_cgst: 38.14, line_sgst: 38.14, line_igst: 0, line_total: 500 };
    const payload = { email: "t@example.com", phone: "9999999999", subtotal: 500, discount_amount: 0, shipping_amount: 0, total_amount: 500, taxable_amount: 423.73, cgst_amount: 38.14, sgst_amount: 38.14, igst_amount: 0, ship_full_name: "T", ship_phone: "9999999999", ship_line1: "1", ship_city: "C", ship_state: "Karnataka", ship_pincode: "560001", razorpay_order_id: rzp, shipping_charge: 0, shipping_gst: 0, reservation_session: session, items: [line] };
    const po = await rpc<{ order_id: string }>("create_pending_order", { p: payload });
    const held = await sel<any[]>(`/stock_reservations?order_id=eq.${po.order_id}`); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(held.length).toBe(1); // linked
    const c = await rpc<{ ok: boolean }>("cancel_order", { p: { order_id: po.order_id, reason: "test", release_inventory: false } });
    expect(c.ok).toBe(true);
    const after = await sel<any[]>(`/stock_reservations?order_id=eq.${po.order_id}`); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(after.length).toBe(0); // hold released despite release_inventory=false — no orphan
  });

  it("INV-11 predicate: expired hold on a PENDING order protects; on a terminal/orphan order it does not", async () => {
    await del(`/stock_reservations?variant_id=eq.${variantId}`);
    await rpc("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 10, reason: "reset" } });
    const session = `${TAG}-pred`, rzp = `${TAG}-rzp3`;
    await rpc("reserve_stock", { p: { session_id: session, ttl_minutes: 15, items: [{ variant_id: variantId, quantity: 4, sku }] } });
    const line = { product_id: productId, variant_id: variantId, product_name: `${TAG} product`, sku, hsn_code: "3307", gst_rate: 18, unit_price: 500, quantity: 4, line_subtotal: 2000, line_discount: 0, line_taxable: 1694.92, line_cgst: 152.54, line_sgst: 152.54, line_igst: 0, line_total: 2000 };
    const payload = { email: "t@example.com", phone: "9999999999", subtotal: 2000, discount_amount: 0, shipping_amount: 0, total_amount: 2000, taxable_amount: 1694.92, cgst_amount: 152.54, sgst_amount: 152.54, igst_amount: 0, ship_full_name: "T", ship_phone: "9999999999", ship_line1: "1", ship_city: "C", ship_state: "Karnataka", ship_pincode: "560001", razorpay_order_id: rzp, shipping_charge: 0, shipping_gst: 0, reservation_session: session, items: [line] };
    const po = await rpc<{ order_id: string }>("create_pending_order", { p: payload });
    // Force the linked hold EXPIRED — storefront sees it as free, but the order is still payable.
    await fetch(rest(`/stock_reservations?order_id=eq.${po.order_id}`), { method: "PATCH", headers: H, body: JSON.stringify({ expires_at: new Date(Date.now() - 3_600_000).toISOString() }) });
    const vr = await rpc<{ reserved: number }[]>("variant_reserved", { p_variant_ids: [variantId] });
    expect(vr[0].reserved).toBe(0); // live reserved ignores the expired hold
    const blocked = await rpc<{ ok: boolean; reason: string }>("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 0, reason: "x" } });
    expect(blocked).toMatchObject({ ok: false, reason: "below_reserved" }); // protected via the PENDING order
    // Order goes terminal WITHOUT its hold cleaned (simulates a legacy orphan the cancel-fix prevents).
    await fetch(rest(`/orders?id=eq.${po.order_id}`), { method: "PATCH", headers: H, body: JSON.stringify({ status: "cancelled" }) });
    const ok = await rpc<{ ok: boolean }>("adjust_inventory", { p: { variant_id: variantId, mode: "set", qty: 0, reason: "orphan does not protect" } });
    expect(ok.ok).toBe(true); // orphan on a terminal order does NOT freeze stock
    await del(`/stock_reservations?variant_id=eq.${variantId}`);
  });

  // MUST run last — it deletes the shared test variant.
  it("INV-8/req#6: history survives variant deletion (variant_id→NULL, snapshot intact)", async () => {
    const before = await movements();
    expect(before.length).toBeGreaterThan(0);
    await del(`/stock_reservations?variant_id=eq.${variantId}`);
    const dv = await fetch(rest(`/variants?id=eq.${variantId}`), { method: "DELETE", headers: H });
    expect(dv.ok).toBe(true); // hard-delete allowed (no RESTRICT) — the existing catalog flow still works
    const after = await movements(); // still queryable by variant_ref
    expect(after.length).toBe(before.length); // no rows lost
    expect(after.every((m) => m.variant_id === null)).toBe(true); // FK SET NULL
    expect(after.every((m) => m.sku_snapshot === sku && m.product_name_snapshot === `${TAG} product`)).toBe(true); // identity intact
  });
});
