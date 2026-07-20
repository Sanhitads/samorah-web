/**
 * Packing checklist (warehouse Priority-1 #3) — the brand's unboxing, made a gate. Pure + testable.
 *
 * The item CATALOG is config here; per-order completion lives in orders.packing_checklist (jsonb):
 * { item_key: { done, by, at } }. An order cannot be marked "packed" until every REQUIRED item is
 * checked — for Samorah, shipping without the Story Card or Care Card is a brand failure, not a
 * minor miss, so the workflow enforces it rather than trusting memory.
 *
 * Gift Box is required only for gift orders; everything else is always required.
 */
export interface PackingItem {
  key: string;
  label: string;
  giftOnly?: boolean;
}

export const PACKING_ITEMS: PackingItem[] = [
  { key: "product", label: "Product / Candle" },
  { key: "dust_bag", label: "Dust Bag / Jute Pouch" },
  { key: "thank_you_card", label: "Thank You Card" },
  { key: "story_card", label: "Story Card" },
  { key: "care_card", label: "Candle Care Card" },
  { key: "gift_box", label: "Gift Box", giftOnly: true },
  { key: "invoice", label: "Invoice" },
];

/** The items required for THIS order — gift-only items appear only on gift orders. */
export function requiredPackingItems(isGift: boolean): PackingItem[] {
  return PACKING_ITEMS.filter((i) => !i.giftOnly || isGift);
}

export type PackingChecklist = Record<string, { done?: boolean; by?: string | null; at?: string } | undefined>;

/** True only when every required item is checked. `{}` (the default) ⇒ incomplete. */
export function packingComplete(checklist: PackingChecklist | null | undefined, isGift: boolean): boolean {
  return requiredPackingItems(isGift).every((i) => checklist?.[i.key]?.done === true);
}

/** Done / total across the required items, for a progress display. */
export function packingProgress(checklist: PackingChecklist | null | undefined, isGift: boolean): { done: number; total: number; complete: boolean } {
  const req = requiredPackingItems(isGift);
  const done = req.filter((i) => checklist?.[i.key]?.done === true).length;
  return { done, total: req.length, complete: done === req.length };
}
