/**
 * Capability-based authorization (review point 7 / SLP principle 20).
 *
 * Code checks a CAPABILITY, never a role rank. Roles are just named bundles of
 * capabilities, so adding a "warehouse_lead" or splitting CS from Finance later is
 * a data change here — no route edits. The middleware still gates the `/admin`
 * PATH at editor+; capabilities gate individual ACTIONS.
 *
 * Domain reference: docs/SLP_DOMAIN_MODEL.md §5.
 */
export const CAPABILITIES = [
  "fulfillment.operate", // pick/pack/qc/ready/hold/resume/create-shipment/dispatch
  "fulfillment.triage", // priority / assign / tags / notes
  "order.cancel", // commercial cancellation
  "order.refund", // issue / view refunds
  "returns.operate", // receive / inspect / restock
  "returns.approve", // approve / reject a return (financial consequence)
  "catalog.manage",
  "rules.manage",
  "shipping.configure",
  "analytics.view",
  "data.export",
  "users.manage",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** Role → capabilities. Higher roles inherit lower ones by construction. */
const WAREHOUSE: Capability[] = ["fulfillment.operate", "fulfillment.triage", "returns.operate"];
const CS_FINANCE: Capability[] = [...WAREHOUSE, "order.cancel", "order.refund", "returns.approve", "analytics.view", "data.export"];
const ADMIN: Capability[] = [...CS_FINANCE, "catalog.manage", "rules.manage", "shipping.configure", "users.manage"];

export const ROLE_CAPABILITIES: Record<string, readonly Capability[]> = {
  customer: [],
  editor: WAREHOUSE,
  manager: CS_FINANCE,
  admin: ADMIN,
  super_admin: [...CAPABILITIES],
};

/** Does this role hold this capability? Unknown roles hold nothing. */
export function hasCapability(role: string | null | undefined, cap: Capability): boolean {
  if (!role) return false;
  return (ROLE_CAPABILITIES[role] ?? []).includes(cap);
}

/** All capabilities a role holds — handy for shipping a permission set to the client. */
export function capabilitiesFor(role: string | null | undefined): Capability[] {
  if (!role) return [];
  return [...(ROLE_CAPABILITIES[role] ?? [])];
}
