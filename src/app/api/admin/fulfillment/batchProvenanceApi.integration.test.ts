import { describe, it, expect, beforeAll, vi } from "vitest";

/**
 * Phase 8 — /api/admin/fulfillment/batch route: capability gating per action, server-derived actor
 * (never from the body), and dispatch into the provenance service. LOCAL Supabase only.
 */
const URL = (process.env.INV_TEST_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.INV_TEST_SERVICE_KEY || "";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL);
const RUN = !!(URL && KEY && LOCAL);
const d = RUN ? describe : describe.skip;
if (RUN) { process.env.NEXT_PUBLIC_SUPABASE_URL = URL; process.env.SUPABASE_SERVICE_ROLE_KEY = KEY; }

const staff = vi.hoisted(() => ({ role: "editor", userId: "" }));
vi.mock("@/lib/auth/requireStaff", async () => {
  const { hasCapability } = await import("@/lib/auth/capabilities");
  return {
    requireCapability: async (cap: string) => ({ ok: !!staff.userId && hasCapability(staff.role, cap as never), role: staff.role, userId: staff.userId }),
    requireStaff: async () => ({ ok: !!staff.userId, role: staff.role, userId: staff.userId }),
  };
});

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const rest = (p: string) => `${URL}/rest/v1${p}`;
/* eslint-disable @typescript-eslint/no-explicit-any */
const sel = async (p: string) => (await fetch(rest(p), { headers: H })).json() as any;
const ins = async (t: string, row: any) => { const r = await fetch(rest(`/${t}`), { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(row) }); if (!r.ok) throw new Error(`${t}: ${await r.text()}`); return (await r.json())[0]; };
const rpc = async (fn: string, body: any) => { const r = await fetch(rest(`/rpc/${fn}`), { method: "POST", headers: H, body: JSON.stringify(body) }); return r.json().catch(() => null); };

import { POST } from "@/app/api/admin/fulfillment/batch/route";
import { createBatch, updateBatch, startProduction } from "@/services/manufacturing/batchService";
import { toCuring, toQualityCheck, approveQc } from "@/services/manufacturing/lifecycleService";
import { recordRoutineQc, recordDesignValidation } from "@/services/manufacturing/qcService";
import { releaseBatch } from "@/services/manufacturing/releaseService";
import { setAllocationEnabled, setReleaseEnabled, setVariantTracking } from "@/services/manufacturing/activationService";
import type { StaffActor } from "@/services/manufacturing/actor";

const post = async (body: any) => {
  const res = await POST(new Request("http://t/api/admin/fulfillment/batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as any };
};

const RUNK = Date.now().toString(36).slice(-5);
let sup: StaffActor, mgr: StaffActor, ed: StaffActor;
let orderId = "", orderItemId = "", batchId = "";

d("POST /api/admin/fulfillment/batch", () => {
  beforeAll(async () => {
    const us = await sel("/users?select=id&limit=2");
    staff.userId = us[0].id;
    sup = { userId: us[0].id, role: "super_admin" }; mgr = { userId: us[1]?.id ?? us[0].id, role: "manager" }; ed = { userId: us[0].id, role: "editor" };
    await setReleaseEnabled(sup, true); await setAllocationEnabled(sup, true);
    const cat = (await sel("/categories?select=id&limit=1"))[0];
    const t = `${RUNK}${Math.random().toString(36).slice(2, 5)}`;
    const pref = ("PA" + Math.random().toString(36).slice(2, 5)).toUpperCase().slice(0, 6);
    const p = await ins("products", { name: `PAPI ${t}`, slug: `papi-${t}`, base_sku: `PAPI-${t}`.toUpperCase(), category_id: cat.id, price: 100, hsn_code: "34060010", product_type: "candle", batch_prefix: pref });
    const v = await ins("variants", { product_id: p.id, sku: `PAPI-${t}-GL`.toUpperCase(), price: 100, vessel_type: "glass", size_label: "100g", tracking_state: "untracked", is_active: false });
    await setVariantTracking(sup, v.id, "tracked");
    const { batchId: b } = await createBatch(mgr, { variantId: v.id, idempotencyKey: `PAB-${RUNK}`, manufacturingDate: "2026-10-01", plannedQty: 10, earliestReleaseDate: "2026-10-10" });
    batchId = b;
    await updateBatch(mgr, { batchId: b, producedQty: 10, pendingInspectionQty: 10 });
    await startProduction(mgr, b); await toCuring(mgr, b); await toQualityCheck(mgr, b);
    await recordRoutineQc(ed, { batchId: b, inspectedQty: 10, approvedDelta: 10, rejectedDelta: 0, result: "pass", measurements: { fill_weight: 100 } });
    await recordDesignValidation(ed, { batchId: b, result: "pass", measurements: { flame: "stable" } });
    await approveQc(mgr, b);
    await releaseBatch(mgr, { batchId: b, qty: 10, idempotencyKey: `PAR-${RUNK}` });
    const roid = `rzp_papi_${RUNK}`;
    const o = await ins("orders", { order_number: `PAPI-${RUNK}`, email: "t@example.test", status: "pending", payment_status: "pending", total_amount: 300, razorpay_order_id: roid });
    orderId = o.id;
    const oi = await ins("order_items", { order_id: o.id, variant_id: v.id, product_name: "T", sku: "T", hsn_code: "34060010", gst_rate: 5, unit_price: 100, quantity: 3, line_subtotal: 300, line_total: 300 });
    orderItemId = oi.id;
    await ins("stock_reservations", { variant_id: v.id, quantity: 3, order_id: o.id, session_id: `s-${RUNK}`, expires_at: new Date(Date.now() + 3600e3).toISOString() });
    await rpc("finalize_order", { p_razorpay_order_id: roid, p_payment_id: `pay_${RUNK}`, p_signature: "sig", p_source: "test", p_amount_paise: null });
  });

  it("rejects an unknown action (400)", async () => {
    staff.role = "editor";
    expect((await post({ action: "nope" })).status).toBe(400);
  });

  it("403s a role without manufacturing.operate (customer) and without manufacturing.qc for packing_qc", async () => {
    staff.role = "customer";
    expect((await post({ action: "entitlements", orderId })).status).toBe(403);
    expect((await post({ action: "confirm_pick", orderItemId, batchId, qty: 1 })).status).toBe(403);
    staff.role = "editor"; // editor HAS operate + qc
    expect((await post({ action: "packing_qc", orderId, checklist: { product_ok: true } })).status).toBe(200);
  });

  it("reads entitlements and confirms a pick through the route (actor from session, not body)", async () => {
    staff.role = "editor";
    const e = await post({ action: "entitlements", orderId });
    expect(e.status).toBe(200); expect(e.json.result.order_blocked).toBe(false);
    const r = await post({ action: "confirm_pick", actor_id: "99999999-9999-4999-8999-999999999999", orderItemId, batchId, qty: 2 });
    expect(r.status).toBe(200); expect(r.json.result.ok).toBe(true);
    // confirmed_by is the authenticated staff, not the body actor_id
    const pc = await sel(`/batch_pick_confirmations?order_item_id=eq.${orderItemId}&select=confirmed_by,qty`);
    expect(pc[0].confirmed_by).toBe(staff.userId);
  });

  it("surfaces business errors as 400 (over-pick beyond entitlement)", async () => {
    staff.role = "editor";
    const r = await post({ action: "confirm_pick", orderItemId, batchId, qty: 5 }); // already 2 of 3 → +5 > remaining
    expect(r.status).toBe(400); expect(r.json.ok).toBe(false);
  });
});
