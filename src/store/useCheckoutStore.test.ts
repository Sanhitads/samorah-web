import { describe, it, expect, beforeEach, vi } from "vitest";
import { useCheckoutStore, EMPTY_ADDRESS, CHECKOUT_KEY, CHECKOUT_TTL_MS } from "@/store/useCheckoutStore";

const S = () => useCheckoutStore.getState();
const persisted = () => JSON.parse(sessionStorage.getItem(CHECKOUT_KEY) as string) as { state: Record<string, unknown>; version: number };

const ADDRESS = { fullName: "A", email: "a@b.com", phone: "9000000000", line1: "1", line2: "", city: "Pune", state: "Maharashtra", pincode: "411001" };
const BIZ = { companyName: "", gstin: "" };

/** Write a storage record directly, so rehydration can be tested without a real page load. */
const seed = (state: Record<string, unknown>, version = 1) =>
  sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify({ state, version }));
const filled = (savedAt: number) => ({ ship: ADDRESS, bill: EMPTY_ADDRESS, billSame: true, wantGst: false, biz: BIZ, notes: "", couponCode: "WELCOME10", savedAt });

describe("checkout store", () => {
  beforeEach(() => {
    S().reset();
    sessionStorage.clear();
  });

  it("CHK-001 — entered inputs round-trip through sessionStorage", () => {
    S().setShip(ADDRESS);
    S().setNotes("Leave at the door");
    S().setCouponCode("WELCOME10");
    expect(persisted().state.ship).toEqual(ADDRESS);
    expect(persisted().state.notes).toBe("Leave at the door");
    expect(persisted().state.couponCode).toBe("WELCOME10");
  });

  it("CHK-002 — persists to sessionStorage, NOT localStorage (checkout PII must die with the tab)", () => {
    S().setShip(ADDRESS);
    expect(sessionStorage.getItem(CHECKOUT_KEY)).not.toBeNull();
    expect(localStorage.getItem(CHECKOUT_KEY)).toBeNull();
  });

  it("CHK-003 — consent is never persisted; a restored session must re-affirm it", () => {
    S().setConsent(true);
    expect(S().consent).toBe(true); // held in memory for this page life
    expect(persisted().state).not.toHaveProperty("consent");
  });

  it("CHK-004 — ONLY customer-entered inputs are persisted (exact allowlist)", () => {
    S().setShip(ADDRESS);
    S().setConsent(true);
    S().setCouponCode("WELCOME10");
    // An exact set, not a subset: any new persisted field fails here until it is justified. Guards
    // the whole architecture — no derived money (calculateOrderTotals stays the one money module),
    // no UI flags (errors/spinners/API status), no `restored`, no `consent`.
    expect(Object.keys(persisted().state).sort()).toEqual(
      ["bill", "billSame", "biz", "couponCode", "notes", "savedAt", "ship", "wantGst"],
    );
  });

  it("CHK-005 — the persisted key carries a schema version", () => {
    S().setNotes("x");
    expect(persisted().version).toBe(1);
    expect(CHECKOUT_KEY).toMatch(/_v\d+$/);
  });

  it("CHK-006 — reset() clears every entered input, including consent", () => {
    S().setShip(ADDRESS);
    S().setBill(ADDRESS);
    S().setBillSame(false);
    S().setWantGst(true);
    S().setBiz({ companyName: "Acme", gstin: "27AAAAA0000A1Z5" });
    S().setNotes("x");
    S().setCouponCode("WELCOME10");
    S().setConsent(true);

    S().reset();

    expect(S().ship).toEqual(EMPTY_ADDRESS);
    expect(S().bill).toEqual(EMPTY_ADDRESS);
    expect(S().billSame).toBe(true);
    expect(S().wantGst).toBe(false);
    expect(S().biz).toEqual(BIZ);
    expect(S().notes).toBe("");
    expect(S().couponCode).toBe("");
    expect(S().consent).toBe(false);
    expect(S().restored).toBe(false);
    // and the sessionStorage copy holds no leftover PII
    expect(persisted().state.ship).toEqual(EMPTY_ADDRESS);
  });

  it("CHK-007 — no wizard state (checkout is a single page)", () => {
    const s = S() as unknown as Record<string, unknown>;
    for (const wizard of ["step", "nextStep", "prevStep"]) expect(s[wizard]).toBeUndefined();
  });

  // ── Expiry (Improvement 1) ─────────────────────────────────────────────────
  it("CHK-008 — a checkout within 24h is restored", async () => {
    seed(filled(Date.now() - 60_000));
    await useCheckoutStore.persist.rehydrate();
    expect(S().ship).toEqual(ADDRESS);
    expect(S().couponCode).toBe("WELCOME10");
    expect(S().restored).toBe(true);
  });

  it("CHK-009 — a checkout older than 24h is discarded AND purged, not merely ignored", async () => {
    seed(filled(Date.now() - (CHECKOUT_TTL_MS + 60_000)));
    await useCheckoutStore.persist.rehydrate();
    expect(S().ship).toEqual(EMPTY_ADDRESS);
    expect(S().couponCode).toBe("");
    expect(S().restored).toBe(false);
    // The point of the TTL is that day-old PII stops existing — ignoring it is not enough.
    expect(sessionStorage.getItem(CHECKOUT_KEY)).toBeNull();
  });

  it("CHK-010 — a record with no savedAt stamp is distrusted", async () => {
    const { savedAt, ...noStamp } = filled(Date.now());
    void savedAt;
    seed(noStamp);
    await useCheckoutStore.persist.rehydrate();
    expect(S().ship).toEqual(EMPTY_ADDRESS);
    expect(sessionStorage.getItem(CHECKOUT_KEY)).toBeNull();
  });

  it("CHK-011 — every write re-stamps savedAt (the TTL measures time since the last edit)", () => {
    const before = Date.now();
    S().setNotes("x");
    expect(persisted().state.savedAt as number).toBeGreaterThanOrEqual(before);
  });

  // ── Degrading safely (Improvement 4 — no migrate, by design) ───────────────
  it("CHK-012 — a version bump discards the old record rather than half-loading a foreign shape", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    seed(filled(Date.now()), 99); // a shape from a future//older schema
    await useCheckoutStore.persist.rehydrate();
    expect(S().ship).toEqual(EMPTY_ADDRESS); // defaults, not garbage
    expect(S().restored).toBe(false);
    err.mockRestore();
  });

  it("CHK-013 — unparseable storage is dropped, not thrown on", async () => {
    sessionStorage.setItem(CHECKOUT_KEY, "{ not json");
    await useCheckoutStore.persist.rehydrate();
    expect(S().ship).toEqual(EMPTY_ADDRESS);
    expect(sessionStorage.getItem(CHECKOUT_KEY)).toBeNull();
  });

  // ── Restore signal (Improvement 6) ─────────────────────────────────────────
  it("CHK-014 — an all-empty restore is not a restore (no bogus checkout_restored)", async () => {
    // reset() writes an empty record; reloading onto it must not report a recovery.
    seed({ ship: EMPTY_ADDRESS, bill: EMPTY_ADDRESS, billSame: true, wantGst: false, biz: BIZ, notes: "", couponCode: "", savedAt: Date.now() });
    await useCheckoutStore.persist.rehydrate();
    expect(S().restored).toBe(false);
  });

  it("CHK-015 — `restored` is never persisted (it describes this page life, not the data)", async () => {
    seed(filled(Date.now()));
    await useCheckoutStore.persist.rehydrate();
    expect(S().restored).toBe(true);
    S().setNotes("x"); // force a write while restored === true
    expect(persisted().state).not.toHaveProperty("restored");
  });
});
