/**
 * Customer-enquiry status machine — the ONE definition of the enquiry lifecycle and its allowed
 * transitions, mirroring lib/returns/state.ts. Pure + framework-free.
 *
 *   new → open → replied → resolved → (archived)
 *   any → spam / archived; spam/archived can be restored to new.
 */
export const ENQUIRY_STATUSES = ["new", "open", "replied", "resolved", "spam", "archived"] as const;
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];

export const ENQUIRY_STATUS_LABEL: Record<EnquiryStatus, string> = {
  new: "New", open: "Open", replied: "Replied", resolved: "Resolved", spam: "Spam", archived: "Archived",
};

const TRANSITIONS: Record<EnquiryStatus, EnquiryStatus[]> = {
  new: ["open", "replied", "resolved", "spam", "archived"],
  open: ["replied", "resolved", "spam", "archived"],
  replied: ["open", "resolved", "archived"],
  resolved: ["open", "archived"],
  spam: ["new", "archived"],
  archived: ["new"],
};

export function isEnquiryStatus(s: string): s is EnquiryStatus {
  return (ENQUIRY_STATUSES as readonly string[]).includes(s);
}
export function canTransitionEnquiry(from: EnquiryStatus, to: EnquiryStatus): boolean {
  return from === to || (TRANSITIONS[from] ?? []).includes(to);
}
export function nextEnquiryStates(from: EnquiryStatus): EnquiryStatus[] {
  return TRANSITIONS[from] ?? [];
}
/** Throws on an illegal transition (server-authoritative guard). */
export function assertEnquiryTransition(from: EnquiryStatus, to: EnquiryStatus): void {
  if (!canTransitionEnquiry(from, to)) throw new Error(`Cannot move an enquiry from ${from} to ${to}`);
}
