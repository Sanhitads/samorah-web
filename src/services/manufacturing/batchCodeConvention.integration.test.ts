import { describe, it, expect, beforeAll } from "vitest";

/**
 * Batch-code convention — proves the generator produces the agreed Samorah format
 *   [PREFIX]-[VESSEL/FORMAT]-[YYMMDD]-[SEQUENCE]   e.g. KC-G190-261201-01
 * given a product whose batch_prefix is the fragrance code. The VESSEL/FORMAT half is derived by
 * batch_format_code (G=glass, C=ceramic/candle, + size digits; sprays → R…ML / LN…ML) and is correct as-is;
 * the only real-world defect is that some real products carry a test-polluted or null batch_prefix (data,
 * corrected separately under an approval boundary). Uses a DISPOSABLE product + a disposable prefix.
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
const rpc = async (fn: string, body: any) => { const r = await fetch(rest(`/rpc/${fn}`), { method: "POST", headers: H, body: JSON.stringify(body) }); return (await r.json().catch(() => null)) as any; };

import { createBatch } from "@/services/manufacturing/batchService";
import type { StaffActor } from "@/services/manufacturing/actor";

const RUNK = "BCC" + Date.now().toString(36).slice(-4);
let mgr: StaffActor;
// Disposable fragrance-style prefix (unique; never a real catalogue code).
const PREFIX = ("Z" + Date.now().toString(36).slice(-4)).toUpperCase().slice(0, 6);
let productId = "";

async function variant(vessel: string, size: string): Promise<string> {
  const v = await ins("variants", { product_id: productId, sku: `${PREFIX}-${vessel[0]}${size}-${Math.random().toString(36).slice(2, 5)}`.toUpperCase(), price: 100, vessel_type: vessel, size_label: size, variant_name: `${vessel} ${size}`, is_active: false });
  return v.id;
}
const ymd = (iso: string) => iso.slice(2, 10).replace(/-/g, ""); // YYYY-MM-DD → YYMMDD

d("Batch-code convention [PREFIX]-[FORMAT]-[YYMMDD]-[SEQ]", () => {
  beforeAll(async () => {
    const us = await sel("/users?select=id&limit=1"); mgr = { userId: us[0].id, role: "manager" };
    const cat = (await sel("/categories?select=id&limit=1"))[0];
    const p = await ins("products", { name: `BCC ${RUNK}`, slug: `bcc-${RUNK}`.toLowerCase(), base_sku: `BCC-${RUNK}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: PREFIX });
    productId = p.id;
  });

  it("glass 190g → PREFIX-G190-YYMMDD-01 (matches the agreed KC-G190-… shape)", async () => {
    const v = await variant("glass", "190g");
    const mdate = "2026-12-01";
    const { batchId } = await createBatch(mgr, { variantId: v, idempotencyKey: `BCC-${RUNK}-g190`, manufacturingDate: mdate, plannedQty: 5, earliestReleaseDate: "2027-01-01" });
    const code = (await sel(`/manufacturing_batches?id=eq.${batchId}&select=batch_code`))[0].batch_code;
    expect(code).toBe(`${PREFIX}-G190-${ymd(mdate)}-01`);
  });

  it("ceramic 150g → PREFIX-C150-… ; format reflects vessel+size (C100/G100 are NOT wrong, just derived)", async () => {
    const v = await variant("ceramic", "150g");
    const mdate = "2026-12-01";
    const { batchId } = await createBatch(mgr, { variantId: v, idempotencyKey: `BCC-${RUNK}-c150`, manufacturingDate: mdate, plannedQty: 5, earliestReleaseDate: "2027-01-01" });
    const code = (await sel(`/manufacturing_batches?id=eq.${batchId}&select=batch_code`))[0].batch_code;
    expect(code).toBe(`${PREFIX}-C150-${ymd(mdate)}-01`);  // own (vessel,size) scope → seq 01
  });

  it("batch_format_code mappings are correct for candle + spray types", async () => {
    expect(await rpc("batch_format_code", { p_vessel: "glass", p_size_label: "190g", p_product_type: "candle" })).toBe("G190");
    expect(await rpc("batch_format_code", { p_vessel: "ceramic", p_size_label: "100g", p_product_type: "candle" })).toBe("C100");
    expect(await rpc("batch_format_code", { p_vessel: "ceramic", p_size_label: "200g", p_product_type: "candle" })).toBe("C200");
    expect(await rpc("batch_format_code", { p_vessel: null, p_size_label: "100ml", p_product_type: "room_spray" })).toBe("R100ML");
    expect(await rpc("batch_format_code", { p_vessel: null, p_size_label: "100ml", p_product_type: "linen_spray" })).toBe("LN100ML");
  });
});
