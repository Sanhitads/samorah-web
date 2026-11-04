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
  "inventory.view", // read on-hand / reserved / available + movement history (manager+)
  "inventory.adjust", // mutate on-hand via the canonical adjust_inventory RPC only (admin+)
  "content.edit", // CMS: prepare/save drafts (navigation, pages…) — does NOT grant publish
  "content.publish", // CMS: make a draft live / schedule / unpublish / reset — storefront deployment
  "rules.manage",
  "shipping.configure",
  "analytics.view",
  "data.export",
  "users.manage",
  "enquiries.manage", // customer enquiries: change status / assign / notes (CS work, manager+)
  "manufacturing.operate", // create/edit manufacturing batches, record materials/process (editor+)
  "manufacturing.qc", // record batch quality-control checks (editor+)
  "manufacturing.qc_approve", // approve QC → qc_approved lifecycle (manager+) — distinct from inventory release; SoD vs the inspector
  "manufacturing.release", // release a QC-passed batch to sellable stock (manager+) — separation of duties from QC
  "manufacturing.recall", // hold / recall / quarantine a batch (admin+) — production-critical
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** Role → capabilities. Higher roles inherit lower ones by construction. */
const WAREHOUSE: Capability[] = ["fulfillment.operate", "fulfillment.triage", "returns.operate", "manufacturing.operate", "manufacturing.qc"];
// inventory.view lands at manager+ (view stock levels + movement history, no mutation).
// manufacturing.release lands at manager+ so the releaser is a DIFFERENT role from the editor who
// records QC (manufacturing.qc) — separation of duties for the sellable-stock release decision.
const CS_FINANCE: Capability[] = [...WAREHOUSE, "order.cancel", "order.refund", "returns.approve", "analytics.view", "data.export", "inventory.view", "enquiries.manage", "manufacturing.qc_approve", "manufacturing.release"];
// content.edit and content.publish both land at admin+ so current access is unchanged (admins can edit
// AND publish). The split is server-enforced and future-ready: to let a lower role PREPARE navigation
// without deploy authority, add "content.edit" (only) to that role's bundle — publish stays gated here.
// inventory.adjust is admin+ initially (physical stock mutation is sensitive; managers may view but not adjust).
const ADMIN: Capability[] = [...CS_FINANCE, "catalog.manage", "content.edit", "content.publish", "rules.manage", "shipping.configure", "users.manage", "inventory.adjust", "manufacturing.recall"];

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
