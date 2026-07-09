/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Settings service (build #5) — admin edits to the shipping_settings singleton.
 * The engines already READ these (getShippingSettings with a code-default fallback);
 * this lets Admin CHANGE them without a deploy (principle f — configurable, not
 * hardcoded), with guardrails and an audit trail (who changed what).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getShippingSettings, type ShippingSettings } from "@/lib/settings/shippingSettings";
import { getWarehouses } from "@/services/warehouseService";
import { logEvent } from "@/services/auditService";
import type { ProviderName } from "@/lib/shipping/types";

function loose() {
  return createAdminClient() as unknown as { from: (t: string) => any };
}

// Which providers have a working adapter today (the rest fall back to Manual).
const PROVIDER_CONFIGURED: Record<ProviderName, boolean> = {
  manual: true,
  shiprocket: false,
  delhivery: false,
  bluedart: false,
  indiapost: false,
};

export interface ProviderInfo {
  name: ProviderName;
  configured: boolean;
  isDefault: boolean;
}

export interface SettingsAdminView {
  settings: ShippingSettings;
  providers: ProviderInfo[];
  warehouses: { id: string; name: string; active: boolean }[];
}

export async function getSettingsAdminView(): Promise<SettingsAdminView> {
  const settings = await getShippingSettings();
  const warehouses = (await getWarehouses()).map((w) => ({ id: w.id, name: w.name, active: (w as { active?: boolean }).active ?? true }));
  const providers: ProviderInfo[] = (Object.keys(PROVIDER_CONFIGURED) as ProviderName[]).map((name) => ({
    name,
    configured: PROVIDER_CONFIGURED[name],
    isDefault: settings.defaultProvider === name,
  }));
  return { settings, providers, warehouses };
}

const DB_FIELD: Record<keyof ShippingSettings, string> = {
  defaultProvider: "default_provider",
  courierStrategy: "courier_strategy",
  autoAssign: "auto_assign",
  autoCreateAfterFulfillment: "auto_create_after_fulfillment",
  insuranceThreshold: "insurance_threshold",
  codThreshold: "cod_threshold",
  defaultWarehouseId: "default_warehouse_id",
  fragilePolicy: "fragile_policy",
  volumetricDivisor: "volumetric_divisor",
  workingDays: "working_days",
  holidayCalendar: "holiday_calendar",
};

export interface UpdateSettingsResult {
  ok: boolean;
  reason?: string;
  warnings?: string[];
}

/** Upsert the singleton (id=true). Validates + warns; logs the change to audit. */
export async function updateShippingSettings(patch: Partial<ShippingSettings>, actorId?: string): Promise<UpdateSettingsResult> {
  const warnings: string[] = [];

  // Guardrails (hard): reject nonsensical values that would break the engines.
  if (patch.volumetricDivisor != null && (!(patch.volumetricDivisor > 0))) return { ok: false, reason: "volumetric divisor must be > 0" };
  if (patch.insuranceThreshold != null && patch.insuranceThreshold < 0) return { ok: false, reason: "insurance threshold cannot be negative" };
  if (patch.codThreshold != null && patch.codThreshold < 0) return { ok: false, reason: "COD threshold cannot be negative" };

  // Soft guardrails (warn but allow): unconfigured provider, inactive/unknown warehouse.
  if (patch.defaultProvider && !PROVIDER_CONFIGURED[patch.defaultProvider as ProviderName]) {
    warnings.push(`Provider "${patch.defaultProvider}" has no adapter yet — shipments will fall back to Manual.`);
  }
  if (patch.defaultWarehouseId) {
    const wh = (await getWarehouses()).find((w) => w.id === patch.defaultWarehouseId);
    if (!wh) warnings.push(`Warehouse "${patch.defaultWarehouseId}" not found.`);
    else if ((wh as { active?: boolean }).active === false) warnings.push(`Warehouse "${patch.defaultWarehouseId}" is inactive.`);
  }

  const before = await getShippingSettings();
  const row: Record<string, unknown> = { id: true, updated_at: new Date().toISOString() };
  const changed: string[] = [];
  for (const [k, v] of Object.entries(patch) as [keyof ShippingSettings, unknown][]) {
    if (v === undefined) continue;
    row[DB_FIELD[k]] = v;
    if (JSON.stringify((before as any)[k]) !== JSON.stringify(v)) changed.push(k);
  }

  const db = loose();
  const { error } = await db.from("shipping_settings").upsert(row, { onConflict: "id" });
  if (error) return { ok: false, reason: error.message };

  if (changed.length) {
    await logEvent({
      entityType: "settings",
      event: "settings.updated",
      actorType: actorId ? "staff" : "system",
      actorId,
      notes: `Changed: ${changed.join(", ")}`,
      metadata: { changed, patch },
    });
  }
  return { ok: true, warnings: warnings.length ? warnings : undefined };
}
