import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
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
 *  · NO wizard fields (`step` / `nextStep` / `prevStep`). Checkout is a single page; there are no
 *    steps to track.
 *  · The coupon CODE is persisted, never its computed discount. On restore the code is
 *    re-validated server-side (prices, expiry and minimums may all have changed since).
 *
 * Privacy (DPDP): this holds a name, phone, email and address. It persists to **sessionStorage**,
 * not localStorage — the data dies with the tab instead of lingering on a shared device — and is
 * cleared on successful placement, on an emptied cart, or on an explicit reset.
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

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set) => ({
      ...EMPTY_INPUTS,
      setShip: (ship) => set({ ship }),
      setBill: (bill) => set({ bill }),
      setBillSame: (billSame) => set({ billSame }),
      setWantGst: (wantGst) => set({ wantGst }),
      setBiz: (biz) => set({ biz }),
      setNotes: (notes) => set({ notes }),
      setCouponCode: (couponCode) => set({ couponCode }),
      setConsent: (consent) => set({ consent }),
      reset: () => set({ ...EMPTY_INPUTS }),
    }),
    {
      name: "samorah_checkout_v1",   // schema version in the key: a shape change can't misread old data
      version: 1,
      // sessionStorage, NOT localStorage — checkout PII should not outlive the tab.
      // createJSONStorage try/catches the getter, so this is safe during SSR where it doesn't exist.
      storage: createJSONStorage(() => sessionStorage),
      // Inputs only. `consent` is deliberately NOT persisted: re-affirming the terms is cheap, and
      // silently restoring a ticked consent box is not a defensible record of agreement.
      partialize: (s) => ({
        ship: s.ship, bill: s.bill, billSame: s.billSame,
        wantGst: s.wantGst, biz: s.biz, notes: s.notes, couponCode: s.couponCode,
      }),
    },
  ),
);
