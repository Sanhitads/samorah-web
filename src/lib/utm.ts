/**
 * UTM attribution (client). We capture the marketing parameters from the landing
 * URL into localStorage (last-touch: a visit that carries utm_* overwrites the
 * previous), and read them back at checkout so they persist onto the order.
 */
export interface StoredUtm {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
}

export const UTM_STORAGE_KEY = "samorah_utm";

/** Parse utm_* from a query string and persist them if any are present. */
export function captureUtm(search: string): void {
  if (typeof window === "undefined") return;
  try {
    const q = new URLSearchParams(search);
    const utm: StoredUtm = {
      source: q.get("utm_source") ?? undefined,
      medium: q.get("utm_medium") ?? undefined,
      campaign: q.get("utm_campaign") ?? undefined,
      content: q.get("utm_content") ?? undefined,
      term: q.get("utm_term") ?? undefined,
    };
    if (Object.values(utm).some(Boolean)) {
      window.localStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utm));
    }
  } catch {
    /* private mode / storage disabled — attribution is best-effort */
  }
}

export function readStoredUtm(): StoredUtm | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(UTM_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredUtm) : undefined;
  } catch {
    return undefined;
  }
}
