import { describe, it, expect, beforeAll, vi } from "vitest";

/**
 * Phase 5 — /api/admin/manufacturing route: capability gating per action, server-derived
 * actor (never from the body), validation, and dispatch. LOCAL Supabase only. NON-STOCK.
 */
const URL = (process.env.INV_TEST_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.INV_TEST_SERVICE_KEY || "";
const LOCAL = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL);
const RUN = !!(URL && KEY && LOCAL);
const d = RUN ? describe : describe.skip;
if (RUN) { process.env.NEXT_PUBLIC_SUPABASE_URL = URL; process.env.SUPABASE_SERVICE_ROLE_KEY = KEY; }

// Mutable staff identity the mocked guard reflects; capability is computed from the real map.
const staff = vi.hoisted(() => ({ role: "admin", userId: "" }));
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

import { POST } from "@/app/api/admin/manufacturing/route";
const post = async (body: any) => {
  const res = await POST(new Request("http://t/api/admin/manufacturing", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, json: (await res.json()) as any };
};

const RUNK = Date.now().toString(36).slice(-5);
let variantId = "", productId = "";

d("POST /api/admin/manufacturing", () => {
  beforeAll(async () => {
    const u = await sel("/users?select=id&limit=1");
    staff.userId = u?.[0]?.id ?? "";
    const vs = await sel("/variants?select=id,product_id,products!inner(product_type)&products.product_type=eq.candle&limit=1");
    variantId = vs?.[0]?.id; productId = vs?.[0]?.product_id;
    staff.role = "admin";
    await post({ action: "set_prefix", productId, prefix: ("A" + String(productId).replace(/-/g, "").slice(0, 4)).toUpperCase() });
  });

  it("rejects an unknown action", async () => {
    staff.role = "admin";
    expect((await post({ action: "nope" })).status).toBe(400);
  });

  it("403s when the role lacks the action's capability", async () => {
    staff.role = "editor"; // editor lacks manufacturing.qc_approve
    const r = await post({ action: "approve", batchId: "00000000-0000-4000-8000-000000000000" });
    expect(r.status).toBe(403);
    expect(r.json.error).toMatch(/manufacturing\.qc_approve/);
  });

  it("401/403s when there is no authenticated staff", async () => {
    const saved = staff.userId; staff.userId = ""; staff.role = "admin";
    expect((await post({ action: "create_batch", input: {} })).status).toBe(403);
    staff.userId = saved;
  });

  it("validates input server-side (bad create)", async () => {
    staff.role = "admin";
    const r = await post({ action: "create_batch", input: { variantId: "", idempotencyKey: "" } });
    expect(r.status).toBe(400);
    expect(r.json.ok).toBe(false);
  });

  it("creates a batch through the service and ignores any body-supplied actor", async () => {
    staff.role = "admin";
    const r = await post({ action: "create_batch", actor_id: "99999999-9999-4999-8999-999999999999", input: { variantId, idempotencyKey: `API-${RUNK}`, manufacturingDate: "2026-12-09", plannedQty: 2 } });
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
    const batchId = r.json.result.batchId;
    // created_by is the authenticated staff, NOT the body actor_id.
    const row = await sel(`/manufacturing_batches?id=eq.${batchId}&select=created_by`);
    expect(row[0].created_by).toBe(staff.userId);
  });

  it("enforces the capability boundary for EVERY sensitive action (negative auth)", async () => {
    // action → a role that LACKS the required capability (editor lacks qc_approve; customer lacks qc/operate).
    const cases: Array<[string, string]> = [
      ["approve", "editor"], ["reject", "editor"], ["reopen", "editor"], ["hold", "editor"], ["resume", "editor"], ["revoke_design_validation", "editor"],
      ["record_qc", "customer"], ["record_design_validation", "customer"], ["upsert_template", "customer"], ["to_quality_check", "customer"],
      ["create_batch", "customer"], ["update_batch", "customer"], ["set_prefix", "customer"], ["start_production", "customer"],
      ["to_curing", "customer"], ["register_material", "customer"], ["register_lot", "customer"], ["record_consumption", "customer"],
    ];
    for (const [action, role] of cases) {
      staff.role = role;
      const r = await post({ action, batchId: "00000000-0000-4000-8000-000000000000", input: {} });
      expect(r.status, `${action} as ${role}`).toBe(403);
    }
    staff.role = "admin";
  });

  it("surfaces business errors as 400 (illegal transition)", async () => {
    staff.role = "admin";
    const c = await post({ action: "create_batch", input: { variantId, idempotencyKey: `API2-${RUNK}`, manufacturingDate: "2026-12-09" } });
    const batchId = c.json.result.batchId;
    const r = await post({ action: "approve", batchId }); // draft → qc_approved is illegal
    expect(r.status).toBe(400);
    expect(r.json.ok).toBe(false);
  });
});
