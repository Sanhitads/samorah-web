import { PostgrestClient } from "@supabase/postgrest-js";
import type { Database } from "@/types/database";

/**
 * Service-role PostgREST client — SERVER ONLY. Bypasses RLS (service-role key), so
 * it must never be imported into a client component or exposed to the browser. Used
 * by the payment routes (create-order / verify / webhook / cron) which write orders
 * on behalf of guests (no user session).
 *
 * Uses `@supabase/postgrest-js` directly (like `createPublicClient`) rather than the
 * full `@supabase/supabase-js` client — the latter eagerly constructs a Realtime
 * client that throws "Node 20 without native WebSocket support" in this runtime.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase admin client is not configured (URL / SERVICE_ROLE_KEY).");
  }
  return new PostgrestClient<Database>(`${url}/rest/v1`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
}
