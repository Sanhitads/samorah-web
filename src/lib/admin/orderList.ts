/**
 * Orders-list vocabulary (admin Screen 1) — pure functions turning raw order fields into the
 * signals an operator scans without interpreting. Kept pure + testable; the service calls the query
 * mappers, the page renders the badge/label results. No I/O here.
 *
 * Everything below reads columns that ALREADY exist on `orders` (priority, payment_method,
 * courier_name, ops_tags, placed_at) — this is a presentation layer over existing data, not new
 * state. See STATE_MANAGEMENT / the schema audit: no migration backs this module.
 */

// ── Sorting ──────────────────────────────────────────────────────────────────
export type OrderSort = "newest" | "oldest" | "value_high" | "updated" | "pending";

export const SORT_OPTIONS: { key: OrderSort; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "oldest", label: "Oldest" },
  { key: "value_high", label: "Highest Value" },
  { key: "updated", label: "Recently Updated" },
  { key: "pending", label: "Pending First" },
];

/**
 * Sort key → concrete DB order. Pure so the mapping is unit-tested, not discovered in prod.
 * "pending" sorts oldest-first so the most-aged unfulfilled orders surface at the top (the ones
 * an operator must act on first); the service pairs it with a pending/paid-pre-ship filter.
 */
export function sortColumn(sort: OrderSort | undefined): { column: string; ascending: boolean } {
  switch (sort) {
    case "oldest": return { column: "created_at", ascending: true };
    case "value_high": return { column: "total_amount", ascending: false };
    case "updated": return { column: "updated_at", ascending: false };
    case "pending": return { column: "created_at", ascending: true };
    case "newest":
    default: return { column: "created_at", ascending: false };
  }
}

// ── Order age ────────────────────────────────────────────────────────────────
/**
 * Compact relative age ("just now" / "5 min ago" / "Yesterday" / "3 days ago"). `now` is injected
 * so the function is deterministic and testable — never reads the clock itself. Returns "" for an
 * unparseable date rather than throwing, so one bad row can't blank the whole table.
 */
export function orderAge(placedAtIso: string, now: number = Date.now()): string {
  const then = new Date(placedAtIso).getTime();
  if (!Number.isFinite(then)) return "";
  const secs = Math.max(0, Math.round((now - then) / 1000));
  if (secs < 45) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  const wks = Math.floor(days / 7);
  if (wks < 5) return `${wks} wk${wks === 1 ? "" : "s"} ago`;
  const mos = Math.floor(days / 30);
  if (mos < 12) return `${mos} mo ago`;
  const yrs = Math.floor(days / 365);
  return `${yrs} yr${yrs === 1 ? "" : "s"} ago`;
}

// ── Priority ─────────────────────────────────────────────────────────────────
export type PriorityBadge = { label: string; b: string } | null;
/**
 * Order priority → operator badge. Maps the DB enum (normal|high|urgent|vip) to warehouse
 * vocabulary: `urgent` reads as "Rush". `normal` returns null — badges mark exceptions, so the
 * common case shows nothing and the rare VIP/Rush rows pop.
 */
export function priorityBadge(priority: string | null | undefined): PriorityBadge {
  switch (priority) {
    case "vip": return { label: "VIP", b: "vip" };
    case "urgent": return { label: "Rush", b: "rush" };
    case "high": return { label: "Priority", b: "highp" };
    default: return null;
  }
}

/** The priority values a filter offers (excludes `normal` — filtering to "normal" is not useful). */
export const PRIORITY_FILTERS: { value: string; label: string }[] = [
  { value: "vip", label: "VIP" },
  { value: "urgent", label: "Rush" },
  { value: "high", label: "Priority" },
];

// ── Payment method ───────────────────────────────────────────────────────────
/**
 * The captured payment instrument → short label, shown ALONGSIDE (never replacing) the payment
 * STATUS. `is_cod` wins because a COD order's stored method is a pre-capture placeholder.
 * Returns null when unknown, so the row shows a status with no method rather than a fake one.
 */
export function paymentMethodLabel(method: string | null | undefined, isCod: boolean): string | null {
  if (isCod || method === "cod") return "COD";
  switch (method) {
    case "upi": return "UPI";
    case "card": return "Card";
    case "netbanking": return "Netbanking";
    case "wallet": return "Wallet";
    case "razorpay": return null; // pre-capture placeholder; the real instrument overwrites it on finalize
    default: return method ? method : null;
  }
}

export const PAYMENT_METHOD_FILTERS: { value: string; label: string }[] = [
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "netbanking", label: "Netbanking" },
  { value: "wallet", label: "Wallet" },
  { value: "cod", label: "COD" },
];

// ── Operational flags ────────────────────────────────────────────────────────
/**
 * The tiny status icons an operator scans a row for. Each is derived from a column that ALREADY
 * exists — nothing here is faked. `Wholesale` reads the `ops_tags` convention (there is no
 * is_wholesale column yet); Incident and Fraud-Review are deliberately ABSENT because the schema
 * cannot back them honestly yet (incidents have no order_id FK; there is no fraud_review flag).
 */
export interface OrderFlagInput {
  status: string;
  refundAmount: number;
  latestRefundStatus: string | null;
  isGift: boolean;
  tags: string[];
}
export type OrderFlag = { label: string; f: string };
export function opsFlags(o: OrderFlagInput): OrderFlag[] {
  const flags: OrderFlag[] = [];
  if (o.status === "cancelled") flags.push({ label: "Cancelled", f: "cancelled" });
  if (o.status === "returned" || o.status === "rto") flags.push({ label: o.status === "rto" ? "RTO" : "Returned", f: "returned" });
  if (o.refundAmount > 0 || o.latestRefundStatus) flags.push({ label: "Refunded", f: "refunded" });
  if (o.isGift) flags.push({ label: "Gift", f: "gift" });
  if (o.tags.includes("Wholesale")) flags.push({ label: "Wholesale", f: "wholesale" });
  return flags;
}

// ── Saved views ──────────────────────────────────────────────────────────────
/**
 * Preset filter combinations, expressed purely as URL query params the service already understands.
 * A saved view is a link, not stored state — shareable, bookmarkable, and zero new schema. The
 * `match` predicate lets the page highlight the active view from the current searchParams.
 */
export interface SavedView {
  key: string;
  label: string;
  params: Record<string, string>;
}
export const SAVED_VIEWS: SavedView[] = [
  { key: "today", label: "Today", params: { range: "today" } },
  { key: "pending_ship", label: "Pending Shipment", params: { awaiting: "1", sort: "pending" } },
  { key: "refund_queue", label: "Refund Queue", params: { refundQueue: "1" } },
  { key: "vip", label: "VIP", params: { priority: "vip" } },
  { key: "wholesale", label: "Wholesale", params: { tag: "Wholesale" } },
  { key: "attention", label: "Needs Attention", params: { needsAttention: "1" } },
];

/** Build the querystring for a saved view (stable key order → stable, testable URLs). */
export function savedViewHref(view: SavedView): string {
  const qs = new URLSearchParams(view.params).toString();
  return qs ? `/admin/orders?${qs}` : "/admin/orders";
}

/** Is this saved view the one currently applied? Exact match on its defining params. */
export function isViewActive(view: SavedView, current: Record<string, string | undefined>): boolean {
  return Object.entries(view.params).every(([k, v]) => current[k] === v);
}

export const DATE_RANGES: { value: string; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

/** A date-range key → an ISO lower bound (or null for "all time"). `now` injected for testability. */
export function rangeStart(range: string | undefined, now: number = Date.now()): string | null {
  const DAY = 86_400_000;
  switch (range) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case "7d": return new Date(now - 7 * DAY).toISOString();
    case "30d": return new Date(now - 30 * DAY).toISOString();
    default: return null;
  }
}
