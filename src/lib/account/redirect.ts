/**
 * Post-auth redirect safety. Only RELATIVE in-app paths are honoured — anything else
 * (absolute URLs, protocol-relative, missing) falls back to "/". Prevents open-redirect
 * abuse while letting Google/magic-link return the user to their originating page.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  // Must start with a single "/" and not "//" (protocol-relative) or "/\".
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
