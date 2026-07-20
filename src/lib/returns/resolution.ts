/**
 * Returns Resolution Center config — the option catalogs for resolution, inspection, warehouse
 * decision, damage grade, and refund method. Code-config (like the packing checklist): the DB stores
 * only the chosen value. Reused by the detail-page display AND the setter controls.
 */
export interface Opt { value: string; label: string; }

export const RESOLUTIONS: Opt[] = [
  { value: "return_required", label: "Return Required" },
  { value: "return_waived", label: "Return Waived (keep product)" },
  { value: "replacement_only", label: "Replacement Only" },
  { value: "refund_only", label: "Refund Only" },
  { value: "partial_refund", label: "Partial Refund" },
  { value: "exchange", label: "Exchange" },
  { value: "reject_claim", label: "Reject Claim" },
];

export const INSPECTION_RESULTS: Opt[] = [
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "partial_damage", label: "Partial Damage" },
];

export const WAREHOUSE_DECISIONS: Opt[] = [
  { value: "restock", label: "Restock" },
  { value: "destroy", label: "Destroy" },
  { value: "return_to_vendor", label: "Return to Vendor" },
  { value: "keep_as_sample", label: "Keep as Sample" },
];

export const DAMAGE_GRADES: Opt[] = [
  { value: "minor", label: "Minor" },
  { value: "moderate", label: "Moderate" },
  { value: "major", label: "Major" },
];

/** Refund methods — Original is functional; Store Credit is disabled (needs the ledger, on the
 *  roadmap); Manual is structural (recorded, settled out-of-band). `enabled: false` → not selectable. */
export const REFUND_METHODS: (Opt & { enabled: boolean; hint?: string })[] = [
  { value: "original", label: "Original Payment", enabled: true },
  { value: "store_credit", label: "Store Credit", enabled: false, hint: "Needs the store-credit ledger (post-launch)" },
  { value: "manual", label: "Manual Transfer", enabled: true, hint: "Recorded; finance settles out-of-band" },
];

/** True when the resolution does NOT require a physical return (waive/refund/replacement/exchange). */
export function resolutionWaivesReturn(resolution: string | null | undefined): boolean {
  return !!resolution && resolution !== "return_required";
}

export function labelOf(list: Opt[], value: string | null | undefined): string {
  if (!value) return "—";
  return list.find((x) => x.value === value)?.label ?? value;
}
