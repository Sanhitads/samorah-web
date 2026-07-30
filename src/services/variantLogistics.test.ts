import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Batch C — upsertVariant must persist the new logistics columns, and — critically — must NOT hard-fail
 * before the 20260805120000 migration is applied: on a schema error it retries with those columns
 * stripped. These tests pin both the happy path (all columns written) and the resilient fallback.
 */
let calls: { row: Record<string, unknown> }[];
let failFirstWithSchema = false;
const resetState = () => { calls = []; failFirstWithSchema = false; };
resetState();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      // insert(row) and update(row).eq(...) both resolve to {error}; capture each attempted row.
      insert: (row: Record<string, unknown>) => {
        calls.push({ row });
        if (failFirstWithSchema && calls.length === 1) return Promise.resolve({ error: { message: "Could not find the 'shipping_class' column of 'variants' in the schema cache" } });
        return Promise.resolve({ error: null });
      },
      update: (row: Record<string, unknown>) => ({
        eq: () => {
          calls.push({ row });
          if (failFirstWithSchema && calls.length === 1) return Promise.resolve({ error: { message: "column variants.package_length_cm does not exist" } });
          return Promise.resolve({ error: null });
        },
      }),
    }),
  }),
}));
vi.mock("@/services/auditService", () => ({ logEvent: vi.fn(async () => {}) }));

import { upsertVariant } from "@/services/productAdminService";

const base = { productId: "prod-1", sku: "sam-log-1", price: 100, shippingClass: "fragile", packageLengthCm: 12, packageWidthCm: 8, packageHeightCm: 6, supplierSku: "VEND-9" };

describe("upsertVariant — logistics columns + resilient strip", () => {
  beforeEach(() => resetState());

  it("writes the logistics columns when the schema supports them", async () => {
    const r = await upsertVariant(base);
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].row).toMatchObject({ shipping_class: "fragile", package_length_cm: 12, package_width_cm: 8, package_height_cm: 6, supplier_sku: "VEND-9" });
    expect(calls[0].row.sku).toBe("SAM-LOG-1"); // uppercased
  });

  it("retries WITHOUT the logistics columns on a schema error (pre-migration safety)", async () => {
    failFirstWithSchema = true;
    const r = await upsertVariant(base);
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(2); // first attempt failed on schema, second stripped + succeeded
    for (const c of ["shipping_class", "package_length_cm", "package_width_cm", "package_height_cm", "supplier_sku"]) {
      expect(calls[1].row).not.toHaveProperty(c);
    }
    // core fields still persist on the retry
    expect(calls[1].row).toMatchObject({ sku: "SAM-LOG-1", price: 100 });
  });

  it("still requires a SKU", async () => {
    const r = await upsertVariant({ ...base, sku: "  " });
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
