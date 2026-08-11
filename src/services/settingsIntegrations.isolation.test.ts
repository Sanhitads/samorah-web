import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Prove PANEL ISOLATION: each integration status is composed independently, so one source failing/slow
// degrades ONLY its own panel(s) to Unknown — the others still render, and the page never loses panels.
const { mockHealth, mockChannels } = vi.hoisted(() => ({ mockHealth: vi.fn(), mockChannels: vi.fn() }));

vi.mock("@/services/healthService", () => ({ getSystemHealth: () => mockHealth() }));
vi.mock("@/lib/notifications/opsEngine", () => ({ getChannelHealth: () => mockChannels() }));
vi.mock("@/services/emailDeliveryService", () => ({ getEmailDeliveryHealth: async () => ({}) }));
vi.mock("@/lib/email", () => ({ IMPLEMENTED_EMAIL_TYPES: [] as string[] }));
vi.mock("@/lib/analytics/config", () => ({
  analyticsConfig: { ga4Id: "G-XXX", gtmId: "", clarityId: "", metaPixelId: "" },
  hasGa4: () => true,
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ select: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) }),
}));

import { getIntegrationStatuses, getEnvironmentInfo, resolveIntegrationTimeoutMs, DEFAULT_INTEGRATION_TIMEOUT_MS } from "@/services/settingsIntegrationsService";

const goodHealth = [
  { name: "Payments (Razorpay)", status: "ok", detail: "keys configured" },
  { name: "Webhooks", status: "ok", detail: "5 received (24h)" },
  { name: "Email (Resend)", status: "ok", detail: "configured" },
  { name: "Email deliverability", status: "ok", detail: "no recent failures" },
];
const goodChannels = [{ key: "in_app", configured: true, state: "healthy", lastSuccessAt: "2026-01-01T00:00:00Z", lastFailureAt: null, avgLatencyMs24h: null, delivered24h: 1, failed24h: 0, dead: 0 }];
const by = async () => Object.fromEntries((await getIntegrationStatuses()).map((x) => [x.id, x]));

beforeEach(() => { mockHealth.mockReset(); mockChannels.mockReset(); });

describe("Integration Status Aggregator — panel isolation (S1A)", () => {
  it("renders exactly the 4 registry panels when all sources are healthy", async () => {
    mockHealth.mockResolvedValue(goodHealth); mockChannels.mockResolvedValue(goodChannels);
    const s = await getIntegrationStatuses();
    expect(s.map((x) => x.id)).toEqual(["analytics", "payment", "email", "notifications"]);
    expect(s.every((x) => x.severity !== "unknown")).toBe(true);
  });

  it("health source fails → only payment+email go Unknown; analytics+notifications still render", async () => {
    mockHealth.mockRejectedValue(new Error("boom")); mockChannels.mockResolvedValue(goodChannels);
    const m = await by();
    expect(m.payment.severity).toBe("unknown");
    expect(m.email.severity).toBe("unknown");
    expect(m.analytics.severity).toBe("healthy");
    expect(m.notifications.severity).toBe("healthy");
    expect(Object.keys(m)).toHaveLength(4); // no panel lost
  });

  it("channel source fails → only notifications goes Unknown; payment/email/analytics still render", async () => {
    mockHealth.mockResolvedValue(goodHealth); mockChannels.mockRejectedValue(new Error("boom"));
    const m = await by();
    expect(m.notifications.severity).toBe("unknown");
    expect(m.payment.severity).toBe("healthy");
    expect(m.email.severity).toBe("healthy");
  });

  it("a HANGING source is time-bounded → only its panel goes Unknown; others render (no stall)", async () => {
    process.env.SETTINGS_INTEGRATION_TIMEOUT_MS = "50";
    mockHealth.mockImplementation(() => new Promise(() => {})); // never resolves
    mockChannels.mockResolvedValue(goodChannels);
    const start = Date.now();
    const m = await by();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1500); // bounded — did not hang on the stuck source
    expect(m.payment.severity).toBe("unknown");
    expect(m.email.severity).toBe("unknown");
    expect(m.notifications.severity).toBe("healthy");
    expect(m.analytics.severity).toBe("healthy");
    delete process.env.SETTINGS_INTEGRATION_TIMEOUT_MS;
  });

  it("EVERY source fails → all four panels still render (no throw); config-only analytics survives", async () => {
    mockHealth.mockRejectedValue(new Error("x")); mockChannels.mockRejectedValue(new Error("x"));
    const s = await getIntegrationStatuses();
    expect(s).toHaveLength(4);
    const m = Object.fromEntries(s.map((x) => [x.id, x]));
    expect(m.payment.severity).toBe("unknown");
    expect(m.email.severity).toBe("unknown");
    expect(m.notifications.severity).toBe("unknown");
    expect(m.analytics.severity).toBe("healthy"); // analytics reads config, independent of the failed sources
  });
});

describe("Environment + build metadata (S1A)", () => {
  const origEnv = process.env.VERCEL_ENV;
  const origSha = process.env.VERCEL_GIT_COMMIT_SHA;
  afterEach(() => {
    if (origEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = origEnv;
    if (origSha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA; else process.env.VERCEL_GIT_COMMIT_SHA = origSha;
  });

  it("build metadata AVAILABLE → valid shortened 7-char SHA; UNAVAILABLE → null (graceful)", () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567890";
    const commit = getEnvironmentInfo().commit;
    expect(commit).toBe("abcdef1");
    expect(commit).toMatch(/^[0-9a-f]{7}$/); // a valid shortened commit SHA
    delete process.env.VERCEL_GIT_COMMIT_SHA;
    expect(getEnvironmentInfo().commit).toBeNull();
  });

  it("environment label reads VERCEL_ENV / NODE_ENV (never a new versioning mechanism)", () => {
    process.env.VERCEL_ENV = "production";
    expect(getEnvironmentInfo().environment).toBe("Production");
    process.env.VERCEL_ENV = "preview";
    expect(getEnvironmentInfo().environment).toBe("Preview / Staging");
    delete process.env.VERCEL_ENV; // vitest NODE_ENV is "test" → not production → Development
    expect(getEnvironmentInfo().environment).toBe("Development");
  });
});

describe("Timeout configuration fallback (S1A)", () => {
  const orig = process.env.SETTINGS_INTEGRATION_TIMEOUT_MS;
  afterEach(() => {
    if (orig === undefined) delete process.env.SETTINGS_INTEGRATION_TIMEOUT_MS;
    else process.env.SETTINGS_INTEGRATION_TIMEOUT_MS = orig;
  });

  it("missing / non-numeric / 0 / negative → documented default; valid positive → itself", () => {
    expect(DEFAULT_INTEGRATION_TIMEOUT_MS).toBe(4000);
    delete process.env.SETTINGS_INTEGRATION_TIMEOUT_MS;
    expect(resolveIntegrationTimeoutMs()).toBe(4000);
    process.env.SETTINGS_INTEGRATION_TIMEOUT_MS = "abc";
    expect(resolveIntegrationTimeoutMs()).toBe(4000);
    process.env.SETTINGS_INTEGRATION_TIMEOUT_MS = "0";
    expect(resolveIntegrationTimeoutMs()).toBe(4000);
    process.env.SETTINGS_INTEGRATION_TIMEOUT_MS = "-5";
    expect(resolveIntegrationTimeoutMs()).toBe(4000);
    process.env.SETTINGS_INTEGRATION_TIMEOUT_MS = "1500";
    expect(resolveIntegrationTimeoutMs()).toBe(1500);
  });
});

describe("Concurrency proof (S1A) — aggregation ≈ slowest source, not the sum", () => {
  const delayed = <T>(v: T, ms: number) => () => new Promise<T>((r) => setTimeout(() => r(v), ms));
  it("two ~200ms sources complete concurrently (≈200ms, not ≈400ms)", async () => {
    mockHealth.mockImplementation(delayed(goodHealth, 200));
    mockChannels.mockImplementation(delayed(goodChannels, 200));
    const start = Date.now();
    const s = await getIntegrationStatuses();
    const elapsed = Date.now() - start;
    expect(s).toHaveLength(4);
    expect(elapsed).toBeGreaterThanOrEqual(180); // both actually ran (~200ms each)
    expect(elapsed).toBeLessThan(360);           // CONCURRENT — not the ~400ms sequential sum
  });
});
