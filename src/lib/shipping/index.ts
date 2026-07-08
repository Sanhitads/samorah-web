/**
 * Shipping Engine entrypoint. `getShippingProvider()` returns the active provider
 * by name (env SHIPPING_PROVIDER, default "manual"). Unimplemented adapters fall
 * back to Manual so the platform can ALWAYS ship — you launch on manual today and
 * flip SHIPPING_PROVIDER to "shiprocket" once that adapter (Slice 5) lands, with
 * zero changes to fulfillment.
 */
import type { ShippingProvider } from "./provider";
import type { ProviderName } from "./types";
import { ManualShippingProvider } from "./providers/manual";

export type { ShippingProvider } from "./provider";
export * from "./types";
export { ManualShippingProvider } from "./providers/manual";

const manual = new ManualShippingProvider();

export function getShippingProvider(name?: ProviderName): ShippingProvider {
  const selected = (name ?? (process.env.SHIPPING_PROVIDER as ProviderName | undefined) ?? "manual");
  switch (selected) {
    case "manual":
      return manual;
    // case "shiprocket": return new ShiprocketProvider();   // Slice 5 (needs creds)
    // case "delhivery":  return new DelhiveryProvider();     // future adapter
    default:
      // Any provider without an adapter yet → Manual, so the platform always ships.
      console.warn(`shipping provider "${selected}" not implemented yet — using manual`);
      return manual;
  }
}
