/**
 * Warehouse model (§2) — dynamic pickup locations from the warehouses table, with
 * the config WAREHOUSES as the seed/fallback. An order picks a warehouse (by
 * priority) to fulfil it.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { WAREHOUSES, DEFAULT_WAREHOUSE } from "@/config/logistics";
import type { PickupLocation } from "@/lib/shipping/types";

export interface Warehouse extends PickupLocation {
  manager?: string;
  phone?: string;
  workingHours?: string;
  priority: number;
  active: boolean;
}

/** Pure mapper: DB row → Warehouse (PickupLocation-compatible). */
export function mapWarehouseRow(row: Record<string, unknown>): Warehouse {
  return {
    id: String(row.id),
    name: String(row.name),
    gstin: (row.gstin as string) ?? undefined,
    manager: (row.manager as string) ?? undefined,
    phone: (row.phone as string) ?? undefined,
    workingHours: (row.working_hours as string) ?? undefined,
    priority: Number(row.priority ?? 100),
    active: (row.active as boolean) ?? true,
    address: {
      name: String(row.name),
      phone: (row.phone as string) ?? "",
      line1: (row.line1 as string) ?? "",
      line2: (row.line2 as string) ?? undefined,
      city: (row.city as string) ?? "",
      state: (row.state as string) ?? "",
      pincode: (row.pincode as string) ?? "",
      country: (row.country as string) ?? "India",
    },
  };
}

const configFallback = (): Warehouse[] =>
  WAREHOUSES.map((w) => ({ ...w, priority: 100, active: true }));

/** Active warehouses, highest priority first. Falls back to config on any error. */
export async function getWarehouses(): Promise<Warehouse[]> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => { select: (q?: string) => { eq: (c: string, v: boolean) => { order: (c: string) => Promise<{ data: Record<string, unknown>[] | null }> } } };
    };
    const { data } = await db.from("warehouses").select("*").eq("active", true).order("priority");
    if (!data || data.length === 0) return configFallback();
    return data.map(mapWarehouseRow);
  } catch {
    return configFallback();
  }
}

export async function getDefaultWarehouse(): Promise<PickupLocation> {
  const all = await getWarehouses();
  return all[0] ?? DEFAULT_WAREHOUSE;
}
