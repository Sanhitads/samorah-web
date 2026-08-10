/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Microsoft Clarity — Data Export API reader (admin behavioural insights). Pulls the
 * project's aggregate metrics (sessions, bots, distinct users, scroll depth, engagement
 * time, rage/dead/quick-back clicks, script errors) so the admin can see behaviour WITHOUT
 * opening Clarity. Server-only (the bearer token is a secret, never NEXT_PUBLIC).
 *
 * Clarity caps this API at 10 requests/day/project and 1–3 days of data, so the call is
 * cached for 6 hours (≤4 calls/day) via unstable_cache. Never throws — returns
 * { available:false } if the token/endpoint is unset or the call fails.
 */
import { unstable_cache } from "next/cache";
import { cacheSeconds } from "@/lib/analytics/cacheConfig";

const DEFAULT_ENDPOINT = "https://www.clarity.ms/export-data/api/v1/project-live-insights";
const NUM_DAYS = 3; // Clarity max

export interface ClarityInsights {
  available: boolean;
  numOfDays: number;
  sessions: number | null;
  bots: number | null;
  distinctUsers: number | null;
  pagesPerSession: number | null;
  avgScrollDepth: number | null;   // %
  avgEngagementSec: number | null;
  rageClicks: number | null;
  deadClicks: number | null;
  quickBacks: number | null;
  scriptErrors: number | null;
  error?: string;
}

const EMPTY: ClarityInsights = {
  available: false, numOfDays: NUM_DAYS, sessions: null, bots: null, distinctUsers: null,
  pagesPerSession: null, avgScrollDepth: null, avgEngagementSec: null, rageClicks: null,
  deadClicks: null, quickBacks: null, scriptErrors: null,
};

/** Read the first present numeric field from a metric's information object, by exact key. */
function num(info: any, keys: string[]): number | null {
  const row = Array.isArray(info) ? info[0] : info;
  if (!row) return null;
  for (const k of keys) {
    const v = row[k];
    if (v != null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

/** Fallback: first numeric field whose key contains any hint (Clarity's exact keys vary). */
function numLoose(info: any, hints: string[]): number | null {
  const row = Array.isArray(info) ? info[0] : info;
  if (!row) return null;
  for (const [k, v] of Object.entries(row)) {
    const kl = k.toLowerCase();
    if (hints.some((h) => kl.includes(h)) && v != null && v !== "" && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

function parse(payload: any): ClarityInsights {
  const arr: any[] = Array.isArray(payload) ? payload : [];
  // Exact metricName match (case-insensitive) — substring matching mis-fires
  // ("scroll" also matches "ExcessiveScroll", which precedes "ScrollDepth").
  const find = (name: string) => arr.find((m) => String(m?.metricName ?? "").toLowerCase() === name)?.information;
  const traffic = find("traffic");
  const engSec = numLoose(find("engagementtime"), ["active", "total", "time", "engage"]);
  return {
    available: arr.length > 0,
    numOfDays: NUM_DAYS,
    sessions: num(traffic, ["totalSessionCount", "sessionsCount"]),
    bots: num(traffic, ["totalBotSessionCount", "botSessionsCount"]),
    distinctUsers: num(traffic, ["distinctUserCount"]),
    pagesPerSession: num(traffic, ["pagesPerSessionPercentage", "averagePagesPerSession"]),
    avgScrollDepth: numLoose(find("scrolldepth"), ["scroll", "depth", "average"]),
    // Clarity engagement time comes in ms; normalise to seconds when it looks like ms.
    avgEngagementSec: engSec == null ? null : engSec > 1000 ? Math.round(engSec / 1000) : Math.round(engSec),
    rageClicks: num(find("rageclickcount"), ["subTotal", "sessionsCount"]),
    deadClicks: num(find("deadclickcount"), ["subTotal", "sessionsCount"]),
    quickBacks: num(find("quickbackclick"), ["subTotal", "sessionsCount"]),
    scriptErrors: num(find("scripterrorcount"), ["subTotal", "sessionsCount"]),
  };
}

const fetchClarity = unstable_cache(
  async (): Promise<ClarityInsights> => {
    const token = process.env.CLARITY_API_TOKEN;
    if (!token) return { ...EMPTY, error: "not_configured" };
    let base = process.env.CLARITY_API_ENDPOINT || DEFAULT_ENDPOINT;
    if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
    try {
      const res = await fetch(`${base}?numOfDays=${NUM_DAYS}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { ...EMPTY, error: `http_${res.status}` };
      return parse(await res.json());
    } catch {
      return { ...EMPTY, error: "fetch_failed" };
    }
  },
  ["clarity-live-insights"],
  { revalidate: cacheSeconds("clarity"), tags: ["clarity"] }, // 6h default — stays well under Clarity's 10/day cap
);

export function getClarityInsights(): Promise<ClarityInsights> {
  return fetchClarity();
}
