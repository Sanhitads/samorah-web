/**
 * GA4 Data API reader (live users + conversion, into the admin). The Measurement Protocol
 * secret only *sends* events — *reading* reports needs a Google identity with GA4 access.
 * Server-only; no-op + { available:false } until configured. Cached 2 min.
 *
 * Auth branches — KEYLESS FIRST (works under `disableServiceAccountKeyCreation`):
 *
 *   1. Workload Identity Federation (recommended, no JSON key). The Vercel runtime issues an
 *      OIDC token (VERCEL_OIDC_TOKEN); we exchange it at Google STS for a federated token, then
 *      impersonate a GA4-Viewer service account for an analytics-scoped token. Set env:
 *        GA4_PROPERTY_ID
 *        GCP_WORKLOAD_IDENTITY_AUDIENCE = //iam.googleapis.com/projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/<POOL>/providers/<PROVIDER>
 *        GA4_SERVICE_ACCOUNT_EMAIL      = the SA (with GA4 Viewer) to impersonate
 *      One-time GCP setup: create a Workload Identity Pool + OIDC provider whose issuer is
 *      Vercel's (https://oidc.vercel.com/<team>), allow your audience, and grant the external
 *      principal roles/iam.workloadIdentityUser on the SA. No key is ever downloaded.
 *
 *   2. Service-account JSON key (LOCAL DEV / non-Vercel fallback; blocked by the org policy
 *      that prompted #1). Set GA4_CLIENT_EMAIL + GA4_PRIVATE_KEY.
 */
import crypto from "node:crypto";
import { headers } from "next/headers";

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
const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";

/** True when either auth path is configured (keyless WIF, or a fallback key). */
export function ga4Configured(): boolean {
  if (!process.env.GA4_PROPERTY_ID) return false;
  const wif = !!process.env.GCP_WORKLOAD_IDENTITY_AUDIENCE && !!process.env.GA4_SERVICE_ACCOUNT_EMAIL;
  const key = !!process.env.GA4_CLIENT_EMAIL && !!process.env.GA4_PRIVATE_KEY;
  return wif || key;
}

/** The Vercel OIDC token. In Vercel Functions it arrives as the `x-vercel-oidc-token`
 *  REQUEST HEADER (not an env var); env is only set in Builds / after `vercel env pull`
 *  locally. (`@vercel/functions`' getVercelOidcToken() wraps this with 45-min caching —
 *  we read it directly to avoid the dependency.) */
async function getOidcToken(): Promise<string | undefined> {
  try {
    const t = (await headers()).get("x-vercel-oidc-token");
    if (t) return t;
  } catch {
    /* not in a request scope (build/CLI) — fall through to env */
  }
  return process.env.VERCEL_OIDC_TOKEN || undefined;
}

/** Obtain an analytics-scoped access token, preferring keyless Workload Identity Federation. */
async function getAccessToken(): Promise<string | null> {
  const audience = process.env.GCP_WORKLOAD_IDENTITY_AUDIENCE;
  const saEmail = process.env.GA4_SERVICE_ACCOUNT_EMAIL;
  if (audience && saEmail) {
    const oidcToken = await getOidcToken();
    if (oidcToken) return tokenViaWif(oidcToken, audience, saEmail);
  }

  const clientEmail = process.env.GA4_CLIENT_EMAIL;
  const privateKey = process.env.GA4_PRIVATE_KEY;
  if (clientEmail && privateKey) return tokenViaKey(clientEmail, privateKey);
  return null;
}

/** KEYLESS: Vercel OIDC → Google STS federated token → impersonate the GA4 SA. */
async function tokenViaWif(subjectToken: string, audience: string, saEmail: string): Promise<string | null> {
  // 1. Exchange the workload's OIDC token for a Google federated access token (RFC 8693).
  const sts = await fetch("https://sts.googleapis.com/v1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      audience,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      subject_token: subjectToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    }),
  });
  if (!sts.ok) return null;
  const federated = ((await sts.json()) as { access_token?: string }).access_token;
  if (!federated) return null;

  // 2. Impersonate the GA4-Viewer service account for an analytics-scoped token (no key).
  const imp = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(saEmail)}:generateAccessToken`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${federated}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scope: [ANALYTICS_SCOPE] }),
    },
  );
  if (!imp.ok) return null;
  return ((await imp.json()) as { accessToken?: string }).accessToken ?? null;
}

/** FALLBACK (local dev / non-Vercel): self-signed JWT-bearer grant with a downloaded SA key. */
async function tokenViaKey(clientEmail: string, privateKey: string): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: clientEmail, scope: ANALYTICS_SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signingInput = `${header}.${claims}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey.replace(/\\n/g, "\n")).toString("base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${signingInput}.${signature}` }),
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

async function fetchGa4(): Promise<Ga4Insights> {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId || !ga4Configured()) return { ...EMPTY, error: "not_configured" };
  try {
    const token = await getAccessToken();
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
}

// Request-safe TTL cache (2 min). unstable_cache can't be used here — the WIF path reads
// the per-request `x-vercel-oidc-token` header, which is unavailable in a cached scope.
// Module cache is per-instance/ephemeral on Vercel, which is fine for realtime metrics.
let cache: { at: number; data: Ga4Insights } | null = null;
const TTL_MS = 120_000;

export async function getGa4Insights(): Promise<Ga4Insights> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.data;
  const data = await fetchGa4();
  if (data.available) cache = { at: Date.now(), data }; // cache successes only
  return data;
}
