import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { AddressForm } from "@/lib/checkout";

/**
 * useCheckoutStore — customer-ENTERED checkout inputs only, so a cart→checkout round-trip or a
 * refresh doesn't wipe a filled-in address (BRD §7.2, adapted).
 *
 * Deliberate deviations from the BRD's field list, and why:
 *
 *  · NO derived state. No subtotal, tax, shipping cost, discount, grand total, order id, payment
 *    status, invoice or webhook state. `calculateOrderTotals()` remains the SINGLE source of truth
 *    for money — duplicating its output here would let the store and the money module drift, which
 *    is the exact failure the one-money-module rule exists to prevent.
 *  · NO transient UI state. Validation errors, spinners, API status and the coupon input buffer all
 *    stay in CheckoutView's local useState. Persisting "Enter a valid email" would resurrect an
 *    error about a field the customer has since fixed.
 *  · NO wizard fields (`step` / `nextStep` / `prevStep`). Checkout is a single page.
 *  · The coupon CODE is persisted, never its computed discount. On restore the code is
 *    re-validated server-side (prices, expiry and minimums may all have changed since).
 *
 * Privacy (DPDP): this holds a name, phone, email and address. Three limits bound that exposure —
 * it persists to **sessionStorage** (dies with the tab, not the device), it **expires after 24h**
 * even if the browser restores the tab days later, and it is cleared on successful placement, on an
 * emptied cart, on sign-out, and on explicit reset.
 *
 * Persisted state ⇒ every RENDER of it must be behind a hydration guard (BRD §7.1). CheckoutView
 * already gates on `mounted`; anything else must use `useStore`.
 */
export interface CheckoutInputs {
  ship: AddressForm;
  bill: AddressForm;
  billSame: boolean;
  wantGst: boolean;
  biz: { companyName: string; gstin: string };
  notes: string;
  couponCode: string;
  consent: boolean;
}

export interface CheckoutState extends CheckoutInputs {
  /**
   * True when this session's inputs came back from storage. Drives the `checkout_restored`
   * analytics event. Never persisted — it describes how *this* page life started.
   */
  restored: boolean;
  setShip: (v: AddressForm) => void;
  setBill: (v: AddressForm) => void;
  setBillSame: (v: boolean) => void;
  setWantGst: (v: boolean) => void;
  setBiz: (v: { companyName: string; gstin: string }) => void;
  setNotes: (v: string) => void;
  setCouponCode: (v: string) => void;
  setConsent: (v: boolean) => void;
  /** Wipe every entered input (and the sessionStorage copy). */
  reset: () => void;
}

/** What actually reaches storage: inputs minus consent, plus the TTL stamp. */
type PersistedCheckout = Omit<CheckoutInputs, "consent"> & { savedAt: number };

export const CHECKOUT_KEY = "samorah_checkout_v1"; // schema version in the key
/** Persisted checkout expires this long after the last edit. */
export const CHECKOUT_TTL_MS = 24 * 60 * 60 * 1000;

export const EMPTY_ADDRESS: AddressForm = { fullName: "", email: "", phone: "", line1: "", line2: "", city: "", state: "", pincode: "" };

const EMPTY_INPUTS: CheckoutInputs = {
  ship: EMPTY_ADDRESS,
  bill: EMPTY_ADDRESS,
  billSame: true,
  wantGst: false,
  biz: { companyName: "", gstin: "" },
  notes: "",
  couponCode: "",
  consent: false,   // never restore consent as given — the customer re-affirms it each time
};

/**
 * Did the customer actually type anything worth restoring? A `reset()` writes an all-empty record,
 * so "storage had an entry" is not the same as "there is something to restore" — without this,
 * every post-reset reload would report a bogus `checkout_restored`.
 */
function hasEnteredInput(i: Omit<CheckoutInputs, "consent">): boolean {
  const a = i.ship;
  return Boolean(
    a?.fullName || a?.email || a?.phone || a?.line1 || a?.city || a?.pincode ||
    i.notes || i.couponCode || i.biz?.companyName || i.biz?.gstin,
  );
}

/**
 * sessionStorage + a hard TTL enforced at the STORAGE boundary, so no caller can read past it.
 *
 * Stale data is REMOVED, not merely ignored: the point of the TTL is that day-old PII stops
 * existing, and leaving it readable in sessionStorage while pretending not to see it would satisfy
 * the letter of the rule and none of its purpose.
 *
 * Touching `sessionStorage` eagerly here is deliberate: on the server it throws ReferenceError,
 * createJSONStorage catches that and no-ops persist — which is exactly what SSR needs.
 */
function expiringSessionStorage(): StateStorage {
  const ss = sessionStorage;
  return {
    getItem: (name) => {
      const raw = ss.getItem(name);
      if (!raw) return null;
      try {
        const { state } = JSON.parse(raw) as { state?: { savedAt?: number } };
        const savedAt = state?.savedAt;
        // No stamp = written before the TTL existed, or hand-edited → distrust it.
        if (typeof savedAt !== "number" || Date.now() - savedAt > CHECKOUT_TTL_MS) {
          ss.removeItem(name);
          return null;
        }
        return raw;
      } catch {
        ss.removeItem(name); // unparseable → drop it rather than let persist throw on it
        return null;
      }
    },
    setItem: (name, value) => ss.setItem(name, value),
    removeItem: (name) => ss.removeItem(name),
  };
}

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set) => ({
      ...EMPTY_INPUTS,
      restored: false,
      setShip: (ship) => set({ ship }),
      setBill: (bill) => set({ bill }),
      setBillSame: (billSame) => set({ billSame }),
      setWantGst: (wantGst) => set({ wantGst }),
      setBiz: (biz) => set({ biz }),
      setNotes: (notes) => set({ notes }),
      setCouponCode: (couponCode) => set({ couponCode }),
      setConsent: (consent) => set({ consent }),
      reset: () => set({ ...EMPTY_INPUTS, restored: false }),
    }),
    {
      name: CHECKOUT_KEY,
      version: 1,
      // No `migrate`: on a version bump zustand discards the old record and falls back to defaults.
      // That IS the intended behaviour here — see STATE_MANAGEMENT.md ("no migration, by design").
      storage: createJSONStorage<PersistedCheckout>(expiringSessionStorage),
      // Inputs only — no derived state, no UI flags, no `restored`. `consent` is deliberately NOT
      // persisted: re-affirming the terms is cheap, and silently restoring a ticked consent box is
      // not a defensible record of agreement.
      partialize: (s) => ({
        ship: s.ship, bill: s.bill, billSame: s.billSame,
        wantGst: s.wantGst, biz: s.biz, notes: s.notes, couponCode: s.couponCode,
        savedAt: Date.now(), // stamped on every write → the TTL measures time since the last edit
      }),
      // `savedAt` is a storage-layer concern and stops here; it never becomes component state.
      merge: (persisted, current) => {
        if (!persisted) return current;
        const { savedAt, ...inputs } = persisted as PersistedCheckout;
        return { ...current, ...inputs, restored: savedAt > 0 && hasEnteredInput(inputs) };
      },
    },
  ),
);
