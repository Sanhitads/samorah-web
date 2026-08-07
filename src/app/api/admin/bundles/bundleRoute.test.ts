import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Phase 1A — Bundle admin ROUTE RBAC. Mocks capabilities + service to isolate the content.edit /
 * content.publish split and validation status codes. Proves: unauthorized → 403; content.edit can
 * save/reset/restore-to-draft but NOT publish/restore.publish (403); content.publish can publish;
 * validation ERROR → 422. (No catalog.manage anywhere.)
 */
const auth = vi.hoisted(() => ({ edit: true, publish: true, role: "admin", userId: "u1" }));
const svc = vi.hoisted(() => ({ publishResult: { ok: true, warnings: [] as string[] } as { ok: boolean; errors?: string[]; warnings?: string[] } }));

vi.mock("@/lib/auth/requireStaff", () => ({
  requireCapability: vi.fn(async (cap: string) => ({ ok: cap === "content.edit" ? auth.edit : true, role: auth.role, userId: auth.userId })),
}));
vi.mock("@/lib/auth/capabilities", () => ({
  hasCapability: vi.fn((_role: string, cap: string) => (cap === "content.publish" ? auth.publish : true)),
}));
vi.mock("@/services/bundleAdminService", () => ({
  getBundleAdmin: vi.fn(async () => ({ draft: {}, published: null, status: "draft", neverPublished: true })),
  saveBundleDraft: vi.fn(async () => ({ ok: true })),
  publishBundle: vi.fn(async () => svc.publishResult),
  resetBundleToDefault: vi.fn(async () => ({ ok: true })),
  listBundleRevisions: vi.fn(async () => []),
  getBundleRevision: vi.fn(async () => ({})),
  restoreBundleRevisionToDraft: vi.fn(async () => ({ ok: true })),
  restoreBundleRevisionAndPublish: vi.fn(async () => svc.publishResult),
}));

import { POST } from "@/app/api/admin/bundles/route";

const call = (action: string, extra: Record<string, unknown> = {}) =>
  POST(new Request("http://x/api/admin/bundles", { method: "POST", body: JSON.stringify({ action, ...extra }) }));

describe("bundle admin route — RBAC + validation", () => {
  beforeEach(() => { auth.edit = true; auth.publish = true; svc.publishResult = { ok: true, warnings: [] }; });

  it("unauthorized (no content.edit) → 403 for every action", async () => {
    auth.edit = false;
    for (const a of ["load", "save", "publish", "reset", "restore", "restore.publish"]) {
      expect((await call(a, { revisionId: "r" })).status).toBe(403);
    }
  });

  it("content.edit WITHOUT content.publish: draft actions 200, live actions 403", async () => {
    auth.edit = true; auth.publish = false;
    expect((await call("load")).status).toBe(200);
    expect((await call("save", { config: {} })).status).toBe(200);
    expect((await call("reset")).status).toBe(200);
    expect((await call("restore", { revisionId: "r" })).status).toBe(200);
    expect((await call("publish", { config: {} })).status).toBe(403);
    expect((await call("restore.publish", { revisionId: "r" })).status).toBe(403);
  });

  it("content.publish: publish succeeds (200)", async () => {
    auth.edit = true; auth.publish = true;
    expect((await call("publish", { config: {} })).status).toBe(200);
    expect((await call("restore.publish", { revisionId: "r" })).status).toBe(200);
  });

  it("validation ERROR → 422 (published untouched by the service)", async () => {
    svc.publishResult = { ok: false, errors: ["Hero heading is required"], warnings: [] };
    const res = await call("publish", { config: {} });
    expect(res.status).toBe(422);
    expect((await res.json()).errors).toContain("Hero heading is required");
  });

  it("unknown action → 400", async () => {
    expect((await call("frobnicate")).status).toBe(400);
  });
});
