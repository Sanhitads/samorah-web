/**
 * Shipping settings (§11) — admin-editable operational config, loaded from the
 * shipping_settings singleton with a code-default fallback (so nothing breaks if the
 * row/table is absent). Change thresholds/policies without a deploy.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { CourierStrategy } from "@/lib/shipping/decision";

export interface ShippingSettings {
  defaultProvider: string;
  courierStrategy: CourierStrategy;
  autoAssign: boolean;
  autoCreateAfterFulfillment: boolean; // §14: gate shipping behind fulfillment
  insuranceThreshold: number;
  codThreshold: number;
  defaultWarehouseId: string;
  fragilePolicy: "auto" | "always" | "never";
  volumetricDivisor: number;
  workingDays: string[];
  holidayCalendar: string[];
}

export const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = {
  defaultProvider: "manual",
  courierStrategy: "manual",
  autoAssign: true,
  autoCreateAfterFulfillment: false,
  insuranceThreshold: 3000,
  codThreshold: 50000,
  defaultWarehouseId: "wh_blr",
  fragilePolicy: "auto",
  volumetricDivisor: 5000,
  workingDays: ["mon", "tue", "wed", "thu", "fri", "sat"],
  holidayCalendar: [],
};

/** Pure mapper from a DB row → settings (missing fields fall back to defaults). */
export function mapSettingsRow(row: Record<string, unknown> | null | undefined): ShippingSettings {
  if (!row) return DEFAULT_SHIPPING_SETTINGS;
  const d = DEFAULT_SHIPPING_SETTINGS;
  return {
    defaultProvider: (row.default_provider as string) ?? d.defaultProvider,
    courierStrategy: ((row.courier_strategy as CourierStrategy) ?? d.courierStrategy),
    autoAssign: (row.auto_assign as boolean) ?? d.autoAssign,
    autoCreateAfterFulfillment: (row.auto_create_after_fulfillment as boolean) ?? d.autoCreateAfterFulfillment,
    insuranceThreshold: row.insurance_threshold != null ? Number(row.insurance_threshold) : d.insuranceThreshold,
    codThreshold: row.cod_threshold != null ? Number(row.cod_threshold) : d.codThreshold,
    defaultWarehouseId: (row.default_warehouse_id as string) ?? d.defaultWarehouseId,
    fragilePolicy: ((row.fragile_policy as ShippingSettings["fragilePolicy"]) ?? d.fragilePolicy),
    volumetricDivisor: row.volumetric_divisor != null ? Number(row.volumetric_divisor) : d.volumetricDivisor,
    workingDays: (row.working_days as string[]) ?? d.workingDays,
    holidayCalendar: (row.holiday_calendar as string[]) ?? d.holidayCalendar,
  };
}

export async function getShippingSettings(): Promise<ShippingSettings> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => { select: (q?: string) => { maybeSingle: () => Promise<{ data: Record<string, unknown> | null }> } };
    };
    const { data } = await db.from("shipping_settings").select("*").maybeSingle();
    return mapSettingsRow(data);
  } catch {
    return DEFAULT_SHIPPING_SETTINGS;
  }
}
