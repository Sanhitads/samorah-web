/** Client helper to call the server-authoritative manufacturing API. All mutations go
 *  through POST /api/admin/manufacturing; the server enforces capability + actor identity. */
export async function mfgAction<T = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch("/api/admin/manufacturing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  let j: { ok?: boolean; result?: T; error?: string };
  try { j = await r.json(); } catch { throw new Error(`Request failed (${r.status}).`); }
  if (!r.ok || !j.ok) throw new Error(j.error || `Request failed (${r.status}).`);
  return j.result as T;
}

/** A client-generated idempotency key for safe create/retry. */
export function newIdempotencyKey(): string {
  try { return crypto.randomUUID(); } catch { return `k-${Date.now()}-${Math.round(Math.random() * 1e9)}`; }
}
