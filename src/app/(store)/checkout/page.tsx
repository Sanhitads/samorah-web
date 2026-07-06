import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout/CheckoutView";

/**
 * Checkout page (Phase 3 · Beat 1) — `/checkout`. Contact + shipping address and
 * a GST-accurate order summary. Cart state is client-side (persisted), so the
 * page is a thin shell around the CheckoutView island. Payment (Razorpay) +
 * order persistence arrive in Beat 2.
 */
export const metadata: Metadata = {
  title: "Checkout",
  description: "Complete your Samorah order.",
  robots: { index: false },
};

export default function CheckoutRoute() {
  return (
    <main className="checkout-page">
      <CheckoutView />
    </main>
  );
}
