import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";

/**
 * Cart page (Phase 2) — `/cart`, "Your Bag". The full review before checkout:
 * line items with variant + composition detail, the composition promotion, a
 * shipping estimate, and the inclusive-GST summary. Cart state is client-side
 * (persisted), so the page is a thin shell around the CartView island.
 */
export const metadata: Metadata = {
  title: "Your Bag",
  description: "Review your Samorah ritual before checkout.",
  robots: { index: false }, // a personal, session-specific page
};

export default function CartRoute() {
  return (
    <main className="cart">
      <CartView />
    </main>
  );
}
