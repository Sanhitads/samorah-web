/**
 * Versioned account preferences (review point 4). Replaces the free-form prefs seam
 * with a typed schema + `schema_version`, so future shape changes migrate cleanly via
 * normalizePrefs() (which upgrades any older/partial payload to the current shape).
 */
export const PREFS_SCHEMA_VERSION = 1;

export interface AccountPrefs {
  schema_version: number;
  language: string;                 // "en" (single-locale today; ready for more)
  currency: string;                 // "INR"
  theme: "system" | "light" | "dark";
  notifications: { orderUpdates: boolean; backInStock: boolean; priceDrops: boolean };
  marketing: { email: boolean; sms: boolean };
  recentlyViewed: string[];         // product slugs, most-recent first (capped)
  quizState: Record<string, unknown> | null; // fragrance quiz progress/result
  collectionPrefs: { preferredCollection?: string | null };
}

const MAX_RECENT = 40;

export function defaultPrefs(): AccountPrefs {
  return {
    schema_version: PREFS_SCHEMA_VERSION,
    language: "en", currency: "INR", theme: "system",
    notifications: { orderUpdates: true, backInStock: false, priceDrops: false },
    marketing: { email: false, sms: false },
    recentlyViewed: [], quizState: null, collectionPrefs: {},
  };
}

/** Upgrade any stored/partial prefs to the current schema (forward-compatible). */
export function normalizePrefs(raw: unknown): AccountPrefs {
  const d = defaultPrefs();
  if (!raw || typeof raw !== "object") return d;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as any;
  // (future: branch on r.schema_version to run version-specific migrations)
  return {
    schema_version: PREFS_SCHEMA_VERSION,
    language: typeof r.language === "string" ? r.language : d.language,
    currency: typeof r.currency === "string" ? r.currency : d.currency,
    theme: ["system", "light", "dark"].includes(r.theme) ? r.theme : d.theme,
    notifications: { ...d.notifications, ...(r.notifications && typeof r.notifications === "object" ? r.notifications : {}) },
    marketing: { ...d.marketing, ...(r.marketing && typeof r.marketing === "object" ? r.marketing : {}) },
    recentlyViewed: (Array.isArray(r.recentlyViewed) ? r.recentlyViewed.filter((x: unknown) => typeof x === "string") : []).slice(0, MAX_RECENT),
    quizState: r.quizState && typeof r.quizState === "object" ? r.quizState : null,
    collectionPrefs: { ...d.collectionPrefs, ...(r.collectionPrefs && typeof r.collectionPrefs === "object" ? r.collectionPrefs : {}) },
  };
}
