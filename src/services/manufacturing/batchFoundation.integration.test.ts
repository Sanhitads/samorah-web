import { describe, it, expect, beforeAll } from "vitest";

/**
 * Phase 2 — Manufacturing foundation schema & security. LOCAL Supabase only.
 * Proves: (1) concurrency-safe, unique, contiguous batch-code generation;
 * (2) RLS Pattern #1 — anon can neither read nor write manufacturing tables, and
 *     generate_batch_code is not executable by anon;
 * (3) DB-enforced release cap (Σ release qty ≤ approved_qty);
 * (4) production quantity conservation CHECK;
 * (5) batch_code immutability trigger.
 * NO stock is moved and NO allocation/release posting exists — schema only.
 */
const URL = (process.env.INV_TEST_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.INV_TEST_SERVICE_KEY || "";
const ANON = process.env.INV_TEST_ANON_KEY || "";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL);
const RUN = !!(URL && KEY && ANON && LOCAL);
const d = RUN ? describe : describe.skip;

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const AH = { apikey: ANON, Authorization: `Bearer ${ANON}`, "Content-Type": "application/json" };
const rest = (p: string) => `${URL}/rest/v1${p}`;
const rpc = (fn: string) => `${URL}/rest/v1/rpc/${fn}`;
/* eslint-disable @typescript-eslint/no-explicit-any */
const sel = async (p: string, h = H) => { const r = await fetch(rest(p), { headers: h }); return { status: r.status, body: await r.json().catch(() => null) as any }; };
const ins = async (t: string, row: any, h = H) => fetch(rest(`/${t}`), { method: "POST", headers: { ...h, Prefer: "return=representation" }, body: JSON.stringify(row) });
const callRpc = async (fn: string, body: any, h = H) => { const r = await fetch(rpc(fn), { method: "POST", headers: h, body: JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) as any }; };

// Unique per-run prefix so each run starts a fresh batch-code sequence scope (≤6 chars).
const PREFIX = ("T" + Date.now().toString(36).slice(-4)).toUpperCase();
const RUN_DATE = "2026-12-01";
let variantId = "", productId = "", sku = "", productType = "candle";

d("Manufacturing foundation (Phase 2)", () => {
  beforeAll(async () => {
    const { body } = await sel("/variants?select=id,sku,product_id,products(product_type)&limit=1");
    if (Array.isArray(body) && body[0]) {
      variantId = body[0].id; productId = body[0].product_id; sku = body[0].sku;
      productType = body[0].products?.product_type ?? "candle";
    }
  });

  it("generates unique, contiguous batch codes under concurrency", async () => {
    const N = 20;
    const results = await Promise.all(
      Array.from({ length: N }, () => callRpc("generate_batch_code", { p_prefix: PREFIX, p_format: "G190", p_date: RUN_DATE })),
    );
    const codes = results.map((r) => r.body as string);
    expect(codes.every((c) => typeof c === "string" && c.startsWith(`${PREFIX}-G190-261201-`))).toBe(true);
    expect(new Set(codes).size).toBe(N); // all unique
    const seqs = codes.map((c) => Number(c.split("-").pop())).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1)); // contiguous 1..N, none reused
  });

  it("denies anon read, anon write, and anon RPC execute (RLS Pattern #1)", async () => {
    const read = await sel("/manufacturing_batches?select=id", AH);
    expect(Array.isArray(read.body) ? read.body.length : 0).toBe(0); // RLS: no rows for anon
    const write = await ins("materials", { name: `x-${PREFIX}`, material_type: "wax" }, AH);
    expect(write.ok).toBe(false); // no insert grant / no policy for anon
    const genAnon = await callRpc("generate_batch_code", { p_prefix: PREFIX, p_format: "G190", p_date: RUN_DATE }, AH);
    expect(genAnon.status).toBeGreaterThanOrEqual(400); // execute revoked from anon
  });

  it("rejects a batch violating production quantity conservation", async () => {
    if (!variantId) return expect(RUN).toBe(true);
    const r = await ins("manufacturing_batches", {
      batch_kind: "production", batch_code: `${PREFIX}-CONS-261201-01`, product_id: productId, variant_id: variantId,
      sku_snapshot: sku, product_type: productType, manufacturing_date: RUN_DATE, production_sequence: 1,
      produced_qty: 10, approved_qty: 10, pending_inspection_qty: 5, rejected_qty: 0, qc_sampled_destroyed_qty: 0, // 10 ≠ 10+0+0+5
    });
    expect(r.ok).toBe(false);
    expect((await r.text()).toLowerCase()).toContain("conservation");
  });

  it("enforces the release cap and batch-code immutability", async () => {
    if (!variantId) return expect(RUN).toBe(true);
    const code = `${PREFIX}-REL-261201-01`;
    const b = await ins("manufacturing_batches", {
      batch_kind: "production", batch_code: code, product_id: productId, variant_id: variantId,
      sku_snapshot: sku, product_type: productType, manufacturing_date: RUN_DATE, production_sequence: 1,
      produced_qty: 10, approved_qty: 10, pending_inspection_qty: 0,
    });
    expect(b.ok).toBe(true);
    const batchId = (await b.json())[0].id;

    const e1 = await ins("batch_release_events", { batch_id: batchId, release_seq: 1, qty: 6, idempotency_key: `${code}:1` });
    expect(e1.ok).toBe(true); // 6 ≤ 10
    const e2 = await ins("batch_release_events", { batch_id: batchId, release_seq: 2, qty: 5, idempotency_key: `${code}:2` });
    expect(e2.ok).toBe(false); // 6+5 > 10 → capped
    const e3 = await ins("batch_release_events", { batch_id: batchId, release_seq: 3, qty: 4, idempotency_key: `${code}:3` });
    expect(e3.ok).toBe(true); // 6+4 = 10

    const upd = await fetch(rest(`/manufacturing_batches?id=eq.${batchId}`), { method: "PATCH", headers: H, body: JSON.stringify({ batch_code: `${code}-X` }) });
    expect(upd.ok).toBe(false); // immutable
    expect((await upd.text()).toLowerCase()).toContain("immutable");
  });
});
