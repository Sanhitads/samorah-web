import { describe, it, expect, beforeAll } from "vitest";

/**
 * DATA API GRANTS — Oct-30 explicit-grant posture (regression gate).
 *
 * Supabase's 2026-10-30 change stops auto-granting Data API access to NEW public tables. Samorah never
 * relied on that auto-grant — every SELECT/INSERT/UPDATE/DELETE to anon/authenticated/service_role is an
 * EXPLICIT migration GRANT (verified: all such grants have grantor=postgres; zero come from the
 * supabase_admin default). This test LOCKS IN that posture behaviourally, through the real Data API:
 *
 *   • anon may read EXACTLY the approved public tables — no more (a new table accidentally exposed to
 *     anon fails here), no less (a dropped/forgotten grant that would break the storefront fails here);
 *   • a representative set of privileged tables is DENIED to anon at the GRANT layer (not merely RLS).
 *
 * It uses actual anon/service Data API requests against the LOCAL database (the integration-guard fails
 * closed on any hosted URL, so this can never touch production). No production credentials, no SQL.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.INV_TEST_SUPABASE_URL || "";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.INV_TEST_ANON_KEY || "";
const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.INV_TEST_SERVICE_KEY || "";

/** The EXACT public read surface. Keep in sync with the explicit `grant select ... to anon` migrations
 *  (phase_2a catalogue + reviews/banners/instagram/related_products/blogs/return_attachments). */
const ANON_READABLE = [
  "blogs", "categories", "collections", "fragrance_notes", "homepage_banners", "instagram_gallery",
  "product_images", "products", "related_products", "return_attachments", "reviews", "variants",
].sort();

/** Representative privileged tables that must never be anon-readable (financial, customer, admin, internal). */
const ANON_DENIED = [
  "orders", "order_items", "payment_attempts", "refunds", "users", "addresses", "cart", "coupons",
  "coupon_redemptions", "stock_reservations", "counters", "cms_pages", "cron_locks", "notification_log", "audit_events",
];

const anonGet = (t: string) =>
  fetch(`${URL}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });

describe("Data API grants — explicit anon surface (Oct-30 compatibility)", () => {
  let allTables: string[] = [];
  let readable: string[] = [];

  beforeAll(async () => {
    expect(URL, "integration env must be LOCAL").toMatch(/^https?:\/\/(127\.0\.0\.1|localhost)/);
    const res = await fetch(`${URL}/rest/v1/`, { headers: { apikey: SVC, Authorization: `Bearer ${SVC}`, Accept: "application/openapi+json" } });
    const oa = await res.json();
    allTables = Object.keys(oa.paths ?? {}).filter((p) => /^\/[a-z]/.test(p) && p !== "/" && !p.startsWith("/rpc/")).map((p) => p.slice(1));
    const flags = await Promise.all(allTables.map(async (t) => [t, (await anonGet(t)).status === 200] as const));
    readable = flags.filter(([, ok]) => ok).map(([t]) => t).sort();
  }, 60_000);

  it("enumerated the full public schema (sanity — guards against an empty/short scan)", () => {
    expect(allTables.length).toBeGreaterThan(50);
  });

  it("anon can read EXACTLY the approved public tables — no unexpected exposure, no missing grant", () => {
    const unexpected = readable.filter((t) => !ANON_READABLE.includes(t));
    const missing = ANON_READABLE.filter((t) => !readable.includes(t));
    expect(unexpected, `UNEXPECTED anon-readable tables (privilege leak — review the grant): ${unexpected.join(", ")}`).toEqual([]);
    expect(missing, `approved public tables NOT anon-readable (missing explicit grant — breaks the storefront under Oct-30 defaults): ${missing.join(", ")}`).toEqual([]);
  });

  it.each(ANON_DENIED)("privileged table '%s' is DENIED to anon at the grant layer (status != 200)", async (t) => {
    const r = await anonGet(t);
    expect(r.status, `anon must NOT be able to read ${t} (got 200 — a grant leak)`).not.toBe(200);
  });
});
