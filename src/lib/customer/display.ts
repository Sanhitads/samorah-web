/**
 * Customer presentation helpers — initials avatar, spend tier, repeat-buyer badge, and the
 * priority name-badges (VIP / Wholesale / Influencer) that belong beside the name rather than buried
 * in a tags column. Pure lookups shared by the list + detail so the CRM reads consistently.
 */

/** Two-letter initials for the avatar chip (review 2.6). Falls back to the email's first letters. */
export function initials(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** A deterministic hue for the avatar so the same customer always gets the same colour. */
export function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

/** Spend tier from lifetime value (review 2.7) — a 0–5 star rating that flags premium customers at a
 *  glance. Thresholds tuned for a luxury AOV; a customer with no spend is tier 0. */
export function spendTier(ltv: number): { tier: number; label: string } {
  if (ltv >= 30000) return { tier: 5, label: "Elite" };
  if (ltv >= 15000) return { tier: 4, label: "Premium" };
  if (ltv >= 5000) return { tier: 3, label: "High" };
  if (ltv >= 1000) return { tier: 2, label: "Mid" };
  if (ltv > 0) return { tier: 1, label: "Entry" };
  return { tier: 0, label: "—" };
}

/** Human repeat-purchase badge (review 1.4) — First Purchase / Repeat Buyer / "N Orders". */
export function repeatBadge(orders: number): { label: string; tone: string } | null {
  if (orders <= 0) return null;
  if (orders === 1) return { label: "First Purchase", tone: "pending" };
  if (orders < 5) return { label: "Repeat Buyer", tone: "paid" };
  return { label: `${orders} Orders`, tone: "gold" };
}

/** Priority badges to show beside the name (review 1.3). VIP from the segment or tag; Wholesale +
 *  Influencer from the derived flag / tags. */
export function customerNameBadges(segment: string, wholesale: boolean, tags: string[]): { label: string; icon: string; tone: string }[] {
  const lower = (tags ?? []).map((t) => t.toLowerCase());
  const out: { label: string; icon: string; tone: string }[] = [];
  if (segment === "vip" || lower.includes("vip")) out.push({ label: "VIP", icon: "⭐", tone: "gold" });
  if (wholesale || lower.includes("wholesale")) out.push({ label: "Wholesale", icon: "🏢", tone: "paid" });
  if (lower.includes("influencer")) out.push({ label: "Influencer", icon: "📣", tone: "pending" });
  return out;
}
