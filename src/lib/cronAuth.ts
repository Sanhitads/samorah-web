/** Shared guard for scheduled endpoints — a constant shared secret (CRON_SECRET),
 *  accepted via `x-cron-secret` or `Authorization: Bearer`. Returns false when the
 *  secret is unset, so cron endpoints are closed by default. */
export function cronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header =
    request.headers.get("x-cron-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return header === secret;
}
