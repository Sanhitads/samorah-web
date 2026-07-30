import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * bulkUpdateProducts — Batch B safe multi-select actions. These pin the action→column mapping, the
 * id hygiene (dedupe + drop falsy + cap), status validation, and that exactly ONE `update … in (ids)`
 * is issued (no N+1). The Supabase admin client + audit log are mocked so the logic runs in isolation.
 */
let captured: { table: string | null; row: Record<string, unknown> | null; col: string | null; ids: string[] | null; updateCalls: number };
const resetCaptured = () => { captured = { table: null, row: null, col: null, ids: null, updateCalls: 0 }; };
resetCaptured();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      captured.table = table;
      return {
        update: (row: Record<string, unknown>) => {
          captured.row = row; captured.updateCalls += 1;
          return { in: (col: string, ids: string[]) => { captured.col = col; captured.ids = ids; return Promise.resolve({ error: null }); } };
        },
      };
    },
  }),
}));
vi.mock("@/services/auditService", () => ({ logEvent: vi.fn(async () => {}) }));

import { bulkUpdateProducts } from "@/services/productAdminService";

describe("bulkUpdateProducts — action mapping + id hygiene", () => {
  beforeEach(() => resetCaptured());

  it("status: writes the status column with a validated value", async () => {
    const r = await bulkUpdateProducts(["a", "b"], "status", "archived");
    expect(r.ok).toBe(true); expect(r.done).toBe(2);
    expect(captured.row?.status).toBe("archived");
    expect(captured.col).toBe("id");
    expect(captured.updateCalls).toBe(1); // exactly one query, not per-id
  });

  it("status: rejects an invalid value without issuing an update", async () => {
    const r = await bulkUpdateProducts(["a"], "status", "banana");
    expect(r.ok).toBe(false);
    expect(captured.updateCalls).toBe(0);
  });

  it("featured / bestseller / newArrival / hero map to their boolean columns", async () => {
    await bulkUpdateProducts(["a"], "featured", true); expect(captured.row?.is_featured).toBe(true);
    await bulkUpdateProducts(["a"], "bestseller", true); expect(captured.row?.is_bestseller).toBe(true);
    await bulkUpdateProducts(["a"], "newArrival", false); expect(captured.row?.is_new_arrival).toBe(false);
    await bulkUpdateProducts(["a"], "hero", true); expect(captured.row?.is_hero).toBe(true);
  });

  it("collection: a value assigns; an empty value clears to null", async () => {
    await bulkUpdateProducts(["a"], "collection", "col-1"); expect(captured.row?.collection_id).toBe("col-1");
    await bulkUpdateProducts(["a"], "collection", ""); expect(captured.row?.collection_id).toBeNull();
  });

  it("de-dupes ids and drops falsy entries", async () => {
    const r = await bulkUpdateProducts(["a", "a", "", "b", null as unknown as string], "featured", true);
    expect(captured.ids).toEqual(["a", "b"]);
    expect(r.done).toBe(2);
  });

  it("empty selection is a no-op failure (never a blind update)", async () => {
    const r = await bulkUpdateProducts([], "featured", true);
    expect(r.ok).toBe(false); expect(captured.updateCalls).toBe(0);
  });

  it("caps a runaway selection at 500 ids", async () => {
    const many = Array.from({ length: 650 }, (_, i) => `id-${i}`);
    const r = await bulkUpdateProducts(many, "featured", true);
    expect(captured.ids?.length).toBe(500);
    expect(r.done).toBe(500);
  });
});
