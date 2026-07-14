import { describe, it, expect, vi, afterEach } from "vitest";
import { rateLimit, tooManyRequests } from "@/lib/rateLimit";

const req = (ip: string) => new Request("https://x.test", { headers: { "x-forwarded-for": ip } });

describe("rateLimit — fixed window per bucket:ip", () => {
  it("allows up to the limit, then 429s", () => {
    const opts = { bucket: "t1", limit: 3, windowMs: 60_000 };
    const ip = "1.1.1.1";
    expect(rateLimit(req(ip), opts).ok).toBe(true);
    expect(rateLimit(req(ip), opts).ok).toBe(true);
    expect(rateLimit(req(ip), opts).ok).toBe(true);
    const blocked = rateLimit(req(ip), opts);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("isolates different IPs and different buckets", () => {
    const opts = { bucket: "t2", limit: 1, windowMs: 60_000 };
    expect(rateLimit(req("2.2.2.2"), opts).ok).toBe(true);
    expect(rateLimit(req("2.2.2.2"), opts).ok).toBe(false); // same ip exhausted
    expect(rateLimit(req("3.3.3.3"), opts).ok).toBe(true); // different ip fresh
    expect(rateLimit(req("2.2.2.2"), { bucket: "t3", limit: 1, windowMs: 60_000 }).ok).toBe(true); // different bucket fresh
  });

  it("RECOVERS once the window elapses (429 then allowed again after cooldown)", () => {
    vi.useFakeTimers();
    try {
      const opts = { bucket: "t-recover", limit: 2, windowMs: 60_000 };
      const ip = "4.4.4.4";
      expect(rateLimit(req(ip), opts).ok).toBe(true);
      expect(rateLimit(req(ip), opts).ok).toBe(true);
      expect(rateLimit(req(ip), opts).ok).toBe(false); // exhausted
      vi.advanceTimersByTime(60_001); // window passes
      expect(rateLimit(req(ip), opts).ok).toBe(true); // fresh window
    } finally {
      vi.useRealTimers();
    }
  });

  it("fail-open is scoped to limiter faults, not threshold breaches (breach still returns ok:false)", () => {
    // A breach is NOT a fault: it must return ok:false so callers render 429.
    const opts = { bucket: "t-breach", limit: 1, windowMs: 60_000 };
    const ip = "5.5.5.5";
    expect(rateLimit(req(ip), opts).ok).toBe(true);
    expect(rateLimit(req(ip), opts).ok).toBe(false); // enforcement holds under load
  });

  it("tooManyRequests() emits 429 + Retry-After", async () => {
    const res = tooManyRequests(42);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect((await res.json()).error).toMatch(/too many/i);
  });
});

afterEach(() => vi.useRealTimers());
