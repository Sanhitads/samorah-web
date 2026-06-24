import { PostgrestClient } from "@supabase/postgrest-js";
import type { Database } from "@/types/database";

/**
 * Cookieless, server-side client for PUBLIC catalog reads.
 *
 * Safe in any context — build-time generateStaticParams, ISR, and RSC — with no
 * Realtime/WebSocket dependency (unlike the full supabase-js client on Node 20).
 * Authenticates as the anon role, so RLS returns only active/published rows.
 *
 * Authenticated or draft-visible reads (admin) use a session-bound client instead.
 */
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }
  return new PostgrestClient<Database>(`${url}/rest/v1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
}
