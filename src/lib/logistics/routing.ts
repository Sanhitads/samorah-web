/**
 * Warehouse routing (coverage §G) — pure decision: which warehouse fulfils an order.
 * Preference order:
 *   1. an ACTIVE warehouse whose `servesStates` includes the delivery state
 *      (highest priority among those),
 *   2. else the highest-priority active warehouse,
 *   3. else null (caller falls back to the config default).
 * Single-warehouse setups (empty servesStates) naturally hit rule 2.
 */
export interface RoutableWarehouse {
  id: string;
  priority: number;
  active: boolean;
  servesStates?: string[];
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

export function routeWarehouse<T extends RoutableWarehouse>(deliveryState: string | null | undefined, warehouses: T[]): T | null {
  const active = warehouses.filter((w) => w.active).sort((a, b) => a.priority - b.priority);
  if (active.length === 0) return null;

  const state = norm(deliveryState);
  if (state) {
    const serving = active.find((w) => (w.servesStates ?? []).some((s) => norm(s) === state));
    if (serving) return serving;
  }
  return active[0];
}
