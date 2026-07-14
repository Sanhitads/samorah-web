/**
 * GA4 Data API reader (live users + conversion, into the admin). The Measurement Protocol
 * secret only *sends* events — *reading* reports needs a Google Cloud service account. This
 * mints a short-lived OAuth token from the service-account key (RS256 JWT, via Node crypto —
 * no extra dependency) and calls the Analytics Data API. Server-only; no-op + { available:false }
 * until the three env vars are set. Cached 2 min (realtime moves fast but not per-render).
 *
 * Setup (Google Cloud + GA4 Admin):
 *   1. Create a service account, download its JSON key.
 *   2. In GA4 Admin → Property Access Management, add the service-account email as Viewer.
 *   3. Set env (server-only):
 *        GA4_PROPERTY_ID   = the NUMERIC property id (Admin → Property Settings)
 *        GA4_CLIENT_EMAIL  = client_email from the JSON
 *        GA4_PRIVATE_KEY   = private_key from the JSON (keep the \n escapes)
 */
import crypto from "node:crypto";
import { unstable_cache } from "next/cache";

export interface Ga4Insights {
  available: boolean;
  activeUsers: number | null;       // realtime (last 30 min)
  sessions7d: number | null;
  conversions7d: number | null;
  conversionRate: number | null;    // % (conversions / sessions)
  error?: string;
}

const EMPTY: Ga4Insights = { available: false, activeUsers: null, sessions7d: null, conversions7d: null, conversionRate: null };
const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

/** Mint an OAuth access token from the service-account key (JWT-bearer grant). */
async function getAccessToken(clientEmail: string, privateKey: string): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey.replace(/\\n/g, "\n")).toString("base64url");
  const assertion = `${signingInput}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { access_token?: string }).access_token ?? null;
}

async function runReport(propertyId: string, token: string, path: string, body: unknown): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ga4 ${path} ${res.status}`);
  return res.json();
}

const firstMetric = (report: any, i = 0): number | null => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const v = report?.rows?.[0]?.metricValues?.[i]?.value ?? report?.totals?.[0]?.metricValues?.[i]?.value;
  return v == null ? null : Number(v);
};

const fetchGa4 = unstable_cache(
  async (): Promise<Ga4Insights> => {
    const propertyId = process.env.GA4_PROPERTY_ID;
    const clientEmail = process.env.GA4_CLIENT_EMAIL;
    const privateKey = process.env.GA4_PRIVATE_KEY;
    if (!propertyId || !clientEmail || !privateKey) return { ...EMPTY, error: "not_configured" };
    try {
      const token = await getAccessToken(clientEmail, privateKey);
      if (!token) return { ...EMPTY, error: "auth_failed" };

      const [realtime, report] = await Promise.all([
        runReport(propertyId, token, "runRealtimeReport", { metrics: [{ name: "activeUsers" }] }),
        runReport(propertyId, token, "runReport", {
          dateRanges: [{ startDate: "7daysAgo", endDate: "today" }],
          metrics: [{ name: "sessions" }, { name: "conversions" }],
        }),
      ]);

      const sessions = firstMetric(report, 0);
      const conversions = firstMetric(report, 1);
      return {
        available: true,
        activeUsers: firstMetric(realtime, 0),
        sessions7d: sessions,
        conversions7d: conversions,
        conversionRate: sessions && conversions != null ? Math.round((conversions / sessions) * 1000) / 10 : null,
      };
    } catch (e) {
      return { ...EMPTY, error: e instanceof Error ? e.message : "fetch_failed" };
    }
  },
  ["ga4-insights"],
  { revalidate: 120, tags: ["ga4"] },
);

export function getGa4Insights(): Promise<Ga4Insights> {
  return fetchGa4();
}
