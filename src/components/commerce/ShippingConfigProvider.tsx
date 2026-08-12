"use client";

import { createContext, useContext, type ReactNode } from "react";
import { SHIPPING } from "@/config/commerce";

/**
 * Client-side carrier for the admin-editable free-shipping threshold (₹). Provided once
 * by the storefront layout (which already reads Site Settings server-side) so the cart
 * summary + drawer show the SAME threshold the server charges — no drift, no per-page
 * fetch. Defaults to the code constant when no provider is present (safety).
 *
 * Refresh behaviour (documented, expected — NOT a defect): the storefront may temporarily
 * display a stale free-shipping progress indicator in an ALREADY-OPEN browser tab after the
 * threshold is changed in Admin, because this provider lives in the persistent layout and its
 * value is fixed at initial page load. A full page refresh retrieves the latest configuration
 * (the layout is dynamically rendered per request). Checkout pricing is ALWAYS recalculated
 * server-side (repriceCart) using the current threshold and therefore remains authoritative.
 */
const ShippingConfigContext = createContext<number>(SHIPPING.freeThreshold);

export function ShippingConfigProvider({ freeShippingThresholdInr, children }: { freeShippingThresholdInr: number; children: ReactNode }) {
  return <ShippingConfigContext.Provider value={freeShippingThresholdInr}>{children}</ShippingConfigContext.Provider>;
}

/** The free-shipping threshold in rupees (admin-configured, else the code constant). */
export function useFreeShippingThreshold(): number {
  return useContext(ShippingConfigContext);
}
