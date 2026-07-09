import { describe, it, expect } from "vitest";
import { rateLimit } from "@/lib/rateLimit";

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
});
