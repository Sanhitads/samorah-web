/**
 * In-memory fixed-window rate limiter (audit gap: payment/webhook/coupon routes
 * were completely open). Keyed by IP + bucket. Per-instance — fine for a single
 * Vercel instance / dev; swap the store for Upstash Redis when horizontal scaling
 * lands (the check() signature stays the same). Fails OPEN on any internal error
 * so a limiter bug never blocks checkout.
 */
type Hit = { count: number; resetAt: number };
const store = new Map<string, Hit>();
let lastSweep = 0;

/** Best-effort client IP from proxy headers. */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export interface RateResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * Allow `limit` requests per `windowMs` for `bucket:ip`. Returns ok=false when the
 * window is exhausted, with a Retry-After hint.
 */
export function rateLimit(request: Request, opts: { bucket: string; limit: number; windowMs: number }): RateResult {
  try {
    const now = Date.now();
    // Opportunistic sweep of expired entries (keeps the map bounded).
    if (now - lastSweep > 60_000) {
      for (const [k, v] of store) if (v.resetAt <= now) store.delete(k);
      lastSweep = now;
    }

    const key = `${opts.bucket}:${clientIp(request)}`;
    const hit = store.get(key);
    if (!hit || hit.resetAt <= now) {
      store.set(key, { count: 1, resetAt: now + opts.windowMs });
      return { ok: true, remaining: opts.limit - 1, retryAfterSec: 0 };
    }
    hit.count += 1;
    if (hit.count > opts.limit) {
      return { ok: false, remaining: 0, retryAfterSec: Math.ceil((hit.resetAt - now) / 1000) };
    }
    return { ok: true, remaining: opts.limit - hit.count, retryAfterSec: 0 };
  } catch {
    return { ok: true, remaining: 1, retryAfterSec: 0 }; // fail open
  }
}

/** Standard 429 response helper. */
export function tooManyRequests(retryAfterSec: number): Response {
  return new Response(JSON.stringify({ error: "Too many requests. Please slow down and try again shortly." }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(retryAfterSec) },
  });
}
